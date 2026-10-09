class AprobarFase {
  constructor({ proyectoRepository, requerimientoRepository, diagramaRepository, disenoRepository }) {
    this.proyectoRepository = proyectoRepository;
    this.requerimientoRepository = requerimientoRepository;
    this.diagramaRepository = diagramaRepository;
    this.disenoRepository = disenoRepository;
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
    } else if (fase === 'diagramas' || fase === 'diseno') {
      const estadosValidos = new Set(['analisis_aprobado', 'diseno_pendiente', 'diagramas_aprobados', 'mockups_pendientes']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('La fase de análisis debe estar aprobada antes de aprobar los diagramas.');
      }
      const diagramas = await this.diagramaRepository.listarPorProyecto(proyectoId);
      const tiposPresentes = new Set((diagramas || []).map(d => String(d.tipo || '').toLowerCase()));
      const tieneCasosUso = tiposPresentes.has('casos_de_uso') || tiposPresentes.has('casos_uso');
      const tieneArquitectura = tiposPresentes.has('arquitectura') || tiposPresentes.has('arquitectura_software') || tiposPresentes.has('arquitectura_sistema');
      const tieneClases = tiposPresentes.has('clases') || tiposPresentes.has('clases_dominio');
      const tieneArbol = tiposPresentes.has('arbol_navegacion') || tiposPresentes.has('arbol');

      const faltantes = [];
      if (!tieneCasosUso) faltantes.push('casos_de_uso');
      if (!tieneArquitectura) faltantes.push('arquitectura');
      if (!tieneClases) faltantes.push('clases');
      if (!tieneArbol) faltantes.push('arbol_navegacion');

      if (faltantes.length > 0) {
        throw new Error(`No se pueden aprobar los diagramas. Faltan: ${faltantes.join(', ')}.`);
      }

      nuevoEstado = 'mockups_pendientes';
      if (aprobarTodosLosElementos) {
        for (const d of diagramas) {
          await this.diagramaRepository.actualizar(d.id, { aprobado: true });
        }
      }
    } else if (fase === 'mockups') {
      const estadosValidos = new Set(['diagramas_aprobados', 'mockups_pendientes', 'mockups_aprobados', 'diseno_aprobado']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('Los diagramas deben estar aprobados antes de aprobar los mockups.');
      }
      if (!this.disenoRepository) {
        throw new Error('No se configuró el repositorio de diseño para aprobar mockups.');
      }
      const diseno = await this.disenoRepository.obtenerPorProyecto(proyectoId);
      if (!diseno?.mockups?.length) {
        throw new Error('No se pueden aprobar los mockups porque todavía no existe ninguno generado.');
      }
      const invalidos = diseno.mockups.filter(m => m.estado_calidad === 'invalido');
      if (invalidos.length > 0) {
        throw new Error(`No se pueden aprobar los mockups. Hay ${invalidos.length} pantalla(s) inválida(s): ${invalidos.map(m => m.nombre_visible || m.nombre_pantalla).join(', ')}.`);
      }
      nuevoEstado = 'mockups_aprobados';
    } else if (fase === 'finalizar') {
      const estadosValidos = new Set(['mockups_aprobados', 'diseno_aprobado', 'finalizado']);
      if (proyecto.estado_fase && !estadosValidos.has(proyecto.estado_fase)) {
        throw new Error('Los mockups deben estar aprobados antes de finalizar el proyecto.');
      }
      nuevoEstado = 'finalizado';
    } else {
      throw new Error(`Fase inválida: ${fase}. Use 'analisis', 'diagramas', 'mockups' o 'finalizar'.`);
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
