const IRequerimientoRepository = require('./IRequerimientoRepository');
const RequerimientoModel = require('../../infrastructure/database/schemas/RequerimientoSchema');

class MongoRequerimientoRepository extends IRequerimientoRepository {
  async crear(req) {
    const nuevo = new RequerimientoModel({
      proyecto_id: req.proyecto_id,
      tipo: req.tipo,
      identificador: req.identificador,
      nombre: req.nombre,
      descripcion: req.descripcion,
      prioridad: req.prioridad,
      actores: req.actores,
      precondiciones: req.precondiciones,
      poscondiciones: req.poscondiciones,
      metrica_medible: req.metrica_medible,
      aprobado: req.aprobado
    });
    const guardado = await nuevo.save();
    return guardado.toJSON();
  }

  async crearMuchos(requerimientos) {
    const docs = requerimientos.map(req => ({
      proyecto_id: req.proyecto_id,
      tipo: req.tipo,
      identificador: req.identificador,
      nombre: req.nombre,
      descripcion: req.descripcion,
      prioridad: req.prioridad,
      actores: req.actores,
      precondiciones: req.precondiciones,
      poscondiciones: req.poscondiciones,
      metrica_medible: req.metrica_medible,
      aprobado: req.aprobado
    }));
    const guardados = await RequerimientoModel.insertMany(docs);
    return guardados.map(g => g.toJSON());
  }

  async obtenerPorId(id) {
    const doc = await RequerimientoModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async listarPorProyecto(proyectoId) {
    const docs = await RequerimientoModel.find({ proyecto_id: proyectoId }).sort({ tipo: 1, identificador: 1 });
    return docs.map(d => d.toJSON());
  }

  async actualizar(id, datos) {
    const doc = await RequerimientoModel.findByIdAndUpdate(id, datos, { new: true });
    return doc ? doc.toJSON() : null;
  }

  async eliminarPorProyecto(proyectoId) {
    return await RequerimientoModel.deleteMany({ proyecto_id: proyectoId });
  }
}

module.exports = MongoRequerimientoRepository;
