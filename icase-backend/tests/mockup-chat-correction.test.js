const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const GenerarMockups = require('../src/core/use-cases/GenerarMockups');
const MockupController = require('../src/interface-adapters/controllers/MockupController');
const MockupIaService = require('../src/infrastructure/services/MockupIaService');

// Campos que la persona sí debe escribir (los que completa el sistema ya no se exigen en el formulario).
const campos = ['cantidadUsos', 'semanas', 'medioPago', 'moneda', 'plan', 'sucursal_id'];
const advertencia = `el formulario de "+ Comprar Paquete" no tiene control para: ${campos.join(', ')} (RF-03 los guarda y el backend puede exigirlos)`;
const instruccion = `corrige esto: • ${advertencia}`;
const controles = campos.map(name => name.endsWith('_id')
  ? `<label>Cliente<select name="${name}"><option>Cliente de ejemplo</option></select></label>`
  : `<label>${name}<input name="${name}" type="${/^(cantidad|semanas)/.test(name) ? 'number' : 'text'}"></label>`).join('');
const html = (fields = '', extra = '<button data-accion="ui">Cerrar</button>') => `<!DOCTYPE html><html><head><style>body{color:black}</style></head><body><main><h1>Comprar Paquete</h1><form><label>Nombre<input name="nombre"></label>${fields}<button data-accion="RF-03.crear">+ Comprar Paquete</button></form>${extra}</main></body></html>`;
const anterior = { nombre_pantalla: 'comprar-paquete', preview_code: html(), version: 4, rf_trazabilidad: ['RF-03'], advertencias_validacion: [advertencia] };
const contrato = { operations: [{ id: 'RF-03', methods: ['GET', 'POST', 'PATCH'], schema: { properties: Object.fromEntries(['nombre', ...campos].map(name => [name, {}])) } }] };
const candidato = (code = html(controles), slug = anterior.nombre_pantalla) => ({ nombre_pantalla: slug, preview_code: code });

function setup(respuestas, previous = anterior) {
  const generarMockups = jest.fn();
  for (const mockups of respuestas) generarMockups.mockResolvedValueOnce({ mockups, proveedorUsado: 'prueba', advertencias: [] });
  const repository = {
    obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [previous], aprobado: true }),
    guardarOActualizar: jest.fn().mockResolvedValue({})
  };
  const useCase = new GenerarMockups({
    proyectoRepository: { obtenerPorId: async () => ({ nombre: 'Paquetes', estado_fase: 'mockups_pendientes' }) },
    requerimientoRepository: { listarPorProyecto: async () => [{ identificador: 'RF-03', tipo: 'RF', aprobado: true, nombre: 'Comprar Paquete', descripcion: 'Registrar compra de paquetes.' }] },
    diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Paquetes\n** Comprar Paquete\n@endwbs' }] },
    disenoRepository: repository,
    mockupIaService: { generarMockups }
  });
  // Aislar la validación de respuestas libres de IA; la reparación local tiene su propia suite.
  jest.spyOn(useCase.formRepairService, 'preparar').mockImplementation(mockup => mockup);
  jest.spyOn(useCase.formRepairService, 'reparar').mockReturnValue(null);
  jest.spyOn(useCase.bindingService, 'contrato').mockReturnValue(contrato);
  const run = (text = instruccion) => useCase.ejecutar({ proyectoId: 'p1', pantallas: [anterior.nombre_pantalla], insumoAdicional: text });
  return { run, useCase, repository, generarMockups };
}

