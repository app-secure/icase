const mongoose = require('mongoose');

const TrabajoGeneracionSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  tipo: { type: String, enum: ['mockups'], default: 'mockups' },
  estado: {
    type: String,
    enum: ['encolado', 'procesando', 'completado', 'fallido'],
    default: 'encolado',
    index: true
  },
  progreso: { type: Number, min: 0, max: 100, default: 0 },
  mensaje: { type: String, default: 'Generación en cola' },
  pantallas: [String],
  insumo_adicional: { type: String, default: '' },
  requerimientos_locales: { type: mongoose.Schema.Types.Mixed, default: null },
  proveedor_usado: { type: String, default: null },
  advertencias: [String],
  total_generados: { type: Number, default: 0 },
  error: { type: String, default: null },
  ejecutor_id: { type: String, required: true },
  // Solo existe durante un trabajo activo. El índice impide dos trabajos simultáneos por proyecto.
  clave_activa: { type: String, unique: true, sparse: true }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.proyecto_id = ret.proyecto_id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.clave_activa;
      delete ret.requerimientos_locales;
      delete ret.insumo_adicional;
      delete ret.ejecutor_id;
      return ret;
    }
  }
});

TrabajoGeneracionSchema.index({ proyecto_id: 1, createdAt: -1 });

module.exports = mongoose.model('TrabajoGeneracion', TrabajoGeneracionSchema);
