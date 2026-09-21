class IRequerimientoRepository {
  async crear(requerimiento) { throw new Error('Método no implementado'); }
  async crearMuchos(requerimientos) { throw new Error('Método no implementado'); }
  async obtenerPorId(id) { throw new Error('Método no implementado'); }
  async listarPorProyecto(proyectoId) { throw new Error('Método no implementado'); }
  async actualizar(id, datos) { throw new Error('Método no implementado'); }
  async eliminarPorProyecto(proyectoId) { throw new Error('Método no implementado'); }
}

module.exports = IRequerimientoRepository;
