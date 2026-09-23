const IProyectoRepository = require('./IProyectoRepository');
const ProyectoModel = require('../../infrastructure/database/schemas/ProyectoSchema');

class MongoProyectoRepository extends IProyectoRepository {
  async crear(proyecto) {
    const nuevo = new ProyectoModel({
      usuario_id: proyecto.usuario_id || null,
      nombre: proyecto.nombre,
      descripcion: proyecto.descripcion,
      insumo_bruto: proyecto.insumo_bruto,
      estado_fase: proyecto.estado_fase || 'insumos_pendientes',
      objetivo_general: proyecto.objetivo_general || '',
      objetivos_especificos: proyecto.objetivos_especificos || [],
      resumen: proyecto.resumen || '',
      palabras_clave: proyecto.palabras_clave || [],
      introduccion: proyecto.introduccion || '',
      parametros: proyecto.parametros || { highAvailability: true, dataPersistence: true }
    });
    const guardado = await nuevo.save();
    return guardado.toJSON();
  }

  async obtenerPorId(id) {
    const doc = await ProyectoModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async listar(filtro = {}) {
    const docs = await ProyectoModel.find(filtro).sort({ createdAt: -1 });
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
