'use strict';

const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');
const { ApiError } = require('../lib/http');

/**
 * Validate the Bearer token and read the current roles from the database.
 * Do not trust roles embedded in the token: after a role is revoked, an old token must not access admin routes.
 * token_version revokes sessions on sign-out: JWT tv must equal users.token_version.
 */
async function loadAuth(payload) {
  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('bad sub');

  const users = await db.query(
    'SELECT user_id, token_version FROM users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!users.length) throw new Error('user not found');
  if (Number(payload.tv) !== Number(users[0].token_version)) throw new Error('token revoked');

  const roleRows = await db.query(
    'SELECT DISTINCT role FROM role_assignments WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
  const extra = roleRows
    .map((r) => r.role)
    .filter((r) => ['ADMIN', 'CHECKER'].includes(r));
  return {
    userId,
    roles: ['USER', ...new Set(extra)],
    tokenVersion: Number(users[0].token_version),
  };
}

function authenticate(req, res, next) {
  const header = (req.get('Authorization') || '').trim();
  const matched = /^Bearer\s+(.+)$/i.exec(header);
  if (!matched) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Not signed in or session expired'));
  }
  let payload;
  try {
    payload = jwt.verify(matched[1], cfg.jwt.secret);
  } catch {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Not signed in or session expired'));
  }
  return loadAuth(payload)
    .then((auth) => {
      req.auth = auth;
      next();
    })
    .catch((err) => {
      if (err instanceof ApiError) return next(err);
      if (['bad sub', 'user not found', 'token revoked'].includes(err.message)) {
        return next(new ApiError(401, 'UNAUTHORIZED', 'Not signed in or session expired'));
      }
      return next(err);
    });
}

/**
 * Optional auth for the public seat map.
 * Populate req.auth for a valid token; missing, stale, or revoked tokens are treated as anonymous without a 401.
 */
async function optionalAuth(req, res, next) {
  const header = (req.get('Authorization') || '').trim();
  const matched = /^Bearer\s+(.+)$/i.exec(header);
  if (!matched) return next();
  try {
    const payload = jwt.verify(matched[1], cfg.jwt.secret);
    req.auth = await loadAuth(payload);
  } catch {
    // Public route: bad, stale, or revoked tokens are treated as anonymous
  }
  return next();
}

/** Allow when any role matches; otherwise 403 without revealing whether the resource exists */
function requireRole(...roles) {
  return (req, res, next) => {
    const have = (req.auth && req.auth.roles) || [];
    if (roles.some((r) => have.includes(r))) return next();
    return next(new ApiError(403, 'FORBIDDEN', 'Your role cannot access this resource'));
  };
}

module.exports = { authenticate, optionalAuth, requireRole };
