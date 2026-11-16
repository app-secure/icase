const { JSDOM } = require('jsdom');
const Generate = require('../src/core/use-cases/GenerarMockups');
const Repair = require('../src/infrastructure/services/MockupFormRepairService');

const properties = {
  fechaCanje: { type: 'string', format: 'date-time' }, puntosCanjeados: { type: 'integer' },
  cliente_id: { type: 'string', 'x-references': 'Cliente' },
  recompensa_id: { type: 'string', 'x-references': 'Recompensa' },
  pedido_id: { type: 'string', 'x-references': 'Pedido' }
};
const values = i => ({ cliente_id: 'cliente-demo', recompensa_id: `rec-${i}`, puntosCanjeados: String(i * 100), fechaCanje: '2026-01-01T12:00:00Z', pedido_id: `pedido-${i}` });
const card = i => `<form class="flex items-center"><h4>Recompensa ${i}</h4>${Object.entries(values(i)).map(([name, value]) => `<input type="hidden" name="${name}" value="${value}">`).join('')}<button type="submit" data-accion="RF-18.crear">Canjear</button></form>`;
const complete = `<form><h4>Procesar canje</h4>${Object.keys(properties).map(name => `<input name="${name}">`).join('')}<button data-accion="RF-18.crear">Procesar Canje de Puntos</button></form>`;
const page = body => `<!DOCTYPE html><html><head><style>body{color:black}</style></head><body><header>Mi aplicación</header><main>${body}</main><footer>Soporte</footer></body></html>`;
const original = { nombre_pantalla: 'canjes', version: 2, rf_trazabilidad: ['RF-18'], preview_code: page(card(1) + card(2) + card(3) + complete) };
const instruction = 'corrige estos aspectos analizar';
const stripIds = html => html.replace(/ data-icase-edit-id="[^"]*"/g, '');

