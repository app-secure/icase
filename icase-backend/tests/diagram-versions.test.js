const DiagramaController = require('../src/interface-adapters/controllers/DiagramaController');

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('Historial de versiones de diagramas', () => {
  test('usa la versión más reciente aunque la interfaz consulte un id anterior', async () => {
    const versiones = [
      {
        id: 'version-1', proyecto_id: 'proyecto-1', tipo: 'casos_de_uso', version: 1,
        titulo: 'V1', codigo_mermaid: 'graph TD', createdAt: new Date('2026-01-01')
      },
      {
        id: 'version-2', proyecto_id: 'proyecto-1', tipo: 'casos_de_uso', version: 2,
        titulo: 'V2', codigo_mermaid: 'graph TD', createdAt: new Date('2026-01-02')
      },
      {
        id: 'version-3', proyecto_id: 'proyecto-1', tipo: 'casos_de_uso', version: 3,
        titulo: 'V3', codigo_mermaid: 'graph TD', createdAt: new Date('2026-01-03')
      }
    ];
    const controller = new DiagramaController({
      diagramaRepository: {
        obtenerPorId: jest.fn().mockResolvedValue(versiones[0]),
        listarPorProyecto: jest.fn().mockResolvedValue(versiones)
      }
    });
    const res = response();

    await controller.listarVersiones({ params: { id: 'version-1' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      actual: expect.objectContaining({ id: 'version-3', version: 3 }),
      historial: expect.arrayContaining([
        expect.objectContaining({ version: 2 }),
        expect.objectContaining({ version: 1 })
      ])
    }));
  });

  test('oculta versiones duplicadas creadas por restauraciones antiguas', async () => {
    const versiones = [{
      id: 'actual', proyecto_id: 'proyecto-1', tipo: 'casos_de_uso', version: 4,
      titulo: 'Actual', codigo_mermaid: 'actual', codigo_plantuml: 'actual',
      historial_versiones: [
        { version: 1, titulo: 'Original', codigo_mermaid: 'original', codigo_plantuml: 'original' },
        { version: 2, titulo: 'Original', codigo_mermaid: 'original', codigo_plantuml: 'original' },
        { version: 3, titulo: 'Actual', codigo_mermaid: 'actual', codigo_plantuml: 'actual' }
      ]
    }];
    const controller = new DiagramaController({
      diagramaRepository: {
        obtenerPorId: jest.fn().mockResolvedValue(versiones[0]),
        listarPorProyecto: jest.fn().mockResolvedValue(versiones)
      }
    });
    const res = response();

    await controller.listarVersiones({ params: { id: 'actual' } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.historial).toHaveLength(1);
    expect(payload.historial[0].version).toBe(2);
  });
});
