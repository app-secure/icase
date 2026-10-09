const CrearProyecto = require('../src/core/use-cases/CrearProyecto');
const ActualizarRequerimientoManual = require('../src/core/use-cases/ActualizarRequerimientoManual');
const ActualizarDiagramaManual = require('../src/core/use-cases/ActualizarDiagramaManual');
const RestaurarVersionDiagrama = require('../src/core/use-cases/RestaurarVersionDiagrama');
const AprobarFase = require('../src/core/use-cases/AprobarFase');
const ModelosIaService = require('../src/infrastructure/services/ModelosIaService');
const ProcesarConIA = require('../src/core/use-cases/ProcesarConIA');
const PlantUMLValidatorService = require('../src/infrastructure/services/PlantUMLValidatorService');
const PlantUMLSynthesizer = require('../src/infrastructure/services/PlantUMLSynthesizer');

describe('I-CASE Clean Architecture Use-Cases Unit Tests', () => {
  test('ModelosIaService debe usar catálogos configurables sin fallbacks obsoletos', async () => {
    const anteriores = {
      groq: process.env.GROQ_ANALYSIS_MODELS,
      gemini: process.env.GEMINI_ANALYSIS_MODELS,
      budget: process.env.GROQ_ANALYSIS_INPUT_BUDGET
    };
    process.env.GROQ_ANALYSIS_MODELS = 'modelo-groq-vigente';
    process.env.GEMINI_ANALYSIS_MODELS = 'modelo-gemini-vigente';
    process.env.GROQ_ANALYSIS_INPUT_BUDGET = '10';

    const service = new ModelosIaService();
    service.groqApiKey = 'test-key';

    expect(service.models.groq).toEqual(['modelo-groq-vigente']);
    expect(service.models.gemini).toEqual(['modelo-gemini-vigente']);
    await expect(service.generarConGroq('x'.repeat(1000), null, { allowFallback: false }))
      .rejects.toThrow('supera el presupuesto Groq');
    service._registrarErrorModelo('gemini:modelo-gemini-vigente', {
      response: { status: 429, data: { error: { message: 'quota exceeded' } } }
    });
    expect(service._modeloDisponible('gemini:modelo-gemini-vigente')).toBe(false);

    for (const [key, value] of Object.entries(anteriores)) {
      const envName = key === 'groq' ? 'GROQ_ANALYSIS_MODELS' : key === 'gemini' ? 'GEMINI_ANALYSIS_MODELS' : 'GROQ_ANALYSIS_INPUT_BUDGET';
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  });


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
    expect(resultado.estado_fase).toBe('insumos_pendientes');
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

  test('ActualizarDiagramaManual invalida los diagramas dependientes', async () => {
    const existente = {
      id: 'd1', proyecto_id: 'p1', tipo: 'casos_de_uso', version: 1,
      codigo_plantuml: '@startuml\nactor Usuario\n@enduml'
    };
    const dependiente = { id: 'd2', proyecto_id: 'p1', tipo: 'clases_dominio', aprobado: true, estado: 'aprobado' };
    const diagramaRepository = {
      obtenerPorId: jest.fn().mockResolvedValue(existente),
      listarPorProyecto: jest.fn().mockResolvedValue([existente, dependiente]),
      actualizar: jest.fn().mockImplementation((id, changes) => Promise.resolve({ ...(id === 'd1' ? existente : dependiente), ...changes, id }))
    };
    const proyectoRepository = { actualizarEstadoFase: jest.fn().mockResolvedValue(true) };
    const useCase = new ActualizarDiagramaManual({ diagramaRepository, proyectoRepository });

    await useCase.ejecutar({ id: 'd1', datos: { descripcion: 'Nueva descripción' } });

    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({ aprobado: false, version: 2 }));
    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({
      historial_versiones: [expect.objectContaining({ version: 1 })]
    }));
    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d2', expect.objectContaining({ estado: 'desactualizado', desactualizado: true }));
    expect(proyectoRepository.actualizarEstadoFase).toHaveBeenCalledWith('p1', 'diseno_pendiente');
  });

  test('RestaurarVersionDiagrama recupera una versión anterior como una nueva versión', async () => {
    const actual = {
      id: 'd2', proyecto_id: 'p1', tipo: 'casos_de_uso', version: 2,
      titulo: 'Actual', descripcion: 'Versión actual', codigo_mermaid: 'actual',
      codigo_plantuml: '@startuml\nactor Actual\n@enduml', historial_versiones: []
    };
    const anterior = {
      id: 'd1', proyecto_id: 'p1', tipo: 'casos_de_uso', version: 1,
      titulo: 'Anterior', descripcion: 'Versión anterior', codigo_mermaid: 'anterior',
      codigo_plantuml: '@startuml\nactor Anterior\n@enduml'
    };
    const actualizarDiagramaManualUseCase = {
      ejecutar: jest.fn().mockImplementation(({ id, datos }) => Promise.resolve({ id, ...datos, version: 3 }))
    };
    const useCase = new RestaurarVersionDiagrama({
      diagramaRepository: {
        obtenerPorId: jest.fn().mockResolvedValue(actual),
        listarPorProyecto: jest.fn().mockResolvedValue([anterior, actual])
      },
      actualizarDiagramaManualUseCase
    });

    const result = await useCase.ejecutar({ id: 'd2', version: 1 });

    expect(actualizarDiagramaManualUseCase.ejecutar).toHaveBeenCalledWith({
      id: 'd2',
      datos: expect.objectContaining({
        titulo: 'Anterior',
        codigo_plantuml: anterior.codigo_plantuml,
        restaurada_desde_version: 1
      })
    });
    expect(result.version).toBe(3);
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

  test('PlantUMLSynthesizer conserva sin alteraciones el código de los diagramas válidos', () => {
    const codigo = '@startuml\n!include <C4/C4_Container>\nSystem_Boundary(s, "Demo") {\nContainer(api, "API", "Go", "Servicio")\nContainerDb(db, "Datos", "PostgreSQL", "Persistencia")\n}\nRel(api, db, "Consulta", "SQL")\n@enduml';
    const [architecture] = PlantUMLSynthesizer.normalizar([{
      tipo: 'arquitectura',
      codigo_plantuml: codigo
    }]).filter((item) => item.tipo === 'arquitectura');
    expect(architecture.codigo_plantuml).toBe(codigo);
  });

  test('PlantUMLValidatorService rechaza diagramas densos o incompletos por tipo', () => {
    const validator = new PlantUMLValidatorService();
    const invalidUseCases = '@startuml\nactor Usuario\nrectangle Sistema {\nusecase "Uno" as U1\n}\n@enduml';
    const invalidArchitecture = '@startuml\nrectangle API\n@enduml';
    const invalidClasses = '@startuml\nclass Usuario\nclass Pedido\nclass Pago\n@enduml';
    expect(validator.validar(invalidUseCases, 'casos_de_uso').valido).toBe(false);
    expect(validator.validar(invalidArchitecture, 'arquitectura').valido).toBe(false);
    expect(validator.validar(invalidClasses, 'clases').valido).toBe(false);
  });

  test('PlantUMLValidatorService diferencia arquitectura de software, sistema y navegación', () => {
    const validator = new PlantUMLValidatorService();
    const systemArchitecture = '@startuml\nnode "Balanceador" as lb\nnode "Servidor API" as api\ndatabase "PostgreSQL" as db\nlb --> api\napi --> db\n@enduml';
    const navigation = '@startmindmap\n* Sistema\n** Ventas\n*** Listado\n*** Detalle\n@endmindmap';

    expect(validator.validar(systemArchitecture, 'arquitectura_sistema').valido).toBe(true);
    expect(validator.validar(systemArchitecture, 'arquitectura_software').valido).toBe(false);
    expect(validator.validar(navigation, 'arbol_navegacion').valido).toBe(true);
  });

  test('AprobarFase bloquea un diagrama que no supera el control de calidad', async () => {
    const invalido = {
      id: 'd1', tipo: 'casos_de_uso', aprobado: false, estado: 'pendiente_revision', version: 1,
      codigo_plantuml: '@startuml\nactor Usuario\nrectangle Sistema {\nusecase "Único" as UC1\n}\nUsuario --> UC1\n@enduml'
    };
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([invalido]),
      actualizar: jest.fn().mockImplementation((id, changes) => Promise.resolve({ ...invalido, ...changes, id }))
    };
    const useCase = new AprobarFase({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }) },
      requerimientoRepository: {},
      diagramaRepository,
      disenoRepository: {},
      plantumlValidatorService: new PlantUMLValidatorService()
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'casos_de_uso' }))
      .rejects.toThrow('no supera el control de calidad');
    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({
      estado_calidad: 'invalido',
      errores_validacion: expect.any(Array)
    }));
    expect(diagramaRepository.actualizar).not.toHaveBeenCalledWith('d1', expect.objectContaining({ aprobado: true }));
  });

  test('AprobarFase impide omitir la revisión individual de diagramas', async () => {
    const proyectoRepository = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }),
      actualizarEstadoFase: jest.fn()
    };
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([
        { id: 'd1', tipo: 'casos_de_uso' },
        { id: 'd2', tipo: 'arquitectura' }
      ]),
      actualizar: jest.fn()
    };
    const useCase = new AprobarFase({
      proyectoRepository,
      requerimientoRepository: {},
      diagramaRepository,
      disenoRepository: {}
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', fase: 'diagramas' }))
      .rejects.toThrow('La aprobación masiva ya no está disponible');
    expect(proyectoRepository.actualizarEstadoFase).not.toHaveBeenCalled();
  });

  test('AprobarFase debe separar aprobación de diagramas y mockups', async () => {
    const proyecto = { id: 'p1', estado_fase: 'diseno_pendiente' };
    const proyectoRepository = {
      obtenerPorId: jest.fn().mockImplementation(() => Promise.resolve({ ...proyecto })),
      actualizarEstadoFase: jest.fn().mockImplementation((id, estado) => {
        proyecto.estado_fase = estado;
        return Promise.resolve({ id, estado_fase: estado });
      })
    };
    const diagramas = ['casos_de_uso', 'clases_dominio', 'arquitectura_software', 'arquitectura_sistema', 'clases_diseno', 'arbol_navegacion']
      .map((tipo, index) => ({ id: `d${index + 1}`, tipo, aprobado: true, estado: 'aprobado' }));
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue(diagramas),
      actualizar: jest.fn().mockResolvedValue(true)
    };
    const disenoRepository = {
      obtenerPorProyecto: jest.fn().mockResolvedValue({ mockups: [{ nombre_pantalla: 'inicio' }] })
    };
    const useCase = new AprobarFase({
      proyectoRepository,
      requerimientoRepository: {},
      diagramaRepository,
      disenoRepository
    });

    const diagramResult = await useCase.ejecutar({
      proyectoId: 'p1', fase: 'diagramas', aprobarTodosLosElementos: true
    });
    const mockupResult = await useCase.ejecutar({ proyectoId: 'p1', fase: 'mockups' });

    expect(diagramResult.nuevoEstado).toBe('mockups_pendientes');
    expect(diagramaRepository.actualizar).not.toHaveBeenCalled();
    expect(mockupResult.nuevoEstado).toBe('mockups_aprobados');
  });

  test('AprobarFase aprueba un diagrama y habilita solamente su dependiente inmediato', async () => {
    const proyectoRepository = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }),
      actualizarEstadoFase: jest.fn().mockImplementation((id, estado) => Promise.resolve({ id, estado_fase: estado }))
    };
    const casosUso = { id: 'd1', tipo: 'casos_de_uso', aprobado: false, estado: 'pendiente_revision', version: 1 };
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([casosUso]),
      actualizar: jest.fn().mockImplementation((id, changes) => Promise.resolve({ ...casosUso, ...changes, id }))
    };
    const useCase = new AprobarFase({ proyectoRepository, requerimientoRepository: {}, diagramaRepository, disenoRepository: {} });

    const result = await useCase.ejecutar({
      proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'casos_de_uso', aprobadoPor: 'user-1'
    });

    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({
      aprobado: true,
      estado: 'aprobado',
      aprobado_en: expect.any(Date),
      aprobado_por: 'user-1'
    }));
    expect(result.nuevoEstado).toBe('diseno_pendiente');
    expect(result.flujoDiagramas.siguiente).toBe('clases_dominio');
  });

  test('AprobarFase registra un rechazo con observaciones sin habilitar dependientes', async () => {
    const pendiente = {
      id: 'd1', tipo: 'casos_de_uso', aprobado: false, estado: 'pendiente_revision', version: 1,
      codigo_plantuml: '@startuml\nactor Usuario\nrectangle Sistema {\nusecase "Crear" as UC1\nusecase "Consultar" as UC2\n}\nUsuario --> UC1\nUsuario --> UC2\n@enduml'
    };
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([pendiente]),
      actualizar: jest.fn().mockImplementation((id, changes) => Promise.resolve({ ...pendiente, ...changes, id }))
    };
    const useCase = new AprobarFase({
      proyectoRepository: {
        obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }),
        actualizarEstadoFase: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' })
      },
      requerimientoRepository: {}, diagramaRepository, disenoRepository: {}
    });

    await expect(useCase.ejecutar({
      proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'casos_de_uso', decision: 'rechazar', observaciones: 'no'
    })).rejects.toThrow('al menos 5 caracteres');

    const result = await useCase.ejecutar({
      proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'casos_de_uso', decision: 'rechazar',
      observaciones: 'Falta representar el flujo alternativo.'
    });
    expect(result.decision).toBe('rechazado');
    expect(result.flujoDiagramas.siguiente).toBe('casos_de_uso');
    expect(diagramaRepository.actualizar).toHaveBeenCalledWith('d1', expect.objectContaining({
      estado: 'rechazado',
      revisiones: [expect.objectContaining({ decision: 'rechazado', version: 1 })]
    }));
  });

  test('AprobarFase impide aprobar un diagrama sin sus dependencias', async () => {
    const useCase = new AprobarFase({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'diseno_pendiente' }) },
      requerimientoRepository: {},
      diagramaRepository: {
        listarPorProyecto: jest.fn().mockResolvedValue([{ id: 'd2', tipo: 'clases_dominio', aprobado: false, estado: 'pendiente_revision' }])
      },
      disenoRepository: {}
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', fase: 'diagrama', tipoDiagrama: 'clases_dominio' }))
      .rejects.toThrow('Primero aprueba: casos_de_uso');
  });

  test('ProcesarConIA debe enviar los 3 bloques mandatorios en el payload', async () => {
    const mockProjRepo = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta de prueba' }),
      actualizar: jest.fn().mockResolvedValue(true)
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

  test('ProcesarConIA genera solo requisitos antes de aprobar el análisis', async () => {
    const proyectoRepository = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta', estado_fase: 'insumos_pendientes' }),
      actualizar: jest.fn().mockResolvedValue(true)
    };
    const requerimientoRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      eliminarPorProyecto: jest.fn().mockResolvedValue(true),
      crearMuchos: jest.fn().mockResolvedValue(true)
    };
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      eliminarPorProyecto: jest.fn().mockResolvedValue(true),
      crearMuchos: jest.fn().mockResolvedValue(true)
    };
    const aiOrchestratorService = {
      procesar: jest.fn().mockResolvedValue({
        requerimientos: [{ tipo: 'RF', identificador: 'RF-01', nombre: 'Registrar pedido' }],
        diagramas: []
      })
    };
    const useCase = new ProcesarConIA({
      proyectoRepository,
      requerimientoRepository,
      diagramaRepository,
      estandarRepository: { obtenerEstandares: jest.fn().mockResolvedValue([]) },
      aiOrchestratorService
    });

    const result = await useCase.ejecutar({ proyectoId: 'p1', objetivo: 'requisitos' });

    expect(aiOrchestratorService.procesar).toHaveBeenCalledWith(expect.objectContaining({ objetivo: 'requisitos' }));
    expect(requerimientoRepository.crearMuchos).toHaveBeenCalled();
    expect(diagramaRepository.crearMuchos).not.toHaveBeenCalled();
    expect(diagramaRepository.eliminarPorProyecto).toHaveBeenCalledWith('p1');
    expect(proyectoRepository.actualizar).toHaveBeenCalledWith('p1', expect.objectContaining({ estado_fase: 'analisis_pendiente' }));
    expect(result.objetivo).toBe('requisitos');
  });

  test('ProcesarConIA genera diagramas sin reemplazar requisitos aprobados', async () => {
    const requisitosAprobados = [{ id: 'r1', identificador: 'RF-01', tipo: 'RF', nombre: 'Registrar pedido', descripcion: 'El sistema DEBE registrar pedidos.', aprobado: true }];
    const proyectoRepository = {
      obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta', estado_fase: 'analisis_aprobado' }),
      actualizar: jest.fn().mockResolvedValue(true)
    };
    const requerimientoRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue(requisitosAprobados),
      eliminarPorProyecto: jest.fn(),
      crearMuchos: jest.fn()
    };
    const diagramas = ['casos_de_uso', 'arquitectura', 'clases', 'arbol_navegacion'].map((tipo) => ({
      tipo,
      titulo: tipo,
      codigo_plantuml: tipo === 'arbol_navegacion' ? '@startwbs\n* Demo\n@endwbs' : `@startuml\nrectangle "${tipo}"\n@enduml`
    }));
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockResolvedValue([]),
      eliminarPorProyecto: jest.fn().mockResolvedValue(true),
      crearMuchos: jest.fn().mockResolvedValue(true)
    };
    const aiOrchestratorService = { procesar: jest.fn().mockResolvedValue({ requerimientos: [], diagramas }) };
    const useCase = new ProcesarConIA({
      proyectoRepository,
      requerimientoRepository,
      diagramaRepository,
      estandarRepository: { obtenerEstandares: jest.fn().mockResolvedValue([]) },
      aiOrchestratorService
    });

    await useCase.ejecutar({ proyectoId: 'p1', objetivo: 'diagramas' });

    expect(requerimientoRepository.eliminarPorProyecto).not.toHaveBeenCalled();
    expect(requerimientoRepository.crearMuchos).not.toHaveBeenCalled();
    expect(diagramaRepository.crearMuchos).toHaveBeenCalled();
    expect(proyectoRepository.actualizar).toHaveBeenCalledWith('p1', expect.objectContaining({ estado_fase: 'diseno_pendiente' }));
  });

  test('ProcesarConIA genera un solo diagrama sin eliminar los artefactos existentes', async () => {
    const requerimientos = [{
      tipo: 'RF', identificador: 'RF-01', nombre: 'Consultar', descripcion: 'Consultar información',
      actores: ['Cliente'], aprobado: true
    }];
    const creados = [];
    let diagramasPersistidos = [{
      id: 'previous', tipo: 'casos_de_uso', version: 1, estado: 'rechazado', aprobado: false,
      revisiones: [{
        decision: 'rechazado', version: 1,
        observaciones: 'Incluye el flujo alternativo de consulta.'
      }]
    }];
    const diagramaRepository = {
      listarPorProyecto: jest.fn().mockImplementation(() => Promise.resolve(diagramasPersistidos)),
      eliminarPorProyecto: jest.fn(),
      actualizar: jest.fn(),
      crearMuchos: jest.fn().mockImplementation((items) => {
        creados.push(...items);
        diagramasPersistidos = items.map((item, index) => ({ ...item, id: `d${index + 1}` }));
        return Promise.resolve(diagramasPersistidos);
      })
    };
    const aiOrchestratorService = {
      procesar: jest.fn().mockResolvedValue({
        nombre_proyecto: 'Demo',
        diagramas: [{
          tipo: 'casos_de_uso',
          titulo: 'Casos de Uso',
          codigo_plantuml: '@startuml\nactor "Cliente" as Cliente\nrectangle "Sistema" {\nusecase "Consultar" as UC1\nusecase "Ver detalle" as UC2\n}\nCliente --> UC1\nCliente --> UC2\n@enduml'
        }]
      })
    };
    const useCase = new ProcesarConIA({
      proyectoRepository: {
        obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta', estado_fase: 'analisis_aprobado' }),
        actualizar: jest.fn().mockResolvedValue(true)
      },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue(requerimientos) },
      diagramaRepository,
      estandarRepository: { obtenerEstandares: jest.fn().mockResolvedValue([]) },
      aiOrchestratorService
    });

    const result = await useCase.ejecutar({ proyectoId: 'p1', objetivo: 'diagramas', tipoDiagrama: 'casos_de_uso' });
    const cachedResult = await useCase.ejecutar({ proyectoId: 'p1', objetivo: 'diagramas', tipoDiagrama: 'casos_de_uso' });

    expect(aiOrchestratorService.procesar).toHaveBeenCalledWith(expect.objectContaining({
      tipo_diagrama: 'casos_de_uso',
      contexto_proyecto: expect.objectContaining({
        retroalimentacion_diagrama: 'Incluye el flujo alternativo de consulta.'
      })
    }));
    expect(diagramaRepository.eliminarPorProyecto).not.toHaveBeenCalled();
    expect(creados).toHaveLength(1);
    expect(creados[0]).toEqual(expect.objectContaining({ tipo: 'casos_de_uso', version: 2, estado: 'pendiente_revision' }));
    expect(result.flujoDiagramas.siguiente).toBe('casos_de_uso');
    expect(cachedResult.cache_hit).toBe(true);
    expect(aiOrchestratorService.procesar).toHaveBeenCalledTimes(1);
  });

  test('ProcesarConIA rechaza diagramas antes de aprobar los requisitos', async () => {
    const useCase = new ProcesarConIA({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', estado_fase: 'analisis_pendiente' }) }
    });
    await expect(useCase.ejecutar({ proyectoId: 'p1', objetivo: 'diagramas' }))
      .rejects.toThrow('Los requisitos deben estar aprobados');
  });

  test('ModelosIaService conserva actores y condiciones al construir el contexto de diagramas', async () => {
    const service = new ModelosIaService();
    service.providerOrder = [];
    service.normalizarResultado = jest.fn().mockReturnValue({ requerimientos: [], diagramas: [] });
    const construirPrompt = jest.spyOn(service, 'construirPrompt');

    await service.procesar({
      objetivo: 'diagramas',
      provider: 'auto',
      insumo_bruto: 'Contexto del proyecto',
      contexto_proyecto: {
        requerimientos_actuales: [{
          identificador: 'RF-06',
          tipo: 'RF',
          nombre: 'Procesar cobro',
          descripcion: 'El sistema DEBE registrar el pago.',
          actores: ['Cajero', 'Cliente'],
          prioridad: 'Alta',
          precondiciones: 'Cuenta abierta',
          poscondiciones: 'Pago confirmado'
        }]
      }
    });

    const contexto = construirPrompt.mock.calls[0][0].contextoActualTexto;
    const prompt = construirPrompt.mock.results[0].value;
    expect(contexto).toContain('Actores: Cajero, Cliente');
    expect(contexto).toContain('Precondición: Cuenta abierta');
    expect(contexto).toContain('Poscondición: Pago confirmado');
    expect(prompt).toContain('trazados estrictamente desde esos requerimientos aprobados');
  });

  test('ProcesarConIA rechaza casos de uso que omiten actores de los RF aprobados', async () => {
    const requerimientos = [{
      tipo: 'RF', identificador: 'RF-01', nombre: 'Cobrar', descripcion: 'Registrar pago',
      actores: ['Cliente', 'Cajero'], aprobado: true
    }];
    const diagramas = [
      {
        tipo: 'casos_de_uso',
        codigo_plantuml: '@startuml\nactor "Cliente" as Cliente\nrectangle "Sistema" {\nusecase "Consultar" as UC1\nusecase "Reservar" as UC2\n}\nCliente --> UC1\nCliente --> UC2\n@enduml'
      },
      {
        tipo: 'arquitectura',
        codigo_plantuml: '@startuml\n!include <C4/C4_Container>\nPerson(u, "Usuario")\nSystem_Boundary(s, "Sistema") {\nContainer(api, "API", "Node", "API")\nContainerDb(db, "DB", "SQL", "Datos")\n}\nRel(u, api, "Usa")\nRel(api, db, "Lee")\n@enduml'
      },
      {
        tipo: 'clases',
        codigo_plantuml: '@startuml\nclass Usuario\nclass Pedido\nclass Pago\nUsuario "1" -- "0..*" Pedido\nPedido "1" -- "1" Pago\n@enduml'
      },
      { tipo: 'arbol_navegacion', codigo_plantuml: '@startwbs\n* Sistema\n** Portal\n*** Inicio\n*** Recuperar acceso\n@endwbs' }
    ];
    const useCase = new ProcesarConIA({
      proyectoRepository: { obtenerPorId: jest.fn().mockResolvedValue({ id: 'p1', nombre: 'Demo', insumo_bruto: 'Acta', estado_fase: 'analisis_aprobado' }) },
      requerimientoRepository: { listarPorProyecto: jest.fn().mockResolvedValue(requerimientos) },
      diagramaRepository: { listarPorProyecto: jest.fn().mockResolvedValue([]) },
      estandarRepository: { obtenerEstandares: jest.fn().mockResolvedValue([]) },
      plantumlValidatorService: new PlantUMLValidatorService(),
      aiOrchestratorService: { procesar: jest.fn().mockResolvedValue({ diagramas }) }
    });

    await expect(useCase.ejecutar({ proyectoId: 'p1', objetivo: 'diagramas' }))
      .rejects.toThrow('omitió actores definidos en los requisitos aprobados: cajero');
  });

});
