const mongoose = require('mongoose');

const EstandarSchema = new mongoose.Schema({
  categoria: {
    type: String, // 'IEEE-830', 'RNF-Metricas', 'Diagramas-Permitidos'
    required: true,
    index: true
  },
  clave: {
    type: String,
    required: true,
    unique: true
  },
  definicion: {
    type: String,
    required: true
  },
  regla_medibilidad: {
    type: String,
    default: ''
  },
  ejemplos: {
    type: mongoose.Schema.Types.Mixed,
    default: []
  }
}, {
  timestamps: true,
  collection: 'estandares'
});

module.exports = mongoose.model('Estandar', EstandarSchema);
