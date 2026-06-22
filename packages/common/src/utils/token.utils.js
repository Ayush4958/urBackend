const crypto = require('crypto');

// Standard Base62 character set
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * For future Developer Reference 
 * Encodes a Buffer to a Base62 string
 * @param {Buffer} buffer
 * @returns {string} Base62 string
 */

function encodeBase62(buffer) {
    let value = BigInt('0x' + buffer.toString('hex'));
    let result = '';
    const base = BigInt(62);
    
    while (value > 0n) {
        result = BASE62_CHARS[Number(value % base)] + result;
        value = value / base;
    }
    
    // Handle leading zeros
    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] !== 0) break;
        result = BASE62_CHARS[0] + result;
    }
    
    return result || BASE62_CHARS[0];
}

/**
 * Generates a Personal Access Token
 * @param {string} environment - 'live' or 'test'
 * @returns {Object} { rawToken, tokenHash, suffix }
 */

function generatePAT(environment = 'live') {
    // Generate 32 bytes of CSPRNG entropy (256 bits)
    const rawBytes = crypto.randomBytes(32);
    
    // Encode to base62 to avoid URL/shell character issues
    const tokenPart = encodeBase62(rawBytes);
    
    // Prefix the token for easy environment identification and secret scanning
    const rawToken = `ubpat_${environment}_${tokenPart}`;
    
    // SHA-256 hash for secure server-side storage
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    // Extract the last 4 characters for UI masking
    const suffix = tokenPart.slice(-4);
    
    return { rawToken, tokenHash, suffix };
}

/**
 * Hashes an existing token for verification
 * @param {string} rawToken 
 * @returns {string} SHA-256 hash
 */

function hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
    generatePAT,
    hashToken,
    encodeBase62
};
