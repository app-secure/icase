class IUsuarioRepository {
  async crear(usuario) { throw new Error('Método no implementado'); }
  async obtenerPorId(id) { throw new Error('Método no implementado'); }
  async obtenerPorCorreo(correo) { throw new Error('Método no implementado'); }
}

module.exports = IUsuarioRepository;
