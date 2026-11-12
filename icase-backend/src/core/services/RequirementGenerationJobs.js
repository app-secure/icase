const Execution = require('../../infrastructure/services/RequirementExecutionContext');
const fail = (message, status = 409, code = 'REQUIREMENTS_CONFLICT') => Object.assign(new Error(message), { status, code });
class RequirementGenerationJobs {
  constructor({ jobs, projects, requirements, sources, execute, mutationLease }) {
    Object.assign(this, { jobs, projects, requirements, sources, execute, mutationLease });
    this.running = new Set();
  }
  async snapshot(projectId, userId, operation = 'legacy') {
    const project = await this.projects.obtenerPorId(projectId);
    if (!project || String(project.usuario_id) !== String(userId)) throw fail('Proyecto no encontrado.', 404);
    const requirements = await this.requirements.listarPorProyecto(projectId);
    const sources = await this.sources.listarPorProyecto(projectId);
    if (!(project.version_flujo_analisis === 2 && operation !== 'legacy') && (requirements.some(r => r.aprobado) || ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'codificacion_pendiente'].includes(project.estado_fase))) throw fail('El análisis está aprobado. No se reemplazará con una generación tardía.');
    const sorted = rows => [...rows].sort((a, b) => String(a.id || a._id).localeCompare(String(b.id || b._id)));
    const canonical = require('../../infrastructure/services/RequirementSourceContext').build(sources).content || project.insumo_bruto;
    const relevant = project.version_flujo_analisis === 2 ? { insumo_bruto: canonical, borrador: project.analisis_inicial_borrador_id, aprobado: project.analisis_inicial_aprobado_id } : project;
    const relevantSources = project.version_flujo_analisis === 2 && operation === 'redaccion_requisitos' ? sources.map(s => ({ id: s.id || s._id, texto_transcrito: s.texto_transcrito, nombre_archivo: s.nombre_archivo })) : sources;
    return Execution.hash({ projectId, userId, operation, version: 'requirements-job-v8-grounded-summary', project: relevant, requirements: sorted(requirements), sources: sorted(relevantSources) });
  }
  public(job) {
    if (!job) return null;
    return { id: job.id, proyecto_id: String(job.proyecto_id), tipo: 'requisitos', estado: job.estado,
      mensaje: job.mensaje, progreso: job.progreso || 0, progreso_requisitos: job.progreso_requisitos || {},
      operacion: job.operacion_requisitos || 'legacy', resultado_analisis_inicial: job.estado === 'completado' ? job.resultado_analisis_inicial || null : null,
      total_recuperadas: Object.values(job.checkpoints_requisitos || {}).filter(c => c.validated).length,
      resultado_requisitos: job.estado === 'completado' ? job.resultado_requisitos : null,
      borrador_conservado: Boolean(job.resultado_requisitos), error: job.error || null };
  }
  async start(projectId, userId, input = {}) {
    const project = await this.projects.obtenerPorId(projectId);
    const operation = project?.version_flujo_analisis === 2 ? (input.operacion || 'analisis_inicial') : 'legacy';
    if (!['legacy', 'analisis_inicial', 'redaccion_requisitos', 'correccion_analisis_inicial', 'analisis_respuesta', 'revision_calidad'].includes(operation) || project?.version_flujo_analisis === 2 && operation === 'legacy') throw fail('Operación inválida.');
    if (['analisis_respuesta', 'revision_calidad'].includes(operation) && (!project.analisis_inicial_borrador_id || input.analisis_id !== project.analisis_inicial_borrador_id)) throw fail('Se requiere el borrador actual.');
    if (operation === 'analisis_respuesta' && (!String(input.respuesta || '').trim() || String(input.respuesta).length > 12000 || !input.pregunta_id)) throw fail('Indica una pregunta y una respuesta de hasta 12000 caracteres.', 400);
    if (operation === 'analisis_inicial' && (project.analisis_inicial_borrador_id || project.analisis_inicial_aprobado_id) && input.regenerar !== true) throw fail('Ya existe un análisis inicial. Ábrelo para revisarlo; volver a extraer requiere confirmación explícita.');
    if (operation === 'redaccion_requisitos') {
      const approved = await this.initialAnalysis.requireApproved(projectId, userId, input.analisis_id);
      const existing = await this.requirements.listarPorProyecto(projectId);
      if (existing.length && !input.actualizar_ids?.length && !(approved.contenido.inventario || []).some(n => ['RF', 'RNF'].includes(n.tipo) && !existing.some(r => (r.necesidades_origen || []).includes(n.id)))) throw fail('Confirma la actualización puntual de requisitos existentes; no se regenerarán automáticamente.');
    }
    if (operation === 'correccion_analisis_inicial' && !project?.analisis_inicial_borrador_id) throw fail('Reabre el análisis antes de solicitar una propuesta.');
    const hash = await this.snapshot(projectId, userId, operation);
    const payload = { insumoBrutoInput: String(input.insumo_bruto || ''), insumoAdicional: String(input.insumo_adicional || ''),
      desdeCero: input.desde_cero === true,
      provider: String(input.provider || 'auto'), specificModel: input.specificModel || null, operacion: operation,
      usuarioId: userId, respuesta: String(input.respuesta || ''), preguntaId: input.pregunta_id || null, regenerar: input.regenerar === true, analisisId: input.analisis_id || project?.analisis_inicial_aprobado_id || null, instruccion: String(input.instruccion || ''), elementosIds: Array.isArray(input.elementos_ids) ? input.elementos_ids.map(String) : [], actualizarIds: Array.isArray(input.actualizar_ids) ? input.actualizar_ids.map(String) : [] };
    if (operation === 'correccion_analisis_inicial' && (!payload.instruccion.trim() || !payload.elementosIds.length)) throw fail('Indica los IDs a revisar y una corrección puntual.', 400);
    const version = Execution.hash({ base: hash, payload });
    const created = await this.jobs.requirementsStart({ proyecto_id: projectId, usuario_id: userId, entrada_hash: version,
      operacion_requisitos: operation, entrada_requisitos: { snapshot: hash, payload }, checkpoints_requisitos: {} });
    if (created.created) this.launch(created.job.id);
    return this.public(created.job);
  }
  async get(id, userId) {
    await this.jobs.requirementsRecover();
    const job = await this.jobs.requirementsGet(id);
    if (!job || job.usuario_id !== String(userId)) throw fail('Trabajo no encontrado.', 404);
    if (job.estado === 'completado') {
      let current = null;
      try { current = await this.snapshot(job.proyecto_id, userId, job.operacion_requisitos); } catch { /* No reaplicar sobre un análisis aprobado. */ }
      if (!job.salida_hash || current !== job.salida_hash) { job.resultado_requisitos = null; job.resultado_analisis_inicial = null; }
    }
    return job;
  }
  async resume(id, userId) {
    const job = await this.get(id, userId);
    if (['completado', 'fallido'].includes(job.estado)) return this.public(job);
    if (await this.snapshot(job.proyecto_id, userId, job.operacion_requisitos) !== job.entrada_requisitos.snapshot) throw fail('La entrada cambió. Inicia una nueva generación para no perder los cambios.');
    this.launch(id, true);
    return this.public(job);
  }
  launch(id, probeUnknownReset = false) { setImmediate(() => this.run(id, probeUnknownReset).catch(() => {})); }
  async run(id, probeUnknownReset = false) {
    if (this.running.has(id)) return;
    this.running.add(id);
    let timer;
    try {
      const job = await this.jobs.requirementsClaim(id);
      if (!job) return;
      const checkpoints = job.checkpoints_requisitos || {};
      let progress = { ...(job.progreso_requisitos || {}) };
      let lost = false;
      const save = changes => this.jobs.requirementsSave(id, changes);
      timer = setInterval(() => { save({}).catch(() => { lost = true; }); }, 30000);
      timer.unref?.();
      const context = {
        cacheNamespace: job.entrada_requisitos.payload.desdeCero ? job.id : '',
        probeUnknownReset,
        checkpoints,
        assertCurrent: async () => {
          if (lost) throw fail('El trabajo perdió su ejecutor.', 409, 'REQUIREMENTS_LEASE_LOST');
          if (await this.snapshot(job.proyecto_id, job.usuario_id, job.operacion_requisitos) !== job.entrada_requisitos.snapshot) throw fail('La entrada cambió durante la generación. No se aplicó el resultado.');
        },
        progress: async delta => { progress = { ...progress, ...delta }; await save({ progreso_requisitos: progress, mensaje: `Procesando: ${progress.etapa || 'requisitos'}` }); },
        save: () => save({ checkpoints_requisitos: checkpoints }),
        commit: async operation => {
          await context.assertCurrent();
          if (context.pending) throw fail('La auditoría está pendiente; conserva el borrador y reanuda.', 503, 'AI_REQUIREMENTS_PENDING');
          const lock = await this.mutationLease.acquire(job.proyecto_id);
          try { await context.assertCurrent(); lock.assert(); return await operation(); }
          finally { await lock.release(); }
        }
      };
      try {
        const result = await Execution.run(context, () => this.execute({ ...job.entrada_requisitos.payload, proyectoId: job.proyecto_id, objetivo: 'requisitos' }));
        if (['correccion_analisis_inicial', 'analisis_respuesta', 'revision_calidad'].includes(job.operacion_requisitos)) await context.assertCurrent();
        const salidaHash = await this.snapshot(job.proyecto_id, job.usuario_id, job.operacion_requisitos);
        const initial = ['analisis_inicial', 'correccion_analisis_inicial', 'analisis_respuesta', 'revision_calidad'].includes(job.operacion_requisitos);
        await this.jobs.requirementsSave(id, { estado: 'completado', progreso: 100, ...(initial ? { resultado_analisis_inicial: result } : { resultado_requisitos: result }), salida_hash: salidaHash, mensaje: initial ? 'Análisis disponible para revisión; no se generaron requisitos.' : 'Requisitos generados; revisa antes de aprobar.', progreso_requisitos: progress }, true);
      } catch (error) {
        const conflict = error.status === 409 || error.code === 'REQUIREMENTS_CONFLICT' || error.code === 'REQUIREMENTS_LEASE_LOST';
        await this.jobs.requirementsSave(id, { estado: conflict ? 'fallido' : 'esperando_proveedor',
          resultado_requisitos: context.draft || null, checkpoints_requisitos: checkpoints, progreso_requisitos: progress,
          mensaje: conflict ? 'La entrada cambió o se perdió el trabajo. No se sobrescribió el proyecto.' : 'Generación pausada. Reanuda para continuar las etapas pendientes.',
          error: conflict ? 'REQUIREMENTS_CONFLICT' : 'AI_REQUIREMENTS_PENDING' }, true);
      }
    } finally { clearInterval(timer); this.running.delete(id); }
  }
}
module.exports = RequirementGenerationJobs;
