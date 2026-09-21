const DisenoModel = require('../../infrastructure/database/schemas/DisenoSchema');

class MongoDisenoRepository {
  async guardarOActualizar(proyectoId, datos) {
    const diseno = await DisenoModel.findOneAndUpdate(
      { proyecto_id: proyectoId },
      { ...datos, proyecto_id: proyectoId },
      { upsert: true, new: true }
    );
    return diseno.toJSON();
  }

  async obtenerPorProyecto(proyectoId) {
    const diseno = await DisenoModel.findOne({ proyecto_id: proyectoId });
    return diseno ? diseno.toJSON() : null;
  }
}

module.exports = MongoDisenoRepository;
