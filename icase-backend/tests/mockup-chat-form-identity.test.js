const GenerarMockups = require('../src/core/use-cases/GenerarMockups');

const campos = ['fechaApertura', 'fechaCierre', 'efectivoEsperado', 'efectivoContado'];
const labels = ['Fecha Apertura', 'Fecha Cierre', 'Efectivo Esperado', 'Efectivo Contado'];
const fields = campos.map((name, i) => `<label>${labels[i]}<input name="${name}"></label>`).join('');
const fondo = '<label>Fondo inicial<input type="number" name="fondoInicial"></label>';
const page = content => `<!DOCTYPE html><html><head><style>body{color:black}</style></head><body><main><h1>Gestión de Caja</h1>${content}</main></body></html>`;
const form = ({ id = '', title = '', extra = '', action = true, buttonAction = 'ui', buttonText = 'Abrir caja' } = {}) =>
  `<form${id ? ` id="${id}"` : ''}${title ? ` aria-label="${title}"` : ''}${action ? ' data-accion="RF-08.crear"' : ''}>${extra}${fields}<button type="submit" data-accion="${buttonAction}">${buttonText}</button></form>`;

function setup(before, after, extraFields = []) {
  const previous = { nombre_pantalla: 'gestion-de-caja', version: 3, preview_code: page(before), rf_trazabilidad: ['RF-08'] };
  const candidate = { ...previous, preview_code: page(after) };
  const repository = { obtenerPorProyecto: async () => ({ mockups: [previous] }), guardarOActualizar: jest.fn() };
  const ai = { generarMockups: jest.fn().mockResolvedValue({ mockups: [candidate] }) };
  const useCase = new GenerarMockups({
    proyectoRepository: { obtenerPorId: async () => ({ nombre: 'Caja', estado_fase: 'mockups_pendientes' }) },
    requerimientoRepository: { listarPorProyecto: async () => [{ identificador: 'RF-08', tipo: 'RF', aprobado: true, nombre: 'Gestión de Caja' }] },
    diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Caja\n** Gestión de Caja\n@endwbs' }] },
    disenoRepository: repository, mockupIaService: ai
  });
  // Compatibilidad con propuestas de IA sin identificadores; la ruta local se prueba aparte.
  jest.spyOn(useCase.formRepairService, 'preparar').mockImplementation(mockup => mockup);
  jest.spyOn(useCase.formRepairService, 'reparar').mockReturnValue(null);
  jest.spyOn(useCase.bindingService, 'contrato').mockReturnValue({ operations: [{
    id: 'RF-08', methods: ['POST'], schema: { properties: Object.fromEntries([...campos, 'fondoInicial', ...extraFields].map(name => [name, {}])) }
  }] });
  const run = (insumoAdicional = 'corrige esto: falta el control fondoInicial en RF-08') => useCase.ejecutar({
    proyectoId: 'caja', pantallas: ['gestion-de-caja'], insumoAdicional
  });
  return { run, previous, repository, ai };
}

