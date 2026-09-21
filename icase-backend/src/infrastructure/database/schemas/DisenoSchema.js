const mongoose = require('mongoose');

const DisenoSchema = new mongoose.Schema({
  proyecto_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proyecto',
    required: true,
    unique: true,
    index: true
  },
  modelo_datos: {
    entidades: [{
      nombre: String,
      atributos: String,
      descripcion: String,
      relaciones: String
    }],
    codigo_mermaid: { type: String, default: '' }
  },
  mockups: [{
    nombre_pantalla: String,
    elementos_visibles: [String],
    diseno_menus: String,
    campos_formulario: [String],
    preview_code: String
  }],
  arbol_navegacion: {
    descripcion: { type: String, default: '' },
    codigo_mermaid: { type: String, default: '' }
  },
  arquitectura_frontend: {
    descripcion: { type: String, default: '' },
    capas: {
      app_layer: String,
      features_layer: String,
      shared_layer: String
    },
    codigo_mermaid: { type: String, default: '' }
  },
  arquitectura_backend: {
    descripcion: { type: String, default: '' },
    caracteristicas: [String],
    codigo_mermaid: { type: String, default: '' }
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

module.exports = mongoose.model('Diseno', DisenoSchema);
