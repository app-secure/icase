const Model = require('../../infrastructure/database/schemas/SesionRevocadaSchema');

class MongoSesionRevocadaRepository {
  obtenerPorId(id) { return Model.findById(id).lean(); }
  revocar({ id, usuario_id, expira_en }) {
    return Model.updateOne({ _id: id }, { $setOnInsert: { usuario_id, expira_en } }, { upsert: true });
  }
}

module.exports = MongoSesionRevocadaRepository;
