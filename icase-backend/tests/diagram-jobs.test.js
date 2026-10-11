const ProyectoController = require('../src/interface-adapters/controllers/ProyectoController');

describe('Trabajos persistentes de diagramas', () => {
  test('devuelve el resultado completo cuando el trabajo ya terminó', async () => {
    const diagramas = [{
      id: 'd1',
      tipo: 'casos_de_uso',
      aprobado: false,
      estado: 'pendiente_revision',
      version: 1
    }];
    const controller = new ProyectoController({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo' }) },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue([{ id: 'r1', tipo: 'RF' }]) },
      diagramaRepository: { listarPorProyecto: jest.fn().mockResolvedValue(diagramas) }
    });

    const response = await controller._respuestaTrabajoDiagrama({
      id: 'j1',
      proyecto_id: 'p1',
      tipo: 'diagrama',
      estado: 'completado',
      cache_hit: false
    });

    expect(response.resultado.diagramas).toEqual(diagramas);
    expect(response.resultado.flujoDiagramas.items[0]).toEqual(expect.objectContaining({
      tipo: 'casos_de_uso',
      estado: 'pendiente_revision'
    }));
  });
});
