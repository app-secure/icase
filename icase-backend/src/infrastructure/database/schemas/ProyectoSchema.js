const mongoose = require('mongoose');

const ProyectoSchema = new mongoose.Schema({
  version_flujo_analisis: { type: Number, default: 1 },
  analisis_inicial_borrador_id: { type: String, default: null },
  analisis_inicial_aprobado_id: { type: String, default: null },
  auditoria_requisitos: { type: mongoose.Schema.Types.Mixed, default: null },
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
    highAvailability: { type: Boolean, default: null },
    dataPersistence: { type: Boolean, default: null }
  },
  estado_fase: {
    type: String,
    enum: [
      'insumos_pendientes',
      'analisis_pendiente',
      'analisis_aprobado',
      'diseno_pendiente',
      'diagramas_aprobados',
      'mockups_pendientes',
      'mockups_aprobados',
      'diseno_aprobado',
      'finalizado'
    ],
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
