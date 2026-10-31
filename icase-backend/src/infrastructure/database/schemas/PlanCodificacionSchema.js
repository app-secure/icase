const mongoose = require('mongoose');
const { CODE_PHASE_IDS, CODE_PHASE_STATES } = require('../../../core/constants/CodeGenerationPhases');

const EtapaCodificacionSchema = new mongoose.Schema({
  etapa: { type: String, enum: CODE_PHASE_IDS, required: true },
  estado: { type: String, enum: Object.values(CODE_PHASE_STATES), required: true },
  propuesta: { type: mongoose.Schema.Types.Mixed, default: null },
  observaciones: { type: String, default: '' },
  version: { type: Number, default: 0 },
  aprobada_por: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  aprobada_en: { type: Date, default: null }
}, { _id: false });

const PlanCodificacionSchema = new mongoose.Schema({
  proyecto_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true, unique: true, index: true },
  version: { type: Number, default: 1 },
  stack_objetivo: {
    backend: { type: String, default: 'Node.js + Express' },
    frontend: { type: String, default: 'React + Vite' },
    base_datos: { type: String, default: 'MongoDB' },
    gestor_paquetes: { type: String, default: 'npm' },
    plataformas: { type: [String], default: ['web'] }
  },
  etapas: { type: [EtapaCodificacionSchema], default: [] },
  modo_un_clic: { type: mongoose.Schema.Types.Mixed, default: null }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id.toString();
      ret.proyecto_id = ret.proyecto_id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('PlanCodificacion', PlanCodificacionSchema);
