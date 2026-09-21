class ActualizarRequerimientoManual {
  constructor({ requerimientoRepository }) {
    this.requerimientoRepository = requerimientoRepository;
  }

  async ejecutar({ id, datos }) {
    const existente = await this.requerimientoRepository.obtenerPorId(id);
    if (!existente) {
      throw new Error(`Requerimiento con ID ${id} no encontrado.`);
    }

    // Actualizar directamente en base de datos sin invocar IA
    const actualizado = await this.requerimientoRepository.actualizar(id, datos);
    return actualizado;
  }
}

module.exports = ActualizarRequerimientoManual;
