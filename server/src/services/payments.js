'use strict';

const crypto = require('node:crypto');
const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, orderNo } = require('../lib/format');
const { writeAudit } = require('../lib/audit');
const { releaseSeats, expireDueOrders } = require('./orders');
const { issueTickets } = require('./ticket-issuance');
const { sellHeldSeats } = require('./inventory');
const { retryTransaction } = require('../lib/retry-transaction');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
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
  if (attempt.result === 'SUCCEEDED' && order.status !== 'PENDING_PAYMENT') {
    if (!['EXPIRED', 'CANCELLED'].includes(order.status)) return { kind: 'DUPLICATE', tickets: 0, orderStatus: order.status };
    const refunds = await q(conn, 'SELECT refund_id FROM refunds WHERE payment_attempt_id = ? LIMIT 1', [attempt.attempt_id]);
    if (refunds.length) return { kind: 'DUPLICATE', tickets: 0, orderStatus: order.status };
  }
  const now = (await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now'))[0].now;

  if (order.status === 'PENDING_PAYMENT' && order.expires_at > now) {
    await q(
      conn,
      "UPDATE orders SET status = 'PAID', paid_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
      [order.order_id]
    );
    await sellHeldSeats(conn, order.order_id);
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

    if (toInt(order.total_amount) === 0) {
      throw new ApiError(409, 'FREE_ORDER_REQUIRES_CONFIRMATION', 'Confirm this free booking without creating a payment');
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
  if (cfg.payment.mode !== 'test') throw new ApiError(403, 'FORBIDDEN', 'Simulated payments are only available in test mode');
  if (!['SUCCESS','FAIL','TIMEOUT'].includes(result)) throw new ApiError(400, 'VALIDATION_ERROR', 'result must be SUCCESS, FAIL, or TIMEOUT');
  const rows = await query(`SELECT pa.*, o.user_id, o.status AS order_status, o.created_at AS order_created_at
    FROM payment_attempts pa JOIN orders o ON o.order_id = pa.order_id WHERE pa.attempt_id = ?`, [paymentId]);
  if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Payment record not found');
  const attempt = rows[0];
  if (Number(attempt.user_id) !== Number(userId)) throw new ApiError(403, 'FORBIDDEN', 'You cannot operate on this payment');
  if (result === 'TIMEOUT' || (result === 'FAIL' && attempt.result !== 'PENDING')) {
    return { payment_status: attempt.result, order_status: attempt.order_status, tickets_issued: 0 };
  }
  // The simulated provider result is persisted as a verified inbox entry before local fulfilment.
  const rawBody = JSON.stringify({ payment_id: paymentId, provider_txn_id: `SIM-${paymentId}-${result}`,
    result, amount_cents: Number(attempt.amount), currency: attempt.currency,
    order_no: orderNo(Number(attempt.order_id), attempt.order_created_at) });
  const outcome = await handleNotification({ payload: JSON.parse(rawBody), rawBody,
    signature: crypto.createHmac('sha256', cfg.payment.notifySecret).update(rawBody).digest('hex'), requestId });
  const current = await query(`SELECT pa.result, o.status AS order_status FROM payment_attempts pa
    JOIN orders o ON o.order_id = pa.order_id WHERE pa.attempt_id = ?`, [paymentId]);
  if (outcome.result === 'LATE_REFUND') {
    const refunds = await query('SELECT refund_id FROM refunds WHERE payment_attempt_id = ? ORDER BY refund_id LIMIT 1', [paymentId]);
    throw new ApiError(409, 'ORDER_EXPIRED', 'The order has expired; payment will be refunded',
      { order_status: current[0].order_status, refund_id: refunds[0]?.refund_id });
  }
  return { payment_status: current[0].result, order_status: current[0].order_status, tickets_issued: outcome.tickets_issued || 0 };
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

async function handleNotificationOnce({ payload, rawBody, signature, requestId, recover = false }) {
  if (!verifySignature(rawBody, signature)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid payment notification signature');
  }
  const paymentId = toInt(payload.payment_id);
  const providerTxn = String(payload.provider_txn_id || '');
  if (!paymentId || !providerTxn || !['SUCCESS', 'FAIL'].includes(payload.result)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Notification fields are incomplete or result is invalid');
  }

  const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
  const witness = await query(`SELECT pa.amount, pa.currency, pa.order_id, o.created_at
    FROM payment_attempts pa JOIN orders o ON o.order_id = pa.order_id WHERE pa.attempt_id = ?`, [paymentId]);
  if (witness.length && Number(payload.amount_cents) === Number(witness[0].amount) &&
      String(payload.currency) === witness[0].currency &&
      String(payload.order_no) === orderNo(Number(witness[0].order_id), witness[0].created_at)) {
    await query(`INSERT INTO payment_notifications
      (source, notification_id, payment_attempt_id, received_at, processed_result, payload_digest, payload_json)
      VALUES ('mockpay', ?, ?, UTC_TIMESTAMP(3), 'PENDING', ?, ?)
      ON DUPLICATE KEY UPDATE notice_id = notice_id`, [providerTxn, paymentId, digest, rawBody]);
  }
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
    if (notices.length && notices[0].processed_result !== 'PENDING' &&
        !(recover && payload.result === 'SUCCESS' && ['PENDING_PAYMENT','EXPIRED','CANCELLED'].includes(attempt.order_status))) {
      await conn.commit();
      committed = true;
      return { result: 'DUPLICATE' };
    }

    const orders = await q(conn, 'SELECT * FROM orders WHERE order_id = ? FOR UPDATE', [
      attempt.order_id,
    ]);
    const order = orders[0];

    let dataResult = 'APPLIED', ticketsIssued = 0;
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
      ticketsIssued = outcome.tickets;
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
    return { result: dataResult, tickets_issued: ticketsIssued };
  } catch (err) {
    if (!committed) await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function handleNotification(args) { return retryTransaction(() => handleNotificationOnce(args)); }
module.exports = { createPayment, getPayment, simulate, handleNotification, verifySignature };
