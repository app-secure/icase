class Requerimiento {
  constructor({
    id,
    proyecto_id,
    tipo = 'RF', // 'RF' o 'RNF'
    identificador, // e.g. RF-01, RNF-01
    nombre,
    descripcion = '',
    prioridad = 'Alta', // Alta, Media, Baja
    actores = [],
    precondiciones = '',
    poscondiciones = '',
    metrica_medible = '', // Mandatorio para RNF según IEEE 830 y docente
    aprobado = false,
    createdAt,
    updatedAt
  }) {
    this.id = id;
    this.proyecto_id = proyecto_id;
    this.tipo = tipo;
    this.identificador = identificador;
    this.nombre = nombre;
    this.descripcion = descripcion;
    this.prioridad = prioridad;
    this.actores = Array.isArray(actores) ? actores : [actores].filter(Boolean);
    this.precondiciones = precondiciones;
    this.poscondiciones = poscondiciones;
    this.metrica_medible = metrica_medible;
    this.aprobado = aprobado;
    this.createdAt = createdAt || new Date();
    this.updatedAt = updatedAt || new Date();
  }

  validar() {
    if (!this.proyecto_id) throw new Error('El ID de proyecto es obligatorio.');
    if (!this.identificador) throw new Error('El identificador de requerimiento es obligatorio.');
    if (!this.nombre) throw new Error('El nombre de requerimiento es obligatorio.');
    if (this.tipo === 'RNF' && (!this.metrica_medible || this.metrica_medible.trim() === '')) {
      throw new Error('Todo RNF debe poseer una métrica medible y cuantificable.');
    }
  }
}

module.exports = Requerimiento;
