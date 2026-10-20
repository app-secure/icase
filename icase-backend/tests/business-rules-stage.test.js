const GestionarPlanCodificacion = require('../src/core/use-cases/GestionarPlanCodificacion');
const CodePlanningProposalService = require('../src/core/services/CodePlanningProposalService');
const BusinessRuleInferenceService = require('../src/infrastructure/services/BusinessRuleInferenceService');
const CodeGenerationWorkflowService = require('../src/core/services/CodeGenerationWorkflowService');
const { CODE_PHASE_STATES } = require('../src/core/constants/CodeGenerationPhases');

const PLANTUML = `@startuml
enum EstadoReserva {
  PENDIENTE
  CONFIRMADA
}
class Cliente {
  +String id
  +String email
}
class Reserva {
  +String id
  +int comensales
  +EstadoReserva estado
}
Cliente "1" --> "0..*" Reserva
@enduml`;

const dominio = { tipo: 'clases_dominio', aprobado: true, estado: 'aprobado', desactualizado: false, version: 1, codigo_plantuml: PLANTUML };
const rf = [
  { aprobado: true, tipo: 'RF', identificador: 'RF-01', nombre: 'Gestionar clientes', descripcion: 'El sistema DEBE validar el correo electrónico del cliente.' },
  { aprobado: true, tipo: 'RF', identificador: 'RF-02', nombre: 'Registrar reservas', descripcion: 'El sistema DEBE aceptar reservas de máximo 20 comensales.' }
];

const propuestaIA = [
  { entidad: 'Reserva', tipo: 'rango', campo: 'comensales', max: 20, min: 1, mensaje: 'Máximo 20 comensales.', rf: ['RF-02'], origen: 'explicito', evidencia: 'reservas de máximo 20 comensales' },
  { entidad: 'Cliente', tipo: 'formato', campo: 'email', formato: 'email', mensaje: 'Correo inválido.', rf: ['RF-01'], origen: 'inferido', justificacion: 'Se valida el correo.' },
  { entidad: 'Reserva', tipo: 'rango', campo: 'noExiste', max: 5, mensaje: 'x', rf: ['RF-02'] },
  { entidad: 'Mesa', tipo: 'requerido', campo: 'numero', mensaje: 'x', rf: ['RF-02'] },
  { entidad: 'Reserva', tipo: 'hechizo', campo: 'estado', mensaje: 'x', rf: ['RF-02'] },
  { entidad: 'Reserva', tipo: 'requerido', campo: 'cliente_id', mensaje: 'La reserva necesita cliente.', rf: ['RF-99'] }
];

