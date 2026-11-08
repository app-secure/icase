const { inspectEvidence } = require('../src/infrastructure/services/SourceEvidence');
const Coverage = require('../src/infrastructure/services/RequirementCoverageService');
const Approval = require('../src/core/services/RequirementApprovalService');
const Entity = require('../src/core/entities/Requerimiento');
const Model = require('../src/infrastructure/database/schemas/RequerimientoSchema');

test('propuesta y confirmación son fragmentos separados con posiciones reales y fuente', () => {
  const input = '[Fuente enriquecida]\nArchivo: reunion.txt\nCategoría: Textos\n\n[Contenido extraído]\nAnalista: ¿Solo el supervisor autoriza?\nGerente: Sí, únicamente él.';
  const evidence = inspectEvidence({ evidencias: [{ texto: '¿Solo el supervisor autoriza?', fuente: 'reunion.txt', inicio: 0 }, { texto: 'Sí, únicamente él.', fuente: 'reunion.txt' }] }, input);
  expect(evidence.valido).toBe(true);
  for (const entry of evidence.valid) expect(input.slice(entry.inicio, entry.fin)).toBe(entry.texto);
  expect(evidence.valid[0].inicio).not.toBe(0);
  expect(inspectEvidence({ evidencias: [{ texto: '¿Solo el supervisor autoriza? Sí, únicamente él.' }] }, input).valido).toBe(false);
});

test('no acepta fuente ajena, elipsis, paráfrasis ni fragmentos ambiguos', () => {
  expect(inspectEvidence({ evidencias: [{ texto: 'Confirmado', fuente: 'otro.txt' }] }, 'Confirmado').valido).toBe(false);
  for (const texto of ['Cita [...] completa', 'Texto reformulado']) expect(inspectEvidence({ evidencias: [{ texto }] }, 'Cita original completa').valido).toBe(false);
  expect(inspectEvidence({ evidencias: [{ texto: 'Sí' }] }, 'Sí. Sí.').invalid[0].codigo).toBe('evidencia_ambigua');
});

test('persiste múltiples evidencias y proyectos anteriores conservan defaults', () => {
  const evidencias = inspectEvidence({ evidencias: [{ texto: 'Consulta autorizada' }] }, 'Consulta autorizada').valid;
  const entity = new Entity({ proyecto_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', identificador: 'RF-1', nombre: 'Consulta', evidencias });
  const document = new Model(entity);
  expect(document.validateSync()).toBeUndefined();
  expect(document.toJSON().evidencias).toEqual(evidencias);
  expect(new Entity({}).evidencias).toEqual([]);
});

test('necesidad funcional rechazada por citación sigue pendiente y bloquea aprobación', async () => {
  const input = 'Consultar expedientes. Autorizar solicitudes.';
  const request = jest.fn().mockResolvedValueOnce({ inventario_necesidades: [
    { id: 'N-1', tipo: 'RF', necesidad: 'Consultar', objetivo_id: 'O-1', estado: 'confirmado', evidencias: [{ texto: 'Consultar expedientes.' }] },
    { id: 'N-2', tipo: 'RF', necesidad: 'Autorizar', objetivo_id: 'O-2', estado: 'confirmado', evidencias: [{ texto: 'Cita inventada' }] }
  ] }).mockResolvedValueOnce(null).mockResolvedValueOnce({ requerimientos: [{ tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar', necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }], evidencias: [{ texto: 'Consultar expedientes.' }] }] });
  const result = await new Coverage().generate({ input, prompt: input, request });
  expect(result.auditoria_requisitos.necesidades_pendientes[0]).toMatchObject({ id: 'N-2', motivo: 'evidencia_incorrecta', estado_validacion: 'pendiente' });
  expect(result.auditoria_requisitos.necesidades_pendientes[0].historial).toHaveLength(2);
  expect(new Approval().evaluate(result.requerimientos, result.auditoria_requisitos).errores_criticos).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'NECESIDAD_PENDIENTE_VALIDACION', necesidad: 'N-2' })]));
});
