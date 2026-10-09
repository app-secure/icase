const mongoose = require('mongoose');
const {
  DIAGRAM_TYPE_VALUES,
  LEGACY_DIAGRAM_TYPES
} = require('../../../core/constants/DiagramTypes');

const AUXILIARY_DIAGRAM_TYPES = ['er', 'secuencia', 'actividad'];
const ACCEPTED_DIAGRAM_TYPES = [
  ...DIAGRAM_TYPE_VALUES,
  ...Object.keys(LEGACY_DIAGRAM_TYPES),
  ...AUXILIARY_DIAGRAM_TYPES
];

const DiagramaSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ACCEPTED_DIAGRAM_TYPES,
    required: true
  },
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  descripcion: {
    type: String,
    default: '',
    trim: true
  },
  codigo_mermaid: {
    type: String,
    required: true,
    default: 'graph TD\n    Inicio --> Proceso --> Fin'
  },
  codigo_plantuml: {
    type: String,
    default: ''
  },
  aprobado: {
    type: Boolean,
    default: false
  },
  estado: {
    type: String,
    enum: ['bloqueado', 'disponible', 'generando', 'pendiente_revision', 'aprobado', 'desactualizado', 'rechazado', 'error'],
    default: 'pendiente_revision'
  },
  version: {
    type: Number,
    min: 1,
    default: 1
  },
  desactualizado: {
    type: Boolean,
    default: false
  },
  motivos_desactualizacion: {
    type: [String],
    default: []
  },
  aprobado_en: {
    type: Date,
    default: null
  },
  aprobado_por: {
    type: String,
    default: null,
    trim: true
  },
  estado_calidad: {
    type: String,
    enum: ['valido', 'advertencia', 'invalido'],
    default: 'advertencia'
  },
  errores_validacion: {
    type: [String],
    default: []
  },
  advertencias_validacion: {
    type: [String],
    default: []
  },
  metricas_validacion: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  validado_en: {
    type: Date,
    default: null
  },
  revisiones: {
    type: [{
      decision: { type: String, enum: ['aprobado', 'rechazado'], required: true },
      observaciones: { type: String, default: '' },
      usuario: { type: String, default: null },
      version: { type: Number, required: true },
      fecha: { type: Date, default: Date.now }
    }],
    default: []
  },
  historial_versiones: {
    type: [{
      version: { type: Number, required: true },
      titulo: { type: String, default: '' },
      descripcion: { type: String, default: '' },
      codigo_mermaid: { type: String, default: '' },
      codigo_plantuml: { type: String, default: '' },
      estado_calidad: { type: String, default: 'advertencia' },
      guardado_en: { type: Date, default: Date.now }
    }],
    default: []
  },
  restaurada_desde_version: {
    type: Number,
    default: null
  },
  huella_entrada: {
    type: String,
    default: null,
    index: true
  },
  retroalimentacion_aplicada: {
    type: String,
    default: ''
  },
  trazabilidad_rnf: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  requisitos_relacionados: {
    type: [String],
    default: []
  },
  versiones_origen: {
    type: Map,
    of: Number,
    default: {}
  },
  descripcion_jerarquica: {
    type: [String],
    default: []
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

module.exports = mongoose.model('Diagrama', DiagramaSchema);
