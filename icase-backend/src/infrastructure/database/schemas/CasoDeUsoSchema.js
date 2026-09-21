const mongoose = require('mongoose');

const CasoDeUsoSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  identificador: {
    type: String,
    required: true,
    trim: true
  },
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  actores: {
    type: [String],
    default: []
  },
  precondiciones: {
    type: String,
    default: ''
  },
  poscondiciones: {
    type: String,
    default: ''
  },
  flujo_basico: {
    type: [String],
    default: []
  },
  flujos_alternativos: {
    type: [String],
    default: []
  },
  excepciones: {
    type: [String],
    default: []
  },
  codigo_mermaid: {
    type: String,
    default: ''
  },
  aprobado: {
    type: Boolean,
    default: false
  }
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

module.exports = mongoose.model('CasoDeUso', CasoDeUsoSchema);
