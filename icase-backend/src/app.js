const express = require('express');
const cors = require('cors');
const { corsOptions, securityHeaders, jsonLimit } = require('./infrastructure/security/httpSecurity');
const buildProjectAccess = require('./infrastructure/security/projectAccess');
const { getJwtSecret } = require('./infrastructure/security/jwtSecret');

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
const MongoPlanCodificacionRepository = require('./interface-adapters/repositories/MongoPlanCodificacionRepository');
const MongoArtefactoGeneradoRepository = require('./interface-adapters/repositories/MongoArtefactoGeneradoRepository');

// Servicios
const ModelosIaService = require('./infrastructure/services/ModelosIaService');
const PlantUMLValidatorService = require('./infrastructure/services/PlantUMLValidatorService');
const MarkdownCompilerService = require('./infrastructure/services/MarkdownCompilerService');
const FileIngestionService = require('./infrastructure/services/FileIngestionService');
const MockupIaService = require('./infrastructure/services/MockupIaService');
const MockupTraceabilityService = require('./infrastructure/services/MockupTraceabilityService');
const FinalProjectAuditService = require('./infrastructure/services/FinalProjectAuditService');
const RequirementChangeService = require('./core/services/RequirementChangeService');
const CodePlanningProposalService = require('./core/services/CodePlanningProposalService');
const BusinessRuleInferenceService = require('./infrastructure/services/BusinessRuleInferenceService');
const BackendScaffoldGenerator = require('./infrastructure/services/BackendScaffoldGenerator');
const FrontendScaffoldGenerator = require('./infrastructure/services/FrontendScaffoldGenerator');
const TestSuiteGenerator = require('./infrastructure/services/TestSuiteGenerator');
const InfrastructureGenerator = require('./infrastructure/services/InfrastructureGenerator');
const CiCdPipelineGenerator = require('./infrastructure/services/CiCdPipelineGenerator');
const DeliveryPackageGenerator = require('./infrastructure/services/DeliveryPackageGenerator');
const ZipArchiveService = require('./infrastructure/services/ZipArchiveService');

// Casos de Uso
const CrearProyecto = require('./core/use-cases/CrearProyecto');
const ProcesarConIA = require('./core/use-cases/ProcesarConIA');
const ActualizarRequerimientoManual = require('./core/use-cases/ActualizarRequerimientoManual');
const ActualizarDiagramaManual = require('./core/use-cases/ActualizarDiagramaManual');
const RestaurarVersionDiagrama = require('./core/use-cases/RestaurarVersionDiagrama');
const AprobarFase = require('./core/use-cases/AprobarFase');
const GenerarMockups = require('./core/use-cases/GenerarMockups');
const ActualizarMockupManual = require('./core/use-cases/ActualizarMockupManual');
const GestionarPlanCodificacion = require('./core/use-cases/GestionarPlanCodificacion');
const GestionarArtefactosCodigo = require('./core/use-cases/GestionarArtefactosCodigo');

// Controladores
const ProyectoController = require('./interface-adapters/controllers/ProyectoController');
const RequerimientoController = require('./interface-adapters/controllers/RequerimientoController');
const DiagramaController = require('./interface-adapters/controllers/DiagramaController');
const FuenteController = require('./interface-adapters/controllers/FuenteController');
const AuthController = require('./interface-adapters/controllers/AuthController');
const MockupController = require('./interface-adapters/controllers/MockupController');
const CodificacionController = require('./interface-adapters/controllers/CodificacionController');

// Rutas
const buildProyectoRoutes = require('./routes/proyectoRoutes');
const buildRequerimientoRoutes = require('./routes/requerimientoRoutes');
const buildDiagramaRoutes = require('./routes/diagramaRoutes');
const buildFuenteRoutes = require('./routes/fuenteRoutes');
const buildAuthRoutes = require('./routes/authRoutes');
const buildMockupRoutes = require('./routes/mockupRoutes');
const buildCodificacionRoutes = require('./routes/codificacionRoutes');

/**
 * @param {object} [options]
 * @param {object} [options.repositories] repositorios alternativos (pruebas); los que falten usan MongoDB.
 * @param {object} [options.env] variables de entorno (por defecto process.env).
 */