describe('BusinessRuleInferenceService', () => {
  const servicio = (respuesta) => new BusinessRuleInferenceService({ modelosIa: { generarJson: jest.fn(async () => respuesta) } });

  test('conserva las reglas válidas, descarta el resto y renumera', async () => {
    const { reglas, advertencias } = await servicio({ reglas: propuestaIA }).inferir({ requerimientos: rf, diagramas: [dominio] });
    expect(reglas.map((item) => item.id)).toEqual(['RN-01', 'RN-02']);
    expect(advertencias.filter((item) => item.startsWith('Se descartó'))).toHaveLength(4);
    expect(advertencias.join(' ')).toContain('noExiste');
    expect(advertencias.join(' ')).toContain('RF-99');
  });

  test('solo la regla explícita con evidencia literal nace confirmada; la IA no decide', async () => {
    const forzada = propuestaIA.map((item) => ({ ...item, estado_decision: 'confirmado' }));
    const { reglas } = await servicio({ reglas: forzada }).inferir({ requerimientos: rf, diagramas: [dominio] });
    expect(reglas.find((item) => item.tipo === 'rango')).toMatchObject({ origen: 'explicito', evidencia_literal: true, estado_decision: 'confirmado' });
    expect(reglas.find((item) => item.tipo === 'formato')).toMatchObject({ origen: 'inferido', estado_decision: 'pendiente' });
  });

  test('una evidencia inventada degrada la regla a inferida y pendiente', async () => {
    const inventada = [{ ...propuestaIA[0], evidencia: 'el cliente puede reservar hasta cuarenta mesas' }];
    const { reglas } = await servicio({ reglas: inventada }).inferir({ requerimientos: rf, diagramas: [dominio] });
    expect(reglas[0]).toMatchObject({ origen: 'inferido', estado_decision: 'pendiente' });
  });

  test('sin diagrama de dominio, sin RF o sin respuesta devuelve una lista vacía y lo explica', async () => {
    const llamada = jest.fn();
    const sinDominio = await new BusinessRuleInferenceService({ modelosIa: { generarJson: llamada } }).inferir({ requerimientos: rf, diagramas: [] });
    expect(sinDominio.reglas).toEqual([]);
    expect(sinDominio.advertencias[0]).toContain('diagrama de clases de dominio');
    expect(llamada).not.toHaveBeenCalled();
    expect((await servicio({ reglas: [] }).inferir({ requerimientos: [], diagramas: [dominio] })).advertencias[0]).toContain('requisitos funcionales');
    expect((await servicio(null).inferir({ requerimientos: rf, diagramas: [dominio] })).advertencias[0]).toContain('Ningún modelo de IA');
    expect((await servicio({ reglas: 'no es una lista' }).inferir({ requerimientos: rf, diagramas: [dominio] })).reglas).toEqual([]);
  });

  test('el prompt incluye el modelo y los RF, y la observación de un rechazo anterior', async () => {
    const generarJson = jest.fn(async () => ({ reglas: [] }));
    await new BusinessRuleInferenceService({ modelosIa: { generarJson } }).inferir({ requerimientos: rf, diagramas: [dominio], retroalimentacion: 'Faltó el límite de mesas' });
    const prompt = generarJson.mock.calls[0][0];
    expect(prompt).toContain('- Reserva: comensales: integer, estado: enum(PENDIENTE|CONFIRMADA), cliente_id: referencia a Cliente');
    expect(prompt).toContain('[RF-02] Registrar reservas');
    expect(prompt).toContain('Faltó el límite de mesas');
    expect(prompt).toContain('lista cerrada');
  });
});

