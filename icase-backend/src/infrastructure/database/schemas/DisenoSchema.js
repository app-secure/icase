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
    pantalla_id: String,
    nombre_pantalla: String,
    nombre_visible: String,
    flujo: String,
    modulo: String,
    ruta: String,
    plataforma: { type: String, enum: ['web', 'mobile', 'tablet'], default: 'web' },
    roles: [String],
    shell: String,
    tipo: String,
    descripcion: String,
    descripcion_jerarquica: [String],
    elementos_visibles: [String],
    campos_formulario: [{
      nombre: String,
      tipo: String,
      requerido: Boolean,
      validacion: String
    }],
    acciones_principales: [String],
    rf_trazabilidad: [String],
    preview_code: { type: String, default: '' },
    imagen_url: String,
    estado: { type: String, enum: ['generado', 'editado', 'aprobado'], default: 'generado' },
    version: { type: Number, default: 1 },
    advertencias_validacion: [String],
    errores_validacion: [String],
    estado_calidad: { type: String, enum: ['valido', 'advertencia', 'invalido'], default: 'advertencia' }
  }],
  manifiesto_navegacion: [{
    pantalla_id: String,
    nombre: String,
    slug: String,
    flujo: String,
    modulo: String,
    ruta: String,
    tipo: String,
    plataforma: { type: String, enum: ['web', 'mobile', 'tablet'], default: 'web' },
    roles: [String],
    shell: String,
    componentes: [String],
    orden: Number,
    obligatoria: { type: Boolean, default: true }
  }],
  sistema_diseno: {
    nombre: { type: String, default: 'Predeterminado I-CASE' },
    origen: { type: String, enum: ['predeterminado', 'manual', 'ia'], default: 'predeterminado' },
    version: { type: Number, default: 1 },
    colores: {
      primario: { type: String, default: '#0b57d0' },
      primario_oscuro: { type: String, default: '#073d8c' },
      secundario: { type: String, default: '#64748b' },
      fondo: { type: String, default: '#f8fafc' },
      superficie: { type: String, default: '#ffffff' },
      texto: { type: String, default: '#0f172a' },
      exito: { type: String, default: '#059669' },
      alerta: { type: String, default: '#d97706' },
      error: { type: String, default: '#dc2626' }
    }
  },
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
