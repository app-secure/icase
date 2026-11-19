const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String, required: true }, // SHA-256 del JWT; nunca almacenar el token.
  usuario_id: { type: String, required: true },
  expira_en: { type: Date, required: true, index: { expires: 0 } }
}, { versionKey: false });

module.exports = mongoose.model('SesionRevocada', schema);
