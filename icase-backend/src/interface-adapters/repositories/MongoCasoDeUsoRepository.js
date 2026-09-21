const CasoDeUsoModel = require('../../infrastructure/database/schemas/CasoDeUsoSchema');

class MongoCasoDeUsoRepository {
  async guardarMuchos(casos) {
    if (!casos || casos.length === 0) return [];
    const guardados = await CasoDeUsoModel.insertMany(casos);
    return guardados.map((c) => c.toJSON());
  }

  async listarPorProyecto(proyectoId) {
    const casos = await CasoDeUsoModel.find({ proyecto_id: proyectoId }).sort({ identificador: 1 });
    return casos.map((c) => c.toJSON());
  }

  async actualizar(id, datos) {
    const actualizado = await CasoDeUsoModel.findByIdAndUpdate(id, datos, { new: true });
    return actualizado ? actualizado.toJSON() : null;
  }

  async eliminarPorProyecto(proyectoId) {
    await CasoDeUsoModel.deleteMany({ proyecto_id: proyectoId });
    return true;
  }
}

module.exports = MongoCasoDeUsoRepository;
