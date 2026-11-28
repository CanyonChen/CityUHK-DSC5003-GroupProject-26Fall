'use strict';

const crypto = require('node:crypto');
const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, orderNo } = require('../lib/format');
const { writeAudit } = require('../lib/audit');
const { releaseSeats, expireDueOrders } = require('./orders');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
}

async function issueTickets(conn, orderId) {
  const items = await q(
    conn,
    'SELECT order_item_id FROM order_items WHERE order_id = ? ORDER BY order_item_id',
    [orderId]
  );
  const existing = await q(
    conn,
    `SELECT COUNT(*) AS n FROM tickets t
       JOIN order_items oi ON oi.order_item_id = t.order_item_id
      WHERE oi.order_id = ?`,
    [orderId]
  );
  if (toInt(existing[0].n) >= items.length) return toInt(existing[0].n);

  let issued = 0;
  for (const item of items) {
    const code = crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    try {
      await q(
        conn,
        `INSERT INTO tickets (order_item_id, ticket_code_hash, status, issued_at)
         VALUES (?, ?, 'VALID', UTC_TIMESTAMP(3))`,
        [toInt(item.order_item_id), hash]
      );
      issued += 1;
    } catch (err) {
      if (!err || err.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  return issued;
}

async function ensureLateRefund(conn, orderId, attemptId, amount) {
  const key = `late-${attemptId}`;
  const rows = await q(conn, 'SELECT refund_id, status FROM refunds WHERE idempotency_key = ?', [key]);
  if (rows.length) return toInt(rows[0].refund_id);
  const insert = await q(
    conn,
    `INSERT INTO refunds (order_id, payment_attempt_id, reason, amount, idempotency_key, status)
     VALUES (?, ?, 'LATE_PAYMENT', ?, ?, 'PENDING')`,
    [orderId, attemptId, amount, key]
  );
  return toInt(insert.insertId);
}

/**
 * Apply the SUCCESS result inside a transaction that already holds the order row lock.
 * Returns { kind: APPLIED|LATE_REFUND|DUPLICATE, tickets, orderStatus, refundId }
 */
async function applySuccessLocked(conn, attempt, order, { requestId, source }) {
  if (attempt.result === 'SUCCEEDED') {
    return { kind: 'DUPLICATE', tickets: 0, orderStatus: order.status };
  }
  const now = (await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now'))[0].now;

  if (order.status === 'PENDING_PAYMENT' && order.expires_at > now) {
    await q(
      conn,
      "UPDATE orders SET status = 'PAID', paid_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
      [order.order_id]
    );
    await q(
      conn,
      `UPDATE session_seats
          SET session_seat_status = 'SOLD', holder_order_id = NULL, hold_expires_at = NULL
        WHERE holder_order_id = ? AND session_seat_status = 'HELD'`,
      [order.order_id]
    );
    const tickets = await issueTickets(conn, order.order_id);
    await q(
      conn,
      "UPDATE payment_attempts SET result = 'SUCCEEDED', handling_category = 'NORMAL' WHERE attempt_id = ?",
      [attempt.attempt_id]
    );
    await writeAudit(conn, {
      actorType: source === 'notify' ? 'SYSTEM' : 'USER',
      objectType: 'ORDER',
      objectId: toInt(order.order_id),
      action: 'ORDER_PAID',
      summary: `PENDING_PAYMENT→PAID, issued ${tickets} tickets`,
      requestId,
    });
    return { kind: 'APPLIED', tickets, orderStatus: 'PAID' };
  }

  // Late payment: order expired/cancelled, or the deadline has passed
  let orderStatus = order.status;
  if (order.status === 'PENDING_PAYMENT') {
    await q(
      conn,
      "UPDATE orders SET status = 'EXPIRED', closed_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
      [order.order_id]
    );
    await releaseSeats(conn, order.order_id);
    orderStatus = 'EXPIRED';
  }
  await q(
    conn,
    "UPDATE payment_attempts SET result = 'SUCCEEDED', handling_category = 'AWAITING_REFUND' WHERE attempt_id = ?",
    [attempt.attempt_id]
  );
  const refundId = await ensureLateRefund(
    conn,
    toInt(order.order_id),
    toInt(attempt.attempt_id),
    toInt(attempt.amount)
  );
  await writeAudit(conn, {
    actorType: source === 'notify' ? 'SYSTEM' : 'USER',
    objectType: 'PAYMENT',
    objectId: toInt(attempt.attempt_id),
    action: 'LATE_PAYMENT_REFUND',
    summary: `order ${orderStatus}, refund ${refundId}`,
    requestId,
  });
  return { kind: 'LATE_REFUND', tickets: 0, orderStatus, refundId };
}

async function createPayment({ userId, orderId, requestId }) {
  await expireDueOrders();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(conn, 'SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [orderId]);
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    const order = rows[0];
    if (toInt(order.user_id) !== userId) throw new ApiError(403, 'FORBIDDEN', 'You cannot pay for this order');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'The order is not payable');
    }
    const now = (await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now'))[0].now;
    if (order.expires_at <= now) {
      throw new ApiError(409, 'ORDER_EXPIRED', 'The order has passed its payment deadline');
    }

    const pending = await q(
      conn,
      "SELECT attempt_id, payment_ref, amount, currency, created_at FROM payment_attempts WHERE order_id = ? AND result = 'PENDING' ORDER BY attempt_id DESC LIMIT 1 FOR UPDATE",
      [orderId]
    );
    if (pending.length) {
      await conn.commit();
      return {
        reused: true,
        payment: {
          payment_id: toInt(pending[0].attempt_id),
          status: 'PENDING',
          amount_cents: toInt(pending[0].amount),
          currency: pending[0].currency,
          order_expires_at: toIso(order.expires_at),
          created_at: toIso(pending[0].created_at),
        },
      };
    }

    const ref = `PAY-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const insert = await q(
      conn,
      `INSERT INTO payment_attempts (order_id, payment_ref, amount, currency, result)
       VALUES (?, ?, ?, ?, 'PENDING')`,
      [orderId, ref, toInt(order.total_amount), order.currency]
    );
    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'PAYMENT',
      objectId: toInt(insert.insertId),
      action: 'PAYMENT_CREATED',
      summary: `order ${orderId}, ${order.total_amount} ${order.currency}`,
      requestId,
    });
    await conn.commit();
    return {
      reused: false,
      payment: {
        payment_id: toInt(insert.insertId),
        status: 'PENDING',
        amount_cents: toInt(order.total_amount),
        currency: order.currency,
        order_expires_at: toIso(order.expires_at),
        created_at: null,
      },
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getPayment(paymentId, viewer) {
  const rows = await q(
    query,
    `SELECT pa.attempt_id, pa.order_id, pa.amount, pa.currency, pa.result, pa.handling_category,
            pa.created_at, pa.updated_at, o.user_id, o.status AS order_status,
            o.created_at AS order_created_at
       FROM payment_attempts pa
       JOIN orders o ON o.order_id = pa.order_id
      WHERE pa.attempt_id = ?`,
    [paymentId]
  );
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payment record not found');
  const p = rows[0];
  const isAdmin = (viewer.roles || []).includes('ADMIN');
  if (!isAdmin && toInt(p.user_id) !== viewer.userId) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot view this payment');
  }
  const refunds = await q(
    query,
    `SELECT refund_id, status, amount, reason, created_at
       FROM refunds WHERE payment_attempt_id = ? ORDER BY refund_id`,
    [paymentId]
  );
  return {
    payment_id: toInt(p.attempt_id),
    order_id: toInt(p.order_id),
    order_no: orderNo(toInt(p.order_id), p.order_created_at),
    status: p.result,
    provider_txn_id: p.result === 'PENDING' ? null : `SIM-${p.attempt_id}`,
    amount_cents: toInt(p.amount),
    currency: p.currency,
    handling_category: p.handling_category,
    created_at: toIso(p.created_at),
    updated_at: toIso(p.updated_at),
    refunds: refunds.map((r) => ({
      refund_id: toInt(r.refund_id),
      status: r.status,
      amount_cents: toInt(r.amount),
      reason: r.reason,
      created_at: toIso(r.created_at),
    })),
  };
}

async function simulate({ userId, paymentId, result, requestId }) {
  if (cfg.payment.mode !== 'test') {
    throw new ApiError(403, 'FORBIDDEN', 'Simulated payments are only available in test mode');
  }
  if (!['SUCCESS', 'FAIL', 'TIMEOUT'].includes(result)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'result must be SUCCESS, FAIL, or TIMEOUT');
  }

  const conn = await pool.getConnection();
  let late = null;
  try {
    await conn.beginTransaction();
    const attempts = await q(
      conn,
      `SELECT pa.*, o.user_id, o.status AS order_status, o.expires_at AS order_expires_at,
              o.total_amount, o.currency AS order_currency, o.created_at AS order_created_at
         FROM payment_attempts pa
         JOIN orders o ON o.order_id = pa.order_id
        WHERE pa.attempt_id = ? FOR UPDATE`,
      [paymentId]
    );
    if (!attempts.length) throw new ApiError(404, 'NOT_FOUND', 'Payment record not found');
    const attempt = attempts[0];
    if (toInt(attempt.user_id) !== userId) throw new ApiError(403, 'FORBIDDEN', 'You cannot operate on this payment');

    const orders = await q(conn, 'SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [
      attempt.order_id,
    ]);
    const order = orders[0];

    // A later simulated failure/timeout cannot contradict an already settled attempt.
    if (result !== 'SUCCESS' && attempt.result !== 'PENDING') {
      await conn.commit();
      return { payment_status: attempt.result, order_status: order.status, tickets_issued: 0 };
    }

    if (result === 'TIMEOUT') {
      await conn.commit();
      return { payment_status: 'PENDING', order_status: order.status, tickets_issued: 0 };
    }
    if (result === 'FAIL') {
      if (attempt.result === 'PENDING') {
        await q(conn, "UPDATE payment_attempts SET result = 'FAILED' WHERE attempt_id = ?", [
          paymentId,
        ]);
      }
      await writeAudit(conn, {
        actorType: 'USER',
        actorId: userId,
        objectType: 'PAYMENT',
        objectId: paymentId,
        action: 'PAYMENT_FAILED',
        summary: 'Simulated payment failed',
        requestId,
      });
      await conn.commit();
      return { payment_status: 'FAILED', order_status: order.status, tickets_issued: 0 };
    }

    const outcome = await applySuccessLocked(conn, attempt, order, {
      requestId,
      source: 'simulate',
    });
    await conn.commit();
    if (outcome.kind === 'LATE_REFUND') {
      late = outcome;
    } else {
      return {
        payment_status: 'SUCCEEDED',
        order_status: outcome.orderStatus,
        tickets_issued: outcome.tickets,
      };
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  throw new ApiError(409, 'ORDER_EXPIRED', 'The order has expired; payment will be refunded', {
    order_status: late.orderStatus,
    refund_id: late.refundId,
  });
}

function verifySignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const provided = String(signature).replace(/^sha256=/i, '').trim();
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = crypto
    .createHmac('sha256', cfg.payment.notifySecret)
    .update(rawBody)
    .digest('hex');
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

async function handleNotification({ payload, rawBody, signature, requestId }) {
  if (!verifySignature(rawBody, signature)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid payment notification signature');
  }
  const paymentId = toInt(payload.payment_id);
  const providerTxn = String(payload.provider_txn_id || '');
  if (!paymentId || !providerTxn || !['SUCCESS', 'FAIL'].includes(payload.result)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Notification fields are incomplete or result is invalid');
  }

  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();
    const attempts = await q(
      conn,
      `SELECT pa.*, o.order_id AS oid, o.user_id, o.status AS order_status,
              o.expires_at AS order_expires_at, o.created_at AS order_created_at,
              o.total_amount, o.currency AS order_currency
         FROM payment_attempts pa
         JOIN orders o ON o.order_id = pa.order_id
        WHERE pa.attempt_id = ? FOR UPDATE`,
      [paymentId]
    );
    if (!attempts.length) throw new ApiError(404, 'NOT_FOUND', 'Payment record not found');
    const attempt = attempts[0];
    if (
      toInt(payload.amount_cents) !== toInt(attempt.amount) ||
      String(payload.currency) !== attempt.currency ||
      String(payload.order_no) !== orderNo(toInt(attempt.order_id), attempt.order_created_at)
    ) {
      await q(
        conn,
        `INSERT INTO payment_notifications
           (source, notification_id, payment_attempt_id, received_at, processed_at,
            processed_result, payload_digest, payload_json)
         VALUES ('mockpay', ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), 'REJECTED', ?, ?)
         ON DUPLICATE KEY UPDATE notice_id = notice_id`,
        [providerTxn, paymentId, digest, rawBody]
      );
      await writeAudit(conn, {
        actorType: 'SYSTEM',
        actorId: null,
        objectType: 'PAYMENT',
        objectId: paymentId,
        action: 'PAYMENT_NOTIFICATION_REJECTED',
        summary: `provider txn ${providerTxn}: amount, currency or order_no mismatch`,
        requestId,
      });
      await conn.commit();
      committed = true;
      throw new ApiError(409, 'PAYMENT_MISMATCH', 'Notification amount, currency, or order number does not match the payment record', {
        notification_result: 'REJECTED',
      });
    }

    const inserted = await q(
      conn,
      `INSERT INTO payment_notifications
         (source, notification_id, payment_attempt_id, received_at, processed_result, payload_digest, payload_json)
       VALUES ('mockpay', ?, ?, UTC_TIMESTAMP(3), 'PENDING', ?, ?)
       ON DUPLICATE KEY UPDATE notice_id = notice_id`,
      [providerTxn, paymentId, digest, rawBody]
    );
    const notices = await q(
      conn,
      `SELECT notice_id, processed_result FROM payment_notifications
        WHERE source = 'mockpay' AND notification_id = ? FOR UPDATE`,
      [providerTxn]
    );
    if (notices.length && notices[0].processed_result !== 'PENDING') {
      await conn.commit();
      committed = true;
      return { result: 'DUPLICATE' };
    }

    const orders = await q(conn, 'SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [
      attempt.order_id,
    ]);
    const order = orders[0];

    let dataResult = 'APPLIED';
    if (payload.result === 'FAIL') {
      if (attempt.result === 'PENDING') {
        await q(conn, "UPDATE payment_attempts SET result = 'FAILED' WHERE attempt_id = ?", [
          paymentId,
        ]);
      }
    } else {
      const outcome = await applySuccessLocked(conn, attempt, order, {
        requestId,
        source: 'notify',
      });
      if (outcome.kind === 'DUPLICATE') dataResult = 'DUPLICATE';
      else if (outcome.kind === 'LATE_REFUND') dataResult = 'LATE_REFUND';
    }

    await q(
      conn,
      `UPDATE payment_notifications
          SET processed_at = UTC_TIMESTAMP(3), processed_result = ?
        WHERE source = 'mockpay' AND notification_id = ?`,
      [dataResult === 'LATE_REFUND' ? 'APPLIED' : dataResult, providerTxn]
    );
    await conn.commit();
    committed = true;
    return { result: dataResult };
  } catch (err) {
    if (!committed) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createPayment, getPayment, simulate, handleNotification, verifySignature };
