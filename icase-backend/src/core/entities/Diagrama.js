const { DiagramTypes, TIPOS_VALIDOS } = require('../constants/DiagramTypes');

class Diagrama {
  constructor({
    id,
    proyecto_id,
    tipo, // Usar los valores oficiales definidos en core/constants/DiagramTypes
    titulo,
    descripcion = '',
    codigo_mermaid = '',
    codigo_plantuml = '',
    aprobado = false,
    estado = 'pendiente_revision',
    version = 1,
    desactualizado = false,
    motivos_desactualizacion = [],
    aprobado_en = null,
    aprobado_por = null,
    estado_calidad = 'advertencia',
    errores_validacion = [],
    advertencias_validacion = [],
    metricas_validacion = {},
    validado_en = null,
    revisiones = [],
    historial_versiones = [],
    restaurada_desde_version = null,
    huella_entrada = null,
    retroalimentacion_aplicada = '',
    trazabilidad_rnf = [],
    requisitos_relacionados = [],
    versiones_origen = {},
    descripcion_jerarquica = [],
    createdAt,
    updatedAt
  }) {
    this.id = id;
    this.proyecto_id = proyecto_id;
    this.tipo = tipo;
    this.titulo = titulo;
    this.descripcion = descripcion;
    this.codigo_mermaid = codigo_mermaid;
    this.codigo_plantuml = codigo_plantuml;
    this.aprobado = aprobado;
    this.estado = estado;
    this.version = Math.max(1, Number(version) || 1);
    this.desactualizado = Boolean(desactualizado);
    this.motivos_desactualizacion = Array.isArray(motivos_desactualizacion)
      ? motivos_desactualizacion
      : [motivos_desactualizacion].filter(Boolean);
    this.aprobado_en = aprobado_en;
    this.aprobado_por = aprobado_por;
    this.estado_calidad = estado_calidad;
    this.errores_validacion = Array.isArray(errores_validacion) ? errores_validacion : [];
    this.advertencias_validacion = Array.isArray(advertencias_validacion) ? advertencias_validacion : [];
    this.metricas_validacion = metricas_validacion && typeof metricas_validacion === 'object' ? metricas_validacion : {};
    this.validado_en = validado_en;
    this.revisiones = Array.isArray(revisiones) ? revisiones : [];
    this.historial_versiones = Array.isArray(historial_versiones) ? historial_versiones : [];
    this.restaurada_desde_version = restaurada_desde_version;
    this.huella_entrada = huella_entrada;
    this.retroalimentacion_aplicada = retroalimentacion_aplicada;
    this.trazabilidad_rnf = Array.isArray(trazabilidad_rnf) ? trazabilidad_rnf : [trazabilidad_rnf].filter(Boolean);
    this.requisitos_relacionados = Array.isArray(requisitos_relacionados)
      ? requisitos_relacionados
      : [requisitos_relacionados].filter(Boolean);
    this.versiones_origen = versiones_origen && typeof versiones_origen === 'object'
      ? versiones_origen
      : {};
    this.descripcion_jerarquica = Array.isArray(descripcion_jerarquica) ? descripcion_jerarquica : (descripcion_jerarquica ? [descripcion_jerarquica] : []);
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  validar() {
    if (!this.proyecto_id) throw new Error('El ID de proyecto es obligatorio.');
    if (!this.tipo) throw new Error('El tipo de diagrama es obligatorio.');
    if (!this.titulo) throw new Error('El título del diagrama es obligatorio.');
    if (!this.codigo_mermaid || this.codigo_mermaid.trim() === '') {
      throw new Error('El código Mermaid no puede estar vacío.');
    }
  }
}

module.exports = Diagrama;
