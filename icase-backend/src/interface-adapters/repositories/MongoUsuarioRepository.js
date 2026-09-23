const IUsuarioRepository = require('./IUsuarioRepository');
const UsuarioModel = require('../../infrastructure/database/schemas/UsuarioSchema');

class MongoUsuarioRepository extends IUsuarioRepository {
  async crear(usuarioData) {
    const nuevo = new UsuarioModel(usuarioData);
    const guardado = await nuevo.save();
    return guardado.toJSON();
  }

  async obtenerPorId(id) {
    const doc = await UsuarioModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async obtenerPorCorreo(correo) {
    // Retornamos el documento completo (incluyendo password para validación de hash en login)
    return await UsuarioModel.findOne({ correo: correo.toLowerCase().trim() });
  }
}

module.exports = MongoUsuarioRepository;
