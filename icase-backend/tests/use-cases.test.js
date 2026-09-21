const CrearProyecto = require('../src/core/use-cases/CrearProyecto');
const ActualizarRequerimientoManual = require('../src/core/use-cases/ActualizarRequerimientoManual');
const ActualizarDiagramaManual = require('../src/core/use-cases/ActualizarDiagramaManual');
const AprobarFase = require('../src/core/use-cases/AprobarFase');
const ProcesarConIA = require('../src/core/use-cases/ProcesarConIA');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');

describe('I-CASE Clean Architecture Use-Cases Unit Tests', () => {

  test('CrearProyecto debe validar campos obligatorios y persistir', async () => {
    const mockRepo = {
      crear: jest.fn().mockImplementation(p => Promise.resolve({ ...p, id: 'proj-123' }))
    };
    const useCase = new CrearProyecto({ proyectoRepository: mockRepo });

    await expect(useCase.ejecutar({ nombre: '' })).rejects.toThrow('El nombre del proyecto es obligatorio.');

    const resultado = await useCase.ejecutar({
      nombre: 'Sistema de Bodega',
      descripcion: 'Prueba unitaria',
      insumo_bruto: 'Texto inicial'
    });

    expect(mockRepo.crear).toHaveBeenCalled();
    expect(resultado.id).toBe('proj-123');
    expect(resultado.estado_fase).toBe('analisis_pendiente');
  });

  test('ActualizarRequerimientoManual debe actualizar sin invocar IA', async () => {
    const mockRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'req-1', nombre: 'Nombre viejo' }),
      actualizar: jest.fn().mockImplementation((id, datos) => Promise.resolve({ id, ...datos }))
    };

    const useCase = new ActualizarRequerimientoManual({ requerimientoRepository: mockRepo });
    const actualizado = await useCase.ejecutar({
      id: 'req-1',
      datos: { nombre: 'Nombre editado manualmente' }
    });

    expect(mockRepo.obtenerPorId).toHaveBeenCalledWith('req-1');
    expect(mockRepo.actualizar).toHaveBeenCalledWith('req-1', { nombre: 'Nombre editado manualmente' });
    expect(actualizado.nombre).toBe('Nombre editado manualmente');
  });

  test('ActualizarDiagramaManual debe validar sintaxis PlantUML antes de persistir', async () => {
    const mockRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'diag-1', codigo_plantuml: '@startuml\nactor Admin\n@enduml' }),
      actualizar: jest.fn().mockImplementation((id, datos) => Promise.resolve({ id, ...datos }))
    };
    const validator = new PlantUMLValidatorService();
    const useCase = new ActualizarDiagramaManual({
      diagramaRepository: mockRepo,
      plantumlValidatorService: validator
    });

    // Código inválido
    await expect(useCase.ejecutar({
      id: 'diag-1',
      datos: { codigo_plantuml: 'sintaxis_invalida_sin_header' }
    })).rejects.toThrow('Sintaxis PlantUML inválida');

    // Código válido
    const res = await useCase.ejecutar({
      id: 'diag-1',
      datos: { codigo_plantuml: '@startuml\nrectangle "Test"\n@enduml' }
    });

    expect(res.codigo_plantuml).toBe('@startuml\nrectangle "Test"\n@enduml');
  });

  test('AprobarFase debe cambiar estado y opcionalmente aprobar todos los requerimientos', async () => {
    const mockProjRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'analisis_pendiente' }),
      actualizarEstadoFase: jest.fn().mockImplementation((id, estado) => Promise.resolve({ id, estado_fase: estado }))
    };
    const mockReqRepo = {
      listarPorProyecto: jest.fn().mockResolvedValue([
        { id: 'r1', aprobado: false },
        { id: 'r2', aprobado: false }
      ]),
      actualizar: jest.fn().mockResolvedValue(true)
    };
    const mockDiagRepo = {};

    const useCase = new AprobarFase({
      proyectoRepository: mockProjRepo,
      requerimientoRepository: mockReqRepo,
      diagramaRepository: mockDiagRepo
    });

    const resultado = await useCase.ejecutar({
      proyectoId: 'p1',
      fase: 'analisis',
      aprobarTodosLosElementos: true
    });

    expect(resultado.nuevoEstado).toBe('analisis_aprobado');
    expect(mockReqRepo.actualizar).toHaveBeenCalledTimes(2);
  });

  test('ProcesarConIA debe enviar los 3 bloques mandatorios en el payload', async () => {
    const mockProjRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta de prueba' })
    };
    const mockReqRepo = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      eliminarPorProyecto: jest.fn().mockResolvedValue(true),
      crearMuchos: jest.fn().mockResolvedValue([])
    };
    const mockDiagRepo = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      eliminarPorProyecto: jest.fn().mockResolvedValue(true),
      crearMuchos: jest.fn().mockResolvedValue([])
    };
    const mockEstandarRepo = {
      obtenerEstandares: jest.fn().mockResolvedValue([{ clave: 'IEEE-830' }])
    };

    let payloadEnviado = null;
    const mockAiService = {
      procesar: jest.fn().mockImplementation(payload => {
        payloadEnviado = payload;
        return Promise.resolve({
          requerimientos: [{ tipo: 'RF', identificador: 'RF-01', nombre: 'Test', prioridad: 'Alta' }],
          diagramas: [{ tipo: 'casos_de_uso', titulo: 'CU Test', codigo_mermaid: 'graph TD\nA-->B' }]
        });
      })
    };

    const useCase = new ProcesarConIA({
      proyectoRepository: mockProjRepo,
      requerimientoRepository: mockReqRepo,
      diagramaRepository: mockDiagRepo,
      estandarRepository: mockEstandarRepo,
      aiOrchestratorService: mockAiService
    });

    await useCase.ejecutar({ proyectoId: 'p1' });

    expect(payloadEnviado).not.toBeNull();
    // Validar los 3 bloques explícitos
    expect(payloadEnviado).toHaveProperty('insumo_bruto');
    expect(payloadEnviado).toHaveProperty('diccionario_estandares');
    expect(payloadEnviado).toHaveProperty('contexto_proyecto');
    expect(payloadEnviado.insumo_bruto).toBe('Acta de prueba');
    expect(payloadEnviado.diccionario_estandares).toEqual([{ clave: 'IEEE-830' }]);
  });

});
