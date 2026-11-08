const { omit, REQUIREMENT_FORBIDDEN } = require('../../infrastructure/security/sanitize');

class RequerimientoController {
  constructor({
    actualizarRequerimientoManualUseCase,
    requerimientoRepository,
    requirementChangeService
  }) {
    this.actualizarRequerimientoManualUseCase = actualizarRequerimientoManualUseCase;
    this.requerimientoRepository = requerimientoRepository;
    this.requirementChangeService = requirementChangeService;
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const datos = omit(req.body, REQUIREMENT_FORBIDDEN);
      const existente = await this.requerimientoRepository.obtenerPorId(id);
      const actualizado = await this.actualizarRequerimientoManualUseCase.ejecutar({
        id,
        datos: { ...datos, aprobado: false }
      });
      if (existente?.proyecto_id && this.requirementChangeService?.changed([existente], [{ ...existente, ...datos }])) {
        await this.requirementChangeService.invalidate(existente.proyecto_id);
      }
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async crearManual(req, res) {
    try {
      const datos = omit(req.body, ['id', '_id', 'aprobado', 'createdAt', 'updatedAt', '__v']); // proyecto_id sí viene, y la ruta ya comprobó que es del usuario
      const nuevo = await this.requerimientoRepository.crear({
        ...datos,
        origen: datos.origen || 'manual',
        aprobado: false
      });
      if (nuevo.proyecto_id && this.requirementChangeService) {
        await this.requirementChangeService.invalidate(nuevo.proyecto_id, 'Se agregó un requisito a la especificación.');
      }
      res.status(201).json(nuevo);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async sincronizarProyecto(req, res) {
    try {
      const { proyectoId } = req.params;
      const { requerimientos } = req.body;
      if (!proyectoId) {
        return res.status(400).json({ error: 'Falta proyectoId' });
      }
      if (Array.isArray(requerimientos)) {
        const existentes = await this.requerimientoRepository.listarPorProyecto(proyectoId);
        const normalizados = requerimientos.map((r, idx) => ({
          identificador: r.identificador || r.id || `${(r.tipo || 'RF').toUpperCase()}-${String(idx + 1).padStart(2, '0')}`,
          tipo: (r.tipo || (r.category ? 'RNF' : 'RF')).toUpperCase(),
          nombre: r.nombre || r.name || r.category || 'Requerimiento',
          descripcion: r.descripcion || r.description || '',
          prioridad: r.prioridad || r.priority || 'Alta',
          actores: Array.isArray(r.actores) ? r.actores : (r.actors ? (Array.isArray(r.actors) ? r.actors : [r.actors]) : ['Usuario']),
          precondiciones: r.precondiciones || r.precondition || '',
          poscondiciones: r.poscondiciones || r.postcondition || '',
          metrica_medible: r.metrica_medible || r.metric || '',
          origen: r.origen || r.origin || 'manual',
          evidencia: r.evidencia || r.evidence || '',
          evidencias: r.evidencias || r.evidences || [],
          fuentes_origen: Array.isArray(r.fuentes_origen) ? r.fuentes_origen : (Array.isArray(r.sourceNames) ? r.sourceNames : []),
          necesidades_origen: Array.isArray(r.necesidades_origen) ? r.necesidades_origen : (r.needIds || []),
          criterios_aceptacion: Array.isArray(r.criterios_aceptacion) ? r.criterios_aceptacion : (r.acceptanceCriteria || []),
          reglas_relacionadas: Array.isArray(r.reglas_relacionadas) ? r.reglas_relacionadas : (r.ruleIds || []),
          estado_decision: r.estado_decision || r.decisionStatus || 'confirmado',
          restricciones_excluidas: r.restricciones_excluidas || r.excludedConstraints || [],
          requiere_confirmacion: Boolean(r.requiere_confirmacion ?? r.requiresConfirmation)
        }));
        if (!this.requirementChangeService.changed(existentes, normalizados)) {
          // Una corrección de cita no invalida los diagramas, pero sí debe guardarse.
          const guardados = await Promise.all(existentes.map(async existente => {
            const next = normalizados.find(item => item.identificador === existente.identificador && item.tipo === existente.tipo);
            if (!next) return existente;
            const trace = { evidencia: next.evidencia, evidencias: next.evidencias, fuentes_origen: next.fuentes_origen };
            const before = { evidencia: existente.evidencia, evidencias: existente.evidencias || [], fuentes_origen: existente.fuentes_origen || [] };
            return JSON.stringify(trace) === JSON.stringify(before) ? existente : this.requerimientoRepository.actualizar(existente.id, trace);
          }));
          return res.json({ success: true, changed: false, count: guardados.length, requerimientos: guardados });
        }
        await this.requerimientoRepository.eliminarPorProyecto(proyectoId);
        const docs = normalizados.map((r) => ({
          proyecto_id: proyectoId,
          ...r,
          aprobado: false
        }));
        const guardados = docs.length > 0 ? await this.requerimientoRepository.crearMuchos(docs) : [];
        await this.requirementChangeService.invalidate(proyectoId);
        return res.json({ success: true, changed: true, count: guardados.length, requerimientos: guardados });
      }
      res.status(400).json({ error: 'Formato de requerimientos inválido' });
    } catch (err) {
      console.error('[RequerimientoController] Error sincronizando requerimientos:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RequerimientoController;
