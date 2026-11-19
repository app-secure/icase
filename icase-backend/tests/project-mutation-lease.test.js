jest.mock('../src/infrastructure/database/schemas/ProjectMutationLeaseSchema', () => ({
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn()
}));

const Model = require('../src/infrastructure/database/schemas/ProjectMutationLeaseSchema');
const ProjectMutationLease = require('../src/infrastructure/services/ProjectMutationLease');

function queryReturning(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('ProjectMutationLease', () => {
  beforeEach(() => jest.clearAllMocks());

  test('acquires and releases the lease idempotently', async () => {
    // The query result must echo the generated owner, which is not known in advance.
    Model.findOneAndUpdate.mockImplementation((filter, update) => queryReturning({ owner: update.$set.owner }));
    Model.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const lease = await new ProjectMutationLease().acquire('project-1');
    expect(() => lease.assert()).not.toThrow();
    await lease.release();
    await lease.release();

    expect(Model.create).not.toHaveBeenCalled();
    expect(Model.deleteOne).toHaveBeenCalledTimes(1);
    expect(Model.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ _id: 'project-1', owner: expect.any(String) }));
  });

  test('reports actual contention as 409, not a storage failure', async () => {
    Model.findOneAndUpdate.mockReturnValue(queryReturning(null));
    Model.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));

    await expect(new ProjectMutationLease().acquire('project-2', { waitMs: 0 }))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('ocupado') });
  });

  test('distinguishes database errors from lock contention', async () => {
    Model.findOneAndUpdate.mockImplementation(() => { throw new Error('database unavailable'); });

    await expect(new ProjectMutationLease().acquire('project-3'))
      .rejects.toMatchObject({ status: 503, message: expect.stringContaining('comprobar') });
  });
});
