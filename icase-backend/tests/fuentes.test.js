const FuenteController = require('../src/interface-adapters/controllers/FuenteController');

describe('Fuentes enriquecidas', () => {
  const sourceId = '507f1f77bcf86cd799439011';
  const projectId = '507f191e810c19729de860ea';

  test('clasifica automáticamente textos, documentos, audios y videos', () => {
    const controller = new FuenteController({});
    expect(controller._categoriaDeArchivo({ tipo: 'texto', nombreArchivo: 'notas.txt' })).toBe('textos');
    expect(controller._categoriaDeArchivo({ tipo: 'pdf', nombreArchivo: 'alcance.pdf' })).toBe('documentos');
    expect(controller._categoriaDeArchivo({ tipo: 'audio', nombreArchivo: 'entrevista.mp3' })).toBe('audios');
    expect(controller._categoriaDeArchivo({ tipo: 'audio', nombreArchivo: 'reunion.mp4', mimetype: 'video/mp4' })).toBe('videos');
  });

  test('persiste metadatos y recompone el contexto consumido por la IA', async () => {
    const fuenteRepository = {
      obtenerPorId: jest.fn().mockResolvedValue({
        id: sourceId,
        proyecto_id: projectId,
        nombre_archivo: 'entrevista.mp3',
        tipo: 'audio',
        texto_transcrito: 'El cliente necesita reservar una mesa.'
      }),
      actualizar: jest.fn().mockImplementation(async (id, cambios) => ({
        id,
        proyecto_id: projectId,
        nombre_archivo: 'entrevista.mp3',
        tipo: 'audio',
        ...cambios
      })),
      listarPorProyecto: jest.fn().mockResolvedValue([{
        nombre_archivo: 'entrevista.mp3',
        tipo: 'audio',
        categoria: 'audios',
        tipo_contenido: 'Entrevista',
        descripcion: 'Conversación con el dueño del restaurante.',
        etiquetas: ['reservas', 'clientes'],
        texto_transcrito: 'El cliente necesita reservar una mesa.',
        transcripcion_verificada: true
      }])
    };
    const proyectoRepository = { actualizar: jest.fn().mockResolvedValue(true) };
    const controller = new FuenteController({ fuenteRepository, proyectoRepository });
    const req = {
      params: { id: sourceId },
      body: {
        categoria: 'audios',
        tipo_contenido: 'Entrevista',
        descripcion: 'Conversación con el dueño del restaurante.',
        etiquetas: ['reservas', 'clientes'],
        transcripcion_verificada: true
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await controller.actualizar(req, res);

    expect(fuenteRepository.actualizar).toHaveBeenCalledWith(sourceId, expect.objectContaining({
      categoria: 'audios',
      tipo_contenido: 'Entrevista',
      transcripcion_verificada: true
    }));
    expect(proyectoRepository.actualizar).toHaveBeenCalledWith(projectId, expect.objectContaining({
      insumo_bruto: expect.stringContaining('Descripción aportada por el usuario: Conversación con el dueño del restaurante.')
    }));
    expect(res.json).toHaveBeenCalled();
  });
});
