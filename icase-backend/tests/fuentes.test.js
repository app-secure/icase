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

  test('la subida ofrece fecha PDF detectada y no inventa fecha para texto', async () => {
    const fuenteRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      crear: jest.fn(async value => ({ id: sourceId, ...value })),
      actualizar: jest.fn()
    };
    const proyectoRepository = { actualizar: jest.fn().mockResolvedValue(true) };
    const ingestionService = {
      procesarArchivo: jest.fn().mockResolvedValue('Contenido extraído.'),
      extraerFechaDocumento: jest.fn(async (_path, type) => type === 'pdf' ? '2024-03-12' : '')
    };
    const controller = new FuenteController({ fuenteRepository, proyectoRepository, fileIngestionService: ingestionService });
    const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
    const request = { params: { proyectoId: projectId }, file: { originalname: 'acta.pdf', mimetype: 'application/pdf', path: 'acta.pdf', size: 100 } };
    await controller.subirYTranscribir(request, response());
    expect(fuenteRepository.crear).toHaveBeenLastCalledWith(expect.objectContaining({ fecha_documento: '2024-03-12', fecha_documento_origen: 'metadatos_pdf' }));
    fuenteRepository.crear.mockClear();
    await controller.subirYTranscribir({ ...request, file: { ...request.file, originalname: 'notas.txt', mimetype: 'text/plain' } }, response());
    expect(fuenteRepository.crear).toHaveBeenLastCalledWith(expect.objectContaining({ fecha_documento: '', fecha_documento_origen: '' }));
  });

  test('la sugerencia de IA conserva la fecha de metadatos y descarta fechas inventadas', async () => {
    const fuente = { id: sourceId, proyecto_id: projectId, nombre_archivo: 'acta.pdf', tipo: 'pdf', texto_transcrito: 'Acta de reunión.' };
    const fuenteRepository = { obtenerPorId: jest.fn().mockResolvedValue(fuente) };
    const modelosIaService = { providerOrder: ['gemini'], _ejecutarProveedor: jest.fn().mockResolvedValue({
      categoria: 'documentos', tipo_contenido: 'Acta', descripcion: 'Acta del proyecto', fecha_documento: '2099-01-01', etiquetas: ['acta']
    }) };
    const controller = new FuenteController({ fuenteRepository, modelosIaService });
    const res = { json: jest.fn().mockReturnThis(), status: jest.fn().mockReturnThis() };
    await controller.sugerirMetadatos({ params: { id: sourceId }, body: {} }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fecha_documento: '', fecha_documento_origen: '' }));

    fuente.fecha_documento = '2024-03-12'; fuente.fecha_documento_origen = 'metadatos_pdf';
    await controller.sugerirMetadatos({ params: { id: sourceId }, body: {} }, res);
    expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ fecha_documento: '2024-03-12', fecha_documento_origen: 'metadatos_pdf' }));
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
      insumo_bruto: expect.stringContaining('Descripción registrada en la fuente: Conversación con el dueño del restaurante.')
    }));
    expect(res.json).toHaveBeenCalled();
  });
});
