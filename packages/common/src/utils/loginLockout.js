const redis = require('../config/redis');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getFailureKey = (projectId, email) => {
  const normalizedEmail = normalizeEmail(email);
  return `project:auth:login:failures:${projectId}:${normalizedEmail}`;
};

const getLockKey = (projectId, email) => {
  const normalizedEmail = normalizeEmail(email);
  return `project:auth:login:lock:${projectId}:${normalizedEmail}`;
};

// Atomic failed-attempt update and lockout transition.
// Returns [attempts, locked(0|1), ttlSeconds].
const ATOMIC_RECORD_FAILED_ATTEMPT_LUA = `
local failureKey = KEYS[1]
local lockKey = KEYS[2]

local maxAttempts = tonumber(ARGV[1])
local lockoutSeconds = tonumber(ARGV[2])

local lockExists = redis.call('GET', lockKey)
if lockExists then
  local lockTtl = redis.call('TTL', lockKey)
  if lockTtl < 0 then
    lockTtl = lockoutSeconds
  end
  return { maxAttempts, 1, lockTtl }
end

local attempts = redis.call('INCR', failureKey)
if attempts == 1 then
  redis.call('EXPIRE', failureKey, lockoutSeconds)
end

if attempts >= maxAttempts then
  redis.call('SET', lockKey, '1', 'EX', lockoutSeconds)
  redis.call('DEL', failureKey)
  return { attempts, 1, lockoutSeconds }
end

return { attempts, 0, 0 }
`;

const checkLockout = async (projectId, email) => {
  const lockKey = getLockKey(projectId, email);
  const isLocked = await redis.get(lockKey);

  if (!isLocked) {
    return {
      locked: false,
      retryAfterSeconds: 0,
    };
  }

  const ttl = await redis.ttl(lockKey);
  return {
    locked: true,
    retryAfterSeconds: ttl > 0 ? ttl : LOCKOUT_SECONDS,
  };
};

const recordFailedAttempt = async (projectId, email) => {
  const failureKey = getFailureKey(projectId, email);
  const lockKey = getLockKey(projectId, email);

  const rawResult = await redis.eval(
    ATOMIC_RECORD_FAILED_ATTEMPT_LUA,
    2,
    failureKey,
    lockKey,
    String(MAX_FAILED_ATTEMPTS),
    String(LOCKOUT_SECONDS),
  );

  const [attemptsRaw, lockedRaw, ttlRaw] = Array.isArray(rawResult) ? rawResult : [0, 0, 0];
  const attempts = Number(attemptsRaw) || 0;
  const locked = Number(lockedRaw) === 1;
  const ttl = Number(ttlRaw) || 0;

  return {
    locked,
    retryAfterSeconds: locked ? ttl : 0,
    attempts,
  };
};

const clearLockout = async (projectId, email) => {
  const failureKey = getFailureKey(projectId, email);
  const lockKey = getLockKey(projectId, email);
  await redis.del(failureKey, lockKey);
};

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_SECONDS,
  checkLockout,
  recordFailedAttempt,
  clearLockout,
};
