const mongoose = require('mongoose');
const { ARTIFACT_TYPE_VALUES, ARTIFACT_STATES } = require('../../../core/constants/ArtifactTypes');

const ArchivoSchema = new mongoose.Schema({
  ruta: { type: String, required: true },
  contenido: { type: String, default: '' },
  lenguaje: { type: String, default: 'text' },
  huella: { type: String, default: '' }
}, { _id: false });

const DependenciaSchema = new mongoose.Schema({
  tipo: { type: String, required: true },
  version: { type: Number, required: true }
}, { _id: false });

const ArtefactoGeneradoSchema = new mongoose.Schema({
  proyecto_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Proyecto', required: true, index: true },
  tipo: { type: String, enum: ARTIFACT_TYPE_VALUES, required: true, index: true },
  version: { type: Number, min: 1, required: true },
  estado: { type: String, enum: ARTIFACT_STATES, default: 'borrador', index: true },
  archivos: { type: [ArchivoSchema], default: [] },
  dependencias: { type: [DependenciaSchema], default: [] },
  trazabilidad_rf: { type: [String], default: [] },
  advertencias: { type: [String], default: [] },
  errores: { type: [String], default: [] },
  verificacion: { type: mongoose.Schema.Types.Mixed, default: null },
  aprobado: { type: Boolean, default: false },
  generado_por: { type: String, default: 'sistema' },
  huella_entrada: { type: String, required: true },
  versiones_origen: { type: mongoose.Schema.Types.Mixed, default: {} }
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

ArtefactoGeneradoSchema.index({ proyecto_id: 1, tipo: 1, version: -1 }, { unique: true });
ArtefactoGeneradoSchema.index({ proyecto_id: 1, tipo: 1, huella_entrada: 1 });

module.exports = mongoose.model('ArtefactoGenerado', ArtefactoGeneradoSchema);