describe('correcciones del mockup desde el chat', () => {
  test('la frase del usuario añade los seis campos y guarda una nueva versión comprobada', async () => {
    const { run, repository, generarMockups } = setup([[candidato()]]);
    const result = await run();
    expect(result.totalProcesados).toBe(1);
    expect(result.ajustes).toEqual([expect.objectContaining({ aplicado: true, advertencias_resueltas: [advertencia] })]);
    expect(result.mockups[0].version).toBe(5);
    expect(result.mockups[0].enlaces[0].campos_faltantes).toEqual([]);
    expect(repository.guardarOActualizar).toHaveBeenCalledWith('p1', expect.objectContaining({ aprobado: false }));
    const request = generarMockups.mock.calls[0][0];
    expect(request.modoEdicion).toBe(true);
    expect(request.insumoAdicional).toContain(instruccion);
    expect(request.insumoAdicional).toContain(anterior.preview_code);
  });

  test.each([
    ['HTML idéntico', () => anterior],
    ['solo una nota de éxito', () => candidato(html('<p>Corrección aplicada</p>'))],
    ['seis spans con name', () => candidato(html(campos.map(name => `<span name="${name}">Dato</span>`).join('')))],
    ['controles ocultos', () => candidato(html(`<div hidden>${controles}</div>`))],
    ['campos de otro formulario', () => candidato(html('', `<form>${controles}</form>`))],
    ['campos sin formulario', () => candidato(html(controles).replace(/<\/?form>/g, ''))],
    ['solo cinco campos', () => candidato(html(controles.replace(/<label>Cliente[\s\S]*?<\/label>/, '')))],
    ['botón convertido en ui', () => candidato(html().replace('RF-03.crear', 'ui'))],
    ['formulario eliminado', () => candidato(html().replace(/<form>[\s\S]*?<\/form>/, '<p>Paquetes</p>'))],
    ['pantalla distinta', () => candidato(html(controles), 'otra-pantalla')],
    ['pantallas adicionales', () => null],
    ['HTML truncado', () => candidato(html(controles).replace('</html>', ''))],
    ['campo válido eliminado', () => candidato(html(controles).replace('<input name="nombre">', ''))],
    ['nueva advertencia', () => candidato(html(controles, '<button>Nuevo sin enlace</button>'))]
  ])('rechaza %s en ambos intentos y conserva el original', async (_name, create) => {
    const response = create();
    const mockups = response ? [response] : [candidato(), candidato(html(), 'otra')];
    const { run, repository, generarMockups } = setup([mockups, mockups]);
    const result = await run();
    expect(generarMockups).toHaveBeenCalledTimes(2);
    expect(result.totalProcesados).toBe(0);
    expect(result.ajustes[0].aplicado).toBe(false);
    expect(result.mockups).toEqual([anterior]);
    expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  });

  test('reintenta con el original y guarda solo cuando se resuelve la advertencia', async () => {
    const { run, generarMockups } = setup([[anterior], [candidato()]]);
    const result = await run();
    expect(result.totalProcesados).toBe(1);
    expect(generarMockups.mock.calls[1][0].insumoAdicional).toContain('sin cambios');
    expect(generarMockups.mock.calls[1][0].insumoAdicional).toContain(anterior.preview_code);
  });

  test('resolver otra advertencia no cuenta como resolver la solicitada', async () => {
    const previous = { ...anterior, preview_code: html('', '<button>Cancelar</button>') };
    const otherFixed = candidato(html('', '<button data-accion="ui">Cancelar</button>'));
    const { run, repository } = setup([[otherFixed], [otherFixed]], previous);
    expect((await run()).totalProcesados).toBe(0);
    expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  });

  test('permite corregir una advertencia y continuar después con las demás', async () => {
    const previous = { ...anterior, preview_code: html('', '<button>Aceptar</button>') };
    const { run } = setup([[candidato(html(controles, '<button>Aceptar</button>'))]], previous);
    const result = await run();
    expect(result.totalProcesados).toBe(1);
    expect(result.ajustes[0].advertencias_pendientes).toContain('sin enlace: Aceptar');
    const next = setup([[candidato(html(controles, '<button data-accion="ui">Aceptar</button>'))]], result.mockups[0]);
    const second = await next.run('corrige esto: sin enlace: Aceptar');
    expect(second.totalProcesados).toBe(1);
    expect(second.mockups[0].enlaces[0].campos_faltantes).toEqual([]);
    expect(second.ajustes[0].advertencias_pendientes).toEqual([]);
    expect(second.mockups[0].version).toBe(6);
  });

  test('una petición de un campo se valida por ese campo, aunque no cambie el número de advertencias', async () => {
    const { run } = setup([[candidato(html('<input name="cantidadUsos" type="number">'))]]);
    const result = await run('agrega cantidadUsos al formulario');
    expect(result.totalProcesados).toBe(1);
    expect(result.mockups[0].enlaces[0].campos_faltantes).not.toContain('cantidadUsos');
    expect(result.mockups[0].enlaces[0].campos_faltantes).toHaveLength(5);
    expect(result.ajustes[0].advertencias_resueltas).toEqual([]);
  });

  test('conserva el orden de pantallas para mantener seleccionada la que se está corrigiendo', async () => {
    const { run, repository } = setup([[candidato()]]);
    const other = { nombre_pantalla: 'inicio', preview_code: html(), version: 2 };
    repository.obtenerPorProyecto.mockResolvedValue({ mockups: [other, anterior] });
    const result = await run();
    expect(result.mockups.map(m => m.nombre_pantalla)).toEqual(['inicio', 'comprar-paquete']);
    expect(result.mockups[0]).toEqual(other);
    expect(result.mockups[1].version).toBe(5);
  });

  test('no resuelve sin enlace eliminando el botón citado', async () => {
    const previous = { ...anterior, preview_code: html(controles, '<button>Cancelar</button>') };
    const { run } = setup([[candidato(html(controles, ''))], [candidato(html(controles, ''))]], previous);
    expect((await run('corrige esto: sin enlace: Cancelar')).totalProcesados).toBe(0);
  });

  test('rechaza una edición si otro proceso cambió el diseño mientras respondía la IA', async () => {
    const { run, repository } = setup([[candidato()]]);
    repository.guardarSiNoCambio = jest.fn().mockResolvedValue(null);
    await expect(run()).rejects.toThrow('El diseño cambió');
    expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  });

  test('sin respuesta de IA no fabrica una nota de ajuste aplicado', async () => {
    const { run, repository } = setup([[], []]);
    const result = await run('añade un buscador de paquetes');
    expect(result.totalProcesados).toBe(0);
    expect(result.mockups[0]).toEqual(anterior);
    expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  });

  test('no trunca el HTML de edición ni siquiera después de los 45000 caracteres', async () => {
    const previous = { ...anterior, preview_code: html('<!--' + 'contenido '.repeat(5000) + '-->') };
    const { run, generarMockups } = setup([[candidato()]], previous);
    await run();
    expect(generarMockups.mock.calls[0][0].insumoAdicional).toContain(previous.preview_code);
  });
});

