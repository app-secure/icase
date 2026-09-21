class AprobarFase {
  constructor({ proyectoRepository, requerimientoRepository, diagramaRepository }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
  }

  async ejecutar({ proyectoId, fase, aprobarTodosLosElementos = false }) {
    const proyecto = await this.proyectoRepository.obtenerPorId(proyectoId);
    if (!proyecto) {
      throw new Error(`Proyecto con ID ${proyectoId} no encontrado.`);
    }

    let nuevoEstado = proyecto.estado_fase;

    if (fase === 'analisis') {
      nuevoEstado = 'analisis_aprobado';
      if (aprobarTodosLosElementos) {
        const reqs = await this.requerimientoRepository.listarPorProyecto(proyectoId);
        for (const r of reqs) {
          await this.requerimientoRepository.actualizar(r.id, { aprobado: true });
        }
      }
    } else if (fase === 'diseno') {
      nuevoEstado = 'diseno_aprobado';
      if (aprobarTodosLosElementos) {
        const diags = await this.diagramaRepository.listarPorProyecto(proyectoId);
        for (const d of diags) {
          await this.diagramaRepository.actualizar(d.id, { aprobado: true });
        }
      }
    } else if (fase === 'finalizar') {
      nuevoEstado = 'finalizado';
    } else {
      throw new Error(`Fase inválida: ${fase}. Use 'analisis', 'diseno' o 'finalizar'.`);
    }

    const proyectoActualizado = await this.proyectoRepository.actualizarEstadoFase(proyectoId, nuevoEstado);
    return {
      proyecto: proyectoActualizado,
      faseAprobada: fase,
      nuevoEstado
    };
  }
}

module.exports = AprobarFase;
