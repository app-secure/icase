const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');

describe('propuestas de planificación de código', () => {
  const service = new CodePlanningProposalService();

  test('detecta tecnologías solo desde requisitos y diagramas aprobados', () => {
    const result = service.generar({
      etapa: 'stack_tecnologico',
      proyecto: { nombre: 'Restaurante' },
      plan: { etapas: [] },
      requerimientos: [
        { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Aplicación React Native', descripcion: 'Backend NestJS y PostgreSQL con Socket.IO' },
        { aprobado: false, tipo: 'RNF', identificador: 'RNF-X', nombre: 'Usar MongoDB' }
      ],
      diagramas: [
        { aprobado: true, estado: 'aprobado', tipo: 'arquitectura_software', titulo: 'Arquitectura', descripcion: 'React con Tailwind', version: 2 },
        { aprobado: false, estado: 'pendiente_revision', tipo: 'arquitectura_sistema', descripcion: 'MySQL' }
      ]
    });

    expect(result.propuesta.backend).toBe('Node.js + NestJS');
    expect(result.propuesta.base_datos).toBe('PostgreSQL');
    expect(result.propuesta.tiempo_real).toBe('Socket.IO');
    expect(result.propuesta.estilos).toBe('Tailwind CSS');
    expect(result.evidencias).toHaveLength(2);
  });

  test('genera carpetas desde las decisiones aprobadas', () => {
    const result = service.generar({
      etapa: 'estructura_carpetas', proyecto: {}, requerimientos: [], diagramas: [],
      plan: { etapas: [
        { etapa: 'stack_tecnologico', estado: 'aprobada', propuesta: { backend: 'Node.js + NestJS' } },
        { etapa: 'arquitectura_codigo', estado: 'aprobada', propuesta: { estilo: 'Clean Architecture' } }
      ] }
    });
    expect(result.propuesta.arbol).toContain('src/{domain,application,infrastructure,interfaces,modules}');
    expect(result.propuesta.convenciones).toContain('Clean Architecture');
  });

  test('sugerir no guarda ni aprueba la propuesta', async () => {
    const workflow = new CodeGenerationWorkflowService();
    const plan = { id: 'plan-1', proyecto_id: 'p1', version: 1, etapas: workflow.crearEtapasIniciales() };
    const planRepository = {
      obtenerPorProyecto: jest.fn(async () => plan),
      crear: jest.fn(),
      guardar: jest.fn()
    };
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' })) },
      planCodificacionRepository: planRepository,
      requerimientoRepository: { listarPorProyecto: jest.fn(async () => []) },
      diagramaRepository: { listarPorProyecto: jest.fn(async () => []) },
      proposalService: service
    });

    const result = await useCase.sugerir({ proyectoId: 'p1', etapa: 'alcance_plataforma' });
    expect(result.propuesta).toBeDefined();
    expect(planRepository.guardar).not.toHaveBeenCalled();
    expect(plan.etapas[0].estado).toBe('pendiente');
  });
});
