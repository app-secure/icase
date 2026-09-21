const IProyectoRepository = require('./IProyectoRepository');
const ProyectoModel = require('../../infrastructure/database/schemas/ProyectoSchema');

class MongoProyectoRepository extends IProyectoRepository {
  async crear(proyecto) {
    const nuevo = new ProyectoModel({
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion,
      insumo_bruto: proyecto.insumo_bruto,
      estado_fase: proyecto.estado_fase
    });
    const guardado = await nuevo.save();
    return guardado.toJSON();
  }

  async obtenerPorId(id) {
    const doc = await ProyectoModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async listar() {
    const docs = await ProyectoModel.find().sort({ createdAt: -1 });
    return docs.map(d => d.toJSON());
  }

  async actualizar(id, datos) {
    const doc = await ProyectoModel.findByIdAndUpdate(id, datos, { new: true });
    return doc ? doc.toJSON() : null;
  }

  async actualizarEstadoFase(id, estadoFase) {
    const doc = await ProyectoModel.findByIdAndUpdate(
      id,
      { estado_fase: estadoFase },
      { new: true }
    );
    return doc ? doc.toJSON() : null;
  }

  async eliminar(id) {
    await ProyectoModel.findByIdAndDelete(id);
    return true;
  }
}

module.exports = MongoProyectoRepository;
