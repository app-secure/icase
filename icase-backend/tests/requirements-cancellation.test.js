const Jobs = require('../src/core/services/RequirementGenerationJobs');
const Execution = require('../src/infrastructure/services/RequirementExecutionContext');
test('cancelar verifica propiedad y libera el bloqueo de escritura', async () => {
  const release = jest.fn();
  const cancel = jest.fn(async () => ({ id: 'job', estado: 'cancelado', proyecto_id: 'project' }));
  const service = new Jobs({ jobs: { requirementsCancel: cancel }, mutationLease: { acquire: async () => ({ release }) } });
  service.get = jest.fn(async () => ({ proyecto_id: 'project' }));
  expect((await service.cancel('job', 'user')).estado).toBe('cancelado');
  expect(service.get).toHaveBeenCalledWith('job', 'user');
  expect(cancel).toHaveBeenCalledWith('job', 'user');
  expect(release).toHaveBeenCalled();
});
test('una respuesta posterior a la cancelación no se guarda como checkpoint', async () => {
  let cancelled = false;
  const save = jest.fn();
  const context = { checkpoints: {}, assertCurrent: async () => { if (cancelled) throw new Error('Cancelado'); }, progress: async () => {}, save };
  await expect(Execution.run(context, () => Execution.request('extract', 'prompt', async () => { cancelled = true; return { data: 'late' }; }))).rejects.toThrow('Cancelado');
  expect(save).not.toHaveBeenCalled();
  expect(context.checkpoints).toEqual({});
});
