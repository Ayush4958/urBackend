const mongoose = require('mongoose');

const patSchema = new mongoose.Schema({
    developer: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Developer', 
        required: true, 
        index: true 
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    suffix: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['human', 'agent'], default: 'human' },
    scopes: [{ type: String }],
    expiresAt: { type: Date, required: true, index: true }, // Indexed for TTL and queries
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

// Native MongoDB TTL index - auto-deletes expired PATs at exactly expiresAt time
patSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PAT', patSchema);
