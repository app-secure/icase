class ActualizarDiagramaManual {
  constructor({ diagramaRepository, plantumlValidatorService }) {
    this.diagramaRepository = diagramaRepository;
    this.plantumlValidatorService = plantumlValidatorService;
  }

  async ejecutar({ id, datos }) {
    const existente = await this.diagramaRepository.obtenerPorId(id);
    if (!existente) {
      throw new Error(`Diagrama con ID ${id} no encontrado.`);
    }

    if (datos.codigo_plantuml && this.plantumlValidatorService) {
      const validacion = this.plantumlValidatorService.validar(datos.codigo_plantuml);
      if (!validacion.valido) {
        throw new Error(`Sintaxis PlantUML inválida: ${validacion.error}`);
      }
    }

    const actualizado = await this.diagramaRepository.actualizar(id, datos);
    return actualizado;
  }
}

module.exports = ActualizarDiagramaManual;
