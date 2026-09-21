const IDiagramaRepository = require('./IDiagramaRepository');
const DiagramaModel = require('../../infrastructure/database/schemas/DiagramaSchema');

class MongoDiagramaRepository extends IDiagramaRepository {
  async crear(diag) {
    const nuevo = new DiagramaModel({
      proyecto_id: diag.proyecto_id,
      tipo: diag.tipo,
      titulo: diag.titulo,
      descripcion: diag.descripcion,
      codigo_mermaid: diag.codigo_mermaid,
      codigo_plantuml: diag.codigo_plantuml || diag.codigo_puml || '',
      aprobado: diag.aprobado,
      trazabilidad_rnf: diag.trazabilidad_rnf
    });
    const guardado = await nuevo.save();
    return guardado.toJSON();
  }

  async crearMuchos(diagramas) {
    const docs = diagramas.map(diag => ({
      proyecto_id: diag.proyecto_id,
      tipo: diag.tipo,
      titulo: diag.titulo,
      descripcion: diag.descripcion,
      codigo_mermaid: diag.codigo_mermaid,
      codigo_plantuml: diag.codigo_plantuml || diag.codigo_puml || '',
      aprobado: diag.aprobado,
      trazabilidad_rnf: diag.trazabilidad_rnf
    }));
    const guardados = await DiagramaModel.insertMany(docs);
    return guardados.map(g => g.toJSON());
  }

  async obtenerPorId(id) {
    const doc = await DiagramaModel.findById(id);
    return doc ? doc.toJSON() : null;
  }

  async listarPorProyecto(proyectoId) {
    const docs = await DiagramaModel.find({ proyecto_id: proyectoId }).sort({ createdAt: 1 });
    return docs.map(d => d.toJSON());
  }

  async actualizar(id, datos) {
    const doc = await DiagramaModel.findByIdAndUpdate(id, datos, { new: true });
    return doc ? doc.toJSON() : null;
  }

  async eliminarPorProyecto(proyectoId) {
    return await DiagramaModel.deleteMany({ proyecto_id: proyectoId });
  }
}

module.exports = MongoDiagramaRepository;
