const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  proyecto_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  usuario_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  version: { type: Number, required: true }, estado: { type: String, enum: ['borrador', 'aprobado'], default: 'borrador' },
  contenido: mongoose.Schema.Types.Mixed, contenido_hash: String, entrada_hash: String, contrato: String,
  insumo_directo: String, insumo_adicional: String, procedencia: String,
  aprobado_en: Date, aprobado_por: String, historial: [mongoose.Schema.Types.Mixed]
}, { timestamps: true, toJSON: { transform: (_, row) => { row.id = String(row._id); delete row._id; delete row.__v; return row; } } });
schema.index({ proyecto_id: 1, version: 1 }, { unique: true });
module.exports = mongoose.models.AnalisisInicial || mongoose.model('AnalisisInicial', schema);
