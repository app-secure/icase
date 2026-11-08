const Controller = require('../src/interface-adapters/controllers/ProyectoController');
const Approval = require('../src/core/services/RequirementApprovalService');
const { contextOf } = require('../src/core/services/RequirementAnalysisContext');
const Compiler = require('../src/infrastructure/services/MarkdownCompilerService');
const Proposal = require('../src/core/services/CodePlanningProposalService');
const Changes = require('../src/core/services/RequirementChangeService');

const requirement = { id: 'r', tipo: 'RF', identificador: 'RF-1', nombre: 'Consulta', descripcion: 'Consultar registros', necesidades_origen: ['N-1'], criterios_aceptacion: [{ descripcion: 'Consulta visible', necesidades_origen: ['N-1'] }] };
const inventory = [
  { id: 'N-1', tipo: 'RF', objetivo_id: 'O-1', necesidad: 'Consultar registros', estado: 'confirmado', evidencia: 'Consultar registros' },
  { id: 'N-2', tipo: 'restriccion_tecnica', necesidad: 'NestJS', estado: 'confirmado', evidencia: 'NestJS' }
];
const setup = () => {
  const audit = { version: 2, inventario: inventory, revision_semantica: { estado: 'completada', hallazgos: [{ id: 'H-1', descripcion: 'Revisar consulta', estado: 'pendiente' }] } };
  const project = { id: 'p', nombre: 'Proyecto', insumo_bruto: 'Consultar registros. NestJS', auditoria_requisitos: audit };
  const repo = { obtenerPorId: jest.fn().mockResolvedValue(project), actualizar: jest.fn().mockResolvedValue({}), actualizarEstadoFase: jest.fn() };
  const reqs = { listarPorProyecto: jest.fn().mockResolvedValue([requirement]) };
  const diagrams = { listarPorProyecto: jest.fn().mockResolvedValue([]), actualizar: jest.fn() };
  const controller = new Controller({ proyectoRepository: repo, requerimientoRepository: reqs, diagramaRepository: diagrams });
  const req = { params: { id: 'p' }, usuario: { id: 'owner' }, body: { accion: 'validar' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return { controller, repo, reqs, diagrams, req, res, project };
};

test('validar recalcula datos actuales sin invalidar derivados ni llamar a IA', async () => {
  const ctx = setup();
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  const audit = ctx.repo.actualizar.mock.calls[0][1].auditoria_requisitos;
  expect(audit.control_aprobacion.bloqueado).toBe(false);
  expect(audit.revision_actual.errores).toEqual([]);
  expect(ctx.diagrams.listarPorProyecto).not.toHaveBeenCalled();
});

test('confirmar un hallazgo crítico bloquea, resolverlo registra revisión humana sin bloqueo circular', async () => {
  const ctx = setup();
  ctx.req.body = { accion: 'confirmar', id: 'H-1', severidad: 'critico', justificacion: 'Omisión crítica comprobada' };
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  const audit = ctx.repo.actualizar.mock.calls[0][1].auditoria_requisitos;
  expect(audit.control_aprobacion.errores_criticos[0].codigo).toBe('HALLAZGO_CRITICO_CONFIRMADO');
  ctx.project.auditoria_requisitos = audit;
  ctx.req.body = { accion: 'resolver', id: 'H-1', justificacion: 'Corregí y revisé los criterios actuales' };
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  const next = ctx.repo.actualizar.mock.calls[1][1].auditoria_requisitos;
  expect(next.control_aprobacion.bloqueado).toBe(false);
  expect(next.revision_semantica.hallazgos[0].historial).toHaveLength(2);
});

test('no permite aceptar un parche que nunca fue aplicado ni modificar un análisis aprobado', async () => {
  const ctx = setup();
  ctx.req.body = { accion: 'aceptar', id: 'H-1', justificacion: 'Aceptar' };
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  expect(ctx.res.status).toHaveBeenCalledWith(400);
  expect(ctx.repo.actualizar).not.toHaveBeenCalled();
  ctx.reqs.listarPorProyecto.mockResolvedValue([{ ...requirement, aprobado: true }]);
  ctx.req.body.accion = 'descartar';
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  expect(ctx.res.status).toHaveBeenCalledWith(409);
});

test('reclasificar cambia el contexto e invalida derivados conservando historial', async () => {
  const ctx = setup();
  ctx.req.body = { accion: 'editar_analisis', id: 'N-2', cambios: { tipo: 'pregunta', estado: 'pendiente' }, justificacion: 'Tecnología todavía no confirmada' };
  await ctx.controller.revisarRequisitos(ctx.req, ctx.res);
  expect(ctx.diagrams.listarPorProyecto).toHaveBeenCalledWith('p');
  expect(ctx.repo.actualizarEstadoFase).toHaveBeenCalledWith('p', 'analisis_pendiente');
  const audit = ctx.repo.actualizar.mock.calls[0][1].auditoria_requisitos;
  expect(audit.historial_revision[0].anterior.tipo).toBe('restriccion_tecnica');
  expect(audit.preguntas_pendientes[0].id).toBe('N-2');
});

test('las citas y métricas de ejecución no cambian el contexto semántico; las decisiones sí', () => {
  const audit = { inventario: [...inventory, { id: 'N-3', tipo: 'decision', necesidad: 'No incluir réplicas', estado: 'confirmado' }] };
  const next = structuredClone(audit);
  next.inventario[1].evidencia = 'Nueva cita formal';
  next.metricas_ejecucion = { duracion_ms: 4 };
  expect(contextOf(audit)).toEqual(contextOf(next));
  next.inventario[2].necesidad = 'Incluir réplicas';
  expect(contextOf(audit)).not.toEqual(contextOf(next));
});

test('el documento incluye decisiones, pendientes y evidencias; la planificación conserva el contexto', () => {
  const audit = { version_analisis: 3, inventario: [...inventory, { id: 'N-3', tipo: 'decision', necesidad: 'No incluir réplicas', estado: 'confirmado' }] };
  const proyecto = { nombre: 'Prueba', auditoria_requisitos: audit };
  const md = new Compiler().compilar({ proyecto, requerimientos: [{ ...requirement, evidencias: [{ texto: 'Consultar registros', fuente: 'entrevista.txt', inicio: 0, fin: 19 }] }] });
  expect(md).toContain('No incluir réplicas');
  expect(md).toContain('entrevista.txt');
  const result = new Proposal().generar({ etapa: 'stack_tecnologico', proyecto, plan: { etapas: [] } });
  expect(result.propuesta.contexto_analisis.decisiones[0].necesidad).toBe('No incluir réplicas');
  expect(new Approval().evaluate([{ ...requirement, requiere_confirmacion: true }], { version: 2, inventario: inventory }).bloqueado).toBe(false);
});

test('un cambio semántico deja obsoletos plan, código y ZIP sin eliminar archivos manuales', async () => {
  const plan = { version: 2, etapas: [{ etapa: 'stack_tecnologico', estado: 'aprobada', propuesta: { backend: 'NestJS' }, aprobada_en: 'fecha' }] };
  const plans = { obtenerPorProyecto: jest.fn().mockResolvedValue(plan), guardar: jest.fn() };
  const artifacts = { listarPorProyecto: jest.fn().mockResolvedValue([{ id: 'backend' }, { id: 'zip' }]), actualizar: jest.fn() };
  const change = new Changes({ proyectoRepository: { actualizarEstadoFase: jest.fn() }, diagramaRepository: { listarPorProyecto: jest.fn().mockResolvedValue([]) }, planCodificacionRepository: plans, artefactoRepository: artifacts });
  await change.invalidate('p', 'Cambió una obligación');
  expect(plans.guardar.mock.calls[0][1].etapas[0]).toMatchObject({ estado: 'desactualizada', propuesta: plan.etapas[0].propuesta });
  expect(artifacts.actualizar).toHaveBeenCalledWith('zip', { estado: 'desactualizado', aprobado: false });
  expect(change.changed([requirement], [{ ...requirement, evidencia: 'Solo cambió la cita' }])).toBe(false);
});