function createApp({ repositories = {}, env = process.env } = {}) {
  const app = express();

  // Si falta el secreto de sesión en producción, el servidor no debe arrancar.
  getJwtSecret(env);

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  app.use(securityHeaders);
  app.use(cors(corsOptions(env)));
  app.use(express.json({ limit: jsonLimit(env) }));
  app.use(express.urlencoded({ extended: true, limit: jsonLimit(env) }));

  // Inyección de Dependencias
  const proyectoRepo = repositories.proyecto || new MongoProyectoRepository();
  const usuarioRepo = repositories.usuario || new MongoUsuarioRepository();
  const requerimientoRepo = repositories.requerimiento || new MongoRequerimientoRepository();
  const diagramaRepo = repositories.diagrama || new MongoDiagramaRepository();
  const estandarRepo = repositories.estandar || new MongoEstandarRepository();
  const fuenteRepo = repositories.fuente || new MongoFuenteRepository();
  const casoDeUsoRepo = repositories.casoDeUso || new MongoCasoDeUsoRepository();
  const disenoRepo = repositories.diseno || new MongoDisenoRepository();
  const trabajoGeneracionRepo = repositories.trabajoGeneracion || new MongoTrabajoGeneracionRepository();
  const planCodificacionRepo = repositories.planCodificacion || new MongoPlanCodificacionRepository();
  const artefactoGeneradoRepo = repositories.artefactoGenerado || new MongoArtefactoGeneradoRepository();
  const access = buildProjectAccess({
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    fuenteRepository: fuenteRepo,
    trabajoGeneracionRepository: trabajoGeneracionRepo,
    artefactoRepository: artefactoGeneradoRepo
  });

  const modelosIaService = new ModelosIaService();
  const plantumlValidator = new PlantUMLValidatorService();
  const markdownCompiler = new MarkdownCompilerService();
  const fileIngestionService = new FileIngestionService();
  const mockupIaService = new MockupIaService();
  const mockupTraceabilityService = new MockupTraceabilityService();
  const finalProjectAuditService = new FinalProjectAuditService({ mockupTraceabilityService });
  const codePlanningProposalService = new CodePlanningProposalService({
    ruleInferenceService: new BusinessRuleInferenceService({ modelosIa: modelosIaService })
  });
  const backendScaffoldGenerator = new BackendScaffoldGenerator();
  const frontendScaffoldGenerator = new FrontendScaffoldGenerator();
  const testSuiteGenerator = new TestSuiteGenerator();
  const infrastructureGenerator = new InfrastructureGenerator();
  const ciCdPipelineGenerator = new CiCdPipelineGenerator();
  const deliveryPackageGenerator = new DeliveryPackageGenerator();
  const zipArchiveService = new ZipArchiveService();
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
    disenoRepository: disenoRepo,
    estandarRepository: estandarRepo,
    fuenteRepository: fuenteRepo,
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
    plantumlValidatorService: plantumlValidator,
    mockupTraceabilityService
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
  const gestionarPlanCodificacion = new GestionarPlanCodificacion({
    proyectoRepository: proyectoRepo,
    planCodificacionRepository: planCodificacionRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    proposalService: codePlanningProposalService
  });
  const gestionarArtefactosCodigo = new GestionarArtefactosCodigo({
    proyectoRepository: proyectoRepo,
    requerimientoRepository: requerimientoRepo,
    diagramaRepository: diagramaRepo,
    disenoRepository: disenoRepo,
    planCodificacionRepository: planCodificacionRepo,
    artefactoRepository: artefactoGeneradoRepo,
    backendGenerator: backendScaffoldGenerator,
    frontendGenerator: frontendScaffoldGenerator,
    testGenerator: testSuiteGenerator,
    infrastructureGenerator,
    pipelineGenerator: ciCdPipelineGenerator,
    deliveryGenerator: deliveryPackageGenerator
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
    trabajoGeneracionRepository: trabajoGeneracionRepo,
    finalProjectAuditService
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
    usuarioRepository: usuarioRepo,
    env
  });

  const mockupController = new MockupController({
    generarMockupsUseCase,
    actualizarMockupManualUseCase,
    disenoRepository: disenoRepo,
    trabajoGeneracionRepository: trabajoGeneracionRepo
  });
  const codificacionController = new CodificacionController({
    gestionarPlanCodificacion,
    gestionarArtefactosCodigo,
    artefactoRepository: artefactoGeneradoRepo,
    zipArchiveService
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
  app.use('/proyectos', buildProyectoRoutes(proyectoController, access));
  app.use('/proyectos', buildCodificacionRoutes(codificacionController, access));
  app.use('/requerimientos', buildRequerimientoRoutes(requerimientoController, access));
  app.use('/diagramas', buildDiagramaRoutes(diagramaController, access));
  app.use('/', buildFuenteRoutes(fuenteController, access));
  app.use('/mockups', buildMockupRoutes(mockupController, access));

  // Rutas inexistentes y errores: siempre JSON y sin detalles internos en los fallos inesperados.
  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido enviado es demasiado grande.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'El archivo supera el tamaño máximo permitido (50 MB).' });
    if (error.expose && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  });

  return {
    app,
    estandarRepo,
    reanudarTrabajosDiagrama: () => proyectoController.reanudarTrabajosDiagrama()
  };
}

module.exports = createApp;
