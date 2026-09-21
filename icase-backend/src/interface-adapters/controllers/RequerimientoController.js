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
}

module.exports = RequerimientoController;
