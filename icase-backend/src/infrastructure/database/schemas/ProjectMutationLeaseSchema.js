const mongoose = require('mongoose');
module.exports = mongoose.models.ProjectMutationLease || mongoose.model('ProjectMutationLease', new mongoose.Schema({ _id: String, owner: String, until: Date }));
