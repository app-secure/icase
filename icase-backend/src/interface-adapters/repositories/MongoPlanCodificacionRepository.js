const PlanCodificacionModel = require('../../infrastructure/database/schemas/PlanCodificacionSchema');

class MongoPlanCodificacionRepository {
  async obtenerPorProyecto(proyectoId) {
    const doc = await PlanCodificacionModel.findOne({ proyecto_id: proyectoId });
    return doc ? doc.toJSON() : null;
  }

  async crear(datos) {
    const doc = await PlanCodificacionModel.create(datos);
    return doc.toJSON();
  }

  async guardar(proyectoId, cambios) {
    const doc = await PlanCodificacionModel.findOneAndUpdate(
      { proyecto_id: proyectoId },
      cambios,
      { new: true, runValidators: true }
    );
    return doc ? doc.toJSON() : null;
  }
}

module.exports = MongoPlanCodificacionRepository;
