const { getConnection } = require('@urbackend/common');
const { getCompiledModel } = require('@urbackend/common');
const mongoose = require('mongoose');

module.exports = async (req, res, next) => {
    try {
        if (req.keyRole === 'secret') {
            return next();
        }

        const { collectionName, id } = req.params;
        const project = req.project;
        const collectionConfig = project.collections.find(c => c.name === collectionName);

        if (!collectionConfig) {
            return res.status(404).json({ error: 'Collection not found' });
        }

        const rls = collectionConfig.rls || {};
        if (!rls.enabled) {
            return res.status(403).json({
                error: 'Write blocked for publishable key',
                message: 'Enable RLS for this collection to allow publishable-key writes.'
            });
        }

        if (rls.requireAuthForWrite && !req.authUser?.userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Provide a valid user Bearer token for write operations.'
            });
        }

        const modeRaw = rls.mode || 'public-read';
        const allowedModes = new Set(['public-read', 'private', 'owner-write-only']);
        if (!allowedModes.has(modeRaw)) {
            return res.status(403).json({ error: 'Unsupported RLS mode' });
        }

        const ownerField = rls.ownerField || 'userId';

        if (!req.authUser?.userId) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Provide a valid user Bearer token for write operations.'
            });
        }

        const authUserId = String(req.authUser.userId);
        const method = String(req.method || '').toUpperCase();

        if (method === 'POST') {
            if (ownerField === '_id') {
                return res.status(403).json({
                    error: 'Insert denied',
                    message: "RLS ownerField '_id' is not valid for insert ownership checks."
                });
            }

            const bodyItems = Array.isArray(req.body) ? req.body : [req.body];

          if (bodyItems.length === 0) {
    return res.status(400).json({
        error: 'Invalid request body',
        message: 'Request body cannot be an empty array.'
    });
}

for (let i = 0; i < bodyItems.length; i++) {
    const item = bodyItems[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({
            error: 'Invalid request body',
           message: `Item at index ${i} must be a valid object`
        });
    }

    const incomingOwner = item?.[ownerField];

    if (incomingOwner === undefined || incomingOwner === null || incomingOwner === '') {
        item[ownerField] = authUserId;
        continue;
    }

    if (String(incomingOwner) !== authUserId) {
        return res.status(403).json({
            error: 'RLS owner mismatch',
            message: `Item at index ${i} must have ${ownerField} equal to your user id`
        });
    }
}

            return next();
        }

        if (method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
            if (!id || !mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ error: 'Invalid ID format.' });
            }

            req.rlsFilter = { [ownerField]: authUserId };

            if (method === 'PUT' || method === 'PATCH') {
                if (
                    req.body &&
                    Object.prototype.hasOwnProperty.call(req.body, ownerField) &&
                    String(req.body[ownerField]) !== authUserId
                ) {
                    return res.status(403).json({
                        error: 'Owner field immutable',
                        message: `${ownerField} cannot be changed under RLS.`
                    });
                }
            }

            return next();
        }

        return next();
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};