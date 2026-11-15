const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  usuario_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  proyecto_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  paquete_hash: String,
  estado: { type: String, enum: ['escribiendo', 'limpiando', 'completado', 'fallido'], required: true },
  owner: String, until: Date,
  hashes: mongoose.Schema.Types.Mixed,
  archivos: [{ _id: false, nombre: String, sha256: String }],
  resultado: mongoose.Schema.Types.Mixed
}, { timestamps: true });
module.exports = mongoose.models.ImportacionProyecto || mongoose.model('ImportacionProyecto', schema);
