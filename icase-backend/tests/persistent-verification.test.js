const CodificacionController = require('../src/interface-adapters/controllers/CodificacionController');

describe('Verificación persistente como TrabajoGeneracion', () => {
  const crearRepoTrabajos = () => {
    const trabajos = new Map();
    let seq = 1;
    return {
      crearORecuperarActivoVerificacion: jest.fn(async ({ proyectoId, artefactoId }) => {
        const id = `trabajo-${seq++}`;
        const trabajo = {
          id,
          proyecto_id: proyectoId,
          artefacto_id: artefactoId,
          tipo: 'verificacion',
          estado: 'encolado',
          progreso: 5,
          mensaje: 'Verificación en cola'
        };
        trabajos.set(id, trabajo);
        return { trabajo, creado: true };
      }),
      obtenerPorId: jest.fn(async (id) => trabajos.get(id) || null),
      obtenerUltimaVerificacionPorArtefacto: jest.fn(async (proyectoId, artefactoId) => {
        const list = [...trabajos.values()].filter(
          (t) => t.proyecto_id === proyectoId && t.artefacto_id === artefactoId
        );
        return list[list.length - 1] || null;
      }),
      actualizar: jest.fn(async (id, cambios) => {
        const actual = trabajos.get(id) || {};
        const actualizado = { ...actual, ...cambios };
        trabajos.set(id, actualizado);
        return actualizado;
      })
    };
  };

  test('inicia un trabajo asíncrono y actualiza el resultado al completarse', async () => {
    const mockRepoTrabajos = crearRepoTrabajos();
    const mockGestionarArtefactos = {
      verificarArtefacto: jest.fn(async () => ({
        estado: 'apta',
        nivel: 'completa',
        nota: 'Pruebas exitosas',
        pruebas: [{ paso: 'Compilación', resultado: 'OK' }]
      }))
    };

    const controller = new CodificacionController({
      gestionarPlanCodificacion: {},
      gestionarArtefactosCodigo: mockGestionarArtefactos,
      artefactoRepository: {},
      zipArchiveService: {},
      trabajoGeneracionRepository: mockRepoTrabajos
    });

    const req = { params: { id: 'p1', artefactoId: 'art-1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await controller.iniciarVerificacionAsync(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        trabajo: expect.objectContaining({ id: 'trabajo-1', estado: 'encolado' }),
        reutilizado: false
      })
    );

    // Esperar a que la ejecución asíncrona en segundo plano finalice
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGestionarArtefactos.verificarArtefacto).toHaveBeenCalledWith('p1', 'art-1');
    expect(mockRepoTrabajos.actualizar).toHaveBeenCalledWith(
      'trabajo-1',
      expect.objectContaining({
        estado: 'completado',
        progreso: 100,
        resultado_verificacion: expect.objectContaining({ estado: 'apta' })
      }),
      true
    );
  });

  test('permite consultar el trabajo y obtener la última verificación', async () => {
    const mockRepoTrabajos = crearRepoTrabajos();
    const controller = new CodificacionController({
      gestionarPlanCodificacion: {},
      gestionarArtefactosCodigo: { verificarArtefacto: jest.fn() },
      artefactoRepository: {},
      zipArchiveService: {},
      trabajoGeneracionRepository: mockRepoTrabajos
    });

    // Iniciar trabajo
    await controller.iniciarVerificacionAsync(
      { params: { id: 'p1', artefactoId: 'art-1' } },
      { status: jest.fn().mockReturnThis(), json: jest.fn() }
    );

    // Consultar por id
    const resId = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.obtenerTrabajoVerificacion(
      { params: { id: 'p1', artefactoId: 'art-1', trabajoId: 'trabajo-1' } },
      resId
    );
    expect(resId.json).toHaveBeenCalledWith(
      expect.objectContaining({
        trabajo: expect.objectContaining({ id: 'trabajo-1' })
      })
    );

    // Consultar último
    const resUltimo = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await controller.obtenerUltimoTrabajoVerificacion(
      { params: { id: 'p1', artefactoId: 'art-1' } },
      resUltimo
    );
    expect(resUltimo.json).toHaveBeenCalledWith(
      expect.objectContaining({
        trabajo: expect.objectContaining({ id: 'trabajo-1' })
      })
    );
  });
});
