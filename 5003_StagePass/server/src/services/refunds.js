'use strict';

const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt } = require('../lib/format');
const { writeAudit } = require('../lib/audit');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
}

async function refundRow(refundId, exec = query) {
  const rows = await q(
    exec,
    `SELECT refund_id, order_id, payment_attempt_id, reason, amount, status, created_at, updated_at
       FROM refunds WHERE refund_id = ?`,
    [refundId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    refund_id: toInt(r.refund_id),
    order_id: toInt(r.order_id),
    payment_id: toInt(r.payment_attempt_id),
    amount_cents: toInt(r.amount),
    reason: r.reason,
    status: r.status,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

/**
 * API-15 Request a full-order refund.
 * Rules: order must be PAID; refunds allowed until 24 hours before the performance; all tickets must be VALID (checked-in, refunding, or void tickets are not refundable).
 * Amount comes only from the original successful payment, never from the client.
 */
async function requestRefundOnce({ orderId, userId, key, reason, requestId }) {
  const storedKey = `refund:${orderId}:${key}`;

  const replay = await q(
    query,
    "SELECT refund_id FROM refunds WHERE order_id = ? AND idempotency_key = ? AND status IN ('PENDING','SUCCEEDED')",
    [orderId, storedKey]
  );
  if (replay.length) {
    return { replayed: true, refund: await refundRow(replay[0].refund_id), orderStatus: 'REFUND_PENDING' };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const orders = await q(
      conn,
      `SELECT o.order_id, o.user_id, o.status, o.total_amount, o.currency,
              p.starts_at
         FROM orders o
         JOIN performances p ON p.performance_id = o.performance_id
        WHERE o.order_id = ? FOR UPDATE`,
      [orderId]
    );
    if (!orders.length) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    const order = orders[0];
    if (toInt(order.user_id) !== userId) throw new ApiError(403, 'FORBIDDEN', 'You cannot request a refund for this order');
    if (order.status === 'REFUND_PENDING' || order.status === 'REFUNDED') {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'This order is already in refund processing or refunded');
    }
    if (order.status !== 'PAID') {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'Only paid orders can be refunded');
    }

    const nowRows = await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now');
    const now = nowRows[0].now;
    const cutoff = new Date(order.starts_at.getTime() - cfg.limits.refundCutoffHours * 3600 * 1000);
    if (!(now < cutoff)) {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', `Refunds are closed within ${cfg.limits.refundCutoffHours} hours of the performance`);
    }

    const tickets = await q(
      conn,
      `SELECT t.ticket_id, t.status
         FROM tickets t
         JOIN order_items oi ON oi.order_item_id = t.order_item_id
        WHERE oi.order_id = ?
        FOR UPDATE`,
      [orderId]
    );
    if (!tickets.length) throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'The order has no refundable tickets');
    if (tickets.some((t) => t.status === 'USED')) {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'The order contains checked-in tickets and cannot be refunded in full');
    }
    if (tickets.some((t) => t.status !== 'VALID')) {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'The order contains non-VALID tickets and cannot be refunded');
    }

    const payments = await q(
      conn,
      `SELECT attempt_id, amount, currency
         FROM payment_attempts
        WHERE order_id = ? AND result = 'SUCCEEDED'
        ORDER BY attempt_id DESC LIMIT 1`,
      [orderId]
    );
    if (!payments.length) throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'No successful original payment was found');
    const paid = payments[0];
    if (toInt(paid.amount) !== toInt(order.total_amount)) {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'Original payment amount does not match the order amount');
    }

    const insert = await q(
      conn,
      `INSERT INTO refunds (order_id, payment_attempt_id, reason, amount, idempotency_key, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [orderId, toInt(paid.attempt_id), reason || null, toInt(paid.amount), storedKey]
    );
    await q(conn, "UPDATE orders SET status = 'REFUND_PENDING' WHERE order_id = ?", [orderId]);
    await q(
      conn,
      `UPDATE tickets t
          JOIN order_items oi ON oi.order_item_id = t.order_item_id
          SET t.status = 'REFUND_PENDING'
        WHERE oi.order_id = ?`,
      [orderId]
    );
    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'REFUND',
      objectId: toInt(insert.insertId),
      action: 'REFUND_REQUESTED',
      summary: `order ${orderId} PAID→REFUND_PENDING, ${toInt(paid.amount)} ${paid.currency}`,
      requestId,
    });
    await conn.commit();
    return {
      replayed: false,
      refund: await refundRow(toInt(insert.insertId), (sql, params) => q(conn, sql, params)),
      orderStatus: 'REFUND_PENDING',
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Refund and check-in transactions take locks in different orders (check-in locks performances first, refund locks orders first),
 * so InnoDB may report a deadlock. The whole transaction can be retried safely: if check-in committed first, the retry returns
 * REFUND_NOT_ALLOWED; if the refund committed first, the retry sees the order already in refund processing.
 */
async function requestRefund(args) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await requestRefundOnce(args);
    } catch (err) {
      lastError = err;
      if (err && err.code === 'ER_LOCK_DEADLOCK' && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * API-43 Admin confirms the refund result.
 * SUCCEEDED: order REFUNDED, tickets VOID, seats back to AVAILABLE;
 * FAILED: order back to PAID, tickets back to VALID, seats remain SOLD.
 * Repeating the same result returns the existing record; a different result returns 409 so a successful refund cannot be changed to failed.
 */
async function resolveRefund({ refundId, result, requestId, actorId }) {
  if (!['SUCCEEDED', 'FAILED'].includes(result)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'result must be SUCCEEDED or FAILED');
  }

  const pre = await q(
    query,
    `SELECT r.refund_id, r.order_id, r.status, r.amount, o.status AS order_status
       FROM refunds r JOIN orders o ON o.order_id = r.order_id
      WHERE r.refund_id = ?`,
    [refundId]
  );
  if (!pre.length) throw new ApiError(404, 'NOT_FOUND', 'Refund record not found');
  if (pre[0].status === result) {
    return { replayed: true, refund: await refundRow(refundId), orderStatus: pre[0].order_status };
  }
  if (pre[0].status !== 'PENDING') {
    throw new ApiError(409, 'REFUND_ALREADY_RESOLVED', 'The refund is already confirmed and cannot be changed');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      `SELECT r.refund_id, r.order_id, r.status, r.amount, o.status AS order_status,
              o.user_id, o.currency
         FROM refunds r JOIN orders o ON o.order_id = r.order_id
        WHERE r.refund_id = ? FOR UPDATE`,
      [refundId]
    );
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Refund record not found');
    const refund = rows[0];
    if (refund.status !== 'PENDING') {
      if (refund.status === result) {
        await conn.commit();
        return { replayed: true, refund: await refundRow(refundId, (sql, params) => q(conn, sql, params)), orderStatus: refund.order_status };
      }
      throw new ApiError(409, 'REFUND_ALREADY_RESOLVED', 'The refund is already confirmed and cannot be changed');
    }
    if (!['REFUND_PENDING', 'EXPIRED'].includes(refund.order_status)) {
      throw new ApiError(409, 'REFUND_NOT_ALLOWED', 'The order is not in refund processing');
    }
    const latePayment = refund.order_status === 'EXPIRED';

    let released = 0;
    if (result === 'SUCCEEDED') {
      await q(conn, "UPDATE refunds SET status = 'SUCCEEDED' WHERE refund_id = ?", [refundId]);
      if (!latePayment) {
        await q(conn, "UPDATE orders SET status = 'REFUNDED' WHERE order_id = ?", [toInt(refund.order_id)]);
      }
      await q(
        conn,
        `UPDATE tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id
            SET t.status = 'VOID'
          WHERE oi.order_id = ? AND t.status IN ('REFUND_PENDING','VALID')`,
        [toInt(refund.order_id)]
      );
      const release = await q(
        conn,
        `UPDATE session_seats ss
            JOIN order_items oi ON oi.session_seat_id = ss.session_seat_id
            SET ss.session_seat_status = 'AVAILABLE', ss.holder_order_id = NULL, ss.hold_expires_at = NULL
          WHERE oi.order_id = ? AND ss.session_seat_status = 'SOLD'`,
        [toInt(refund.order_id)]
      );
      released = toInt(release.affectedRows);
    } else {
      await q(conn, "UPDATE refunds SET status = 'FAILED' WHERE refund_id = ?", [refundId]);
      if (!latePayment) {
        await q(conn, "UPDATE orders SET status = 'PAID' WHERE order_id = ?", [toInt(refund.order_id)]);
      }
      await q(
        conn,
        `UPDATE tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id
            SET t.status = 'VALID'
          WHERE oi.order_id = ? AND t.status = 'REFUND_PENDING'`,
        [toInt(refund.order_id)]
      );
    }

    await writeAudit(conn, {
      actorType: 'ADMIN',
      actorId,
      objectType: 'REFUND',
      objectId: refundId,
      action: result === 'SUCCEEDED' ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
      summary: result === 'SUCCEEDED'
        ? `order ${refund.order_id} ${latePayment ? 'late payment kept EXPIRED' : 'REFUND_PENDING→REFUNDED'}, tickets VOID, ${released} seats released`
        : `order ${refund.order_id} ${latePayment ? 'late payment kept EXPIRED' : 'REFUND_PENDING→PAID'}, tickets restored VALID`,
      requestId,
    });
    await conn.commit();
    return {
      replayed: false,
      refund: await refundRow(refundId, (sql, params) => q(conn, sql, params)),
      orderStatus: latePayment ? 'EXPIRED' : (result === 'SUCCEEDED' ? 'REFUNDED' : 'PAID'),
      released_seats: released,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { requestRefund, resolveRefund };
