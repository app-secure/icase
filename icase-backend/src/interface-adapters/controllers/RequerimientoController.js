class RequerimientoController {
  constructor({
    actualizarRequerimientoManualUseCase,
    requerimientoRepository
  }) {
    this.actualizarRequerimientoManualUseCase = actualizarRequerimientoManualUseCase;
    this.requerimientoRepository = requerimientoRepository;
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const datos = req.body;
      const actualizado = await this.actualizarRequerimientoManualUseCase.ejecutar({
        id,
        datos
      });
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async crearManual(req, res) {
    try {
      const datos = req.body;
      const nuevo = await this.requerimientoRepository.crear(datos);
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
        await this.requerimientoRepository.eliminarPorProyecto(proyectoId);
        const docs = requerimientos.map((r, idx) => ({
          proyecto_id: proyectoId,
          identificador: r.identificador || r.id || `${(r.tipo || 'RF').toUpperCase()}-${String(idx + 1).padStart(2, '0')}`,
          tipo: (r.tipo || (r.category ? 'RNF' : 'RF')).toUpperCase(),
          nombre: r.nombre || r.name || r.category || 'Requerimiento',
          descripcion: r.descripcion || r.description || '',
          prioridad: r.prioridad || r.priority || 'Alta',
          aprobado: true,
          actores: Array.isArray(r.actores) ? r.actores : (r.actors ? (Array.isArray(r.actors) ? r.actors : [r.actors]) : ['Usuario']),
          precondiciones: r.precondiciones || r.precondition || '',
          poscondiciones: r.poscondiciones || r.postcondition || '',
          metrica_medible: r.metrica_medible || r.metric || ''
        }));
        const guardados = docs.length > 0 ? await this.requerimientoRepository.crearMuchos(docs) : [];
        return res.json({ success: true, count: guardados.length, requerimientos: guardados });
      }
      res.status(400).json({ error: 'Formato de requerimientos inválido' });
    } catch (err) {
      console.error('[RequerimientoController] Error sincronizando requerimientos:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = RequerimientoController;
