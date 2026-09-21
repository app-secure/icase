const FuenteModel = require('../../infrastructure/database/schemas/FuenteSchema');

class MongoFuenteRepository {
  async crear(datos) {
    const fuente = new FuenteModel(datos);
    const guardada = await fuente.save();
    return guardada.toJSON();
  }

  async listarPorProyecto(proyectoId) {
    const fuentes = await FuenteModel.find({ proyecto_id: proyectoId }).sort({ createdAt: -1 });
    return fuentes.map((f) => f.toJSON());
  }

  async actualizar(id, datos) {
    const fuente = await FuenteModel.findByIdAndUpdate(id, datos, { new: true });
    return fuente ? fuente.toJSON() : null;
  }

  async obtenerPorId(id) {
    const fuente = await FuenteModel.findById(id);
    return fuente ? fuente.toJSON() : null;
  }

  async eliminar(id) {
    const resultado = await FuenteModel.findByIdAndDelete(id);
    return !!resultado;
  }
}

module.exports = MongoFuenteRepository;
