const Model = require('../../infrastructure/database/schemas/AnalisisInicialSchema');
module.exports = class MongoAnalisisInicialRepository {
  async get(id) { if (!id) return null; const row = await Model.findById(id); return row?.toJSON() || null; }
  async list(projectId) { return (await Model.find({ proyecto_id: projectId }).sort({ version: -1 })).map(row => row.toJSON()); }
  async create(data) { try { return (await Model.create(data)).toJSON(); } catch (error) { if (error.code === 11000) throw Object.assign(new Error('El análisis cambió; recarga antes de guardar.'), { status: 409 }); throw error; } }
  async approve(id, userId) { const row = await Model.findOneAndUpdate({ _id: id, estado: 'borrador' }, { $set: { estado: 'aprobado', aprobado_en: new Date(), aprobado_por: userId } }, { new: true }); return row?.toJSON() || null; }
};
