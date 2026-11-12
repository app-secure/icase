jest.mock('../src/infrastructure/database/schemas/TrabajoGeneracionSchema', () => ({
  updateMany: jest.fn(), findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn()
}));
const Model = require('../src/infrastructure/database/schemas/TrabajoGeneracionSchema');
const Repository = require('../src/interface-adapters/repositories/MongoTrabajoGeneracionRepository');
beforeEach(() => jest.clearAllMocks());
test('nuevo trabajo hereda solo checkpoints validados del mismo propietario y proyecto', async () => {
  Model.findOne.mockImplementation(query => {
    if (query.clave_activa) return { lean: async () => null };
    if (query._id) return { lean: async () => ({ _id: 'j', proyecto_id: 'p', usuario_id: 'u' }) };
    return { sort: () => ({ lean: async () => ({ checkpoints_requisitos: { valid: { validated: true, data: {} }, invalid: { validated: false } } }) }) };
  });
  Model.create.mockResolvedValue({ _id: 'j' });
  await new Repository().requirementsStart({ proyecto_id: 'p', usuario_id: 'u', entrada_hash: 'new' });
  expect(Model.findOne).toHaveBeenCalledWith({ proyecto_id: 'p', usuario_id: 'u', tipo: 'requisitos' });
  expect(Model.create.mock.calls[0][0].checkpoints_requisitos).toEqual({ valid: { validated: true, data: {} } });
});
test('recuperación solo marca interrumpido y no reclama ni genera', async () => {
  await new Repository().requirementsRecover();
  expect(Model.updateMany.mock.calls[0][0]).toMatchObject({ tipo: 'requisitos', estado: { $in: ['encolado', 'procesando'] } });
  expect(Model.updateMany.mock.calls[0][1].$set.estado).toBe('interrumpido');
  expect(Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test('guardar exige ejecutor, estado activo y lease vigente', async () => {
  Model.updateOne.mockResolvedValue({ matchedCount: 0 });
  const repo = new Repository();
  await expect(repo.requirementsSave('j', {})).rejects.toMatchObject({ code: 'REQUIREMENTS_LEASE_LOST' });
  expect(Model.updateOne.mock.calls[0][0]).toMatchObject({ _id: 'j', tipo: 'requisitos', estado: 'procesando', ejecutor_id: repo.ejecutorId });
  expect(Model.updateOne.mock.calls[0][0].lease_expires_at.$gt).toBeInstanceOf(Date);
});
