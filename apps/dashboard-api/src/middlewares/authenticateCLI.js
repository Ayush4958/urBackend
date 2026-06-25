const { Developer, PAT, hashToken, redis, AppError } = require('@urbackend/common');
const CACHE_TTL_ENV = parseInt(process.env.CLI_PAT_CACHE_TTL, 10);
const CACHE_TTL = !isNaN(CACHE_TTL_ENV) ? CACHE_TTL_ENV : 300; // 5 minutes

const authenticateCLI = async (req, res, next) => {
    try {
        // Accept only via Authorization Header
        const authHeader = req.headers.authorization;
        
        if (req.query.token) {
             // Aggressive rejection of query tokens to prevent accidental leak in server logs
             return next(new AppError(400, 'Bad Request: Providing tokens in query parameters is strictly prohibited.'));
        }

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new AppError(401, 'Unauthorized: Missing or invalid Bearer token.'));
        }

        const rawToken = authHeader.split(' ')[1];
        if (!rawToken || !rawToken.startsWith('ubpat_')) {
            return next(new AppError(401, 'Unauthorized: Invalid token format.'));
        }

        // Only checks the SHA-256 hash, raw token is never passed to DB
        const tokenHash = hashToken(rawToken);
        const cacheKey = `cli:pat:cache:${tokenHash}`;

        // Distributed Caching
        let cachedContext = null;
        try {
            const rawCache = await redis.get(cacheKey);
            if (rawCache) cachedContext = JSON.parse(rawCache);
        } catch (redisErr) {
            console.warn("Redis GET failed, falling back to DB:", redisErr);
        }

        let developer;
        let matchedPat;

        if (cachedContext) {
            // Cache hit still constructs the context
            developer = { _id: cachedContext.developerId };
            matchedPat = {
                _id: cachedContext.patId,
                scopes: cachedContext.scopes,
                type: cachedContext.type,
                expiresAt: cachedContext.expiresAt,
                tokenHash: tokenHash
            };
        } else {
            // query the new PAT collection
            matchedPat = await PAT.findOne({ tokenHash });
            if (!matchedPat) {
                return next(new AppError(401, 'Unauthorized: Invalid or revoked token.'));
            }
            developer = { _id: matchedPat.developer.toString() };
            
            // Cache full context to prevent DB hammering
            const contextToCache = {
                developerId: developer._id,
                patId: matchedPat._id.toString(),
                scopes: matchedPat.scopes,
                type: matchedPat.type,
                expiresAt: matchedPat.expiresAt
            };
            try {
                // Fix 2: Set Redis TTL = min(CACHE_TTL, remainingPATlifetime)
                const remainingMs = new Date(matchedPat.expiresAt) - Date.now();
                const remainingSec = Math.floor(remainingMs / 1000);
                const redisTTL = Math.max(0, Math.min(CACHE_TTL, remainingSec));

                if (redisTTL > 0) {
                    await redis.setex(cacheKey, redisTTL, JSON.stringify(contextToCache));
                }
            } catch (redisErr) {
                console.warn("Redis SETEX failed:", redisErr);
            }
        }

        if (!matchedPat) {
            try {
                await redis.del(cacheKey);
            } catch (redisErr) {
                console.warn("Redis DEL failed:", redisErr);
            }
            return next(new AppError(401, 'Unauthorized: Invalid token state.'));
        }

        // Check expiry
        if (matchedPat.expiresAt && new Date() > new Date(matchedPat.expiresAt)) {
            try {
                await redis.del(cacheKey);
            } catch (redisErr) {
                console.warn("Redis DEL failed:", redisErr);
            }
            return next(new AppError(401, 'Unauthorized: Token has expired.'));
        }

        // Fire async update (non-blocking) to log IP and Last Used time
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        PAT.updateOne(
            { _id: matchedPat._id },
            { 
                $set: { 
                    lastUsedAt: new Date(),
                    lastUsedIp: ip
                }
            }
        ).catch(err => console.error("Failed to update PAT metadata:", err));

        // Attach developer and PAT scopes for downstream controllers
        req.user = { id: developer._id.toString() }; // Maintain compatibility with dashboard controllers
        req.developer = developer;
        req.cliScopes = matchedPat.scopes;
        req.cliTokenType = matchedPat.type;
        
        next();
    } catch (error) {
        console.error("authenticateCLI error:", error);
        return next(new AppError(500, 'Internal Server Error during CLI authentication.'));
    }
};

module.exports = authenticateCLI;