describe('respuesta del endpoint y confirmación en el chat', () => {
  let confirm;
  beforeAll(() => {
    const source = fs.readFileSync(path.join(__dirname, '../../icase-frontend/src/utils/mockupCorrectionResult.js'), 'utf8');
    const mod = { exports: {} };
    new Function('module', 'exports', transformSync(source, { format: 'cjs' }).code)(mod, mod.exports);
    confirm = mod.exports.mockupCorrectionResult;
  });

  test.each([true, false])('el endpoint conserva el resultado verificado: aplicado=%s', async applied => {
    const { useCase } = setup(applied ? [[candidato()]] : [[anterior], [anterior]]);
    const controller = new MockupController({ generarMockupsUseCase: useCase });
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.generar({ params: { proyectoId: 'p1' }, body: { pantallas: [anterior.nombre_pantalla], insumoAdicional: instruccion } }, res);
    const response = res.json.mock.calls[0][0];
    expect(response.totalProcesados).toBe(applied ? 1 : 0);
    expect(response.ajustes[0].aplicado).toBe(applied);
    expect(confirm(response, anterior, anterior.nombre_pantalla).applied).toBe(applied);
  });

  test.each([
    { mockups: [anterior] },
    { mockups: [anterior], totalProcesados: 1 },
    { mockups: [candidato()], totalProcesados: 0 },
    { mockups: [candidato(html(controles), 'otra')], totalProcesados: 1 },
    { mockups: [candidato()], totalProcesados: 1, ajustes: [{ nombre_pantalla: anterior.nombre_pantalla, aplicado: false, motivo: 'Pendiente' }] }
  ])('no confirma éxito con catálogo antiguo o una pantalla ajena: %j', response => {
    expect(confirm(response, anterior, anterior.nombre_pantalla).applied).toBe(false);
  });
});

test('el proveedor que no admite el HTML completo se omite sin recortar la edición', async () => {
  const service = new MockupIaService();
  service.provider = 'auto'; service.providerOrder = ['groq', 'gemini'];
  service.models = { groq: ['prueba'], gemini: ['prueba'] };
  service.groqApiKey = 'prueba'; service.geminiApiKey = 'prueba';
  const compact = jest.spyOn(service, '_construirPromptCompactoGroq');
  service._solicitar = jest.fn().mockResolvedValue(JSON.stringify({ mockups: [candidato()] }));
  const complete = 'HTML ACTUAL:\n' + html('<!--' + 'x'.repeat(100000) + '-->');
  const response = await service.generarMockups({ contextoProyecto: 'Contexto', pantallas: [anterior.nombre_pantalla], insumoAdicional: complete, modoEdicion: true });
  expect(compact).not.toHaveBeenCalled();
  expect(service._solicitar).toHaveBeenCalledTimes(1);
  expect(service._solicitar.mock.calls[0][0]).toBe('gemini');
  expect(service._solicitar.mock.calls[0][2]).toContain(complete);
  expect(response.mockups).toHaveLength(1);
});

test('en edición por chat usa contexto compacto sin volcar diagramas completos', async () => {
  const { run, generarMockups } = setup([[candidato()]]);
  await run('corrige el diseño del botón');
  const req = generarMockups.mock.calls[0][0];
  expect(req.contextoProyecto).toContain('OPERACIONES DISPONIBLES');
  expect(req.contextoProyecto).not.toContain('ARQUITECTURA (extracto)');
  expect(req.contextoProyecto).not.toContain('CLASES DEL DOMINIO');
});
