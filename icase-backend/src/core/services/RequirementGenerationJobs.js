const Execution = require('../../infrastructure/services/RequirementExecutionContext');
const fail = (message, status = 409, code = 'REQUIREMENTS_CONFLICT') => Object.assign(new Error(message), { status, code });
class RequirementGenerationJobs {
  constructor({ jobs, projects, requirements, sources, execute, mutationLease }) {
    Object.assign(this, { jobs, projects, requirements, sources, execute, mutationLease });
    this.running = new Set();
  }
  async snapshot(projectId, userId, operation = 'legacy', requirementsOverride) {
    const project = await this.projects.obtenerPorId(projectId);
    if (!project || String(project.usuario_id) !== String(userId)) throw fail('Proyecto no encontrado.', 404);
    const requirements = requirementsOverride ?? await this.requirements.listarPorProyecto(projectId);
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
      if (input.regenerar === true && existing.some(item => item.aprobado)) throw fail('Los requisitos ya están aprobados. No se reemplazan.');
      if (input.regenerar !== true && existing.length && !input.actualizar_ids?.length && !(approved.contenido.inventario || []).some(n => ['RF', 'RNF'].includes(n.tipo) && !existing.some(r => (r.necesidades_origen || []).includes(n.id)))) throw fail('Confirma la actualización puntual de requisitos existentes; no se regenerarán automáticamente.');
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
    if (['completado', 'fallido', 'cancelado'].includes(job.estado)) return this.public(job);
    if (await this.snapshot(job.proyecto_id, userId, job.operacion_requisitos) !== job.entrada_requisitos.snapshot) {
      const recovered = await this.recoverCommitted(job, userId);
      if (recovered) return recovered;
      throw fail('La entrada cambió. Inicia una nueva generación para no perder los cambios.');
    }
    if (['encolado', 'procesando'].includes(job.estado)) return this.public(job);
    // Claim before replying: returning the old interrupted state made clients
    // stop polling immediately, even though setImmediate had queued the worker.
    const claimed = await this.jobs.requirementsClaim(id);
    if (!claimed) return this.public(await this.get(id, userId));
    this.launch(id, true, claimed);
    return this.public(claimed);
  }
  async recoverCommitted(job, userId) {
    if (job.operacion_requisitos !== 'redaccion_requisitos' || !['interrumpido', 'esperando_proveedor'].includes(job.estado)) return null;
    const lock = await this.mutationLease.acquire(job.proyecto_id);
    try {
      const project = await this.projects.obtenerPorId(job.proyecto_id);
      const rows = await this.requirements.listarPorProyecto(job.proyecto_id);
      const audit = project?.auditoria_requisitos;
      const receipt = audit?.registro_generacion;
      if (String(project?.usuario_id) !== String(userId) || !rows.length ||
          project.analisis_inicial_aprobado_id !== job.entrada_requisitos.payload.analisisId ||
          audit?.referencia_analisis_inicial?.id !== project.analisis_inicial_aprobado_id) return null;
      const outputHash = await this.snapshot(job.proyecto_id, userId, job.operacion_requisitos);
      const rowsHash = Execution.hash(rows);
      let proven = receipt?.trabajo_id === job.id && receipt.entrada_snapshot === job.entrada_requisitos.snapshot &&
        receipt.requisitos_hash === rowsHash && receipt.salida_hash === outputHash;
      // Compatibility for jobs saved before receipts existed. Only recover a first
      // generation whose entire saved output still matches its own response. An
      // unvalidated checkpoint is NOT promoted to a validated semantic review.
      if (!receipt && await this.snapshot(job.proyecto_id, userId, job.operacion_requisitos, []) === job.entrada_requisitos.snapshot) {
        const fields = ['tipo', 'identificador', 'nombre', 'descripcion', 'prioridad', 'actores', 'precondiciones', 'poscondiciones', 'metrica_medible', 'origen', 'evidencia', 'fuentes_origen', 'necesidades_origen', 'criterios_aceptacion', 'reglas_relacionadas', 'requiere_confirmacion', 'estado_decision', 'restricciones_excluidas'];
        const matches = response => rows.length === response?.length && rows.every(row => {
          const original = response.find(item => item.identificador === row.identificador);
          return original && !row.aprobado && !row.historial_versiones?.length &&
            new Date(row.createdAt) >= new Date(job.createdAt) && +new Date(row.updatedAt) === +new Date(row.createdAt) &&
            fields.every(field => Execution.hash(row[field] ?? '') === Execution.hash(original[field] ?? ''));
        });
        proven = Object.values(job.checkpoints_requisitos || {}).some(entry =>
          /^redaccion_lote_/.test(entry.stage) && matches(entry.data?.requerimientos));
        // Older executions could normalize/reorder the response before saving,
        // without checkpointing that final representation. Recover the persisted
        // draft (not the raw response) only when its matching audit was saved in
        // the interrupted execution's time window and no row was edited since.
        const control = audit.control_aprobacion;
        const links = control?.calidad?.vinculos || [];
        const savedAt = +new Date(project.updatedAt);
        proven ||= control?.requisitos === rows.length && links.length === rows.length &&
          savedAt >= +new Date(job.createdAt) && savedAt <= +new Date(job.updatedAt) &&
          rows.every(row => !row.aprobado && !row.historial_versiones?.length &&
            +new Date(row.createdAt) >= +new Date(job.createdAt) && +new Date(row.createdAt) <= savedAt &&
            +new Date(row.updatedAt) === +new Date(row.createdAt) &&
            links.some(link => link.requisito === row.identificador &&
              Execution.hash(link.necesidades || []) === Execution.hash(row.necesidades_origen || [])));
      }
      if (!proven) return null;
      lock.assert();
      const claimed = await this.jobs.requirementsClaim(job.id);
      if (!claimed) return this.public(await this.get(job.id, userId));
      const changes = { estado: 'completado', progreso: 100, error: null, salida_hash: outputHash,
        mensaje: 'Borrador guardado recuperado sin repetir IA. Consulta su cobertura y revisión pendientes.',
        progreso_requisitos: { ...job.progreso_requisitos, etapa: 'resultado_guardado_recuperado', recuperada: true },
        resultado_requisitos: { proyecto_id: String(job.proyecto_id), objetivo: 'requisitos', nombre_proyecto: project.nombre,
          descripcion_proyecto: project.descripcion, auditoria_requisitos: audit, requerimientos: rows } };
      await this.jobs.requirementsSave(job.id, changes, true);
      return this.public({ ...claimed, ...changes });
    } finally { await lock.release(); }
  }
  async cancel(id, userId) {
    const job = await this.get(id, userId);
    const lock = await this.mutationLease.acquire(job.proyecto_id);
    try { return this.public(await this.jobs.requirementsCancel(id, String(userId))); }
    finally { await lock.release(); }
  }
  launch(id, probeUnknownReset = false, claimed = null) { setImmediate(() => this.run(id, probeUnknownReset, claimed).catch(() => {})); }
  async run(id, probeUnknownReset = false, claimed = null) {
    if (this.running.has(id)) return;
    this.running.add(id);
    let timer;
    try {
      const job = claimed || await this.jobs.requirementsClaim(id);
      if (!job) return;
      const checkpoints = job.checkpoints_requisitos || {};
      let progress = { ...(job.progreso_requisitos || {}) };
      let lost = false;
      const save = changes => this.jobs.requirementsSave(id, changes);
      timer = setInterval(() => { save({}).catch(() => { lost = true; }); }, 30000);
      timer.unref?.();
      const context = {
        jobId: job.id,
        inputSnapshot: job.entrada_requisitos.snapshot,
        outputSnapshot: () => this.snapshot(job.proyecto_id, job.usuario_id, job.operacion_requisitos),
        cacheNamespace: job.entrada_requisitos.payload.desdeCero ? job.id : '',
        probeUnknownReset,
        checkpoints,
        assertCurrent: async () => {
          if ((await this.jobs.requirementsGet(id))?.estado === 'cancelado') throw fail('Procesamiento cancelado.', 409, 'REQUIREMENTS_CANCELLED');
          if (lost) throw fail('El trabajo perdió su ejecutor.', 409, 'REQUIREMENTS_LEASE_LOST');
          if (await this.snapshot(job.proyecto_id, job.usuario_id, job.operacion_requisitos) !== job.entrada_requisitos.snapshot) throw fail('La entrada cambió durante la generación. No se aplicó el resultado.');
        },
        progress: async delta => { progress = { ...progress, ...delta }; await save({ progreso_requisitos: progress, mensaje: `Procesando: ${progress.etapa || 'requisitos'}` }); },
        save: () => save({ checkpoints_requisitos: checkpoints }),
        commit: async operation => {
          await context.assertCurrent();
          if (context.pending) throw fail(context.pauseMessage || 'La auditoría está pendiente; conserva el borrador y reanuda.', 503, 'AI_REQUIREMENTS_PENDING');
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
          mensaje: conflict ? 'La entrada cambió o se perdió el trabajo. No se sobrescribió el proyecto.' : context.pauseMessage || 'Generación pausada. Reanuda para continuar las etapas pendientes.',
          error: conflict ? 'REQUIREMENTS_CONFLICT' : 'AI_REQUIREMENTS_PENDING' }, true);
      }
    } finally { clearInterval(timer); this.running.delete(id); }
  }
}
module.exports = RequirementGenerationJobs;
