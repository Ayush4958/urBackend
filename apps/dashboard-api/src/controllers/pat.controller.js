const { Developer, PAT, generatePAT, redis, AppError, ApiResponse } = require('@urbackend/common');

exports.createPAT = async (req, res, next) => {
    try {
        const { label, type = 'human', scopes, ttlDays } = req.body;

        if (!label) return next(new AppError(400, "Token label is required."));
        
        // Force explicit selection, no automatic global access
        if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
            return next(new AppError(400, "At least one scope must be explicitly selected."));
        }

        // Lifetime & rotation - Default 30 days, force bounds to prevent permanent keys
        let days = 30;
        if (ttlDays !== undefined && ttlDays !== null && ttlDays !== '') {
            days = Number(ttlDays);
        }
        if (isNaN(days) || days <= 0 || days > 365) return next(new AppError(400, "Token TTL must be between 1 and 365 days."));
        
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);

        // Generate PAT with base62 encoding
        const environment = process.env.NODE_ENV === 'production' ? 'live' : 'test';
        const { rawToken, tokenHash, suffix } = generatePAT(environment);

        const newPat = await PAT.create({
            developer: req.user._id,
            tokenHash,
            suffix,
            label,
            type,
            scopes,
            expiresAt
        });

        // Return raw token exactly once
        return new ApiResponse(
            { rawToken, pat: { suffix, label, type, scopes, expiresAt } },
            "Token created successfully. Store this token now. You will not be able to see it again."
        ).send(res, 201);
    } catch (err) {
        console.error(err);
        return next(new AppError(500, "An error occurred while creating the token"));
    }
};

exports.listPATs = async (req, res, next) => {
    try {
        const pats = await PAT.find({ developer: req.user._id }).sort({ createdAt: -1 });

        // only show masked suffix and metadata
        const safePats = pats.map(pat => ({
            id: pat._id,
            suffix: pat.suffix,
            label: pat.label,
            type: pat.type,
            scopes: pat.scopes,
            createdAt: pat.createdAt,
            expiresAt: pat.expiresAt,
            lastUsedAt: pat.lastUsedAt,
            lastUsedIp: pat.lastUsedIp
        }));

        return new ApiResponse({ pats: safePats }).send(res, 200);
    } catch (err) {
        console.error(err);
        return next(new AppError(500, "An error occurred while fetching tokens"));
    }
};

exports.revokePAT = async (req, res, next) => {
    try {
        const { id } = req.params;

        const patToRevoke = await PAT.findOneAndDelete({ _id: id, developer: req.user._id });

        if (!patToRevoke) {
            return next(new AppError(404, "Token not found"));
        }

        // forcefully clear the Redis cache so ongoing sessions are immediately killed
        try {
            await redis.del(`cli:pat:cache:${patToRevoke.tokenHash}`);
        } catch (redisErr) {
            console.error("Failed to clear PAT from Redis cache:", redisErr);
        }

        return new ApiResponse({}, "Token revoked successfully").send(res, 200);
    } catch (err) {
        console.error(err);
        return next(new AppError(500, "An error occurred while revoking the token"));
    }
};
