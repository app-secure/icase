jest.mock('../src/infrastructure/database/schemas/DisenoSchema', () => ({ findOneAndUpdate: jest.fn() }));
const Model = require('../src/infrastructure/database/schemas/DisenoSchema');
const Repository = require('../src/interface-adapters/repositories/MongoDisenoRepository');
const Controller = require('../src/interface-adapters/controllers/MockupController');
describe('persistencia y contrato de reparación de mockups', () => {
  test('la escritura compara updatedAt y no crea un documento tras conflicto', async () => {
    Model.findOneAndUpdate.mockResolvedValue(null);
    const stamp = new Date('2026-01-01');
    expect(await new Repository().guardarSiNoCambio('p', { aprobado: false }, stamp)).toBeNull();
    expect(Model.findOneAndUpdate).toHaveBeenCalledWith({ proyecto_id: 'p', updatedAt: stamp }, { $set: { aprobado: false } }, { new: true });
  });
  test('propaga el modo de reparación al trabajo persistente y a su ejecución', async () => {
    const jobs = { crearORecuperarActivo: jest.fn(async () => ({ creado: true, trabajo: { id: 'j' } })) };
    const controller = new Controller({ trabajoGeneracionRepository: jobs });
    controller._ejecutarTrabajo = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.iniciarTrabajo({ params: { proyectoId: 'p' }, body: { soloReparar: true } }, res);
    expect(jobs.crearORecuperarActivo).toHaveBeenCalledWith(expect.objectContaining({ soloReparar: true }));
    expect(controller._ejecutarTrabajo).toHaveBeenCalledWith('j', expect.objectContaining({ soloReparar: true }));
    expect(res.status).toHaveBeenCalledWith(202);
  });
  test('rechaza valores ambiguos de modo sin iniciar llamadas IA', async () => {
    const jobs = { crearORecuperarActivo: jest.fn() };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await new Controller({ trabajoGeneracionRepository: jobs }).iniciarTrabajo({ params: { proyectoId: 'p' }, body: { soloReparar: 'false' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(jobs.crearORecuperarActivo).not.toHaveBeenCalled();
  });
});
