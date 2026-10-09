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
