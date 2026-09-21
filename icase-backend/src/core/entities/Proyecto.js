class Proyecto {
  constructor({ id, nombre, descripcion = '', insumo_bruto = '', estado_fase = 'analisis_pendiente', createdAt, updatedAt }) {
    this.id = id;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.insumo_bruto = insumo_bruto;
    this.estado_fase = estado_fase;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  validar() {
    if (!this.nombre || this.nombre.trim() === '') {
      throw new Error('El nombre del proyecto es obligatorio.');
    }
  }
}

module.exports = Proyecto;
