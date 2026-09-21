class IProyectoRepository {
  async crear(proyecto) { throw new Error('Método no implementado'); }
  async obtenerPorId(id) { throw new Error('Método no implementado'); }
  async listar() { throw new Error('Método no implementado'); }
  async actualizar(id, datos) { throw new Error('Método no implementado'); }
  async actualizarEstadoFase(id, estadoFase) { throw new Error('Método no implementado'); }
}

module.exports = IProyectoRepository;
