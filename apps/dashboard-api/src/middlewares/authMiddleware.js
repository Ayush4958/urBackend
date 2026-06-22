const jwt = require('jsonwebtoken');
const { AppError } = require('@urbackend/common');
const authenticateCLI = require('./authenticateCLI');

module.exports = function (req, res, next) {
    const authHeader = req.header('Authorization');

    // Intercept PAT for AI Agents / CLI
    if (authHeader && authHeader.trim().startsWith('Bearer ubpat_')) {
        return authenticateCLI(req, res, next);
    }

    // Check for token in cookies (Primary for Web)
    let token = req.cookies && req.cookies.accessToken;

    // Fallback to Authorization header (For legacy API JWTs)
    if (!token && authHeader) {
        const parts = authHeader.trim().split(/\s+/);
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
            token = parts[1];
        }
    }

    // Check if any token was provided
    if (!token) {
        return next(new AppError(401, 'Access Denied: No Token Provided'));
    }

    try {
        // Verify the token using the secret key
        const verified = jwt.verify(token, process.env.JWT_SECRET);


        // Attach decoded token data to request object
        req.user = verified;

        // Proceed to the next middleware or route handler
        next();
    } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
            console.error(err);
        }

        return next(new AppError(401, 'Invalid Token'));
    }
};
