class Diagrama {
  constructor({
    id,
    proyecto_id,
    tipo, // casos_de_uso, arquitectura, clases, er, arbol_navegacion, secuencia, actividad
    titulo,
    descripcion = '',
    codigo_mermaid = '',
    codigo_plantuml = '',
    aprobado = false,
    trazabilidad_rnf = [],
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
    this.trazabilidad_rnf = Array.isArray(trazabilidad_rnf) ? trazabilidad_rnf : [trazabilidad_rnf].filter(Boolean);
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
