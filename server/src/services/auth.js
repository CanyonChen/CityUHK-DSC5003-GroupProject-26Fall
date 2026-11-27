'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cfg = require('../config');
const db = require('../db');
const { ApiError } = require('../lib/http');
const { toInt } = require('../lib/format');
const { writeAudit } = require('../lib/audit');

// Compare against a dummy hash when the account is missing to avoid timing-based account discovery
const DUMMY_HASH = '$2b$10$7hv8P2WWfliRu/dK2/07sexqm2i5oXM/1xtT7JYpx8YP9HOaPLmPW';

const BASE_ROLES = ['USER'];

/**
 * Every account has at least USER (new registrations only get ticketing access);
 * Additional roles come from active grants in role_assignments.
 */
async function rolesOf(userId) {
  const rows = await db.query(
    'SELECT role FROM role_assignments WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
  const extra = [...new Set(rows.map((r) => r.role))].filter(
    (r) => ['ADMIN', 'CHECKER'].includes(r) && !BASE_ROLES.includes(r)
  );
  return [...BASE_ROLES, ...extra];
}

async function findById(userId) {
  const rows = await db.query(
    'SELECT user_id, user_name, display_name, created_at FROM users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}

async function register({ userName, password, displayName, requestId }) {
  const hash = await bcrypt.hash(password, 10);
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    const insert = await conn.query(
      `INSERT INTO users (user_name, password_hash, display_name, token_version)
       VALUES (?, ?, ?, 0)`,
      [userName, hash, displayName || null]
    );
    const userId = toInt(insert[0].insertId);
    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'USER',
      objectId: userId,
      action: 'USER_REGISTERED',
      summary: `registered ${userName}`,
      requestId,
    });
    await conn.commit();
    return {
      user_id: userId,
      user_name: userName,
      display_name: displayName || null,
      roles: ['USER'],
    };
  } catch (err) {
    await conn.rollback();
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'USERNAME_TAKEN', 'This account is already registered');
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function login(userName, password) {
  const rows = await db.query(
    'SELECT user_id, user_name, display_name, password_hash, token_version FROM users WHERE user_name = ? LIMIT 1',
    [userName]
  );
  const user = rows[0];
  const passwordOk = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordOk) {
    // Use the same code and message for a missing account and a wrong password (API-02)
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect account or password');
  }

  const roles = await rolesOf(user.user_id);
  const tokenVersion = toInt(user.token_version);
  const token = jwt.sign(
    {
      sub: String(user.user_id),
      user_name: user.user_name,
      roles,
      tv: tokenVersion,
    },
    cfg.jwt.secret,
    { expiresIn: cfg.jwt.expiresInSeconds }
  );

  return {
    token,
    token_type: 'Bearer',
    expires_in: cfg.jwt.expiresInSeconds,
    user: {
      user_id: user.user_id,
      user_name: user.user_name,
      display_name: user.display_name,
      roles,
    },
  };
}

async function logout({ userId, requestId }) {
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await conn.query(
      'SELECT token_version FROM users WHERE user_id = ? FOR UPDATE',
      [userId]
    );
    if (!rows[0].length) throw new ApiError(401, 'UNAUTHORIZED', 'Account not found');
    const nextVersion = toInt(rows[0][0].token_version) + 1;
    await conn.query('UPDATE users SET token_version = ? WHERE user_id = ?', [nextVersion, userId]);
    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'USER',
      objectId: userId,
      action: 'AUTH_LOGOUT',
      summary: `token_version ${nextVersion}; all issued tokens revoked`,
      requestId,
    });
    await conn.commit();
    return { token_version: nextVersion };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function me(userId) {
  const user = await findById(userId);
  if (!user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in or session expired');
  }
  return {
    user_id: user.user_id,
    user_name: user.user_name,
    display_name: user.display_name,
    roles: await rolesOf(user.user_id),
    created_at: user.created_at instanceof Date ? user.created_at.toISOString() : user.created_at,
  };
}

module.exports = { register, login, logout, me, rolesOf };
