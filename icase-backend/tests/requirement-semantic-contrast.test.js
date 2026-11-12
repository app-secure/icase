const Review = require('../src/infrastructure/services/RequirementSemanticReviewService');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Approval = require('../src/core/services/RequirementApprovalService');
const input = 'Consultar catálogo. Solo el administrador gestiona usuarios. Las contraseñas deben protegerse. No queremos cobros.';
const fixture = () => ({ requerimientos: [{ identificador: 'RF-01', tipo: 'RF', nombre: 'Catálogo', descripcion: 'Consultar catálogo',
  evidencia: 'Consultar catálogo.', necesidades_origen: ['N-01'], criterios_aceptacion: [{ descripcion: 'Catálogo visible', necesidades_origen: ['N-01'] }] }],
  auditoria_requisitos: { version: 2, inventario: [
    { id: 'N-01', tipo: 'RF', estado: 'confirmado', objetivo_id: 'O-01', necesidad: 'Consultar catálogo', evidencia: 'Consultar catálogo.' },
    { id: 'N-02', tipo: 'regla_negocio', estado: 'confirmado', necesidad: 'Solo el administrador gestiona usuarios', evidencia: 'Solo el administrador gestiona usuarios.' },
    { id: 'N-03', tipo: 'regla_negocio', estado: 'confirmado', necesidad: 'Proteger contraseñas', evidencia: 'Las contraseñas deben protegerse.' },
    { id: 'N-04', tipo: 'decision', estado: 'confirmado', necesidad: 'No queremos cobros', evidencia: 'No queremos cobros.' }
  ], necesidades_pendientes: [], advertencias: [] } });
const contrast = (id, naturaleza, text) => ({ necesidad_id: id, naturaleza, requisitos: [], justificacion: text, evidencias: [{ texto: text }] });
const entries = () => [contrast('N-02', 'funcion', 'Solo el administrador gestiona usuarios.'),
  contrast('N-03', 'cualidad', 'Las contraseñas deben protegerse.'), contrast('N-04', 'exclusion', 'No queremos cobros.')];
const run = request => new Review().run({ input, result: fixture(), request, coverage: new Coverage() });

test('cero hallazgos sin contraste auxiliar no se presenta como revisión completa', async () => {
  const result = await run(jest.fn().mockResolvedValue({ hallazgos: [] }));
  const review = result.auditoria_requisitos.revision_semantica;
  expect(review.estado).toBe('parcial');
  expect(review.contraste_categorias.pendientes).toEqual(['N-02', 'N-03', 'N-04']);
  expect(new Approval().evaluate(result.requerimientos, result.auditoria_requisitos).advertencias.join(' ')).toContain('parcial');
});

test('señala función y cualidad ocultas con evidencia, sin convertir la exclusión en función', async () => {
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [], contraste_categorias: entries() }).mockResolvedValueOnce(null);
  const result = await run(request);
  const review = result.auditoria_requisitos.revision_semantica;
  expect(review.hallazgos.map(h => h.necesidades_afectadas[0])).toEqual(['N-02', 'N-03']);
  expect(review.hallazgos.every(h => h.estado === 'pendiente')).toBe(true);
  expect(result.requerimientos).toHaveLength(1);
  expect(request.mock.calls[0][0]).toContain('INSUMO ORIGINAL');
  expect(request.mock.calls[0][0]).toContain(input);
});

test('una observación con cita inventada se rechaza y queda pendiente, no crea obligación', async () => {
  const response = { hallazgos: [], contraste_categorias: [{ ...entries()[0], evidencias: [{ texto: 'Agregar pagos externos' }] }] };
  const result = await run(jest.fn().mockResolvedValue(response));
  expect(result.auditoria_requisitos.revision_semantica.hallazgos).toEqual([]);
  expect(result.auditoria_requisitos.revision_semantica.contraste_categorias.rechazados).toHaveLength(1);
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('parcial');
});

test('un RF citado no acredita por sí solo una cualidad RNF', async () => {
  const item = { ...entries()[1], requisitos: ['RF-01'] };
  const checked = new Review().inspectContrast({ contraste_categorias: [item] }, input, fixture(), fixture().auditoria_requisitos.inventario);
  expect(checked.hallazgos).toHaveLength(1);
});

test('no duplica hallazgos de clasificación del proveedor y del contraste', async () => {
  const entry = entries()[0];
  const finding = { tipo: 'clasificacion', descripcion: 'Falta gestionar usuarios', accion_propuesta: 'Añadir función sustentada', requisitos_afectados: [], necesidades_afectadas: ['N-02'], evidencias: entry.evidencias };
  const request = jest.fn().mockResolvedValueOnce({ hallazgos: [finding], contraste_categorias: entries() }).mockResolvedValueOnce(null);
  const result = await run(request);
  expect(result.auditoria_requisitos.revision_semantica.hallazgos.filter(h => h.necesidades_afectadas.includes('N-02'))).toHaveLength(1);
});

test('respuesta vacía sin contrato sigue siendo revisión no completada', async () => {
  const result = await run(async () => ({}));
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('no_completada');
});

test('no crea funciones por palabras clave sin un hallazgo o contraste de obligación del modelo', async () => {
  const safe = entries().map(e => ({ ...e, naturaleza: e.necesidad_id === 'N-04' ? 'exclusion' : 'regla' }));
  const request = jest.fn().mockResolvedValue({ hallazgos: [], contraste_categorias: safe });
  const result = await run(request);
  expect(result.auditoria_requisitos.revision_semantica.estado).toBe('completada');
  expect(result.auditoria_requisitos.revision_semantica.hallazgos).toEqual([]);
  expect(request).toHaveBeenCalledTimes(1);
});
