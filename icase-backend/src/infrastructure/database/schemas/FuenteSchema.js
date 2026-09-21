const mongoose = require('mongoose');

const FuenteSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  nombre_archivo: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    enum: ['audio', 'pdf', 'texto'],
    required: true
  },
  tamanio: {
    type: String,
    default: '0 KB'
  },
  ruta_archivo: {
    type: String,
    default: ''
  },
  texto_transcrito: {
    type: String,
    default: ''
  },
  estado: {
    type: String,
    enum: ['cargado', 'transcrito', 'error'],
    default: 'cargado'
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

module.exports = mongoose.model('Fuente', FuenteSchema);
