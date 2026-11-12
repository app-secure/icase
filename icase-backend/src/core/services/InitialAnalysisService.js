const Execution = require('../../infrastructure/services/RequirementExecutionContext');
const Coverage = require('../../infrastructure/services/RequirementCoverageService');
const { analysisSections, isRequirementNeed } = require('../constants/RequirementAnalysisContract');
const Actors = require('./RequirementActors');
const fault = (message, status = 409) => Object.assign(new Error(message), { status, code: 'INITIAL_ANALYSIS_CONFLICT' });
class InitialAnalysisService {
  constructor(deps) { Object.assign(this, deps); }
  async project(id, user) {
    const row = await this.projects.obtenerPorId(id);
    if (!row || String(row.usuario_id) !== String(user)) throw fault('Proyecto no encontrado.', 404);
    return row;
  }
  async source(project, direct = '') {
    const rows = await this.sources.listarPorProyecto(project.id || project._id);
    const context = require('../../infrastructure/services/RequirementSourceContext').build(rows);
    return { ...context, content: context.content || direct || project.insumo_bruto || '' };
  }
  evidence(context, additional = '') { return [context.content, additional ? `[Insumo adicional]\n${additional}` : ''].filter(Boolean).join('\n\n'); }
  async get(projectId, user) {
    const project = await this.project(projectId, user);
    const draft = await this.versions.get(project.analisis_inicial_borrador_id);
    const approved = await this.versions.get(project.analisis_inicial_aprobado_id);
    const active = draft || approved;
    const context = await this.source(project, active?.insumo_directo);
    const hash = Execution.hash(this.evidence(context, active?.insumo_adicional));
    const approvedContext = approved ? await this.source(project, approved.insumo_directo) : null;
    const requirements = await this.requirements.listarPorProyecto(projectId);
    const baseline = await this.versions.get(project.auditoria_requisitos?.referencia_analisis_inicial?.id);
    const candidate = draft || approved;
    const previous = baseline?.contenido || approved?.contenido;
    const changed = new Set();
    if (candidate && previous) {
      const old = new Map((previous.inventario || []).map(n => [n.id, n]));
      for (const item of candidate.contenido.inventario || []) { if (Execution.hash(old.get(item.id) || {}) !== Execution.hash(item)) changed.add(item.id); old.delete(item.id); }
      for (const id of old.keys()) changed.add(id);
    }
    const broad = !previous || candidate && Execution.hash({ actores: previous.actores, sintesis: previous.sintesis, auxiliares: (previous.inventario || []).filter(n => !isRequirementNeed(n)) }) !== Execution.hash({ actores: candidate.contenido.actores, sintesis: candidate.contenido.sintesis, auxiliares: (candidate.contenido.inventario || []).filter(n => !isRequirementNeed(n)) });
    const affected = requirements.filter(r => broad || !(r.necesidades_origen || []).length || (r.necesidades_origen || []).some(id => changed.has(id))).map(r => r.identificador);
    const pending = project.auditoria_requisitos?.pendientes_analisis_inicial || [];
    return { version_flujo: project.version_flujo_analisis || 1, borrador: draft, aprobado: approved,
      vigente: Boolean(approved && approved.entrada_hash === Execution.hash(this.evidence(approvedContext, approved.insumo_adicional))),
      impacto: { necesidades_modificadas: [...changed], requisitos_afectados: [...new Set([...affected, ...pending])], alcance_incierto: Boolean(broad), requisitos_existentes: requirements.length,
        nuevas_necesidades: (candidate?.contenido.inventario || []).filter(isRequirementNeed).filter(n => !requirements.some(r => (r.necesidades_origen || []).includes(n.id))).map(n => n.id) },
      borrador_vigente: Boolean(draft && draft.entrada_hash === hash),
      versiones: (await this.versions.list(projectId)).map(v => ({ id: v.id, version: v.version, estado: v.estado, procedencia: v.procedencia, aprobado_en: v.aprobado_en })),
      heredado: !active ? project.auditoria_requisitos || null : null };
  }
  control(content, input) {
    const activeObligation = item => isRequirementNeed(item) || item?.estado === 'confirmado' && ['restriccion_tecnica', 'regla_negocio', 'decision'].includes(item.tipo);
    const report = new Coverage().inspectInventory(content.inventario, input);
    const errors = report.invalid.filter(item => activeObligation(item.elemento) || item.errores.some(e => ['identificador_duplicado', 'objetivo_invalido', 'tipo_invalido', 'estado_invalido'].includes(e))).map(item => `${item.id}: ${item.errores.join(', ')}`);
    if (!report.valid.some(isRequirementNeed)) errors.push('No se identificaron necesidades funcionales o cualidades activas.');
    if (content.integridad_extraccion) errors.push(...require('../../infrastructure/services/InitialAnalysisContract').errors({ ...content, inventario_necesidades: content.inventario }));
    const goals = new Set(report.valid.filter(isRequirementNeed).map(n => n.objetivo_id));
    for (const item of report.valid) if ((item.objetivos_relacionados || []).some(id => !goals.has(id))) errors.push(`${item.id}: referencia a objetivo inexistente.`);
    for (const item of content.necesidades_pendientes || []) if (!['corregida', 'descartada'].includes(item.estado_validacion) && activeObligation(item.elemento)) errors.push(`${item.id}: evidencia pendiente.`);
    const actors = content.actores || [];
    if (!Array.isArray(content.actores) || actors.some(a => !a?.id || !String(a.nombre || '').trim() || !['persona', 'sistema_externo'].includes(a.tipo) || !['confirmado', 'pendiente'].includes(a.estado))) errors.push('El catálogo contiene actores sin identificador, nombre, tipo o estado válido.');
    if (new Set(actors.map(a => a.id)).size !== actors.length || new Set(actors.map(a => Actors.key(a.nombre))).size !== actors.length) errors.push('Actores con IDs o nombres duplicados.');
    for (const finding of content.hallazgos || []) if (finding.estado === 'confirmado' && finding.severidad === 'critico') errors.push(finding.descripcion);
    const warnings = report.invalid.filter(item => !isRequirementNeed(item.elemento)).map(item => `${item.id}: elemento auxiliar pendiente.`);
    const grouped = new Map();
    for (const item of report.valid.filter(isRequirementNeed)) {
      if (!grouped.has(item.objetivo_id)) grouped.set(item.objetivo_id, []);
      grouped.get(item.objetivo_id).push(item.id);
    }
    for (const [goal, ids] of grouped) if (ids.length > 1) warnings.push(`${goal}: objetivo compartido por ${ids.join(', ')}. Comprueba que describen el mismo resultado; compartir ID no demuestra equivalencia.`);
    if (actors.some(a => a.estado !== 'confirmado')) warnings.push('Hay actores pendientes de confirmación.');
    if ((content.inventario || []).some(n => n.tipo === 'pregunta' && n.estado === 'pendiente')) warnings.push('Hay preguntas pendientes; no se transformarán en obligaciones confirmadas.');
    warnings.push('La revisión asistida no acredita exhaustividad. Contrasta el insumo antes de aprobar.');
    return { bloqueado: errors.length > 0, errores: errors, advertencias: warnings };
  }
  async saveVersion(project, content, { expected, input, direct = '', additional = '', origin = 'editado', history = [] }) {
    const pointer = project.analisis_inicial_borrador_id || project.analisis_inicial_aprobado_id || null;
    if ((expected || null) !== pointer) throw fault('La versión cambió. Recarga el análisis antes de guardar.');
    const versions = await this.versions.list(project.id || project._id);
    const row = await this.versions.create({ proyecto_id: project.id || project._id, usuario_id: project.usuario_id,
      version: (versions[0]?.version || 0) + 1, estado: 'borrador', contenido: content,
      contenido_hash: Execution.hash(content), entrada_hash: Execution.hash(input), contrato: 'initial-analysis-v2-quality', insumo_directo: direct, insumo_adicional: additional, procedencia: origin, historial: history });
    const updated = await this.projects.actualizarSi(project.id || project._id,
      { analisis_inicial_borrador_id: project.analisis_inicial_borrador_id || null, analisis_inicial_aprobado_id: project.analisis_inicial_aprobado_id || null },
      { version_flujo_analisis: 2, analisis_inicial_borrador_id: row.id });
    if (!updated) throw fault('Otra operación modificó el análisis. No se aplicó tu versión.');
    return row;
  }
  async generate(payload) {
    const project = await this.project(payload.proyectoId, payload.usuarioId);
    const state = await this.get(payload.proyectoId, payload.usuarioId);
    const current = state.borrador || state.aprobado;
    if (payload.operacion === 'correccion_analisis_inicial') {
      const known = new Set([...(current?.contenido.inventario || []).map(n => n.id), ...(current?.contenido.actores || []).map(a => a.id), 'sintesis']);
      if (!payload.elementosIds?.length || payload.elementosIds.some(id => !known.has(id))) throw fault('Selecciona elementos existentes antes de solicitar la corrección.', 400);
    }
    if (current && payload.operacion === 'analisis_inicial' && !(payload.regenerar === true && state.borrador?.id === payload.analisisId)) throw fault('Reabre el análisis y confirma su versión antes de volver a extraer.');
    const direct = current?.insumo_directo || payload.insumoBrutoInput || '';
    const additional = current?.insumo_adicional || payload.insumoAdicional || '';
    const context = await this.source(project, direct);
    if (!context.content.trim()) throw fault('Añade contenido antes de analizar.', 400);
    if (['analisis_respuesta', 'revision_calidad'].includes(payload.operacion)) {
      if (!state.borrador || payload.analisisId !== state.borrador.id) throw fault('Reabre o recarga el borrador antes de revisar.');
      const result = await this.ai.procesar({ objetivo: 'requisitos', provider: payload.provider, specificModel: payload.specificModel, insumo_bruto: context.content, insumo_adicional: additional, initialAnalysisTask: payload.operacion, initialAnalysisPrevious: current.contenido, answerText: payload.respuesta, questionId: payload.preguntaId });
      if (payload.operacion === 'analisis_respuesta') return { ...result, version_base: current.id, entrada_hash: Execution.hash(this.evidence(context, additional)) };
      result.control_aprobacion = this.control(result, this.evidence(context, additional));
      return { propuesta: result, version_base: current.id, elementos_afectados: [], justificacion: 'Revisión integral de calidad sobre el borrador, sin repetir extracción.', entrada_hash: Execution.hash(this.evidence(context, additional)) };
    }
    const result = await this.ai.procesar({ objetivo: 'requisitos', provider: payload.provider, specificModel: payload.specificModel,
      insumo_bruto: context.content, insumo_adicional: additional, pistas_fuentes: context.hints,
      initialAnalysisOnly: true, initialAnalysisInstruction: payload.desdeCero ? '' : payload.instruccion || '', initialAnalysisPrevious: payload.desdeCero ? null : current?.contenido || null });
    const input = this.evidence(context, additional);
    result.control_aprobacion = this.control(result, input);
    if (payload.operacion === 'correccion_analisis_inicial') {
      const selected = new Set(payload.elementosIds || []);
      const previous = current.contenido;
      const known = new Set([...(previous.inventario || []).map(n => n.id), ...(previous.actores || []).map(a => a.id), 'sintesis']);
      if ([...selected].some(id => !known.has(id))) throw fault('La selección contiene elementos inexistentes.', 400);
      const replace = (before, after, allowNew) => {
        const originals = new Set(before.map(n => n.id));
        return [...before.map(n => selected.has(n.id) ? after.find(item => item.id === n.id) || n : n), ...(allowNew ? after.filter(n => !originals.has(n.id)) : [])];
      };
      const candidate = { ...previous, inventario: replace(previous.inventario || [], result.inventario || [], (previous.inventario || []).some(n => selected.has(n.id))),
        actores: replace(previous.actores || [], result.actores || [], false), sintesis: selected.has('sintesis') ? result.sintesis : previous.sintesis };
      Object.assign(candidate, analysisSections(candidate.inventario));
      candidate.control_aprobacion = this.control(candidate, input);
      return { propuesta: candidate, version_base: current.id, elementos_afectados: [...selected], justificacion: payload.instruccion, entrada_hash: Execution.hash(input) };
    }
    return Execution.commit(async () => {
      const row = await this.saveVersion(project, result, { expected: current?.id || null, input, direct, additional, origin: 'generado' });
      return { analisis_inicial: row };
    });
  }
  async edit(projectId, user, body) {
    const project = await this.project(projectId, user);
    const current = await this.versions.get(project.analisis_inicial_borrador_id);
    if (!current || current.id !== body.version_esperada || current.estado !== 'borrador') throw fault('Reabre el análisis o recarga su versión antes de editar.');
    if (!String(body.justificacion || '').trim()) throw fault('Escribe una justificación.', 400);
    let content = structuredClone(current.contenido);
    let additional = [current.insumo_adicional, body.insumo_adicional].filter(Boolean).join('\n\n');
    if (body.accion === 'responder_pregunta') {
      const question = content.inventario?.find(n => n.id === body.id && n.tipo === 'pregunta');
      if (!question || question.estado !== 'pendiente') throw fault('La pregunta no está pendiente en esta versión.');
      const answer = String(body.respuesta || '').trim();
      if (!answer || answer.length > 12000) throw fault('Escribe una respuesta de hasta 12000 caracteres.', 400);
      const type = body.tipo_resultado || 'decision';
      if (!['decision', 'RF', 'RNF', 'regla_negocio', 'restriccion_tecnica'].includes(type)) throw fault('Selecciona cómo incorporar la respuesta.', 400);
      const related = body.elementos_relacionados || [];
      if (!Array.isArray(related) || related.some(id => !content.inventario.some(n => n.id === id && n.id !== question.id && n.tipo !== 'pregunta'))) throw fault('Hay elementos relacionados inexistentes.', 400);
      const previousVersions = await this.versions.list(projectId);
      const identifiers = require('./AnalysisIdentifiers')([content, ...previousVersions.map(v => v.contenido)]);
      const elements = body.elementos === undefined ? [{ tipo: type, necesidad: answer, estado: 'confirmado', evidencia: answer, objetivo_id: body.objetivo_id }] : body.elementos;
      if (!Array.isArray(elements) || !elements.length || body.elementos && body.confirmar_elementos !== true) throw fault('Revisa y confirma los elementos de la respuesta.', 400);
      if (body.propuesta_job_id) {
        const job = await this.jobs.requirementsGet(body.propuesta_job_id);
        const proposal = job?.resultado_analisis_inicial;
        if (job?.estado !== 'completado' || String(job.usuario_id) !== String(user) || String(job.proyecto_id) !== String(projectId) || proposal?.version_base !== current.id || proposal.respuesta_hash !== Execution.hash(answer) || proposal.entrada_hash !== current.entrada_hash || proposal.pregunta_id !== question.id) throw fault('La propuesta de respuesta está obsoleta.');
      }
      const results = elements.map(element => {
        if (!['decision', 'RF', 'RNF', 'regla_negocio', 'restriccion_tecnica'].includes(element.tipo) || !String(element.necesidad || '').trim() || !['confirmado', 'pendiente'].includes(element.estado || 'confirmado')) throw fault('Elemento de respuesta inválido.', 400);
        const located = require('../../infrastructure/services/SourceEvidence').inspectEvidence(element, answer);
        if (!located.valido) throw fault('Cada elemento debe citar literalmente la respuesta registrada.', 400);
        if (element.objetivo_id && !content.inventario.some(n => n.objetivo_id === element.objetivo_id && n.tipo === element.tipo && isRequirementNeed(n))) throw fault('El objetivo seleccionado no corresponde a una necesidad activa de esa categoría.', 400);
        return { id: identifiers.next('N'), tipo: element.tipo, necesidad: String(element.necesidad).trim(), estado: element.estado || 'confirmado', origen: 'explicito', evidencia: located.valid[0].texto, evidencias: located.valid.map(e => ({ texto: e.texto, fuente: 'insumo_directo' })), origenes: [question.id], elementos_relacionados: [...new Set(related)], ...(['RF', 'RNF'].includes(element.tipo) ? { objetivo_id: element.objetivo_id || identifiers.next('O') } : {}) };
      });
      additional = [additional, `Respuesta del usuario a ${question.id}: ${question.necesidad}\n${answer}`].filter(Boolean).join('\n\n');
      const evidence = [{ texto: answer, fuente: 'insumo_directo' }];
      const resolved = { ...question, estado: 'confirmado', respuesta: { texto: answer, usuario_id: user, fecha: new Date().toISOString(), elemento_resultante: results[0].id, elementos_resultantes: results.map(n => n.id), elementos_relacionados: [...new Set(related)], evidencias: evidence } };
      content.inventario = content.inventario.map(n => n.id === question.id ? resolved : n).concat(results);
    }
    const context = await this.source(project, current.insumo_directo);
    const input = this.evidence(context, additional);
    if (body.accion === 'aplicar_propuesta') {
      const job = await this.jobs.requirementsGet(body.trabajo_id);
      const proposed = job?.resultado_analisis_inicial;
      if (!job || String(job.usuario_id) !== String(user) || String(job.proyecto_id) !== String(projectId) || job.estado !== 'completado' || proposed?.version_base !== current.id || proposed.entrada_hash !== Execution.hash(input)) throw fault('Propuesta obsoleta o inaccesible.');
      content = structuredClone(proposed.propuesta);
    } else if (body.accion?.endsWith('_actor')) {
      content.actores = Actors.changeActor(content.actores || [], body).actors;
      if (body.accion === 'agregar_actor') {
        const versions = await this.versions.list(projectId);
        const ids = require('./AnalysisIdentifiers')([current.contenido, ...versions.map(v => v.contenido)]);
        content.actores[content.actores.length - 1].id = ids.next('ACT');
      }
    } else if (body.accion === 'guardar') {
      if (!body.contenido || !Array.isArray(body.contenido.inventario)) throw fault('Contenido de análisis inválido.', 400);
      content = structuredClone(body.contenido);
      content.inventario = require('./AnalysisIdentifiers').reserveManualAdditions(current.contenido, (await this.versions.list(projectId)).map(v => v.contenido), content.inventario);
    } else if (body.accion !== 'responder_pregunta') throw fault('Acción no admitida.', 400);
    if (body.sintesis && typeof body.sintesis === 'object' && !Array.isArray(body.sintesis)) content.sintesis = structuredClone(body.sintesis);
    if (body.accion !== 'aplicar_propuesta' && content.revision_inventario) content.revision_inventario = { ...content.revision_inventario, estado: 'parcial', motivo: 'El contenido cambió después de su revisión. Ejecuta Revisar calidad del análisis para contrastar esta versión.' };
    if (body.accion === 'guardar') {
      const validated = new Coverage().inspectInventory(content.inventario, input).valid;
      const validIds = new Set(validated.map(n => n.id));
      content.inventario = content.inventario.map(item => {
        const normalized = validated.find(n => n.id === item.id);
        return normalized ? { ...item, evidencias: normalized.evidencias || require('../../infrastructure/services/SourceEvidence').inspectEvidence(item, input).valid } : item;
      });
      content.necesidades_pendientes = (content.necesidades_pendientes || []).map(pending => validIds.has(pending.id) && !['corregida', 'descartada'].includes(pending.estado_validacion)
        ? { ...pending, estado_validacion: 'corregida', historial: [...(pending.historial || []), { accion: 'corregir_evidencia', usuario_id: user, justificacion: body.justificacion, fecha: new Date().toISOString() }] } : pending);
    }
    content = { ...content, ...analysisSections(content.inventario || []) };
    const check = this.control(content, input);
    content.control_aprobacion = check;
    return this.saveVersion(project, content, { expected: current.id, input, direct: current.insumo_directo, additional, history: [{ usuario_id: user, accion: body.accion, justificacion: body.justificacion, origen: current.id, fecha: new Date().toISOString() }] });
  }
  async reopen(projectId, user, body = {}) {
    const project = await this.project(projectId, user);
    if (project.analisis_inicial_borrador_id) return this.versions.get(project.analisis_inicial_borrador_id);
    const approved = await this.versions.get(project.analisis_inicial_aprobado_id);
    if (!approved && !body.adoptar) throw fault('Confirma la adopción del flujo para este proyecto heredado.');
    const content = structuredClone(approved?.contenido || { ...(project.auditoria_requisitos || {}), inventario: project.auditoria_requisitos?.inventario || [], actores: Actors.actorCatalog(project.auditoria_requisitos || {}, await this.requirements.listarPorProyecto(projectId)) });
    const context = await this.source(project, approved?.insumo_directo);
    const additional = approved?.insumo_adicional || '';
    content.control_aprobacion = this.control(content, this.evidence(context, additional));
    return this.saveVersion(project, content, { expected: approved?.id, input: this.evidence(context, additional), direct: approved?.insumo_directo || '', additional, origin: approved ? 'editado' : 'heredado' });
  }
  async approve(projectId, user, body) {
    const project = await this.project(projectId, user);
    if (!project.analisis_inicial_borrador_id && project.analisis_inicial_aprobado_id === body.version_esperada) return this.requireApproved(projectId, user, body.version_esperada);
    const draft = await this.versions.get(project.analisis_inicial_borrador_id);
    if (!draft || draft.id !== body.version_esperada) throw fault('El análisis cambió; revisa la versión actual.');
    const context = await this.source(project, draft.insumo_directo);
    const input = this.evidence(context, draft.insumo_adicional);
    if (Execution.hash(input) !== draft.entrada_hash) throw fault('Las fuentes cambiaron. Guarda y revisa el borrador actualizado antes de aprobar.');
    const control = this.control(draft.contenido, input);
    if (control.bloqueado) throw fault(`No se puede aprobar: ${control.errores.join(' ')}`, 400);
    if (control.advertencias.length && body.aceptar_advertencias !== true) throw fault('Confirma que revisaste las advertencias.', 400);
    const approved = draft.estado === 'aprobado' ? draft : await this.versions.approve(draft.id, user) || await this.versions.get(draft.id);
    if (!approved) throw fault('La aprobación cambió; recarga.');
    const updated = await this.projects.actualizarSi(projectId, { analisis_inicial_borrador_id: draft.id }, { analisis_inicial_borrador_id: null, analisis_inicial_aprobado_id: draft.id });
    if (!updated) {
      const latest = await this.project(projectId, user);
      if (!latest.analisis_inicial_borrador_id && latest.analisis_inicial_aprobado_id === draft.id) return approved;
      throw fault('El proyecto cambió; recarga antes de continuar.');
    }
    if (project.analisis_inicial_aprobado_id && project.analisis_inicial_aprobado_id !== draft.id) {
      const previous = await this.versions.get(project.analisis_inicial_aprobado_id);
      const semantic = data => ({ inventario: data?.inventario, actores: data?.actores, sintesis: data?.sintesis });
      if (Execution.hash(semantic(previous?.contenido)) !== Execution.hash(semantic(draft.contenido))) await this.changes?.invalidate(projectId, 'Se aprobó una versión modificada del análisis inicial. Revisa los requisitos afectados.');
      else if (project.auditoria_requisitos) await this.projects.actualizar(projectId, { auditoria_requisitos: { ...project.auditoria_requisitos, referencia_analisis_inicial: { id: draft.id, version: draft.version, huella: draft.contenido_hash || Execution.hash(draft.contenido) } } });
    }
    return approved;
  }
  async requireApproved(projectId, user, id) {
    const state = await this.get(projectId, user);
    if (!state.aprobado || !state.vigente || (id && state.aprobado.id !== id)) throw fault('Se requiere un análisis inicial aprobado y vigente.');
    if (state.aprobado.contenido_hash && state.aprobado.contenido_hash !== Execution.hash(state.aprobado.contenido)) throw fault('La integridad de la versión aprobada no pudo verificarse.');
    const project = await this.project(projectId, user);
    const context = await this.source(project, state.aprobado.insumo_directo);
    if (this.control(state.aprobado.contenido, this.evidence(context, state.aprobado.insumo_adicional)).bloqueado) throw fault('La versión aprobada ya no supera la validación de estructura o evidencia.');
    return state.aprobado;
  }
}
module.exports = InitialAnalysisService;
