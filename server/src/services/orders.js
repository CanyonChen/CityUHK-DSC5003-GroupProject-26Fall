'use strict';

const crypto = require('node:crypto');
const { pool, query } = require('../db');
const { ApiError } = require('../lib/http');
const cfg = require('../config');
const { toIso, toInt, orderNo, seatLabel } = require('../lib/format');
const { writeAudit } = require('../lib/audit');

async function q(exec, sql, params = []) {
  if (typeof exec === 'function') return exec(sql, params);
  const [rows] = await exec.query(sql, params);
  return rows;
}

function hashRequest(performanceId, seatIds) {
  const canonical = JSON.stringify({
    performance_id: Number(performanceId),
    session_seat_ids: [...seatIds].sort((a, b) => a - b),
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function loadOrder(exec, orderId) {
  const rows = await q(
    exec,
    `SELECT o.*, p.starts_at, p.sale_end_at, e.name AS event_name, v.name AS venue_name
       FROM orders o
       JOIN performances p ON p.performance_id = o.performance_id
       JOIN events e ON e.event_id = p.event_id
       JOIN venues v ON v.venue_id = p.venue_id
      WHERE o.order_id = ?`,
    [orderId]
  );
  if (!rows.length) return null;
  const o = rows[0];

  const items = await q(
    exec,
    `SELECT oi.order_item_id, oi.session_seat_id, oi.price_snapshot,
            s.region, s.row_no, s.seat_no, pt.tier_name
       FROM order_items oi
       JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
       JOIN seats s ON s.seat_id = ss.seat_id
       JOIN price_tiers pt ON pt.tier_id = ss.tier_id
      WHERE oi.order_id = ?
      ORDER BY s.region, CAST(s.row_no AS UNSIGNED), CAST(s.seat_no AS UNSIGNED)`,
    [orderId]
  );

  const attempts = await q(
    exec,
    `SELECT attempt_id, result, amount, currency, handling_category, created_at, updated_at
       FROM payment_attempts WHERE order_id = ?
      ORDER BY attempt_id DESC`,
    [orderId]
  );

  const tickets = await q(
    exec,
    `SELECT t.ticket_id, t.status, t.issued_at, oi.session_seat_id,
            s.region, s.row_no, s.seat_no
       FROM tickets t
       JOIN order_items oi ON oi.order_item_id = t.order_item_id
       JOIN session_seats ss ON ss.session_seat_id = oi.session_seat_id
       JOIN seats s ON s.seat_id = ss.seat_id
      WHERE oi.order_id = ?
      ORDER BY t.ticket_id`,
    [orderId]
  );

  const refunds = await q(
    exec,
    `SELECT refund_id, status, amount, reason, created_at
       FROM refunds WHERE order_id = ? ORDER BY refund_id DESC LIMIT 1`,
    [orderId]
  );

  const refund = refunds.length
    ? {
        refund_id: toInt(refunds[0].refund_id),
        status: refunds[0].status,
        amount_cents: toInt(refunds[0].amount),
        reason: refunds[0].reason,
        created_at: toIso(refunds[0].created_at),
      }
    : null;

  return {
    order_id: toInt(o.order_id),
    order_no: orderNo(toInt(o.order_id), o.created_at),
    status: o.status,
    performance_id: toInt(o.performance_id),
    event_name: o.event_name,
    venue_name: o.venue_name,
    starts_at: toIso(o.starts_at),
    total_amount_cents: toInt(o.total_amount),
    currency: o.currency,
    expires_at: toIso(o.expires_at),
    created_at: toIso(o.created_at),
    paid_at: toIso(o.paid_at),
    closed_at: toIso(o.closed_at),
    items: items.map((i) => ({
      order_item_id: toInt(i.order_item_id),
      session_seat_id: toInt(i.session_seat_id),
      seat_label: seatLabel(i),
      region: i.region,
      row_no: String(i.row_no),
      seat_no: String(i.seat_no),
      tier_name: i.tier_name,
      price_cents: toInt(i.price_snapshot),
    })),
    payment_attempts: attempts.map((a) => ({
      attempt_id: toInt(a.attempt_id),
      status: a.result,
      amount_cents: toInt(a.amount),
      currency: a.currency,
      handling_category: a.handling_category,
      created_at: toIso(a.created_at),
      updated_at: toIso(a.updated_at),
    })),
    tickets: tickets.map((t) => ({
      ticket_id: toInt(t.ticket_id),
      status: t.status,
      issued_at: toIso(t.issued_at),
      seat_label: seatLabel(t),
    })),
    refund,
  };
}

async function releaseSeats(exec, orderId) {
  const rows = await q(
    exec,
    `UPDATE session_seats
        SET session_seat_status = 'AVAILABLE', holder_order_id = NULL, hold_expires_at = NULL
      WHERE holder_order_id = ? AND session_seat_status = 'HELD'`,
    [orderId]
  );
  return rows.affectedRows || 0;
}

async function expireOne(orderId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      'SELECT order_id, status, expires_at FROM orders WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    if (!rows.length || rows[0].status !== 'PENDING_PAYMENT') {
      await conn.commit();
      return false;
    }
    const nowRows = await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now');
    const now = nowRows[0].now;
    if (rows[0].expires_at > now) {
      await conn.commit();
      return false;
    }
    await q(
      conn,
      "UPDATE orders SET status = 'EXPIRED', closed_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
      [orderId]
    );
    const released = await releaseSeats(conn, orderId);
    await writeAudit(conn, {
      actorType: 'SYSTEM',
      objectType: 'ORDER',
      objectId: orderId,
      action: 'ORDER_EXPIRED',
      summary: `PENDING_PAYMENT→EXPIRED, released ${released} seats`,
      requestId: '-',
    });
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Expire all due pending orders; called before order creation and every 10 seconds in the background */
async function expireDueOrders() {
  const rows = await q(
    query,
    "SELECT order_id FROM orders WHERE status = 'PENDING_PAYMENT' AND expires_at <= UTC_TIMESTAMP(3) ORDER BY order_id LIMIT 100"
  );
  let count = 0;
  for (const row of rows) {
    if (await expireOne(row.order_id)) count += 1;
  }
  return count;
}

let timer = null;
function startExpiryWorker() {
  if (timer) return timer;
  timer = setInterval(() => {
    expireDueOrders().catch((err) => console.error('[expiry] Cleanup failed:', err.message));
  }, 10 * 1000);
  timer.unref();
  return timer;
}

async function createOrder({ userId, performanceId, seatIds, key, requestId }) {
  const requestHash = hashRequest(performanceId, seatIds);

  const existing = await q(
    query,
    'SELECT order_id, request_hash FROM orders WHERE user_id = ? AND idempotency_key = ?',
    [userId, key]
  );
  if (existing.length) {
    if (existing[0].request_hash !== requestHash) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'The same Idempotency-Key was used for a different seat selection');
    }
    return { replayed: true, order: await loadOrder(query, existing[0].order_id) };
  }

  await expireDueOrders();

  const conn = await pool.getConnection();
  try {
    // With 50 concurrent orders from different users on one performance, REPEATABLE READ leaves
    // a gap lock that can deadlock with the performances row lock. The pending query only needs existing rows,
    // not a gap lock, so this transaction uses READ COMMITTED.
    await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await conn.beginTransaction();

    // Serialize order creation per user to enforce CFG-04 (one unexpired pending order per performance)
    await q(conn, 'SELECT user_id FROM users WHERE user_id = ? FOR UPDATE', [userId]);

    const dup = await q(
      conn,
      'SELECT order_id, request_hash FROM orders WHERE user_id = ? AND idempotency_key = ? FOR UPDATE',
      [userId, key]
    );
    if (dup.length) {
      if (dup[0].request_hash !== requestHash) {
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'The same Idempotency-Key was used for a different seat selection');
      }
      // Read back before releasing the transaction connection; otherwise the 10-connection pool is exhausted
      // by loadOrder calls waiting for a second connection, causing an application-level pool deadlock.
      const order = await loadOrder((sql, params) => q(conn, sql, params), dup[0].order_id);
      await conn.commit();
      return { replayed: true, order };
    }

    const pending = await q(
      conn,
      `SELECT order_id FROM orders
        WHERE user_id = ? AND performance_id = ? AND status = 'PENDING_PAYMENT'
          AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE`,
      [userId, performanceId]
    );
    if (pending.length) {
      throw new ApiError(409, 'LIMIT_EXCEEDED', 'An unexpired pending order already exists for this performance', {
        existing_order_id: toInt(pending[0].order_id),
      });
    }

    const perfRows = await q(
      conn,
      `SELECT performance_id, status, sale_start_at, sale_end_at
         FROM performances WHERE performance_id = ? FOR UPDATE`,
      [performanceId]
    );
    if (!perfRows.length) throw new ApiError(404, 'NOT_FOUND', 'Performance not found');
    const perf = perfRows[0];
    const now = (await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now'))[0].now;
    if (perf.status !== 'PUBLISHED') {
      throw new ApiError(409, 'SALE_CLOSED', 'This performance is not on sale');
    }
    if (!(perf.sale_start_at <= now && now < perf.sale_end_at)) {
      throw new ApiError(409, 'SALE_CLOSED', 'Outside the sales window');
    }

    const placeholders = seatIds.map(() => '?').join(',');
    const seats = await q(
      conn,
      `SELECT ss.session_seat_id, ss.session_seat_status, ss.holder_order_id, ss.hold_expires_at,
              pt.current_price, pt.currency
         FROM session_seats ss
         JOIN price_tiers pt ON pt.tier_id = ss.tier_id
        WHERE ss.performance_id = ? AND ss.session_seat_id IN (${placeholders})
        FOR UPDATE`,
      [performanceId, ...seatIds]
    );
    if (seats.length !== seatIds.length) {
      throw new ApiError(409, 'SEAT_UNAVAILABLE', 'Some seats do not belong to this performance', {
        requested: seatIds.length,
        found: seats.length,
      });
    }
    const unavailable = seats.filter((s) => s.session_seat_status !== 'AVAILABLE');
    if (unavailable.length) {
      throw new ApiError(409, 'SEAT_UNAVAILABLE', 'The selected seat is already held or sold', {
        session_seat_ids: unavailable.map((s) => toInt(s.session_seat_id)),
      });
    }
    const currencies = new Set(seats.map((s) => s.currency));
    if (currencies.size > 1) {
      throw new ApiError(409, 'SEAT_UNAVAILABLE', 'The selected seats use different currencies');
    }
    const total = seats.reduce((sum, s) => sum + toInt(s.current_price), 0);
    const currency = seats[0].currency || cfg.currency;

    const insert = await q(
      conn,
      `INSERT INTO orders
         (user_id, performance_id, status, total_amount, currency, expires_at,
          idempotency_key, request_hash, created_at)
       VALUES (?, ?, 'PENDING_PAYMENT', ?, ?,
               LEAST(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${cfg.limits.holdSeconds} SECOND), ?),
               ?, ?, UTC_TIMESTAMP(3))`,
      [userId, performanceId, total, currency, perf.sale_end_at, key, requestHash]
    );
    const orderId = toInt(insert.insertId);

    const orderRows = await q(
      conn,
      'SELECT created_at, expires_at FROM orders WHERE order_id = ?',
      [orderId]
    );
    const created = orderRows[0];

    await q(
      conn,
      `INSERT INTO order_items (order_id, session_seat_id, price_snapshot)
       VALUES ${seats.map(() => '(?, ?, ?)').join(', ')}`,
      seats.flatMap((s) => [orderId, toInt(s.session_seat_id), toInt(s.current_price)])
    );

    for (const seat of seats) {
      await q(
        conn,
        `UPDATE session_seats
            SET session_seat_status = 'HELD', holder_order_id = ?, hold_expires_at = ?
          WHERE session_seat_id = ? AND session_seat_status = 'AVAILABLE'`,
        [orderId, created.expires_at, toInt(seat.session_seat_id)]
      );
    }

    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'ORDER',
      objectId: orderId,
      action: 'ORDER_CREATED',
      summary: `PENDING_PAYMENT, ${seats.length} seats, ${total} ${currency}`,
      requestId,
    });

    // Read the order back on the same transaction connection to avoid requesting a second connection.
    const order = await loadOrder((sql, params) => q(conn, sql, params), orderId);
    await conn.commit();
    return { replayed: false, order, orderId };
  } catch (err) {
    await conn.rollback();
    if (err && err.code === 'ER_DUP_ENTRY') {
      const again = await q(
        query,
        'SELECT order_id, request_hash FROM orders WHERE user_id = ? AND idempotency_key = ?',
        [userId, key]
      );
      if (again.length && again[0].request_hash === requestHash) {
        const order = await loadOrder((sql, params) => q(conn, sql, params), again[0].order_id);
        return { replayed: true, order };
      }
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'The same Idempotency-Key was used for a different seat selection');
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function getOrderForViewer(orderId, viewer) {
  const order = await loadOrder(query, orderId);
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
  const row = await q(query, 'SELECT user_id FROM orders WHERE order_id = ?', [orderId]);
  const isAdmin = (viewer.roles || []).includes('ADMIN');
  if (!isAdmin && toInt(row[0].user_id) !== viewer.userId) {
    throw new ApiError(403, 'FORBIDDEN', 'You cannot view this order');
  }
  return order;
}

async function listOrders({ userId, status, dateFrom, dateTo, page, pageSize, offset }) {
  const conds = ['o.user_id = ?'];
  const params = [userId];
  if (status) {
    conds.push('o.status = ?');
    params.push(status);
  }
  if (dateFrom) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conds.push('DATE(p.starts_at + INTERVAL 8 HOUR) <= ?');
    params.push(dateTo);
  }
  const where = `WHERE ${conds.join(' AND ')}`;
  const base = `
    FROM orders o
    JOIN performances p ON p.performance_id = o.performance_id
    JOIN events e ON e.event_id = p.event_id
    JOIN venues v ON v.venue_id = p.venue_id
    ${where}`;

  const countRows = await q(query, `SELECT COUNT(*) AS total ${base}`, params);
  const rows = await q(
    query,
    `SELECT o.order_id, o.created_at, o.status, o.total_amount, o.currency,
            o.expires_at, o.paid_at, o.performance_id,
            p.starts_at, e.name AS event_name, v.name AS venue_name
       ${base}
      ORDER BY o.created_at DESC, o.order_id DESC
      LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => ({
      order_id: toInt(r.order_id),
      order_no: orderNo(toInt(r.order_id), r.created_at),
      performance_id: toInt(r.performance_id),
      event_name: r.event_name,
      venue_name: r.venue_name,
      starts_at: toIso(r.starts_at),
      status: r.status,
      total_amount_cents: toInt(r.total_amount),
      currency: r.currency,
      expires_at: toIso(r.expires_at),
      paid_at: toIso(r.paid_at),
    })),
    page,
    page_size: pageSize,
    total: toInt(countRows[0] && countRows[0].total),
  };
}

async function cancelOrder({ orderId, userId, requestId }) {
  await expireDueOrders();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const rows = await q(
      conn,
      'SELECT order_id, user_id, status, expires_at FROM orders WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    if (!rows.length) throw new ApiError(404, 'NOT_FOUND', 'Order not found');
    const order = rows[0];
    if (toInt(order.user_id) !== userId) throw new ApiError(403, 'FORBIDDEN', 'You cannot cancel this order');

    if (order.status === 'CANCELLED') {
      await conn.commit();
      return { order_id: orderId, status: 'CANCELLED', released_seats: 0 };
    }
    if (order.status === 'EXPIRED') {
      throw new ApiError(409, 'ORDER_EXPIRED', 'The order has passed its payment deadline');
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'The order is paid or closed and cannot be cancelled');
    }
    const now = (await q(conn, 'SELECT UTC_TIMESTAMP(3) AS now'))[0].now;
    if (order.expires_at <= now) {
      await q(
        conn,
        "UPDATE orders SET status = 'EXPIRED', closed_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
        [orderId]
      );
      await releaseSeats(conn, orderId);
      await conn.commit();
      throw new ApiError(409, 'ORDER_EXPIRED', 'The order has passed its payment deadline');
    }

    await q(
      conn,
      "UPDATE orders SET status = 'CANCELLED', closed_at = UTC_TIMESTAMP(3) WHERE order_id = ?",
      [orderId]
    );
    const released = await releaseSeats(conn, orderId);
    await writeAudit(conn, {
      actorType: 'USER',
      actorId: userId,
      objectType: 'ORDER',
      objectId: orderId,
      action: 'ORDER_CANCELLED',
      summary: `PENDING_PAYMENT→CANCELLED, released ${released} seats`,
      requestId,
    });
    await conn.commit();
    return { order_id: orderId, status: 'CANCELLED', released_seats: released };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createOrder,
  getOrderForViewer,
  listOrders,
  cancelOrder,
  expireDueOrders,
  expireOne,
  startExpiryWorker,
  loadOrder,
  releaseSeats,
};