describe('etapa reglas_negocio', () => {
  const entorno = async ({ diagramas = [dominio], respuesta = { reglas: propuestaIA } } = {}) => {
    let plan = null;
    const repo = {
      obtenerPorProyecto: jest.fn(async () => plan),
      crear: jest.fn(async ({ proyecto_id, etapas }) => { plan = { proyecto_id, version: 1, etapas }; return plan; }),
      guardar: jest.fn(async (_id, cambios) => { plan = { ...plan, ...cambios }; return plan; }),
      actual: () => plan
    };
    const useCase = new GestionarPlanCodificacion({
      proyectoRepository: { obtenerPorId: async () => ({ id: 'p1', nombre: 'Demo', estado_fase: 'mockups_aprobados' }) },
      planCodificacionRepository: repo,
      requerimientoRepository: { listarPorProyecto: async () => rf },
      diagramaRepository: { listarPorProyecto: async () => diagramas },
      proposalService: new CodePlanningProposalService({ ruleInferenceService: new BusinessRuleInferenceService({ modelosIa: { generarJson: async () => respuesta } }) })
    });
    // Deja aprobadas las cuatro etapas previas.
    await useCase.obtener('p1');
    const etapas = new CodeGenerationWorkflowService().crearEtapasIniciales().map((item) =>
      ['alcance_plataforma', 'stack_tecnologico', 'arquitectura_codigo', 'estructura_carpetas'].includes(item.etapa) ? { ...item, estado: CODE_PHASE_STATES.APPROVED, version: 1, propuesta: { ok: true } } : item);
    await repo.guardar('p1', { etapas: new CodeGenerationWorkflowService().sincronizarBloqueos(etapas) });
    return { useCase, repo };
  };

  test('la etapa existe, depende de la estructura de carpetas y bloquea la generación del backend', async () => {
    const { repo } = await entorno();
    const workflow = new CodeGenerationWorkflowService();
    const rules = repo.actual().etapas.find((item) => item.etapa === 'reglas_negocio');
    expect(rules.estado).toBe(CODE_PHASE_STATES.PENDING);
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_backend')).toThrow('reglas_negocio');
    expect(() => workflow.validarDependencias(repo.actual(), 'generacion_frontend')).toThrow('control_acceso');
  });

  test('sugerir devuelve la propuesta de la IA ya depurada, con evidencias y advertencias', async () => {
    const { useCase } = await entorno();
    const sugerencia = await useCase.sugerir({ proyectoId: 'p1', etapa: 'reglas_negocio' });
    expect(sugerencia.propuesta.reglas).toHaveLength(2);
    expect(sugerencia.propuesta.notas).toContain('1 requieren tu decisión');
    expect(sugerencia.advertencias.length).toBeGreaterThan(0);
  });

  test('no se puede aprobar mientras haya reglas pendientes; al resolverlas sí', async () => {
    const { useCase, repo } = await entorno();
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'reglas_negocio' });
    await useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta });
    await expect(useCase.revisar({ proyectoId: 'p1', etapa: 'reglas_negocio', decision: 'aprobar' })).rejects.toThrow('reglas pendientes');

    const resueltas = { ...propuesta, reglas: propuesta.reglas.map((item) => ({ ...item, estado_decision: item.tipo === 'formato' ? 'rechazado' : 'confirmado' })) };
    await useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta: resueltas });
    await useCase.revisar({ proyectoId: 'p1', etapa: 'reglas_negocio', decision: 'aprobar', aprobadoPor: 'u1' });
    const stored = repo.actual().etapas;
    expect(stored.find((item) => item.etapa === 'reglas_negocio').estado).toBe(CODE_PHASE_STATES.APPROVED);
    // El backend también necesita la política de acceso aprobada.
    expect(stored.find((item) => item.etapa === 'generacion_backend').estado).toBe(CODE_PHASE_STATES.BLOCKED);
  });

  test('una etapa sin reglas puede aprobarse vacía', async () => {
    const { useCase } = await entorno({ diagramas: [] });
    const { propuesta, advertencias } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'reglas_negocio' });
    expect(propuesta.reglas).toEqual([]);
    expect(advertencias.join(' ')).toContain('diagrama de clases de dominio');
    await useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta });
    await expect(useCase.revisar({ proyectoId: 'p1', etapa: 'reglas_negocio', decision: 'aprobar' })).resolves.toBeDefined();
  });

  test('rechaza propuestas manuales con reglas inválidas o sin diagrama que las respalde', async () => {
    const { useCase } = await entorno();
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta: { reglas: [{ ...propuestaIA[2], id: 'RN-X' }] } }))
      .rejects.toThrow('RN-X: el campo "noExiste" no existe en Reserva');
    await expect(useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta: { reglas: 'x' } })).rejects.toThrow('lista');
    const { useCase: sinDominio } = await entorno({ diagramas: [] });
    await expect(sinDominio.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta: { reglas: [propuestaIA[0]] } })).rejects.toThrow('diagrama de clases de dominio');
  });

  test('al aprobar se revalida: si el modelo cambió, la aprobación falla', async () => {
    const { useCase, repo } = await entorno();
    const { propuesta } = await useCase.sugerir({ proyectoId: 'p1', etapa: 'reglas_negocio' });
    await useCase.proponer({ proyectoId: 'p1', etapa: 'reglas_negocio', propuesta: { ...propuesta, reglas: propuesta.reglas.map((item) => ({ ...item, estado_decision: 'confirmado' })) } });
    useCase.diagramaRepository.listarPorProyecto = async () => [{ ...dominio, codigo_plantuml: PLANTUML.replace('+int comensales', '+int personas') }];
    await expect(useCase.revisar({ proyectoId: 'p1', etapa: 'reglas_negocio', decision: 'aprobar' })).rejects.toThrow('comensales');
    expect(repo.actual().etapas.find((item) => item.etapa === 'reglas_negocio').estado).not.toBe(CODE_PHASE_STATES.APPROVED);
  });
});