function setup(mockup = original, schema = properties) {
  const contrato = { operations: [{ id: 'RF-18', methods: ['POST'], schema: { properties: schema, required: [] } }] };
  const requerimientos = [{ identificador: 'RF-18', tipo: 'RF', aprobado: true, nombre: 'Canje de puntos' }];
  const ai = { generarMockups: jest.fn().mockResolvedValue({ mockups: [] }) };
  const repository = { obtenerPorProyecto: async () => ({ mockups: [mockup] }), guardarOActualizar: jest.fn() };
  const useCase = new Generate({
    proyectoRepository: { obtenerPorId: async () => ({ nombre: 'Recompensas', estado_fase: 'mockups_pendientes' }) },
    requerimientoRepository: { listarPorProyecto: async () => requerimientos },
    diagramaRepository: { listarPorProyecto: async () => [{ tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Recompensas\n** Canjes\n@endwbs' }] },
    disenoRepository: repository, mockupIaService: ai
  });
  jest.spyOn(useCase.bindingService, 'contrato').mockReturnValue(contrato);
  const diagnose = m => useCase._evaluarCalidadChat(m, { requerimientos, contratoEnlaces: contrato });
  const run = (text = instruction) => useCase.ejecutar({ proyectoId: 'p', pantallas: ['canjes'], insumoAdicional: text });
  return { useCase, ai, repository, run, diagnose, contrato };
}

test('la frase real del usuario corrige tres Canjear repetidos sin invocar la IA ni cambiar el cuarto formulario', async () => {
  const { run, ai, repository } = setup();
  const result = await run();
  expect(result.totalProcesados).toBe(1);
  expect(result.proveedorUsado).toBe('icase-formularios');
  expect(result.ajustes[0].aplicado).toBe(true);
  expect(result.mockups[0].enlaces.filter(e => e.rf === 'RF-18')).toHaveLength(4);
  expect(result.mockups[0].enlaces.every(e => e.campos_faltantes.length === 0)).toBe(true);
  expect(ai.generarMockups).not.toHaveBeenCalled();
  expect(repository.guardarOActualizar).toHaveBeenCalledTimes(1);
  const code = result.mockups[0].preview_code;
  expect(stripIds(code)).toContain(complete);
  expect(code).toContain('<header>Mi aplicación</header>');
  expect(code).toContain('<footer>Soporte</footer>');
  const dom = new JSDOM(code);
  const forms = [...dom.window.document.querySelectorAll('form')];
  expect(new Set(forms.map(form => form.getAttribute('data-icase-edit-id'))).size).toBe(4);
  for (let i = 0; i < 3; i++) {
    const form = forms[i];
    const data = new dom.window.FormData(form);
    for (const name of Object.keys(properties)) expect(form.querySelectorAll(`[name="${name}"]`)).toHaveLength(1);
    expect(form.querySelector('[type="hidden"]')).toBeNull();
    expect(form.querySelector('[name="puntosCanjeados"]').type).toBe('number');
    expect(form.querySelector('[name="fechaCanje"]').type).toBe('datetime-local');
    expect(form.querySelector('[name="recompensa_id"]').tagName).toBe('SELECT');
    expect(data.get('recompensa_id')).toBe(values(i + 1).recompensa_id);
    expect(data.get('puntosCanjeados')).toBe(values(i + 1).puntosCanjeados);
    expect(form.style.flexWrap).toBe('wrap');
  }
  dom.window.close();
});

test('puede corregir un campo y dejar los demás advertidos sin atribuirlos a otra tarjeta', async () => {
  const { run } = setup();
  const result = await run('corrige el campo fechaCanje');
  expect(result.totalProcesados).toBe(1);
  const cards = result.mockups[0].enlaces.filter(e => e.control === 'Canjear');
  expect(cards).toHaveLength(3);
  for (const e of cards) {
    expect(e.campos_faltantes).not.toContain('fechaCanje');
    expect(e.campos_faltantes).toHaveLength(4);
  }
});

test('una petición que también cambia el diseño se entrega a la IA completa', async () => {
  const { run, ai, repository } = setup();
  const result = await run('corrige estos aspectos y cambia el color del botón a rojo');
  expect(ai.generarMockups).toHaveBeenCalledTimes(2);
  expect(ai.generarMockups.mock.calls[0][0].insumoAdicional).toContain('data-icase-edit-id');
  expect(result.totalProcesados).toBe(0);
  expect(repository.guardarOActualizar).not.toHaveBeenCalled();
});

test('si no puede resolver todos los tipos solicitados no aplica una reparación parcial ni inventa campos', async () => {
  const { run, ai, repository } = setup(original, { ...properties, datos: { type: 'object' } });
  const result = await run();
  expect(result.totalProcesados).toBe(0);
  expect(ai.generarMockups).toHaveBeenCalled();
  expect(repository.guardarOActualizar).not.toHaveBeenCalled();
  expect(result.mockups).toEqual([original]);
});

test('la preparación asigna identidades únicas, mantiene las existentes y no modifica contenido visible', () => {
  const repair = new Repair();
  const before = { preview_code: page('<form data-icase-edit-id="viejo"><button data-icase-edit-id="duplicado">Uno</button></form><form><button data-icase-edit-id="duplicado">Dos</button></form>') };
  const first = repair.preparar(before);
  const second = repair.preparar(first);
  expect(first.preview_code).toBe(second.preview_code);
  expect(stripIds(first.preview_code)).toBe(stripIds(before.preview_code));
  const ids = [...first.preview_code.matchAll(/data-icase-edit-id="([^"]+)"/g)].map(m => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain('viejo');
});

test.each(['eliminar', 'ocultar', 'desvincular', 'mover campos'])('sigue rechazando %s de una tarjeta aunque los otros Canjear estén corregidos', (_action) => {
  const { useCase, diagnose, contrato } = setup();
  const previous = useCase.formRepairService.preparar(original);
  const before = diagnose(previous);
  const objectives = useCase.chatCorrectionService.objetivos(instruction, before);
  const candidate = useCase.formRepairService.reparar({ mockup: previous, instruccion: instruction, objetivos: objectives, diagnostico: before, contrato });
  const dom = new JSDOM(candidate.preview_code);
  const form = dom.window.document.querySelector('form');
  if (_action === 'eliminar') form.remove();
  if (_action === 'ocultar') form.hidden = true;
  if (_action === 'desvincular') form.querySelector('button').setAttribute('data-accion', 'ui');
  if (_action === 'mover campos') dom.window.document.querySelectorAll('form')[1].append(form.querySelector('div'));
  candidate.preview_code = dom.serialize();
  const result = useCase.chatCorrectionService.evaluar({ previo: previous, candidato: candidate, diagnosticoPrevio: before, diagnostico: diagnose(candidate), objetivos: objectives });
  expect(result.aplicado).toBe(false);
  dom.window.close();
});

test('añadir solo identificadores internos no se considera una corrección', () => {
  const { useCase, diagnose } = setup();
  const prepared = useCase.formRepairService.preparar(original);
  const result = useCase.chatCorrectionService.evaluar({ previo: original, candidato: prepared,
    diagnosticoPrevio: diagnose(original), diagnostico: diagnose(prepared), objetivos: [] });
  expect(result).toEqual({ aplicado: false, motivo: 'La IA devolvió la pantalla sin cambios.' });
});

test.each([
  ['corrige los aspectos que conviene revisar', [], []],
  ['Aspectos que conviene revisar • el formulario de "Cobrar" no tiene control para: fechaCanje', ['puntosCanjeados', 'cliente_id', 'recompensa_id', 'pedido_id'], ['Nuevo Canje']],
  ['corrige esto: • campo "horaCreacion" de "Cobrar" no existe en la operación RF-18 • el formulario de "Cobrar" no tiene control para: fechaCanje, puntosCanjeados, cliente_id, recompensa_id, pedido_id', [], ['Nuevo Canje']]
])('resuelve sin IA botones de tabla y encabezado fuera de formulario con frase real: %s', async (phrase, expectedMissingOnCobrar, expectedRemainingControls) => {
  const tableHtml = page('<button data-accion="RF-18.crear">Nuevo Canje</button><input name="horaCreacion"><table><tr><td><button data-accion="RF-18.crear">Cobrar</button></td></tr><tr><td><button data-accion="RF-18.crear">Cobrar</button></td></tr></table>');
  const previous = { nombre_pantalla: 'canjes', version: 1, rf_trazabilidad: ['RF-18'], preview_code: tableHtml, advertencias_validacion: ['campo "horaCreacion" de "Cobrar" no existe en la operación RF-18'] };
  const { run, ai, repository } = setup(previous);
  const result = await run(phrase);
  expect(result.totalProcesados).toBe(1);
  expect(result.proveedorUsado).toBe('icase-formularios');
  const cobrarLinks = result.mockups[0].enlaces.filter(e => e.control === 'Cobrar');
  expect(cobrarLinks).toHaveLength(2);
  for (const link of cobrarLinks) expect(link.campos_faltantes).toEqual(expectedMissingOnCobrar);
  for (const ctrl of expectedRemainingControls) {
    expect(result.mockups[0].advertencias_validacion.some(w => w.includes(ctrl))).toBe(true);
  }
  if (!expectedRemainingControls.length) expect(result.mockups[0].advertencias_validacion).toEqual([]);
  expect(ai.generarMockups).not.toHaveBeenCalled();
  expect(repository.guardarOActualizar).toHaveBeenCalledTimes(1);
});

test('corrige los aspectos que conviene revisar combinado con cambio visual sigue yendo a la IA', async () => {
  const { run, ai } = setup();
  await run('corrige los aspectos que conviene revisar y cambia el color a azul');
  expect(ai.generarMockups).toHaveBeenCalled();
});
