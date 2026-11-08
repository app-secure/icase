const Review = require('../src/infrastructure/services/RequirementSemanticReviewService');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const input = 'El operador consulta expedientes y autoriza solicitudes. Las contraseñas se protegen.';
const need = (id, objective, text) => ({ id, objetivo_id: objective, tipo: 'RF', necesidad: text, estado: 'confirmado', evidencias: [{ texto: input }] });
const req = (id, ref, text) => ({ identificador: id, tipo: 'RF', nombre: text, descripcion: text, necesidades_origen: [ref], criterios_aceptacion: [{ descripcion: text, necesidades_origen: [ref] }], evidencias: [{ texto: input }] });
const original = () => ({ requerimientos: [req('RF-1', 'N-1', 'Consultar')], auditoria_requisitos: { version: 2, estado: 'cobertura_verificada', inventario: [need('N-1', 'O-1', 'Consultar')], advertencias: [], necesidades_pendientes: [] } });
const finding = () => ({ tipo: 'omision', descripcion: 'Falta autorizar solicitudes', accion_propuesta: 'Añadir la autorización como función', requisitos_afectados: [], necesidades_afectadas: [], evidencias: [{ texto: 'autoriza solicitudes.' }] });
const patch = () => ({ necesidades_corregidas: [need('N-2', 'O-2', 'Autorizar')], requerimientos_corregidos: [req('RF-2', 'N-2', 'Autorizar')], eliminar_necesidades: [], eliminar_identificadores: [] });
const run = (result, request) => new Review().run({ input, result, request, coverage: new Coverage() });

test('revisa el insumo original y valida omisiones sin añadir una cuota ni reglas por dominio', async () => {
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [] });
  const result = await run(original(), request);
  expect(request.mock.calls[0][0]).toContain(input);
  expect(request.mock.calls[0][0]).toContain('Una cualidad sin cifra');
  expect(request.mock.calls[0][1].etapa).toBe('revision_semantica');
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('completada');
});

test('corrige una omisión de forma atómica sin modificar el requisito correcto y verifica el candidato', async () => {
  const before = original();
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [finding()] }).mockResolvedValueOnce(patch()).mockResolvedValueOnce({ hallazgos: [] });
  const result = await run(before, request);
  expect(result.requerimientos).toHaveLength(2);
  expect(result.requerimientos[0]).toEqual(before.requerimientos[0]);
  expect(before.requerimientos).toHaveLength(1);
  expect(result.auditoria_requisitos.inventario).toHaveLength(2);
  expect(result.auditoria_requisitos.revision_semantica.reparacion.estado).toBe('aplicada');
  expect(request.mock.calls.map(call => call[1].etapa)).toEqual(['revision_semantica', 'correccion_semantica', 'verificacion_correccion_semantica']);
});

test('una observación inventada o con IDs ajenos no se convierte en obligación ni bloqueador', async () => {
  const request = jest.fn().mockResolvedValue({ hallazgos: [{ ...finding(), evidencias: [{ texto: 'Inventado' }] }, { ...finding(), requisitos_afectados: ['RF-ajeno'] }] });
  const result = await run(original(), request);
  expect(result.requerimientos).toHaveLength(1);
  expect(result.auditoria_requisitos.revision_semantica.rechazados).toHaveLength(2);
  expect(request).toHaveBeenCalledTimes(1);
});

test.each(['elemento_ajeno', 'evidencia_falsa', 'sin_verificacion', 'hallazgo_persistente'])('rechaza parche %s preservando borrador', async mode => {
  const change = patch();
  if (mode === 'elemento_ajeno') change.requerimientos_corregidos.push(req('RF-1', 'N-1', 'Alterado'));
  if (mode === 'evidencia_falsa') change.necesidades_corregidas[0].evidencias = [{ texto: 'No existente' }];
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [finding()] }).mockResolvedValueOnce(change)
    .mockResolvedValueOnce(mode === 'sin_verificacion' ? null : { hallazgos: [finding()] });
  const before = original();
  const result = await run(before, request);
  expect(result.requerimientos).toEqual(before.requerimientos);
  expect(result.auditoria_requisitos.inventario).toEqual(before.auditoria_requisitos.inventario);
  expect(result.auditoria_requisitos.revision_semantica.reparacion.estado).toBe('rechazada');
});

test('presupuesto o proveedor fallido conserva resultado y advierte revisión incompleta', async () => {
  const result = await run(original(), jest.fn().mockResolvedValue(null));
  expect(result.auditoria_requisitos.estado).toBe('revision_requerida');
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('no_completada');
  expect(result.requerimientos).toHaveLength(1);
});

test('recupera una cualidad mal clasificada sin inventar métricas', async () => {
  const before = original();
  before.auditoria_requisitos.inventario.push({ id: 'N-3', tipo: 'contexto', necesidad: 'Proteger contraseñas', estado: 'confirmado', evidencias: [{ texto: 'Las contraseñas se protegen.' }] });
  const finding = { tipo: 'clasificacion', descripcion: 'La protección solicitada no es solo contexto', accion_propuesta: 'Conservarla como cualidad con métrica pendiente', requisitos_afectados: [], necesidades_afectadas: ['N-3'], evidencias: [{ texto: 'Las contraseñas se protegen.' }] };
  const change = { necesidades_corregidas: [{ ...before.auditoria_requisitos.inventario[1], tipo: 'RNF', objetivo_id: 'O-3' }], eliminar_necesidades: [], eliminar_identificadores: [],
    requerimientos_corregidos: [{ ...req('RNF-3', 'N-3', 'Proteger contraseñas'), tipo: 'RNF', metrica_medible: 'Por confirmar con el usuario', requiere_confirmacion: true }] };
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [finding] }).mockResolvedValueOnce(change).mockResolvedValueOnce({ hallazgos: [] });
  const result = await run(before, request);
  expect(result.requerimientos[1]).toMatchObject({ tipo: 'RNF', metrica_medible: 'Por confirmar con el usuario' });
  expect(result.auditoria_requisitos.revision_semantica.reparacion.estado).toBe('aplicada');
});

test('más de cinco hallazgos se conservan sin regeneración masiva', async () => {
  const request = jest.fn().mockResolvedValue({ hallazgos: Array.from({ length: 6 }, finding) });
  const result = await run(original(), request);
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.auditoria_requisitos.revision_semantica.reparacion.estado).toBe('omitida_por_limite_o_estructura_pendiente');
});
