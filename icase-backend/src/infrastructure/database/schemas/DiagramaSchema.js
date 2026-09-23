const mongoose = require('mongoose');

const DiagramaSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    index: true
  },
  tipo: {
    type: String,
    enum: ['casos_de_uso', 'clases', 'er', 'arquitectura', 'arbol_navegacion', 'secuencia', 'actividad'],
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
    type: [String],
    default: []
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
