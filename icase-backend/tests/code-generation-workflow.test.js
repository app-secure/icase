const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');
const { ARTIFACT_TYPE_VALUES } = require('../src/core/constants/ArtifactTypes');

function crearRepositorioPlan() {
  let plan = null;
  return {
    obtenerPorProyecto: jest.fn(async () => plan),
    crear: jest.fn(async ({ proyecto_id, etapas }) => {
      plan = { id: 'plan-1', proyecto_id, version: 1, etapas };
      return plan;
    }),
    guardar: jest.fn(async (_proyectoId, cambios) => {
      plan = { ...plan, ...cambios };
      return plan;
    }),
    actual: () => plan
  };
}

describe('flujo base de generación de código', () => {
  test('registra los seis tipos de artefacto acordados', () => {
    expect(ARTIFACT_TYPE_VALUES).toEqual([
      'codigo_backend', 'codigo_frontend', 'pruebas',
      'infraestructura', 'pipeline_ci_cd', 'paquete_entrega'
    ]);
  });

  test('habilita plataformas y herramientas al crear el plan', () => {
    const workflow = new CodeGenerationWorkflowService();
    const etapas = workflow.crearEtapasIniciales();
    expect(etapas.find((item) => item.etapa === 'alcance_plataforma').estado).toBe(CODE_PHASE_STATES.PENDING);
    expect(etapas.find((item) => item.etapa === 'stack_tecnologico').estado).toBe(CODE_PHASE_STATES.PENDING);
    expect(etapas.find((item) => item.etapa === 'generacion_backend').estado).toBe(CODE_PHASE_STATES.BLOCKED);
  });

  test('impide iniciar la codificación antes de aprobar mockups', async () => {
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', estado_fase: 'mockups_pendientes' })) },
      planCodificacionRepository: crearRepositorioPlan()
    });
    await expect(useCase.obtener('p1')).rejects.toThrow('aprobar los mockups');
  });

  test('la estructura requiere herramientas aprobadas', async () => {
    const repo = crearRepositorioPlan();
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: jest.fn(async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' })) },
      planCodificacionRepository: repo
    });
    await useCase.obtener('p1');
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'estructura_carpetas', propuesta: { arbol: 'backend/' } }))
      .rejects.toThrow('stack_tecnologico');

    await useCase.proponer({ proyectoId: 'p1', etapa: 'alcance_plataforma', propuesta: { plataformas: ['web'] } });
    await useCase.revisar({ proyectoId: 'p1', etapa: 'alcance_plataforma', decision: 'aprobar', aprobadoPor: null });
    const plan = repo.actual();
    expect(plan.etapas.find((item) => item.etapa === 'stack_tecnologico').estado).toBe(CODE_PHASE_STATES.PENDING);
  });

  test('un cambio aprobado desactualiza las decisiones y artefactos descendientes', () => {
    const workflow = new CodeGenerationWorkflowService();
    const etapas = workflow.crearEtapasIniciales().map((item) => ({ ...item, estado: CODE_PHASE_STATES.APPROVED }));
    const resultado = workflow.invalidarDependientes(etapas, 'stack_tecnologico');
    expect(resultado.find((item) => item.etapa === 'stack_tecnologico').estado).toBe(CODE_PHASE_STATES.APPROVED);
    expect(resultado.find((item) => item.etapa === 'estructura_carpetas').estado).toBe(CODE_PHASE_STATES.STALE);
    expect(resultado.find((item) => item.etapa === 'paquete_entrega').estado).toBe(CODE_PHASE_STATES.STALE);
    expect(resultado.find((item) => item.etapa === 'alcance_plataforma').estado).toBe(CODE_PHASE_STATES.APPROVED);
  });
});
