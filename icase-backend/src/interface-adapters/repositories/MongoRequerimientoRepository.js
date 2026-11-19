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
      origen: req.origen,
      evidencia: req.evidencia,
      evidencias: req.evidencias,
      fuentes_origen: req.fuentes_origen,
      necesidades_origen: req.necesidades_origen,
      criterios_aceptacion: req.criterios_aceptacion,
      reglas_relacionadas: req.reglas_relacionadas,
      estado_decision: req.estado_decision,
      restricciones_excluidas: req.restricciones_excluidas,
      requiere_confirmacion: req.requiere_confirmacion,
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
      origen: req.origen,
      evidencia: req.evidencia,
      evidencias: req.evidencias,
      fuentes_origen: req.fuentes_origen,
      necesidades_origen: req.necesidades_origen,
      criterios_aceptacion: req.criterios_aceptacion,
      reglas_relacionadas: req.reglas_relacionadas,
      estado_decision: req.estado_decision,
      restricciones_excluidas: req.restricciones_excluidas,
      requiere_confirmacion: req.requiere_confirmacion,
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

  async obtenerPorProyecto(proyectoId) {
    return this.listarPorProyecto(proyectoId);
  }

  async actualizar(id, datos) {
    const doc = await RequerimientoModel.findByIdAndUpdate(id, datos, { new: true });
    return doc ? doc.toJSON() : null;
  }

  async eliminarPorProyecto(proyectoId) {
    return await RequerimientoModel.deleteMany({ proyecto_id: proyectoId });
  }
  async eliminar(id) { return Boolean(await RequerimientoModel.findByIdAndDelete(id)); }
}

module.exports = MongoRequerimientoRepository;
