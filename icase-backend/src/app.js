const express = require('express');
const cors = require('cors');

// Repositorios
const MongoProyectoRepository = require('./interface-adapters/repositories/MongoProyectoRepository');
const MongoUsuarioRepository = require('./interface-adapters/repositories/MongoUsuarioRepository');
const MongoRequerimientoRepository = require('./interface-adapters/repositories/MongoRequerimientoRepository');
const MongoDiagramaRepository = require('./interface-adapters/repositories/MongoDiagramaRepository');
const MongoEstandarRepository = require('./interface-adapters/repositories/MongoEstandarRepository');
const MongoFuenteRepository = require('./interface-adapters/repositories/MongoFuenteRepository');
const MongoCasoDeUsoRepository = require('./interface-adapters/repositories/MongoCasoDeUsoRepository');
const MongoDisenoRepository = require('./interface-adapters/repositories/MongoDisenoRepository');
const MongoTrabajoGeneracionRepository = require('./interface-adapters/repositories/MongoTrabajoGeneracionRepository');

// Servicios
const ModelosIaService = require('./infrastructure/services/ModelosIaService');
const PlantUMLValidatorService = require('./infrastructure/services/PlantUMLValidatorService');
const MarkdownCompilerService = require('./infrastructure/services/MarkdownCompilerService');
const FileIngestionService = require('./infrastructure/services/FileIngestionService');
const MockupIaService = require('./infrastructure/services/MockupIaService');
const RequirementChangeService = require('./core/services/RequirementChangeService');

// Casos de Uso
const CrearProyecto = require('./core/use-cases/CrearProyecto');
const ProcesarConIA = require('./core/use-cases/ProcesarConIA');
const ActualizarRequerimientoManual = require('./core/use-cases/ActualizarRequerimientoManual');
const ActualizarDiagramaManual = require('./core/use-cases/ActualizarDiagramaManual');
const RestaurarVersionDiagrama = require('./core/use-cases/RestaurarVersionDiagrama');
const AprobarFase = require('./core/use-cases/AprobarFase');
const GenerarMockups = require('./core/use-cases/GenerarMockups');
const ActualizarMockupManual = require('./core/use-cases/ActualizarMockupManual');

// Controladores
const ProyectoController = require('./interface-adapters/controllers/ProyectoController');
const RequerimientoController = require('./interface-adapters/controllers/RequerimientoController');
const DiagramaController = require('./interface-adapters/controllers/DiagramaController');
const FuenteController = require('./interface-adapters/controllers/FuenteController');
const AuthController = require('./interface-adapters/controllers/AuthController');
const MockupController = require('./interface-adapters/controllers/MockupController');

// Rutas
const buildProyectoRoutes = require('./routes/proyectoRoutes');
const buildRequerimientoRoutes = require('./routes/requerimientoRoutes');
const buildDiagramaRoutes = require('./routes/diagramaRoutes');
const buildFuenteRoutes = require('./routes/fuenteRoutes');
const buildAuthRoutes = require('./routes/authRoutes');
const buildMockupRoutes = require('./routes/mockupRoutes');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Inyección de Dependencias
  const proyectoRepo = new MongoProyectoRepository();
  const usuarioRepo = new MongoUsuarioRepository();
  const requerimientoRepo = new MongoRequerimientoRepository();
  const diagramaRepo = new MongoDiagramaRepository();
  const estandarRepo = new MongoEstandarRepository();
  const fuenteRepo = new MongoFuenteRepository();
  const casoDeUsoRepo = new MongoCasoDeUsoRepository();
  const disenoRepo = new MongoDisenoRepository();
  const trabajoGeneracionRepo = new MongoTrabajoGeneracionRepository();

  const modelosIaService = new ModelosIaService();
  const plantumlValidator = new PlantUMLValidatorService();
  const markdownCompiler = new MarkdownCompilerService();
  const fileIngestionService = new FileIngestionService();
  const mockupIaService = new MockupIaService();
  const requirementChangeService = new RequirementChangeService({
    proyectoRepository: proyectoRepo,
    diagramaRepository: diagramaRepo,
    disenoRepository: disenoRepo
  });

  const crearProyectoUseCase = new CrearProyecto({ proyectoRepository: proyectoRepo });
  const procesarConIAUseCase = new ProcesarConIA({
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    estandarRepository: estandarRepo,
    fuenteRepository: fuenteRepo,
    disenoRepository: disenoRepo,
    plantumlValidatorService: plantumlValidator,
    aiOrchestratorService: modelosIaService
  });
  const actualizarRequerimientoManualUseCase = new ActualizarRequerimientoManual({
    requerimientoRepository: requerimientoRepo
  });
  const actualizarDiagramaManualUseCase = new ActualizarDiagramaManual({
    diagramaRepository: diagramaRepo,
    plantumlValidatorService: plantumlValidator,
    proyectoRepository: proyectoRepo
  });
  const restaurarVersionDiagramaUseCase = new RestaurarVersionDiagrama({
    diagramaRepository: diagramaRepo,
    actualizarDiagramaManualUseCase
  });
  const aprobarFaseUseCase = new AprobarFase({
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    disenoRepository: disenoRepo,
    plantumlValidatorService: plantumlValidator
  });
  const generarMockupsUseCase = new GenerarMockups({
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    disenoRepository: disenoRepo,
    mockupIaService
  });
  const actualizarMockupManualUseCase = new ActualizarMockupManual({
    disenoRepository: disenoRepo
  });

  const proyectoController = new ProyectoController({
    crearProyectoUseCase,
    procesarConIAUseCase,
    aprobarFaseUseCase,
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    fuenteRepository: fuenteRepo,
    casoDeUsoRepository: casoDeUsoRepo,
    disenoRepository: disenoRepo,
    markdownCompilerService: markdownCompiler,
    trabajoGeneracionRepository: trabajoGeneracionRepo
  });

  const requerimientoController = new RequerimientoController({
    actualizarRequerimientoManualUseCase,
    requerimientoRepository: requerimientoRepo,
    requirementChangeService
  });

  const diagramaController = new DiagramaController({
    actualizarDiagramaManualUseCase,
    restaurarVersionDiagramaUseCase,
    plantumlValidatorService: plantumlValidator,
    diagramaRepository: diagramaRepo
  });

  const fuenteController = new FuenteController({
    fuenteRepository: fuenteRepo,
    proyectoRepository: proyectoRepo,
    fileIngestionService,
    modelosIaService
  });

  const authController = new AuthController({
    usuarioRepository: usuarioRepo
  });

  const mockupController = new MockupController({
    generarMockupsUseCase,
    actualizarMockupManualUseCase,
    disenoRepository: disenoRepo,
    trabajoGeneracionRepository: trabajoGeneracionRepo
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'icase-backend',
      timestamp: new Date().toISOString()
    });
  });

  // Montaje de rutas
  app.use('/auth', buildAuthRoutes(authController));
  app.use('/proyectos', buildProyectoRoutes(proyectoController));
  app.use('/requerimientos', buildRequerimientoRoutes(requerimientoController));
  app.use('/diagramas', buildDiagramaRoutes(diagramaController));
  app.use('/', buildFuenteRoutes(fuenteController));
  app.use('/mockups', buildMockupRoutes(mockupController));

  return {
    app,
    estandarRepo,
    reanudarTrabajosDiagrama: () => proyectoController.reanudarTrabajosDiagrama()
  };
}

module.exports = createApp;
