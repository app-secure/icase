const { DiagramWorkflowService } = require('../../core/services/DiagramWorkflowService');
const { normalizeDiagramType, isValidDiagramType } = require('../../core/constants/DiagramTypes');
const { pick, PROJECT_EDITABLE } = require('../../infrastructure/security/sanitize');

class ProyectoController {
  async revisarRequisitos(req, res) {
    try {
      const project = await this.proyectoRepository.obtenerPorId(req.params.id);
      const requirements = await this.requerimientoRepository.listarPorProyecto(req.params.id);
      const audit = structuredClone(project.auditoria_requisitos || {});
      const { accion, id, justificacion } = req.body;
      if (project.version_flujo_analisis === 2 && (accion.endsWith('_actor') || accion === 'editar_analisis')) return res.status(409).json({ error: 'Revisa el análisis inicial para cambiar actores, reglas o clasificación; su versión aprobada es inmutable.' });
      const Approval = require('../../core/services/RequirementApprovalService');
      if (accion !== 'validar') {
        if (requirements.some(item => item.aprobado)) return res.status(409).json({ error: 'Reabre el análisis antes de cambiar una especificación aprobada.' });
        if (typeof justificacion !== 'string' || !justificacion.trim()) return res.status(400).json({ error: 'La revisión requiere una justificación.' });
        const record = { accion, justificacion: justificacion.trim(), usuario_id: req.usuario.id, fecha: new Date().toISOString() };
        if (['agregar_actor', 'editar_actor', 'confirmar_actor', 'fusionar_actor'].includes(accion)) {
          if (project.estado_fase && !['insumos_pendientes', 'analisis_pendiente'].includes(project.estado_fase)) return res.status(409).json({ error: 'Reabre el análisis antes de editar actores.' });
          const Actors = require('../../core/services/RequirementActors');
          const previous = Actors.actorCatalog(audit, requirements);
          let change;
          try { change = Actors.changeActor(previous, req.body); }
          catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
          for (const requirement of requirements) {
            const names = (requirement.actores || []).map(name => change.replacements.find(([old]) => Actors.key(old) === Actors.key(name))?.[1] || name);
            const updated = [...new Map(names.map(name => [Actors.key(name), name])).values()];
            if (JSON.stringify(updated) !== JSON.stringify(requirement.actores || [])) await this.requerimientoRepository.actualizar(requirement.id || requirement._id, { actores: updated });
          }
          audit.actores = change.actors;
          audit.historial_revision = [...(audit.historial_revision || []), { ...record, id, anterior: previous, posterior: change.actors }];
          audit.cambios_actores = change.replacements;
        } else if (accion === 'editar_analisis') {
          const original = audit.inventario?.find(item => item.id === id);
          if (!original) return res.status(404).json({ error: 'Elemento del análisis no encontrado.' });
          const fields = ['tipo', 'necesidad', 'estado', 'objetivo_id'];
          const next = { ...original, ...pick(req.body.cambios, fields) };
          const sources = this.fuenteRepository ? await this.fuenteRepository.listarPorProyecto(req.params.id) : [];
          const input = sources.filter(source => source.texto_transcrito?.trim()).map(source => `[Fuente enriquecida]\nArchivo: ${source.nombre_archivo}\n\n[Contenido extraído]\n${source.texto_transcrito}`).join('\n\n---\n\n') || project.insumo_bruto || '';
          const report = new (require('../../infrastructure/services/RequirementCoverageService'))().inspectInventory([next], input);
          if (report.invalid.length) return res.status(400).json({ error: 'Clasificación, datos o evidencias inválidos.', diagnostico: report.invalid });
          audit.inventario = audit.inventario.map(item => item.id === id ? report.valid[0] : item);
          Object.assign(audit, require('../../core/constants/RequirementAnalysisContract').analysisSections(audit.inventario));
          audit.historial_revision = [...(audit.historial_revision || []), { ...record, id, anterior: original, posterior: report.valid[0] }];
        } else {
          const finding = audit.revision_semantica?.hallazgos?.find(item => item.id === id);
          if (!finding || !['confirmar', 'resolver', 'descartar', 'aceptar'].includes(accion)) return res.status(400).json({ error: 'Hallazgo o acción inválidos.' });
          if (accion === 'aceptar' && finding.estado !== 'corregido') return res.status(400).json({ error: 'Solo se puede aceptar una corrección aplicada.' });
          const checkAudit = { ...audit, revision_semantica: { ...audit.revision_semantica, hallazgos: [] } };
          if (accion === 'resolver' && new Approval().evaluate(requirements, checkAudit).bloqueado) return res.status(400).json({ error: 'Corrige primero los errores estructurales o necesidades pendientes.' });
          finding.estado = ({ confirmar: 'confirmado', resolver: 'resuelto', descartar: 'descartado', aceptar: 'aceptado' })[accion];
          finding.severidad = accion === 'confirmar' && req.body.severidad === 'critico' ? 'critico' : 'advertencia';
          finding.historial = [...(finding.historial || []), record];
        }
        audit.version_analisis = Number(audit.version_analisis || 0) + 1;
        const { contextOf } = require('../../core/services/RequirementAnalysisContext');
        if (accion.endsWith('_actor') || JSON.stringify(contextOf(project.auditoria_requisitos)) !== JSON.stringify(contextOf(audit))) {
          await (this.requirementChangeService || new (require('../../core/services/RequirementChangeService'))({ proyectoRepository: this.proyectoRepository, diagramaRepository: this.diagramaRepository, disenoRepository: this.disenoRepository })).invalidate(req.params.id, 'Cambió una regla, restricción o decisión del análisis.');
        }
      }
      audit.control_aprobacion = new Approval().evaluate(requirements, audit);
      audit.revision_actual = { fecha: new Date().toISOString(), errores: audit.control_aprobacion.errores_criticos, advertencias: audit.control_aprobacion.advertencias };
      await this.proyectoRepository.actualizar(req.params.id, { auditoria_requisitos: audit });
      return res.json({ auditoria_requisitos: audit });
    } catch (error) {
      console.error('[ProyectoController] Error revisando requisitos:', error);
      return res.status(500).json({ error: 'No se pudo guardar la revisión de requisitos.' });
    }
  }
  async resolverNecesidad(req, res) {
    try {
      const project = await this.proyectoRepository.obtenerPorId(req.params.id);
      if (Number(project.version_flujo_analisis || 1) >= 2) return res.status(409).json({ error: 'Revisa el análisis inicial para corregir sus necesidades; su versión aprobada es inmutable.' });
      const requirements = await this.requerimientoRepository.listarPorProyecto(req.params.id);
      if (requirements.some(item => item.aprobado)) return res.status(409).json({ error: 'Reabre el análisis antes de cambiar necesidades de una especificación aprobada.' });
      const audit = structuredClone(project.auditoria_requisitos || {});
      const pending = audit.necesidades_pendientes || [];
      const entry = pending.find(item => item.id === req.params.necesidadId && item.estado_validacion === 'pendiente');
      if (!entry) return res.status(404).json({ error: 'Necesidad pendiente no encontrada.' });
      const { accion, justificacion, evidencias } = req.body;
      if (typeof justificacion !== 'string' || !justificacion.trim() || !['corregir_evidencia', 'descartar'].includes(accion)) return res.status(400).json({ error: 'Indica una acción válida y su justificación.' });
      if (accion === 'corregir_evidencia') {
        const sources = this.fuenteRepository ? await this.fuenteRepository.listarPorProyecto(req.params.id) : [];
        const content = sources.filter(source => source.texto_transcrito?.trim()).map(source => `[Fuente enriquecida]\nArchivo: ${source.nombre_archivo}\n\n[Contenido extraído]\n${source.texto_transcrito}`).join('\n\n---\n\n') || project.insumo_bruto || '';
        if (!Array.isArray(evidencias) || !evidencias.length) return res.status(400).json({ error: 'Indica los fragmentos de evidencia.' });
        const Coverage = require('../../infrastructure/services/RequirementCoverageService');
        const result = new Coverage().inspectInventory([{ ...entry.elemento, ...pick(req.body.cambios, ['tipo', 'necesidad', 'estado', 'objetivo_id']), evidencias }], content);
        if (result.invalid.length) return res.status(400).json({ error: 'La corrección no es válida.', diagnostico: result.invalid });
        if ((audit.inventario || []).some(item => item.id === entry.id)) return res.status(409).json({ error: 'El identificador ya está en el inventario validado.' });
        audit.inventario = [...(audit.inventario || []), result.valid[0]];
        Object.assign(audit, require('../../core/constants/RequirementAnalysisContract').analysisSections(audit.inventario));
        entry.estado_validacion = 'corregida';
        entry.elemento_corregido = result.valid[0];
      } else entry.estado_validacion = 'descartada';
      entry.historial = [...(entry.historial || []), { accion, justificacion: justificacion.trim(), usuario_id: req.usuario.id, fecha: new Date().toISOString() }];
      audit.version_analisis = Number(audit.version_analisis || 0) + 1;
      const { contextOf } = require('../../core/services/RequirementAnalysisContext');
      if (this.diagramaRepository && JSON.stringify(contextOf(project.auditoria_requisitos)) !== JSON.stringify(contextOf(audit))) {
        await (this.requirementChangeService || new (require('../../core/services/RequirementChangeService'))({ proyectoRepository: this.proyectoRepository, diagramaRepository: this.diagramaRepository, disenoRepository: this.disenoRepository })).invalidate(req.params.id, 'Cambió una decisión del análisis al resolver una necesidad.');
      }
      // Se conserva el diagnóstico original como historial, sin borrar evidencias rechazadas.
      audit.control_aprobacion = new (require('../../core/services/RequirementApprovalService'))().evaluate(requirements, audit);
      audit.revision_actual = { fecha: new Date().toISOString(), errores: audit.control_aprobacion.errores_criticos, advertencias: audit.control_aprobacion.advertencias };
      await this.proyectoRepository.actualizar(req.params.id, { auditoria_requisitos: audit });
      return res.json({ auditoria_requisitos: audit });
    } catch (error) {
      console.error('[ProyectoController] Error al resolver necesidad:', error);
      return res.status(500).json({ error: 'No se pudo resolver la necesidad pendiente.' });
    }
  }
  constructor({
    crearProyectoUseCase,
    procesarConIAUseCase,
    aprobarFaseUseCase,
    proyectoRepository,
    requerimientoRepository,
    diagramaRepository,
    fuenteRepository,
    casoDeUsoRepository,
    disenoRepository,
    markdownCompilerService,
    trabajoGeneracionRepository,
    finalProjectAuditService,
    requirementChangeService = null
  }) {
    this.crearProyectoUseCase = crearProyectoUseCase;
    this.procesarConIAUseCase = procesarConIAUseCase;
    this.aprobarFaseUseCase = aprobarFaseUseCase;
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.fuenteRepository = fuenteRepository;
    this.casoDeUsoRepository = casoDeUsoRepository;
    this.disenoRepository = disenoRepository;
    this.markdownCompilerService = markdownCompilerService;
    this.trabajoGeneracionRepository = trabajoGeneracionRepository;
    this.finalProjectAuditService = finalProjectAuditService;
    this.requirementChangeService = requirementChangeService;
    this.diagramWorkflowService = new DiagramWorkflowService();
  }

