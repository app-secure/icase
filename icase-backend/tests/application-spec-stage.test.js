const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const ApplicationSpecService = require('../src/infrastructure/services/ApplicationSpecService');
const BackendScaffoldGenerator = require('../src/infrastructure/services/BackendScaffoldGenerator');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');

const PLANTUML = `@startuml
enum EstadoMesa {
  LIBRE
  OCUPADA
}
class Usuario {
  +String id
  +String email
}
class Mesa {
  +String id
  +int numero
  +EstadoMesa estado
}
Usuario "1" --> "0..*" Mesa
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, version: 1, codigo_plantuml: PLANTUML };
const rf = [{ aprobado: true, tipo: 'RF', identificador: 'RF-04', nombre: 'Consulta de mesas asignadas', descripcion: 'El mesero consulta sus mesas.', actores: ['Mesero'] }];
const respuesta = { operaciones: [{ nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa',
  filtros: [{ campo: 'usuario_id', operador: '==', origen: 'sesion', valor: 'usuario.id' }], salida: ['numero', 'estado'] }], pantallas: [] };

const entorno = async () => {
  let plan = null;
  const repo = {
    obtenerPorProyecto: jest.fn(async () => plan),
    crear: jest.fn(async ({ proyecto_id, etapas }) => { plan = { proyecto_id, version: 1, etapas }; return plan; }),
    guardar: jest.fn(async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; }),
    actual: () => plan
  };
  const specService = new ApplicationSpecService({ modelosIa: { generarJson: async () => respuesta } });
  const useCase = new GestionarPlanCodificacion({
    proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) },
    planCodificacionRepository: repo,
    requerimientoRepository: { listarPorProyecto: async () => rf },
    diagramaRepository: { listarPorProyecto: async () => [dominio] },
    proposalService: new CodePlanningProposalService({ specService })
  });
  await useCase.obtener('p1');
  const workflow = new CodeGenerationWorkflowService();
  const etapas = workflow.crearEtapasIniciales().map((item) =>
    ['alcance_plataforma', 'stack_tecnologico', 'estructura_carpetas', 'reglas_negocio'].includes(item.etapa)
      ? { ...item, estado: CODE_PHASE_STATES.APPROVED, version: 1, propuesta: { ok: true } } : item);
  await repo.guardar('p1', { etapas: workflow.sincronizarBloqueos(etapas) });
  return { useCase, repo };
};

describe('etapa especificacion_aplicacion', () => {
  test('es opcional: no bloquea la generación pero la deja desactualizada si cambia', () => {
    const workflow = new CodeGenerationWorkflowService();
    const etapas = workflow.crearEtapasIniciales().map((item) => ({ ...item, estado: CODE_PHASE_STATES.APPROVED }));
    const cambio = workflow.invalidarDependientes(etapas, 'especificacion_aplicacion');
    expect(cambio.find((item) => item.etapa === 'generacion_backend').estado).toBe(CODE_PHASE_STATES.STALE);
    const sinSpec = etapas.map((item) => (item.etapa === 'especificacion_aplicacion' ? { ...item, estado: CODE_PHASE_STATES.PENDING } : item));
    expect(() => workflow.validarDependencias({ etapas: sinSpec }, 'generacion_backend')).not.toThrow();
  });

  test('sugerir propone operaciones validadas; aprobar exige resolver las pendientes', async () => {
    const { useCase } = await entorno();
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'especificacion_aplicacion' });
    expect(propuesta.operaciones[0]).toMatchObject({ nombre: 'listarMesasAsignadas', estado_decision: 'pendiente', origen: 'ia' });
    await useCase.proponer({ proyectoId: 'p1', etapa: 'especificacion_aplicacion', propuesta });
    await expect(useCase.revisar({ proyectoId: 'p1', etapa: 'especificacion_aplicacion', decision: 'aprobar' })).rejects.toThrow(/pendientes.*listarMesasAsignadas/);
    const confirmada = { ...propuesta, operaciones: propuesta.operaciones.map((op) => ({ ...op, estado_decision: 'confirmado' })) };
    await useCase.proponer({ proyectoId: 'p1', etapa: 'especificacion_aplicacion', propuesta: confirmada });
    const plan = await useCase.revisar({ proyectoId: 'p1', etapa: 'especificacion_aplicacion', decision: 'aprobar' });
    expect(plan.etapas.find((item) => item.etapa === 'especificacion_aplicacion').estado).toBe(CODE_PHASE_STATES.APPROVED);
  });

  test('rechaza una propuesta con campos que no existen en el dominio', async () => {
    const { useCase } = await entorno();
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'especificacion_aplicacion' });
    const mala = { ...propuesta, operaciones: [{ ...propuesta.operaciones[0], salida: ['campoInexistente'] }] };
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'especificacion_aplicacion', propuesta: mala })).rejects.toThrow(/campoInexistente/);
  });

  test('el backend solo recibe las operaciones confirmadas', () => {
    const generador = new BackendScaffoldGenerator();
    const op = { nombre: 'listarMesasAsignadas', rf: 'RF-04', tipo: 'consulta', entidad: 'Mesa', origen: 'ia' };
    const spec = generador._especificacion({ version: 1, operaciones: [{ ...op, estado_decision: 'confirmado' }, { ...op, nombre: 'otra', estado_decision: 'pendiente' }, { ...op, nombre: 'rechazada', estado_decision: 'rechazado' }] });
    expect(spec.operaciones.map((o) => o.nombre)).toEqual(['listarMesasAsignadas']);
    expect(generador._especificacion({ operaciones: [{ ...op, estado_decision: 'pendiente' }] })).toBeNull();
    expect(generador._especificacion(undefined)).toBeNull();
  });
});
