const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    method: String, // GET, POST
    path: String,   // /api/data/products
    status: Number, // 200, 400, 500
    ip: String,
    timestamp: { type: Date, default: Date.now }
}, {
    // IMPORTANT: Capped Collection
    // Max size: 50MB (52428800 bytes)
    capped: { size: 52428800, max: 50000 }
});

logSchema.index({ projectId: 1, timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);