describe('identidad de operaciones al corregir formularios de caja', () => {
  test('reproduce la captura: acepta añadir fondoInicial aunque cambien los textos internos del form', async () => {
    const { run, ai } = setup(form(), form({ extra: fondo }));
    // También entiende advertencias copiadas antes de corregir el nombre del formulario.
    const result = await run('corrige esto: el formulario de "Fecha Apertura Fecha Cierre Efectivo Esperado Efectivo Conta" no tiene control para: fondoInicial (RF-08 los guarda y el backend puede exigirlos)');
    expect(result.totalProcesados).toBe(1);
    expect(result.ajustes[0].aplicado).toBe(true);
    expect(result.mockups[0].version).toBe(4);
    expect(result.mockups[0].enlaces.find(e => e.rf === 'RF-08').campos_faltantes).toEqual([]);
    expect(ai.generarMockups).toHaveBeenCalledTimes(1);
  });

  test('acepta la corrección con un formulario sin título ni botón de envío', async () => {
    const before = `<form data-accion="RF-08.crear">${fields}</form>`;
    const after = `<form data-accion="RF-08.crear">${fondo}${fields}</form>`;
    expect((await setup(before, after).run()).totalProcesados).toBe(1);
  });

  test.each([
    ['del formulario al botón', form(), form({ action: false, buttonAction: 'RF-08.crear', extra: fondo })],
    ['del botón al formulario', form({ action: false, buttonAction: 'RF-08.crear' }), form({ extra: fondo })],
    ['eliminando solo la declaración duplicada', form({ buttonAction: 'RF-08.crear' }), form({ action: false, buttonAction: 'RF-08.crear', extra: fondo })],
    ['conservando ambas declaraciones', form({ buttonAction: 'RF-08.crear' }), form({ buttonAction: 'RF-08.crear', extra: fondo })],
    ['cambiando el título del formulario', form({ title: 'Apertura' }), form({ title: 'Abrir caja', extra: fondo })],
    ['mejorando el texto del botón', form({ action: false, buttonAction: 'RF-08.crear' }), form({ action: false, buttonAction: 'RF-08.crear', buttonText: 'Confirmar apertura', extra: fondo })]
  ])('acepta campos corregidos %s conservando RF-08.crear', async (_label, before, after) => {
    const { run } = setup(before, after);
    const result = await run();
    expect(result.totalProcesados).toBe(1);
    expect(result.mockups[0].enlaces.filter(e => e.rf === 'RF-08')).toHaveLength(1);
  });

  test('permite cambiar el texto conservando otras advertencias pendientes del mismo formulario', async () => {
    const { run } = setup(form({ title: 'Apertura' }), form({ title: 'Abrir caja', extra: fondo }), ['moneda']);
    const result = await run();
    expect(result.totalProcesados).toBe(1);
    expect(result.ajustes[0].advertencias_pendientes).toEqual([expect.stringContaining('moneda')]);
    expect(result.mockups[0].enlaces.find(e => e.rf === 'RF-08').campos_faltantes).toEqual(['moneda']);
  });

  test('permite completar un formulario vacío aunque se mejore el texto del submit', async () => {
    const before = '<form><button data-accion="RF-08.crear">Abrir</button></form>';
    const after = form({ action: false, buttonAction: 'RF-08.crear', buttonText: 'Confirmar apertura', extra: fondo });
    expect((await setup(before, after).run('corrige los campos faltantes de RF-08')).totalProcesados).toBe(1);
  });

  test('permite crear el formulario que faltaba conservando la operación del botón', async () => {
    const before = '<button data-accion="RF-08.crear">Abrir</button>';
    const after = form({ buttonAction: 'RF-08.crear', buttonText: 'Confirmar apertura', extra: fondo });
    expect((await setup(before, after).run('corrige los campos faltantes de RF-08')).totalProcesados).toBe(1);
  });

  test('no atribuye a otro formulario una advertencia solo porque tienen el mismo texto', async () => {
    const usuario = '<label>Usuario<input name="moneda"></label>';
    const before = form({ id: 'a', extra: usuario }) + form({ id: 'b', extra: fondo });
    const after = form({ id: 'a', extra: usuario + fondo }) + form({ id: 'b', extra: fondo });
    const result = await setup(before, after, ['moneda']).run();
    expect(result.totalProcesados).toBe(1);
    expect(result.ajustes[0].advertencias_pendientes).toEqual([expect.stringContaining('moneda')]);
  });

  const a = { id: 'caja-a', title: 'Sucursal A' };
  const b = { id: 'caja-b', title: 'Sucursal B' };
  const targetA = 'corrige esto: el formulario de "Sucursal A" no tiene control para: fondoInicial (RF-08 los guarda y el backend puede exigirlos)';
  test('distingue dos formularios con el mismo RF y mantiene su identidad al cambiar de orden', async () => {
    const { run } = setup(form(a) + form(b), form(b) + form({ ...a, title: 'Apertura A', extra: fondo }));
    const result = await run(targetA);
    expect(result.totalProcesados).toBe(1);
    expect(result.mockups[0].enlaces.find(e => e.formulario_id === 'caja-a' && e.rf).campos_faltantes).toEqual([]);
    expect(result.mockups[0].enlaces.find(e => e.formulario_id === 'caja-b' && e.rf).campos_faltantes).toEqual(['fondoInicial']);
  });

  test.each([
    ['añade el campo solo en la otra caja', form(a) + form({ ...b, extra: fondo })],
    ['elimina la caja solicitada', form({ ...b, extra: fondo })],
    ['elimina la otra caja', form({ ...a, extra: fondo })],
    ['fusiona dos formularios en uno', form({ extra: fondo })],
    ['oculta la caja solicitada', `<div hidden>${form({ ...a, extra: fondo })}</div>${form(b)}`],
    ['convierte la operación solicitada en ui', form({ ...a, extra: fondo }).replace('RF-08.crear', 'ui') + form(b)]
  ])('rechaza una propuesta que %s', async (_label, after) => {
    const { run, previous, repository } = setup(form(a) + form(b), after);
    const result = await run(targetA);
    expect(result.totalProcesados).toBe(0);
    expect(result.mockups).toEqual([previous]);
    expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  });

  test('renombrar un formulario sin añadir el campo no se considera corrección', async () => {
    expect((await setup(form({ title: 'Apertura' }), form({ title: 'Abrir caja' })).run()).totalProcesados).toBe(0);
  });
});
