const { Developer, hashToken, redis, AppError } = require('@urbackend/common');
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
        let developerId = null;
        try {
            developerId = await redis.get(cacheKey);
        } catch (redisErr) {
            console.warn("Redis GET failed, falling back to DB:", redisErr);
        }

        let developer;
        let matchedPat;

        if (developerId) {
            developer = await Developer.findById(developerId);
            if (!developer) {
                try {
                    await redis.del(cacheKey);
                } catch (redisErr) {
                    console.warn("Redis DEL failed:", redisErr);
                }
                return next(new AppError(401, 'Unauthorized: Developer not found.'));
            }
            matchedPat = developer.pats.find(p => p.tokenHash === tokenHash);
        } else {
            developer = await Developer.findOne({ 'pats.tokenHash': tokenHash });
            if (!developer) {
                return next(new AppError(401, 'Unauthorized: Invalid or revoked token.'));
            }
            matchedPat = developer.pats.find(p => p.tokenHash === tokenHash);
            
            // Cache valid token to prevent DB hammering
            try {
                await redis.setex(cacheKey, CACHE_TTL, developer._id.toString());
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
        
        Developer.updateOne(
            { _id: developer._id, 'pats._id': matchedPat._id },
            { 
                $set: { 
                    'pats.$.lastUsedAt': new Date(),
                    'pats.$.lastUsedIp': ip
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
