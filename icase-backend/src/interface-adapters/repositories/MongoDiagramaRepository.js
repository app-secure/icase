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
      estado: diag.estado || (diag.aprobado ? 'aprobado' : 'pendiente_revision'),
      version: diag.version || 1,
      desactualizado: Boolean(diag.desactualizado),
      motivos_desactualizacion: diag.motivos_desactualizacion || [],
      aprobado_en: diag.aprobado_en || null,
      aprobado_por: diag.aprobado_por || null,
      estado_calidad: diag.estado_calidad || 'advertencia',
      errores_validacion: diag.errores_validacion || [],
      advertencias_validacion: diag.advertencias_validacion || [],
      metricas_validacion: diag.metricas_validacion || {},
      validado_en: diag.validado_en || null,
      revisiones: diag.revisiones || [],
      historial_versiones: diag.historial_versiones || [],
      restaurada_desde_version: diag.restaurada_desde_version || null,
      huella_entrada: diag.huella_entrada || null,
      retroalimentacion_aplicada: diag.retroalimentacion_aplicada || '',
      trazabilidad_rnf: diag.trazabilidad_rnf,
      requisitos_relacionados: diag.requisitos_relacionados || [],
      versiones_origen: diag.versiones_origen || {},
      descripcion_jerarquica: diag.descripcion_jerarquica || []
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
      estado: diag.estado || (diag.aprobado ? 'aprobado' : 'pendiente_revision'),
      version: diag.version || 1,
      desactualizado: Boolean(diag.desactualizado),
      motivos_desactualizacion: diag.motivos_desactualizacion || [],
      aprobado_en: diag.aprobado_en || null,
      aprobado_por: diag.aprobado_por || null,
      estado_calidad: diag.estado_calidad || 'advertencia',
      errores_validacion: diag.errores_validacion || [],
      advertencias_validacion: diag.advertencias_validacion || [],
      metricas_validacion: diag.metricas_validacion || {},
      validado_en: diag.validado_en || null,
      revisiones: diag.revisiones || [],
      historial_versiones: diag.historial_versiones || [],
      restaurada_desde_version: diag.restaurada_desde_version || null,
      huella_entrada: diag.huella_entrada || null,
      retroalimentacion_aplicada: diag.retroalimentacion_aplicada || '',
      trazabilidad_rnf: diag.trazabilidad_rnf,
      requisitos_relacionados: diag.requisitos_relacionados || [],
      versiones_origen: diag.versiones_origen || {},
      descripcion_jerarquica: diag.descripcion_jerarquica || []
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

  async obtenerPorProyecto(proyectoId) {
    return this.listarPorProyecto(proyectoId);
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
