class DiagramaController {
  constructor({
    actualizarDiagramaManualUseCase,
    plantumlValidatorService,
    diagramaRepository
  }) {
    this.actualizarDiagramaManualUseCase = actualizarDiagramaManualUseCase;
    this.plantumlValidatorService = plantumlValidatorService;
    this.diagramaRepository = diagramaRepository;
  }

  async actualizar(req, res) {
    try {
      const { id } = req.params;
      const datos = req.body;
      const actualizado = await this.actualizarDiagramaManualUseCase.ejecutar({
        id,
        datos
      });
      res.json(actualizado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async validarSintaxis(req, res) {
    try {
      const { codigo_plantuml, codigo_mermaid } = req.body;
      const codigo = codigo_plantuml || codigo_mermaid;
      const resultado = this.plantumlValidatorService
        ? this.plantumlValidatorService.validar(codigo)
        : { valido: true };
      res.json(resultado);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = DiagramaController;
