const Model = require('../../infrastructure/database/schemas/AiProviderStateSchema');
class MongoAiProviderStateRepository {
  async get(id) { return Model.findById(id).lean(); }
  async put(id, data) { return Model.findByIdAndUpdate(id, { $set: data }, { upsert: true, new: true }).lean(); }
  async remove(id) { await Model.deleteOne({ _id: id }); }
}
module.exports = MongoAiProviderStateRepository;
