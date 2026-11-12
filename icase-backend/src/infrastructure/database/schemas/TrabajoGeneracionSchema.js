const mongoose = require('mongoose');

const TrabajoGeneracionSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: [
      'mockups', 'diagrama', 'codigo_backend', 'codigo_frontend', 'pruebas',
      'infraestructura', 'pipeline_ci_cd', 'paquete_entrega', 'verificacion', 'requisitos'
    ],
    default: 'mockups',
    index: true
  },
  artefacto_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ArtefactoGenerado', default: null, index: true },
  resultado_verificacion: { type: mongoose.Schema.Types.Mixed, default: null },
  tipo_diagrama: { type: String, default: null, index: true },
  estado: {
    type: String,
    enum: ['encolado', 'procesando', 'completado', 'fallido', 'esperando_proveedor', 'interrumpido'],
    default: 'encolado',
    index: true
  },
  progreso: { type: Number, min: 0, max: 100, default: 0 },
  mensaje: { type: String, default: 'Generación en cola' },
  pantallas: [String],
  solo_reparar: { type: Boolean, default: false },
  insumo_adicional: { type: String, default: '' },
  requerimientos_locales: { type: mongoose.Schema.Types.Mixed, default: null },
  insumo_bruto: { type: String, default: '' },
  provider: { type: String, default: 'auto' },
  specific_model: { type: String, default: null },
  regenerar: { type: Boolean, default: false },
  objetivo: { type: String, default: null },
  proveedor_usado: { type: String, default: null },
  advertencias: [String],
  total_generados: { type: Number, default: 0 },
  error: { type: String, default: null },
  cache_hit: { type: Boolean, default: false },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, default: null },
  entrada_hash: String,
  operacion_requisitos: { type: String, enum: ['legacy', 'analisis_inicial', 'redaccion_requisitos', 'correccion_analisis_inicial', 'analisis_respuesta', 'revision_calidad'], default: 'legacy' },
  resultado_analisis_inicial: { type: mongoose.Schema.Types.Mixed, default: null },
  salida_hash: String,
  entrada_requisitos: { type: mongoose.Schema.Types.Mixed, default: null },
  checkpoints_requisitos: { type: mongoose.Schema.Types.Mixed, default: {} },
  progreso_requisitos: { type: mongoose.Schema.Types.Mixed, default: {} },
  resultado_requisitos: { type: mongoose.Schema.Types.Mixed, default: null },
  ejecutor_id: { type: String, required: true },
  lease_expires_at: { type: Date, default: null, index: true },
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
      delete ret.insumo_bruto;
      delete ret.provider;
      delete ret.specific_model;
      delete ret.objetivo;
      delete ret.ejecutor_id;
      delete ret.entrada_requisitos;
      delete ret.checkpoints_requisitos;
      return ret;
    }
  }
});

TrabajoGeneracionSchema.index({ proyecto_id: 1, createdAt: -1 });

module.exports = mongoose.model('TrabajoGeneracion', TrabajoGeneracionSchema);
