const mongoose = require('mongoose');
module.exports = mongoose.models.AiProviderState || mongoose.model('AiProviderState', new mongoose.Schema({
  _id: String, provider: String, model: String, cause: String, scope: String,
  until: { type: Date, default: null }, credential: { type: String, default: null }
}, { timestamps: true }));
