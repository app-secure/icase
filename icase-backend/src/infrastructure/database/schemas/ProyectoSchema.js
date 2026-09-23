const mongoose = require('mongoose');

const ProyectoSchema = new mongoose.Schema({
  usuario_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    index: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true,
    default: 'Proyecto sin nombre'
  },
  descripcion: {
    type: String,
    default: '',
    trim: true
  },
  objetivo_general: {
    type: String,
    default: ''
  },
  objetivos_especificos: {
    type: [String],
    default: []
  },
  resumen: {
    type: String,
    default: ''
  },
  palabras_clave: {
    type: [String],
    default: []
  },
  introduccion: {
    type: String,
    default: ''
  },
  insumo_bruto: {
    type: String,
    default: ''
  },
  parametros: {
    highAvailability: { type: Boolean, default: true },
    dataPersistence: { type: Boolean, default: true }
  },
  estado_fase: {
    type: String,
    enum: ['insumos_pendientes', 'analisis_pendiente', 'analisis_aprobado', 'diseno_pendiente', 'diseno_aprobado', 'finalizado'],
    default: 'insumos_pendientes'
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Proyecto', ProyectoSchema);
