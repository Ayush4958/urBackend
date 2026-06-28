const authMiddleware = require('./authMiddleware');
const authenticateCLI = require('./authenticateCLI');

/**
 * Flexible auth middleware — accepts either:
 * - Session cookie (browser dashboard)
 * - Bearer PAT token (CLI)
 */
const authFlexible = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ubpat_')) {
        return authenticateCLI(req, res, next);
    }

    return authMiddleware(req, res, next);
};

module.exports = authFlexible;