  async crear(req, res) {
    try {
      const { nombre, descripcion, insumo_bruto, parametros } = req.body;
      const usuario_id = req.usuario.id; // el dueño es siempre quien tiene la sesión, nunca lo que diga el cuerpo
      const proyecto = await this.crearProyectoUseCase.ejecutar({
        usuario_id,
        nombre: nombre || 'Proyecto sin nombre',
        descripcion: descripcion || '',
        insumo_bruto: insumo_bruto || '',
        parametros
      });
      res.status(201).json(proyecto);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async listar(req, res) {
    try {
      const filtro = { usuario_id: req.usuario.id };
      const proyectos = await this.proyectoRepository.listar(filtro);
      // Asociar fuentes, requerimientos y diagramas a cada proyecto para persistencia completa
      const proyectosCompletos = await Promise.all(
        proyectos.map(async (p) => {
          const [fuentes, requerimientos, diagramas, diseno] = await Promise.all([
            this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(p.id) : [],
            this.requerimientoRepository ? this.requerimientoRepository.listarPorProyecto(p.id) : [],
            this.diagramaRepository ? this.diagramaRepository.listarPorProyecto(p.id) : [],
            this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(p.id) : null
          ]);
          const requirementsApproved = ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
            .includes(p.estado_fase);
          return {
            ...p,
            fuentes,
            requerimientos,
            diagramas,
            diseno,
            auditoriaFinal: this._auditarProyecto({ proyecto: p, requerimientos, diagramas, diseno }),
            flujoDiagramas: this.diagramWorkflowService.build({ requirementsApproved, diagrams: diagramas })
          };
        })
      );
      res.json(proyectosCompletos);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      // Solo datos editables: el dueño y el estado de las fases no se cambian desde aquí.
      const data = pick(req.body, PROJECT_EDITABLE);
      const actualizado = await this.proyectoRepository.actualizar(id, data);
      if (!actualizado) {
        return res.status(404).json({ error: 'Proyecto no encontrado para actualizar' });
      }
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async obtenerPorId(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      res.json({
        ...proyecto,
        requerimientos,
        diagramas,
        fuentes,
        casosDeUso,
        diseno,
        auditoriaFinal: this._auditarProyecto({ proyecto, requerimientos, diagramas, diseno }),
        flujoDiagramas: this.diagramWorkflowService.build({
          requirementsApproved: ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
            .includes(proyecto.estado_fase),
          diagrams: diagramas
        })
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async eliminar(req, res) {
    try {
      const { id } = req.params;
      await this.proyectoRepository.eliminar(id);
      res.json({ success: true, message: 'Proyecto eliminado con éxito' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async obtenerModelosIA(req, res) {
    try {
      if (this.procesarConIAUseCase && typeof this.procesarConIAUseCase.obtenerModelosDisponibles === 'function') {
        const info = await this.procesarConIAUseCase.obtenerModelosDisponibles({ objetivo: req.query.objetivo });
        return res.json(info);
      }
      res.json({ provider_defecto: 'auto', proveedores: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async procesarConIA(req, res) {
    try {
      const { id } = req.params;
      const { insumo_adicional, insumo_bruto, provider, modelo, proveedor, specificModel, objetivo, tipo_diagrama } = req.body;
      const project = await this.proyectoRepository.obtenerPorId(id);
      if (project?.version_flujo_analisis === 2 && objetivo !== 'diagramas') {
        const job = await this.requirementJobs.start(id, req.usuario.id, { insumo_adicional, insumo_bruto, provider: provider || proveedor || 'auto', specificModel, operacion: 'analisis_inicial' });
        return res.status(202).json({ trabajo: job, mensaje: 'Revisa y aprueba el análisis inicial antes de redactar requisitos.' });
      }
      if (this.requirementJobs && this.legacyRequirementJobsEnabled !== false && objetivo === 'requisitos') {
        // Liberar el lease HTTP: el worker adquiere el suyo únicamente al persistir.
        if (req.projectMutationLease) await req.projectMutationLease.release();
        const job = await this.requirementJobs.start(id, req.usuario.id, { insumo_adicional, insumo_bruto, provider: provider || modelo || proveedor || 'auto', specificModel });
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline) {
          const current = await this.requirementJobs.get(job.id, req.usuario.id);
          if (current.estado === 'completado') return res.json(current.resultado_requisitos);
          if (['esperando_proveedor', 'fallido', 'interrumpido'].includes(current.estado)) return res.status(503).json({ error: current.mensaje, codigo: current.error || 'AI_REQUIREMENTS_PENDING', trabajo: this.requirementJobs.public(current) });
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        return res.status(503).json({ error: 'La generación continúa en segundo plano.', codigo: 'AI_REQUIREMENTS_PENDING', trabajo_id: job.id });
      }
      const resultado = await this.procesarConIAUseCase.ejecutar({
        proyectoId: id,
        insumoBrutoInput: insumo_bruto,
        insumoAdicional: insumo_adicional,
        provider: provider || modelo || proveedor || 'auto',
        specificModel,
        objetivo: objetivo || 'completo',
        tipoDiagrama: tipo_diagrama
      });
      res.json(resultado);
    } catch (err) {
      console.error('[ProyectoController] Error en procesarConIA:', err);
      res.status(400).json({ error: err.message, ...(err.code ? { codigo: err.code } : {}), ...(err.proveedores ? { proveedores: err.proveedores } : {}), ...(err.metricasEjecucion ? { metricas_ejecucion: err.metricasEjecucion } : {}) });
    }
  }

  async aprobarFase(req, res) {
    try {
      const { id } = req.params;
      const { fase, aprobar_todos, tipo_diagrama, decision, observaciones } = req.body;
      const resultado = await this.aprobarFaseUseCase.ejecutar({
        proyectoId: id,
        fase,
        aprobarTodosLosElementos: Boolean(aprobar_todos),
        tipoDiagrama: tipo_diagrama,
        aprobadoPor: req.usuario?.id || req.usuario?.email || null,
        decision: decision || 'aprobar',
        observaciones: observaciones || ''
      });
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message,
        ...(err.controlRequisitos ? { codigo: err.code, control_requisitos: err.controlRequisitos } : {})
      });
    }
  }

  async iniciarTrabajoDiagrama(req, res) {
    try {
      const tipoDiagrama = normalizeDiagramType(req.body.tipo_diagrama);
      if (!isValidDiagramType(tipoDiagrama)) {
        return res.status(400).json({ error: 'tipo_diagrama no es válido' });
      }
      const payload = {
        proyectoId: req.params.id,
        tipoDiagrama,
        regenerar: req.body.regenerar === true,
        insumoBruto: req.body.insumo_bruto || '',
        insumoAdicional: req.body.insumo_adicional || '',
        provider: req.body.provider || req.body.modelo || req.body.proveedor || 'auto',
        specificModel: req.body.specificModel || null
      };
      const resultado = await this.trabajoGeneracionRepository.crearORecuperarActivoDiagrama(payload);
      res.status(resultado.creado ? 202 : 200).json({
        trabajo: resultado.trabajo,
        reutilizado: !resultado.creado,
        reanudado: Boolean(resultado.reanudado)
      });
      if (resultado.creado) this._lanzarTrabajoDiagrama(resultado.trabajo.id, payload);
    } catch (err) {
      console.error('[ProyectoController] Error iniciando trabajo de diagrama:', err);
      res.status(400).json({ error: err.message });
    }
  }

  async _respuestaTrabajoDiagrama(trabajo) {
    const response = { trabajo };
    if (trabajo?.estado !== 'completado') return response;
    const [proyecto, requerimientos, diagramas] = await Promise.all([
      this.proyectoRepository.obtenerPorId(trabajo.proyecto_id),
      this.requerimientoRepository.listarPorProyecto(trabajo.proyecto_id),
      this.diagramaRepository.listarPorProyecto(trabajo.proyecto_id)
    ]);
    response.resultado = {
      ...(proyecto || {}),
      proyecto_id: trabajo.proyecto_id,
      requerimientos,
      diagramas,
      flujoDiagramas: this.diagramWorkflowService.build({ requirementsApproved: true, diagrams: diagramas }),
      cache_hit: Boolean(trabajo.cache_hit)
    };
    return response;
  }

  async obtenerTrabajoDiagrama(req, res) {
    try {
      const trabajo = await this.trabajoGeneracionRepository.obtenerPorId(req.params.trabajoId);
      if (!trabajo || trabajo.tipo !== 'diagrama') return res.status(404).json({ error: 'Trabajo no encontrado' });
      res.json(await this._respuestaTrabajoDiagrama(trabajo));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async obtenerUltimoTrabajoDiagrama(req, res) {
    try {
      const tipo = req.query.tipo_diagrama ? normalizeDiagramType(req.query.tipo_diagrama) : null;
      const trabajo = await this.trabajoGeneracionRepository.obtenerUltimoDiagramaPorProyecto(req.params.id, tipo);
      if (!trabajo) return res.json({ trabajo: null });
      res.json(await this._respuestaTrabajoDiagrama(trabajo));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  _lanzarTrabajoDiagrama(trabajoId, payload) {
    // La aceptación HTTP no espera a la IA. Un fallo al persistir el estado
    // tampoco debe convertirse en un rechazo no manejado que tumbe Node.
    setImmediate(() => {
      Promise.resolve().then(() => this._ejecutarTrabajoDiagrama(trabajoId, payload)).catch(error => {
        console.error(`[ProyectoController] No se pudo finalizar el trabajo ${trabajoId}; se conserva para recuperación:`, error.message);
      });
    });
  }

  async _ejecutarTrabajoDiagrama(trabajoId, payload) {
    const heartbeat = setInterval(() => {
      this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando', mensaje: 'La IA continúa generando el diagrama'
      }).catch(() => {});
    }, 30000);
    heartbeat.unref?.();
    try {
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'procesando', progreso: 10, mensaje: 'Generando diagrama con IA'
      });
      const resultado = await this.procesarConIAUseCase.ejecutar({
        proyectoId: payload.proyectoId,
        insumoBrutoInput: payload.insumoBruto,
        insumoAdicional: payload.insumoAdicional,
        provider: payload.provider,
        specificModel: payload.specificModel,
        objetivo: 'diagramas',
        tipoDiagrama: payload.tipoDiagrama,
        regenerar: payload.regenerar === true
      });
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'completado', progreso: 100, mensaje: 'Diagrama generado correctamente',
        proveedor_usado: resultado?.proveedorUsado || resultado?.proveedor_usado || null,
        total_generados: 1, cache_hit: Boolean(resultado?.cache_hit), error: null
      }, true);
    } catch (err) {
      console.error(`[ProyectoController] Trabajo de diagrama ${trabajoId} falló:`, err);
      await this.trabajoGeneracionRepository.actualizar(trabajoId, {
        estado: 'fallido', progreso: 100, mensaje: 'La generación del diagrama falló', error: err.message
      }, true);
    } finally {
      clearInterval(heartbeat);
    }
  }

  async reanudarTrabajosDiagrama() {
    const trabajos = await this.trabajoGeneracionRepository.reclamarDiagramasExpirados();
    for (const trabajo of trabajos) {
      const payload = await this.trabajoGeneracionRepository.obtenerPayloadDiagrama(trabajo.id);
      if (payload) this._lanzarTrabajoDiagrama(trabajo.id, payload);
    }
    return trabajos.length;
  }

  async obtenerFlujoDiagramas(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
      const diagramas = await this.diagramaRepository.listarPorProyecto(id);
      const requirementsApproved = ['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado', 'finalizado']
        .includes(proyecto.estado_fase);
      res.json(this.diagramWorkflowService.build({ requirementsApproved, diagrams: diagramas }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async exportarMarkdown(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      const auditoriaFinal = this._auditarProyecto({ proyecto, requerimientos, diagramas, diseno });
      if (auditoriaFinal && !auditoriaFinal.exportable) {
        return res.status(409).json({
          error: 'La auditoría final detectó errores críticos que impiden exportar el documento.',
          auditoriaFinal
        });
      }

      const markdown = this.markdownCompilerService.compilar({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas
      });

      const safeName = (proyecto.nombre || 'proyecto')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_especificacion.md"`);
      res.send(markdown);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async documentoConsolidado(req, res) {
    try {
      const { id } = req.params;
      const proyecto = await this.proyectoRepository.obtenerPorId(id);
      if (!proyecto) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const estadosConDocumento = new Set(['mockups_aprobados', 'diseno_aprobado', 'finalizado']);
      if (proyecto.estado_fase && !estadosConDocumento.has(proyecto.estado_fase)) {
        return res.status(409).json({
          error: 'Debes aprobar los mockups antes de generar el documento consolidado.'
        });
      }

      const [requerimientos, diagramas, fuentes, casosDeUso, diseno] = await Promise.all([
        this.requerimientoRepository.listarPorProyecto(id),
        this.diagramaRepository.listarPorProyecto(id),
        this.fuenteRepository ? this.fuenteRepository.listarPorProyecto(id) : [],
        this.casoDeUsoRepository ? this.casoDeUsoRepository.listarPorProyecto(id) : [],
        this.disenoRepository ? this.disenoRepository.obtenerPorProyecto(id) : null
      ]);

      const auditoriaFinal = this._auditarProyecto({ proyecto, requerimientos, diagramas, diseno });
      if (auditoriaFinal && !auditoriaFinal.exportable) {
        return res.status(409).json({
          error: 'La auditoría final detectó errores críticos que impiden generar el documento.',
          auditoriaFinal
        });
      }

      const flujoDiagramas = this.diagramWorkflowService.build({
        requirementsApproved: true,
        diagrams: diagramas
      });
      if (!flujoDiagramas.todos_aprobados) {
        const inconsistentes = flujoDiagramas.items
          .filter((item) => item.estado !== 'aprobado')
          .map((item) => `${item.label}: ${item.estado}`);
        return res.status(409).json({
          error: 'El documento consolidado requiere los seis diagramas vigentes y aprobados.',
          diagramas_pendientes: inconsistentes,
          flujoDiagramas
        });
      }

      const markdown = this.markdownCompilerService.compilar({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas
      });

      res.json({
        proyecto,
        fuentes,
        requerimientos,
        casosDeUso,
        diseno,
        diagramas,
        auditoriaFinal,
        markdown
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  _auditarProyecto(data) {
    return this.finalProjectAuditService?.auditar(data) || null;
  }
}

module.exports = ProyectoController;
