class IDiagramaRepository {
  async crear(diagrama) { throw new Error('Método no implementado'); }
  async crearMuchos(diagramas) { throw new Error('Método no implementado'); }
  async obtenerPorId(id) { throw new Error('Método no implementado'); }
  async listarPorProyecto(proyectoId) { throw new Error('Método no implementado'); }
  async actualizar(id, datos) { throw new Error('Método no implementado'); }
  async eliminarPorProyecto(proyectoId) { throw new Error('Método no implementado'); }
}

module.exports = IDiagramaRepository;
