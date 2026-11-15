const Jobs = require('../src/core/services/RequirementGenerationJobs');
const Execution = require('../src/infrastructure/services/RequirementExecutionContext');

function setup() {
  const row = { identificador: 'RF-01', descripcion: 'Consultar catálogo', aprobado: false, createdAt: '2026-11-15T16:00:00Z', updatedAt: '2026-11-15T16:00:00Z' };
  const job = { id: 'job', proyecto_id: 'project', usuario_id: 'user', estado: 'interrumpido', operacion_requisitos: 'redaccion_requisitos', createdAt: '2026-11-15T15:00:00Z',
    entrada_requisitos: { snapshot: 'before', payload: { analisisId: 'analysis' } },
    checkpoints_requisitos: { batch: { stage: 'redaccion_lote_1', validated: false, data: { requerimientos: [{ identificador: row.identificador, descripcion: row.descripcion }] } } } };
  const project = { usuario_id: 'user', nombre: 'Biblioteca', analisis_inicial_aprobado_id: 'analysis', auditoria_requisitos: { referencia_analisis_inicial: { id: 'analysis' }, revision_semantica: { estado: 'no_completada' } } };
  const lock = { assert: jest.fn(), release: jest.fn() };
  const jobs = { requirementsClaim: jest.fn(async () => ({ ...job, estado: 'procesando' })), requirementsSave: jest.fn() };
  const service = new Jobs({ jobs, projects: { obtenerPorId: async () => project }, requirements: { listarPorProyecto: async () => [row] }, mutationLease: { acquire: async () => lock }, execute: jest.fn() });
  service.get = jest.fn(async () => job);
  service.snapshot = jest.fn(async (_p, _u, _o, override) => override ? 'before' : 'after');
  service.launch = jest.fn();
  return { service, job, project, row, lock, jobs };
}

test('recupera el borrador anterior al reinicio sin repetir IA ni certificar su auditoría', async () => {
  const { service, jobs, project, lock } = setup();
  const result = await service.resume('job', 'user');
  expect(result.estado).toBe('completado');
  expect(result.resultado_requisitos.requerimientos).toHaveLength(1);
  expect(result.resultado_requisitos.auditoria_requisitos).toBe(project.auditoria_requisitos);
  expect(result.resultado_requisitos.auditoria_requisitos.revision_semantica.estado).toBe('no_completada');
  expect(service.launch).not.toHaveBeenCalled();
  expect(service.execute).not.toHaveBeenCalled();
  expect(jobs.requirementsSave).toHaveBeenCalledWith('job', expect.objectContaining({ salida_hash: 'after' }), true);
  expect(lock.release).toHaveBeenCalled();
});

test.each(['contenido', 'fecha', 'analisis', 'fuentes'])('no recupera sobre cambios externos: %s', async type => {
  const { service, row, project, jobs } = setup();
  if (type === 'contenido') row.descripcion = 'Edición manual';
  if (type === 'fecha') row.updatedAt = '2026-11-15T16:05:00Z';
  if (type === 'analisis') project.analisis_inicial_aprobado_id = 'other';
  if (type === 'fuentes') service.snapshot.mockResolvedValue('changed');
  await expect(service.resume('job', 'user')).rejects.toThrow('La entrada cambió');
  expect(jobs.requirementsClaim).not.toHaveBeenCalled();
});

test('un recibo permite recuperar actualizaciones, solo mientras coincidan entrada y salida', async () => {
  const { service, project, row, job } = setup();
  job.checkpoints_requisitos = {};
  project.auditoria_requisitos.registro_generacion = { trabajo_id: job.id, entrada_snapshot: 'before', requisitos_hash: Execution.hash([row]), salida_hash: 'after' };
  expect((await service.resume('job', 'user')).estado).toBe('completado');
  row.descripcion = 'Cambio posterior';
  await expect(service.resume('job', 'user')).rejects.toThrow('La entrada cambió');
});

test('recupera la representación normalizada antigua con su auditoría persistida, sin validarla como completa', async () => {
  const { service, project, row, job } = setup();
  job.checkpoints_requisitos = {};
  project.updatedAt = '2026-11-15T16:01:00Z';
  job.updatedAt = '2026-11-15T16:02:00Z';
  project.auditoria_requisitos.control_aprobacion = { bloqueado: true, requisitos: 1,
    calidad: { vinculos: [{ requisito: row.identificador, necesidades: [] }] } };
  const result = await service.resume('job', 'user');
  expect(result.resultado_requisitos.auditoria_requisitos.control_aprobacion.bloqueado).toBe(true);
  row.updatedAt = '2026-11-15T16:01:30Z';
  await expect(service.resume('job', 'user')).rejects.toThrow('La entrada cambió');
});
