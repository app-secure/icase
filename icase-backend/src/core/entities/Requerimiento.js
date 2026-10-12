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
    origen = 'explicito',
    evidencia = '',
    fuentes_origen = [],
    requiere_confirmacion = false,
    estado_decision = 'confirmado',
    restricciones_excluidas = [],
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
    this.origen = ['explicito', 'inferido', 'manual'].includes(origen) ? origen : 'inferido';
    this.evidencia = evidencia;
    this.fuentes_origen = Array.isArray(fuentes_origen) ? fuentes_origen : [fuentes_origen].filter(Boolean);
    this.requiere_confirmacion = Boolean(requiere_confirmacion);
    this.estado_decision = ['confirmado', 'pendiente', 'rechazado', 'fuera_de_alcance'].includes(estado_decision)
      ? estado_decision
      : (this.requiere_confirmacion ? 'pendiente' : 'confirmado');
    this.restricciones_excluidas = Array.isArray(restricciones_excluidas)
      ? restricciones_excluidas
      : [restricciones_excluidas].filter(Boolean);
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
