const Jobs = require('../src/core/services/RequirementGenerationJobs');
test('reanudar devuelve el estado persistido en ejecución, no el interrumpido anterior', async () => {
  const paused = { id: 'job', proyecto_id: 'project', usuario_id: 'user', estado: 'interrumpido', entrada_requisitos: { snapshot: 'same' } };
  const claimed = { ...paused, estado: 'procesando' };
  const jobs = { requirementsClaim: jest.fn(async () => claimed) };
  const service = new Jobs({ jobs });
  service.get = jest.fn(async () => paused);
  service.snapshot = jest.fn(async () => 'same');
  service.launch = jest.fn();
  const result = await service.resume('job', 'user');
  expect(result.estado).toBe('procesando');
  expect(service.launch).toHaveBeenCalledWith('job', true, claimed);
  expect(jobs.requirementsClaim).toHaveBeenCalledTimes(1);
});
test('un segundo clic no reclama un trabajo que ya se está ejecutando', async () => {
  const service = new Jobs({ jobs: { requirementsClaim: jest.fn() } });
  service.get = jest.fn(async () => ({ estado: 'procesando', entrada_requisitos: { snapshot: 'same' } }));
  service.snapshot = jest.fn(async () => 'same');
  service.launch = jest.fn();
  expect((await service.resume('job', 'user')).estado).toBe('procesando');
  expect(service.launch).not.toHaveBeenCalled();
  expect(service.jobs.requirementsClaim).not.toHaveBeenCalled();
});
