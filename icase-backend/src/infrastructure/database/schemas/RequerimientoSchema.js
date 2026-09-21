const mongoose = require('mongoose');

const RequerimientoSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ['RF', 'RNF'],
    required: true,
    default: 'RF'
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
  descripcion: {
    type: String,
    default: '',
    trim: true
  },
  prioridad: {
    type: String,
    enum: ['Alta', 'Media', 'Baja'],
    default: 'Media'
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
  metrica_medible: {
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
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

module.exports = mongoose.model('Requerimiento', RequerimientoSchema);
