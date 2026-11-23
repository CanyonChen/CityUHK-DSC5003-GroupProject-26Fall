'use strict';

const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const { toIso, toInt } = require('../lib/format');
const { writeAudit } = require('../lib/audit');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
}

function bad(field, detail = '') {
  return new ApiError(400, 'VALIDATION_ERROR', `${field}${detail ? ': ' + detail : ' is invalid'}`);
}

async function listUsers({ keyword, role, page, pageSize, offset }) {
  const conds = [];
  const params = [];
  if (keyword) {
    conds.push('(u.user_name LIKE ? OR IFNULL(u.display_name, \'\') LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  if (role) {
    if (!['ADMIN', 'CHECKER'].includes(role)) throw bad('role', 'must be ADMIN or CHECKER');
    conds.push(`EXISTS (
      SELECT 1 FROM role_assignments r
       WHERE r.user_id = u.user_id AND r.role = ? AND r.revoked_at IS NULL
    )`);
    params.push(role);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const counts = await q(query, `SELECT COUNT(*) AS total FROM users u ${where}`, params);
  const users = await q(
    query,
    `SELECT u.user_id, u.user_name, u.display_name, u.created_at
       FROM users u ${where}
      ORDER BY u.user_id
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const ids = users.map((u) => toInt(u.user_id));
  let assignments = [];
  if (ids.length) {
    assignments = await q(
      query,
      `SELECT ra.assignment_id, ra.user_id, ra.role, ra.performance_id, ra.assigned_at,
              p.starts_at, e.name AS event_name
         FROM role_assignments ra
         LEFT JOIN performances p ON p.performance_id = ra.performance_id
         LEFT JOIN events e ON e.event_id = p.event_id
        WHERE ra.user_id IN (${ids.map(() => '?').join(',')})
          AND ra.revoked_at IS NULL
        ORDER BY ra.assignment_id`,
      ids
    );
  }
  return {
    items: users.map((u) => {
      const mine = assignments.filter((a) => toInt(a.user_id) === toInt(u.user_id));
      const roles = ['USER', ...new Set(mine.map((a) => a.role))];
      return {
        user_id: toInt(u.user_id),
        user_name: u.user_name,
        display_name: u.display_name,
        created_at: toIso(u.created_at),
        roles,
        assignments: mine.map((a) => ({
          assignment_id: toInt(a.assignment_id),
          role: a.role,
          performance_id: a.performance_id === null ? null : toInt(a.performance_id),
          event_name: a.event_name || null,
          starts_at: toIso(a.starts_at),
          assigned_at: toIso(a.assigned_at),
        })),
      };
    }),
    page,
    page_size: pageSize,
    total: toInt(counts[0] && counts[0].total),
  };
}

async function grantRole({ userId, role, performanceId, requestId, actorId }) {
  if (!['ADMIN', 'CHECKER'].includes(role)) throw bad('role', 'must be ADMIN or CHECKER');
  if (role === 'CHECKER') {
    if (!Number.isInteger(performanceId) || performanceId <= 0) throw bad('performance_id', 'CHECKER requires performance_id');
  } else if (performanceId !== undefined && performanceId !== null) {
    throw bad('performance_id', 'ADMIN must omit performance_id');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const users = await q(conn, 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);
    if (!users.length) throw new ApiError(404, 'NOT_FOUND', 'User not found');

    if (role === 'CHECKER') {
      const performances = await q(
        conn,
        'SELECT performance_id FROM performances WHERE performance_id = ?',
        [performanceId]
      );
      if (!performances.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    }

    const key = role === 'CHECKER' ? performanceId : null;
    const existing = await q(
      conn,
      `SELECT assignment_id, revoked_at
         FROM role_assignments
        WHERE user_id = ? AND role = ? AND performance_key = ?
        FOR UPDATE`,
      [userId, role, key === null ? 0 : key]
    );

    let assignmentId;
    let reactivated = false;
    if (existing.length && existing[0].revoked_at === null) {
      throw new ApiError(409, 'ROLE_ALREADY_ASSIGNED', 'This role is already assigned');
    }
    if (existing.length) {
      await q(
        conn,
        'UPDATE role_assignments SET revoked_at = NULL, assigned_at = UTC_TIMESTAMP(3) WHERE assignment_id = ?',
        [toInt(existing[0].assignment_id)]
      );
      assignmentId = toInt(existing[0].assignment_id);
      reactivated = true;
    } else {
      const inserted = await q(
        conn,
        `INSERT INTO role_assignments (user_id, role, performance_id, assigned_at)
         VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
        [userId, role, key]
      );
      assignmentId = toInt(inserted.insertId);
    }

    const rows = await q(
      conn,
      'SELECT assigned_at FROM role_assignments WHERE assignment_id = ?',
      [assignmentId]
    );
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'ROLE',
      objectId: assignmentId,
      action: 'ROLE_GRANTED',
      summary: `user ${userId} granted ${role}${key ? ` for performance ${key}` : ''}${reactivated ? ' (reactivated)' : ''}`,
      requestId,
    });
    await conn.commit();
    return {
      assignment_id: assignmentId,
      user_id: userId,
      role,
      performance_id: key,
      assigned_at: toIso(rows[0] && rows[0].assigned_at),
      reactivated,
    };
  } catch (err) {
    await conn.rollback();
    if (err && err.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'ROLE_ALREADY_ASSIGNED', 'This role is already assigned');
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function revokeRole({ userId, assignmentId, requestId, actorId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      `SELECT assignment_id, user_id, role, performance_id, revoked_at
         FROM role_assignments WHERE assignment_id = ? FOR UPDATE`,
      [assignmentId]
    );
    if (!rows.length || toInt(rows[0].user_id) !== userId || rows[0].revoked_at !== null) {
      throw new ApiError(404, 'NOT_FOUND', 'Role assignment not found');
    }
    if (rows[0].role === 'ADMIN') {
      const admins = await q(
        conn,
        `SELECT COUNT(*) AS n FROM role_assignments
          WHERE role = 'ADMIN' AND revoked_at IS NULL`
      );
      if (toInt(admins[0].n) <= 1) {
        throw new ApiError(409, 'LAST_ADMIN', 'Cannot revoke the last active administrator');
      }
    }
    await q(
      conn,
      'UPDATE role_assignments SET revoked_at = UTC_TIMESTAMP(3) WHERE assignment_id = ?',
      [assignmentId]
    );
    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'ROLE',
      objectId: assignmentId,
      action: 'ROLE_REVOKED',
      summary: `user ${userId} revoked ${rows[0].role}${rows[0].performance_id ? ` for performance ${rows[0].performance_id}` : ''}`,
      requestId,
    });
    await conn.commit();
    return null;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { listUsers, grantRole, revokeRole };
