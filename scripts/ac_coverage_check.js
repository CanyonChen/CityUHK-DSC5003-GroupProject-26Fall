#!/usr/bin/env node
/**
 * Run named ticketing acceptance cases against an isolated API and database.
 *
 * Target: an isolated API + isolated MySQL database, never the demo database.
 * Quick start:
 *   node scripts/ac_coverage_check.js --cases=AC-02,AC-04,AC-07,AC-08
 *   node scripts/ac_coverage_check.js --all
 *
 * Environment:
 *   BASE=http://127.0.0.1:3300
 *   DB_NAME=ticketing_ac
 *   OUT=.cache/checks/ac-coverage.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'server');
const serverRequire = createRequire(path.join(SERVER, 'package.json'));
const mysql = serverRequire('mysql2/promise');

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME || 'ticketing_ac',
};
const OUT = path.resolve(ROOT, process.env.OUT || '.cache/checks/ac-coverage.json');
const SECRET = process.env.PAYMENT_NOTIFY_SECRET || 'ac-test-secret';
const PASSWORD = 'Demo@1234';
const PREFIX = (process.env.AC_PREFIX || `ACX${Date.now().toString(36).toUpperCase()}`);
const VENUE_ID = Number(process.env.AC_VENUE_ID || 1);
const RUN_ID = `${new Date().toISOString()} ${PREFIX}`;

let pool;
const tokens = new Map();

function argCases() {
  const arg = process.argv.find((a) => a.startsWith('--cases='));
  if (process.argv.includes('--all')) return [
    'AC-02', 'AC-04', 'AC-07', 'AC-08', 'AC-11', 'AC-12', 'AC-13', 'AC-20',
    'AC-01', 'AC-03', 'AC-06', 'AC-09', 'AC-10', 'AC-18', 'AC-21', 'AC-23', 'AC-25',
  ];
  if (!arg) return ['AC-02'];
  return arg.slice('--cases='.length).split(',').map((s) => s.trim()).filter(Boolean);
}

function assert(cond, message, details) {
  if (!cond) {
    const err = new Error(message);
    err.details = details;
    throw err;
  }
}

function isStatus(res, expected) {
  return Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
}

function errorCode(body) {
  return body && (body.code || (body.error && body.error.code));
}

async function api(method, endpoint, { token, body, key, headers, raw } = {}) {
  const h = { ...(headers || {}) };
  let payload;
  if (raw !== undefined) {
    payload = raw;
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) h.Authorization = `Bearer ${token}`;
  if (key) h['Idempotency-Key'] = key;
  const res = await fetch(BASE + endpoint, { method, headers: h, body: payload });
  const text = await res.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* keep text */ }
  return { status: res.status, body: data, raw: text };
}

async function expectStatus(res, expected, label) {
  if (!isStatus(res, expected)) {
    throw new Error(`${label}: HTTP ${res.status}, expected ${expected}; body=${res.raw.slice(0, 500)}`);
  }
  return res.body && res.body.data !== undefined ? res.body.data : res.body;
}

async function expectError(res, status, code, label) {
  assert(res.status === status, `${label}: HTTP ${res.status}, expected ${status}; body=${res.raw.slice(0, 400)}`);
  const got = errorCode(res.body);
  if (code) assert(got === code, `${label}: error code ${got}, expected ${code}; body=${res.raw.slice(0, 300)}`);
  return res.body;
}

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function keyFor(label) {
  return uniq(`${PREFIX}-${label}`).slice(0, 64);
}

function isoDate(offsetMinutes) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function orderNo(orderId, createdAt) {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const hkt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const ymd = hkt.toISOString().slice(0, 10).replace(/-/g, '');
  return `TIX-${ymd}-${String(orderId).padStart(6, '0')}`;
}

async function login(userName) {
  if (tokens.has(userName)) return tokens.get(userName);
  const res = await api('POST', '/auth/login', { body: { user_name: userName, password: PASSWORD } });
  const data = await expectStatus(res, 200, `login ${userName}`);
  assert(data && data.token, `login ${userName}: no token`);
  tokens.set(userName, data.token);
  return data.token;
}

async function ensureUser(userName) {
  const res = await api('POST', '/auth/register', {
    body: { user_name: userName, password: PASSWORD, display_name: userName },
  });
  if (res.status === 409) return login(userName);
  assert([200, 201].includes(res.status), `register ${userName}: HTTP ${res.status}; ${res.raw.slice(0, 300)}`);
  return login(userName);
}

async function createPerformance({ price = 10000, startsInMinutes = 72 * 60, saleStartInMinutes = -60, saleEndInMinutes = 24 * 60, publish = true } = {}) {
  const res = await api('POST', '/admin/performances', {
    token: await login('admin'),
    key: keyFor('perf'),
    body: {
      event_id: 1,
      venue_id: VENUE_ID,
      starts_at: isoDate(startsInMinutes),
      sale_start_at: isoDate(saleStartInMinutes),
      sale_end_at: isoDate(saleEndInMinutes),
      checkin_start_at: isoDate(-60),
      checkin_end_at: isoDate(120),
      price_tiers: [{ tier_name: 'Standard', price_cents: price }],
    },
  });
  const data = await expectStatus(res, [200, 201], 'create performance');
  const id = Number(data && data.performance_id);
  assert(id, 'create performance: no performance_id');
  if (publish) {
    await expectStatus(await api('POST', `/admin/performances/${id}/publish`, { token: await login('admin'), key: keyFor('pub') }), [200, 201], `publish ${id}`);
  }
  return id;
}

async function availableSeats(perf, limit = 20) {
  return q(
    `SELECT session_seat_id, seat_id, tier_id FROM session_seats
      WHERE performance_id = ? AND session_seat_status = 'AVAILABLE'
      ORDER BY session_seat_id LIMIT ?`,
    [perf, limit]
  );
}

async function seatsInRow(perf, region, rowNo) {
  return q(
    `SELECT ss.session_seat_id, s.region, s.row_no, s.seat_no, ss.session_seat_status
       FROM session_seats ss
       JOIN seats s ON s.seat_id = ss.seat_id
      WHERE ss.performance_id = ? AND s.region = ? AND s.row_no = ?
      ORDER BY CAST(s.seat_no AS UNSIGNED)`,
    [perf, region, rowNo]
  );
}

function seatKey(seat) {
  return `${seat.region}-${seat.row_no}-${seat.seat_no}`;
}

async function createOrder(token, perf, seatIds, label) {
  const res = await api('POST', '/orders', {
    token,
    key: keyFor(label),
    body: { performance_id: perf, session_seat_ids: seatIds },
  });
  return res;
}

async function createPayment(token, orderId, label) {
  const res = await api('POST', '/payments', { token, key: keyFor(label), body: { order_id: orderId } });
  const data = await expectStatus(res, [200, 201], `create payment ${orderId}`);
  return data;
}

async function simulate(token, paymentId, result = 'SUCCESS') {
  return api('POST', `/payments/${paymentId}/simulate`, { token, key: keyFor('sim'), body: { result } });
}

async function paidOrder(buyer, perf, seats, label) {
  const token = await login(buyer);
  const res = await createOrder(token, perf, seats, `ord-${label}`);
  const data = await expectStatus(res, [200, 201], `create order ${label}`);
  const orderId = Number(data.order_id);
  const payment = await createPayment(token, orderId, `pay-${label}`);
  const payId = Number(payment.payment_id);
  const sim = await simulate(token, payId, 'SUCCESS');
  await expectStatus(sim, 200, `simulate ${label}`);
  return { orderId, paymentId: payId, token, order: data };
}

async function ticketForOrder(orderId) {
  const rows = await q(
    `SELECT t.ticket_id, t.ticket_code_hash, t.status
       FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id
      WHERE oi.order_id = ? ORDER BY t.ticket_id LIMIT 1`,
    [orderId]
  );
  return rows[0] || null;
}

async function seatStatus(perf) {
  return q(
    `SELECT session_seat_status, COUNT(*) AS n FROM session_seats
      WHERE performance_id = ? GROUP BY session_seat_status ORDER BY session_seat_status`,
    [perf]
  );
}

async function stats(perf) {
  const res = await api('GET', `/admin/stats?performance_id=${perf}`, { token: await login('admin') });
  const data = await expectStatus(res, 200, `stats ${perf}`);
  const item = (data.items || []).find((x) => Number(x.performance_id) === Number(perf));
  assert(item, `stats ${perf}: performance not present`);
  return item;
}

async function userId(userName) {
  const rows = await q('SELECT user_id FROM users WHERE user_name = ? LIMIT 1', [userName]);
  assert(rows.length, `user not found: ${userName}`);
  return Number(rows[0].user_id);
}

async function dbOrder(orderId) {
  const rows = await q(
    `SELECT order_id, user_id, performance_id, status, total_amount, currency, expires_at, created_at
       FROM orders WHERE order_id = ?`,
    [orderId]
  );
  assert(rows.length, `order not found: ${orderId}`);
  return rows[0];
}

async function forceExpired(orderId, secondsAgo = 5) {
  const seconds = Math.max(1, Math.floor(Number(secondsAgo) || 1));
  await q(
    `UPDATE orders
        SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE),
            expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${seconds} SECOND)
      WHERE order_id = ?`,
    [orderId]
  );
}

async function resolveRefund(refundId, result, label) {
  const res = await api('POST', `/admin/refunds/${refundId}/resolve`, {
    token: await login('admin'),
    key: keyFor(`resolve-${label}`),
    body: { result },
  });
  return res;
}

async function note(rawBody) {
  const signature = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  return api('POST', '/payments/notify', { raw: rawBody, headers: { 'Content-Type': 'application/json', 'X-Signature': signature } });
}

/* ------------------------------------------------------------------ cases */

async function ac01() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 2);
  assert(seats.length >= 1, 'AC-01: no seats');
  const buyerB = 'buyer23';
  const buyerA = 'buyer24';
  const paid = await paidOrder(buyerB, perf, [seats[0].session_seat_id], 'ac01');
  const ticket = await ticketForOrder(paid.orderId);
  assert(ticket, 'AC-01: no ticket');
  const tokenA = await login(buyerA);
  const checker = await login('checker01');

  const foreignOrder = await api('GET', `/orders/${paid.orderId}`, { token: tokenA });
  const foreignTicket = await api('GET', `/tickets/${ticket.ticket_id}`, { token: tokenA });
  const foreignAdminEvents = await api('GET', '/admin/events', { token: tokenA });
  const checkerAdminEvents = await api('GET', '/admin/events', { token: checker });
  const checkerAdminOrders = await api('GET', '/admin/orders', { token: checker });
  const checkerResolve = await api('POST', '/admin/refunds/999999/resolve', { token: checker, key: keyFor('ac01-res'), body: { result: 'SUCCEEDED' } });
  const foreignResolve = await api('POST', '/admin/refunds/999999/resolve', { token: tokenA, key: keyFor('ac01-res2'), body: { result: 'SUCCEEDED' } });
  const checkerUnassignedCheckin = await api('POST', '/admin/checkins', { token: checker, key: keyFor('ac01-chk'), body: { performance_id: perf, ticket_code: ticket.ticket_code_hash } });

  await expectError(foreignOrder, 403, 'FORBIDDEN', 'AC-01 foreign order');
  await expectError(foreignTicket, 403, 'FORBIDDEN', 'AC-01 foreign ticket');
  await expectError(foreignAdminEvents, 403, 'FORBIDDEN', 'AC-01 buyer admin events');
  await expectError(checkerAdminEvents, 403, 'FORBIDDEN', 'AC-01 checker admin events');
  await expectError(checkerAdminOrders, 403, 'FORBIDDEN', 'AC-01 checker admin orders');
  await expectError(checkerResolve, 403, 'FORBIDDEN', 'AC-01 checker resolve');
  await expectError(foreignResolve, 403, 'FORBIDDEN', 'AC-01 buyer resolve');
  await expectError(checkerUnassignedCheckin, 403, 'FORBIDDEN', 'AC-01 unassigned checkin');

  const ownTicket = await api('GET', `/tickets/${ticket.ticket_id}`, { token: paid.token });
  await expectStatus(ownTicket, 200, 'AC-01 own ticket');

  return {
    orders: [paid.orderId],
    ticket_id: ticket.ticket_id,
    assertions: ['foreign order/ticket 403', 'buyer/admin 403', 'checker/admin 403', 'unassigned checkin 403', 'owner 200'],
  };
}

async function ac02() {
  const perfA = await createPerformance({ price: 10000 });
  const perfB = await createPerformance({ price: 10000 });
  const seatsA = await availableSeats(perfA, 2);
  const seatsB = await availableSeats(perfB, 2);
  assert(seatsA.length && seatsB.length, 'AC-02: no seats');
  assert(String(seatsA[0].seat_id) === String(seatsB[0].seat_id), `AC-02: expected same physical seat in both performances, got ${seatsA[0].seat_id}/${seatsB[0].seat_id}`);

  const paid = await paidOrder('buyer01', perfA, [seatsA[0].session_seat_id], 'ac02');
  const rowA = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [seatsA[0].session_seat_id]);
  const rowB = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [seatsB[0].session_seat_id]);
  assert(rowA[0].session_seat_status === 'SOLD', `AC-02: perf A seat ${rowA[0].session_seat_status}`);
  assert(rowB[0].session_seat_status === 'AVAILABLE', `AC-02: perf B seat ${rowB[0].session_seat_status}`);

  const token = await login('buyer01');
  const orderB = await createOrder(token, perfB, [seatsB[0].session_seat_id], 'ac02-b');
  await expectStatus(orderB, [200, 201], 'AC-02 buy same seat in other performance');

  return {
    same_seat_id: seatsA[0].seat_id,
    performance_a: { id: perfA, status: rowA[0].session_seat_status, order_id: paid.orderId },
    performance_b: { id: perfB, status: rowB[0].session_seat_status, order_id: orderB.body.data.order_id },
  };
}

async function ac03() {
  const buyer = 'buyer15';
  const token = await login(buyer);

  const draft = await createPerformance({ price: 10000, publish: false });
  const draftSeats = await availableSeats(draft, 2);
  assert(draftSeats.length, 'AC-03: draft seats missing');
  const draftOrder = await createOrder(token, draft, [draftSeats[0].session_seat_id], 'ac03-draft');
  await expectError(draftOrder, 409, 'SALE_CLOSED', 'AC-03 draft sale');

  const future = await createPerformance({ price: 10000 });
  await q('UPDATE performances SET sale_start_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 60 MINUTE) WHERE performance_id = ?', [future]);
  const futureOrder = await createOrder(token, future, [Number((await q('SELECT session_seat_id FROM session_seats WHERE performance_id = ? LIMIT 1', [future]))[0].session_seat_id)], 'ac03-future');
  await expectError(futureOrder, 409, 'SALE_CLOSED', 'AC-03 future sale');

  const cutoff = await createPerformance({ price: 10000 });
  await q('UPDATE performances SET sale_end_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE performance_id = ?', [cutoff]);
  const cutoffSeat = await q('SELECT session_seat_id FROM session_seats WHERE performance_id = ? LIMIT 1', [cutoff]);
  const cutoffOrder = await createOrder(token, cutoff, [cutoffSeat[0].session_seat_id], 'ac03-cutoff');
  await expectError(cutoffOrder, 409, 'SALE_CLOSED', 'AC-03 sale cutoff');

  const pausePerf = await createPerformance({ price: 10000 });
  const pauseSeats = await availableSeats(pausePerf, 2);
  assert(pauseSeats.length, 'AC-03: pause seats');
  const prePause = await createOrder(token, pausePerf, [pauseSeats[0].session_seat_id], 'ac03-pre');
  const preOrderData = await expectStatus(prePause, [200, 201], 'AC-03 pre-pause order');
  const pause = await api('POST', `/admin/performances/${pausePerf}/sales`, { token: await login('admin'), key: keyFor('pause'), body: { action: 'pause' } });
  await expectStatus(pause, 200, 'AC-03 pause');
  const afterToken = await login('buyer16');
  const afterPause = await createOrder(afterToken, pausePerf, [pauseSeats[1].session_seat_id], 'ac03-after');
  await expectError(afterPause, 409, 'SALE_CLOSED', 'AC-03 order after pause');
  const payment = await createPayment(token, Number(preOrderData.order_id), 'ac03-pay');
  const sim = await simulate(token, Number(payment.payment_id), 'SUCCESS');
  await expectStatus(sim, 200, 'AC-03 pay after pause');
  const order = await dbOrder(Number(preOrderData.order_id));
  assert(order.status === 'PAID', `AC-03: order after pause payment is ${order.status}`);

  return {
    draft_future_cutoff: ['SALE_CLOSED', 'SALE_CLOSED', 'SALE_CLOSED'],
    paused: { performance_id: pausePerf, after_pause_order: errorCode(afterPause.body), paid_order_id: order.order_id, status: order.status },
  };
}

async function ac04() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 8);
  assert(seats.length >= 6, 'AC-04: need 6 seats');
  const token = await login('buyer02');

  const tooMany = await createOrder(token, perf, seats.slice(0, 5).map((s) => s.session_seat_id), 'ac04-many');
  await expectError(tooMany, 409, 'LIMIT_EXCEEDED', 'AC-04 five seats');

  const empty = await api('POST', '/orders', { token, key: keyFor('ac04-empty'), body: { performance_id: perf, session_seat_ids: [] } });
  await expectError(empty, 400, 'VALIDATION_ERROR', 'AC-04 empty seats');

  const duplicate = await createOrder(token, perf, [seats[0].session_seat_id, seats[0].session_seat_id], 'ac04-dup');
  await expectError(duplicate, 400, 'VALIDATION_ERROR', 'AC-04 duplicate seats');

  const perfB = await createPerformance({ price: 10000 });
  const seatsB = await availableSeats(perfB, 2);
  const cross = await createOrder(token, perf, [seats[1].session_seat_id, seatsB[0].session_seat_id], 'ac04-cross');
  await expectError(cross, 409, 'SEAT_UNAVAILABLE', 'AC-04 cross performance');

  const orderCount = await q('SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND performance_id = ?', [await userId('buyer02'), perf]);
  assert(Number(orderCount[0].n) === 0, `AC-04: orders created despite failures: ${orderCount[0].n}`);
  const seatRows = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id IN (?, ?)', [seats[1].session_seat_id, seatsB[0].session_seat_id]);
  assert(seatRows.every((r) => r.session_seat_status === 'AVAILABLE'), 'AC-04: seats were changed');

  return { errors: ['LIMIT_EXCEEDED', 'VALIDATION_ERROR', 'VALIDATION_ERROR', 'SEAT_UNAVAILABLE'], order_count: 0, seats_unchanged: true };
}

async function ac06() {
  const perf = await createPerformance({ price: 10000 });
  const available = await availableSeats(perf, 3);
  assert(available.length >= 2, 'AC-06: need at least 2 seats');
  const winnerSeat = available[0].session_seat_id;
  await q(
    `UPDATE session_seats SET session_seat_status = 'BLOCKED'
      WHERE performance_id = ? AND session_seat_status = 'AVAILABLE' AND session_seat_id <> ?`,
    [perf, winnerSeat]
  );

  const users = [];
  const userTokens = [];
  for (let i = 1; i <= 100; i += 1) {
    const name = `ac06${PREFIX.slice(-4).toLowerCase()}${String(i).padStart(3, '0')}`.slice(0, 20);
    users.push(name);
    userTokens.push(await ensureUser(name));
  }

  const wave = await Promise.all(userTokens.map((token, idx) => createOrder(token, perf, [winnerSeat], `ac06-${idx}`)));
  const codes = wave.map((r) => r.status);
  const errors = wave.filter((r) => r.status >= 500);
  const success = wave.filter((r) => [200, 201].includes(r.status));
  const conflicts = wave.filter((r) => r.status === 409);
  assert(errors.length === 0, `AC-06: ${errors.length} HTTP 5xx under 100-way concurrency: ${errors.map((r) => r.raw.slice(0, 200)).join(' | ')}`);
  assert(success.length === 1, `AC-06: expected exactly 1 success, got ${success.length}; statuses=${codes.join(',')}`);

  const dbOrders = await q('SELECT order_id, status FROM orders WHERE performance_id = ? ORDER BY order_id', [perf]);
  assert(dbOrders.length === 1, `AC-06: DB has ${dbOrders.length} orders`);
  const seat = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [winnerSeat]);
  assert(seat[0].session_seat_status === 'HELD', `AC-06: winner seat ${seat[0].session_seat_status}`);

  return {
    attempts: 100,
    success: success.length,
    conflict_409: conflicts.length,
    http_5xx: 0,
    db_orders: dbOrders.length,
    seat_status: seat[0].session_seat_status,
    sample_conflict_codes: [...new Set(conflicts.map((r) => errorCode(r.body)))],
  };
}

async function ac07() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 3);
  assert(seats.length >= 3, 'AC-07: need 3 seats');
  await q("UPDATE session_seats SET session_seat_status = 'SOLD' WHERE session_seat_id = ?", [seats[1].session_seat_id]);
  const token = await login('buyer03');
  const res = await createOrder(token, perf, [seats[0].session_seat_id, seats[1].session_seat_id, seats[2].session_seat_id], 'ac07');
  await expectError(res, 409, 'SEAT_UNAVAILABLE', 'AC-07 partial group');

  const orders = await q('SELECT COUNT(*) AS n FROM orders WHERE performance_id = ?', [perf]);
  assert(Number(orders[0].n) === 0, `AC-07: order partially created: ${orders[0].n}`);
  const rows = await q('SELECT session_seat_id, session_seat_status FROM session_seats WHERE session_seat_id IN (?, ?)', [seats[0].session_seat_id, seats[2].session_seat_id]);
  assert(rows.every((r) => r.session_seat_status === 'AVAILABLE'), 'AC-07: sibling seats changed');

  return { order_count: 0, sibling_seats: rows.map((r) => r.session_seat_status), blocked_seat: 'SOLD (pre-set)' };
}

async function ac08() {
  const buyer = 'buyer04';
  const token = await login(buyer);
  const tokens = [];
  const orderIds = [];
  const perfIds = [];
  const seatIds = [];
  for (let i = 0; i < 3; i += 1) {
    const perf = await createPerformance({ price: 10000 });
    const seat = (await availableSeats(perf, 1))[0];
    const res = await createOrder(token, perf, [seat.session_seat_id], `ac08-${i}`);
    const data = await expectStatus(res, [200, 201], `AC-08 order ${i}`);
    perfIds.push(perf);
    seatIds.push(seat.session_seat_id);
    orderIds.push(Number(data.order_id));
  }
  const keyRows = await q('SELECT order_id, idempotency_key FROM orders WHERE order_id IN (?, ?, ?)', orderIds);
  for (const row of keyRows) tokens.push(row.idempotency_key);
  assert(tokens.length === 3 && !tokens.includes(null), 'AC-08: order rows missing idempotency_key');

  for (const orderId of orderIds) await forceExpired(orderId, 300);
  const workerSql = "SELECT order_id, status FROM orders WHERE order_id IN (?, ?, ?) AND status = 'PENDING_PAYMENT'";
  let before = await q(workerSql, orderIds);
  assert(before.length === 3, `AC-08: expected 3 pending before worker, got ${before.length}`);

  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    before = await q(workerSql, orderIds);
    if (before.length === 0) break;
  }
  const expired = await q('SELECT order_id, status FROM orders WHERE order_id IN (?, ?, ?)', orderIds);
  assert(expired.every((r) => r.status === 'EXPIRED'), `AC-08: not all expired: ${expired.map((r) => r.order_id + ':' + r.status).join(',')}`);
  const seatRows = await q('SELECT session_seat_status, COUNT(*) AS n FROM session_seats WHERE session_seat_id IN (?, ?, ?) GROUP BY session_seat_status', seatIds);
  assert(seatRows.length === 1 && seatRows[0].session_seat_status === 'AVAILABLE' && Number(seatRows[0].n) === 3, `AC-08: seats not released: ${JSON.stringify(seatRows)}`);

  return { performance_ids: perfIds, orders: orderIds, statuses: expired, released_seats: 3, idempotency_keys: tokens };
}

async function ac09() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 2);
  assert(seats.length >= 2, 'AC-09: need 2 seats');
  const paid = await paidOrder('buyer17', perf, [seats[0].session_seat_id, seats[1].session_seat_id], 'ac09');
  const order = await dbOrder(paid.orderId);
  const items = await q('SELECT price_snapshot FROM order_items WHERE order_id = ? ORDER BY order_item_id', [paid.orderId]);
  const attempt = await q('SELECT amount, currency, result, handling_category FROM payment_attempts WHERE attempt_id = ?', [paid.paymentId]);
  const ticketRows = await q(
    `SELECT t.ticket_id, t.status FROM tickets t
       JOIN order_items oi ON oi.order_item_id = t.order_item_id
      WHERE oi.order_id = ?`,
    [paid.orderId]
  );
  const itemSum = items.reduce((acc, x) => acc + Number(x.price_snapshot), 0);
  assert(order.status === 'PAID', `AC-09: order ${order.status}`);
  assert(attempt.length && attempt[0].result === 'SUCCEEDED' && attempt[0].handling_category === 'NORMAL', 'AC-09: payment not normal success');
  assert(Number(attempt[0].amount) === Number(order.total_amount), 'AC-09: payment amount != order total');
  assert(itemSum === Number(order.total_amount), `AC-09: item sum ${itemSum} != total ${order.total_amount}`);
  assert(ticketRows.length === 2 && ticketRows.every((t) => t.status === 'VALID'), 'AC-09: tickets not exactly 2 VALID');
  const seatRows = await q('SELECT session_seat_status, COUNT(*) AS n FROM session_seats WHERE session_seat_id IN (?, ?) GROUP BY session_seat_status', [seats[0].session_seat_id, seats[1].session_seat_id]);
  assert(seatRows.length === 1 && seatRows[0].session_seat_status === 'SOLD' && Number(seatRows[0].n) === 2, `AC-09: seats ${JSON.stringify(seatRows)}`);

  return { order_id: paid.orderId, total_amount: Number(order.total_amount), item_sum: itemSum, tickets: ticketRows.length, seats: 2, payment_status: attempt[0].result };
}

async function ac10() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 2);
  const buyer = 'buyer18';
  const token = await login(buyer);
  const orderRes = await createOrder(token, perf, [seats[0].session_seat_id], 'ac10');
  const orderData = await expectStatus(orderRes, [200, 201], 'AC-10 order');
  const orderId = Number(orderData.order_id);
  const payment = await createPayment(token, orderId, 'ac10-pay');
  const paymentId = Number(payment.payment_id);
  const order = await dbOrder(orderId);
  const attempt = await q('SELECT amount, currency FROM payment_attempts WHERE attempt_id = ?', [paymentId]);
  const orderNoValue = orderNo(orderId, order.created_at);
  const base = { payment_id: paymentId, order_no: orderNoValue, amount_cents: Number(attempt[0].amount), currency: attempt[0].currency };
  const notifySuccess = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-SUCCESS'), result: 'SUCCESS' }));
  await expectStatus(notifySuccess, 200, 'AC-10 first notification');
  const duplicate = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-SUCCESS'), result: 'SUCCESS' }));
  await expectStatus(duplicate, 200, 'AC-10 duplicate notification');
  const lateFail = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-FAIL'), result: 'FAIL' }));
  await expectStatus(lateFail, 200, 'AC-10 late FAIL notification');

  const before = await q('SELECT COUNT(*) AS n FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id WHERE oi.order_id = ?', [orderId]);
  for (let i = 0; i < 3; i += 1) {
    await expectStatus(await api('GET', `/payments/${paymentId}`, { token }), 200, `AC-10 refresh ${i}`);
  }
  const after = await q('SELECT COUNT(*) AS n FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id WHERE oi.order_id = ?', [orderId]);
  const attempts = await q('SELECT attempt_id, result, handling_category FROM payment_attempts WHERE order_id = ?', [orderId]);
  const orderAfter = await dbOrder(orderId);
  assert(Number(before[0].n) === 1 && Number(after[0].n) === 1, `AC-10: ticket count ${before[0].n} -> ${after[0].n}`);
  assert(attempts.length === 1 && attempts[0].result === 'SUCCEEDED', 'AC-10: attempt changed');
  assert(orderAfter.status === 'PAID', `AC-10: order ${orderAfter.status}`);

  return { order_id: orderId, payment_id: paymentId, tickets_before: before[0].n, tickets_after: after[0].n, attempts: attempts.length, order_status: orderAfter.status, duplicate_notification: '200' };
}

async function ac11() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 2);
  const buyer = 'buyer08';
  const token = await login(buyer);
  const orderRes = await createOrder(token, perf, [seats[0].session_seat_id], 'ac11');
  const orderId = Number((await expectStatus(orderRes, [200, 201], 'AC-11 order')).order_id);
  const payment = await createPayment(token, orderId, 'ac11-pay');
  const paymentId = Number(payment.payment_id);
  const order = await dbOrder(orderId);
  const attempt = await q('SELECT amount, currency FROM payment_attempts WHERE attempt_id = ?', [paymentId]);
  const orderNoValue = orderNo(orderId, order.created_at);
  const base = { payment_id: paymentId, order_no: orderNoValue, amount_cents: Number(attempt[0].amount), currency: attempt[0].currency };

  const badSig = await api('POST', '/payments/notify', {
    raw: JSON.stringify({ ...base, provider_txn_id: uniq('TX-BADSIG'), result: 'SUCCESS' }),
    headers: { 'Content-Type': 'application/json', 'X-Signature': 'sha256=' + '0'.repeat(64) },
  });
  await expectError(badSig, 401, 'UNAUTHORIZED', 'AC-11 bad signature');

  const wrongAmount = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-AMT'), amount_cents: base.amount_cents + 1, result: 'SUCCESS' }));
  await expectError(wrongAmount, 409, 'PAYMENT_MISMATCH', 'AC-11 wrong amount');

  const wrongCurrency = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-CUR'), currency: 'USD', result: 'SUCCESS' }));
  await expectError(wrongCurrency, 409, 'PAYMENT_MISMATCH', 'AC-11 wrong currency');

  const wrongOrderNo = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-ORD'), order_no: 'TIX-19700101-999999', result: 'SUCCESS' }));
  await expectError(wrongOrderNo, 409, 'PAYMENT_MISMATCH', 'AC-11 wrong order number');

  const rejected = await q("SELECT processed_result, COUNT(*) AS n FROM payment_notifications WHERE payment_attempt_id = ? AND processed_result = 'REJECTED' GROUP BY processed_result", [paymentId]);
  assert(rejected.length && Number(rejected[0].n) >= 3, `AC-11: rejected records ${JSON.stringify(rejected)}`);

  const good = await note(JSON.stringify({ ...base, provider_txn_id: uniq('TX-OK'), result: 'SUCCESS' }));
  await expectStatus(good, 200, 'AC-11 valid notification');
  const after = await dbOrder(orderId);
  const notification = await q("SELECT processed_result FROM payment_notifications WHERE payment_attempt_id = ? AND processed_result = 'APPLIED' LIMIT 1", [paymentId]);
  assert(after.status === 'PAID', `AC-11: order ${after.status}`);
  assert(notification.length === 1, 'AC-11: no APPLIED notification');

  return { rejected_records: Number(rejected[0].n), final_order_status: after.status, applied_notification: true };
}

async function ac12() {
  const buyer = 'buyer09';
  const token = await login(buyer);

  const perfBefore = await createPerformance({ price: 10000 });
  const seatBefore = (await availableSeats(perfBefore, 1))[0];
  const beforePay = await paidOrder(buyer, perfBefore, [seatBefore.session_seat_id], 'ac12-before');

  const perfAt = await createPerformance({ price: 10000 });
  const seatAt = (await availableSeats(perfAt, 1))[0];
  const atOrderRes = await createOrder(token, perfAt, [seatAt.session_seat_id], 'ac12-at');
  const atOrderId = Number((await expectStatus(atOrderRes, [200, 201], 'AC-12 at order')).order_id);
  const atPayment = await createPayment(token, atOrderId, 'ac12-atpay');
  await forceExpired(atOrderId, 1);
  const atSim = await simulate(token, Number(atPayment.payment_id), 'SUCCESS');
  await expectError(atSim, 409, 'ORDER_EXPIRED', 'AC-12 at deadline');
  const atRefund = await q("SELECT refund_id, status, amount FROM refunds WHERE order_id = ? ORDER BY refund_id DESC LIMIT 1", [atOrderId]);
  const atTicket = await ticketForOrder(atOrderId);
  const atSeat = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [seatAt.session_seat_id]);
  assert(atRefund.length === 1 && atRefund[0].status === 'PENDING', 'AC-12: no pending refund at deadline');
  assert(!atTicket, 'AC-12: ticket issued at deadline');
  assert(atSeat[0].session_seat_status === 'AVAILABLE', `AC-12: seat not released: ${atSeat[0].session_seat_status}`);

  const perfAfter = await createPerformance({ price: 10000 });
  const seatsAfter = await availableSeats(perfAfter, 2);
  const afterOrderRes = await createOrder(token, perfAfter, [seatsAfter[0].session_seat_id], 'ac12-after');
  const afterOrderId = Number((await expectStatus(afterOrderRes, [200, 201], 'AC-12 after order')).order_id);
  const afterPayment = await createPayment(token, afterOrderId, 'ac12-afterpay');
  await forceExpired(afterOrderId, 120);
  const [simRes, newOrderRes] = await Promise.all([
    simulate(token, Number(afterPayment.payment_id), 'SUCCESS'),
    createOrder(token, perfAfter, [seatsAfter[1].session_seat_id], 'ac12-new'),
  ]);
  await expectError(simRes, 409, 'ORDER_EXPIRED', 'AC-12 after cutoff concurrent simulate');
  const newOrderData = await expectStatus(newOrderRes, [200, 201], 'AC-12 new order concurrent cleanup');
  const lateRefund = await q("SELECT refund_id, status, amount FROM refunds WHERE order_id = ? ORDER BY refund_id DESC LIMIT 1", [afterOrderId]);
  const lateTicket = await ticketForOrder(afterOrderId);
  assert(lateRefund.length === 1 && lateRefund[0].status === 'PENDING', 'AC-12: late refund missing');
  assert(!lateTicket, 'AC-12: late ticket issued');
  const originalSeat = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [seatsAfter[0].session_seat_id]);
  assert(originalSeat[0].session_seat_status === 'HELD' || originalSeat[0].session_seat_status === 'AVAILABLE', `AC-12: original seat ${originalSeat[0].session_seat_status}`);

  return {
    before: { order_id: beforePay.orderId, status: 'PAID' },
    at_deadline: { order_id: atOrderId, refund_id: atRefund[0].refund_id, refund: atRefund[0].status, ticket: false, seat: atSeat[0].session_seat_status },
    after_deadline: { order_id: afterOrderId, refund_id: lateRefund[0].refund_id, refund: lateRefund[0].status, ticket: false, concurrent_new_order: Number(newOrderData.order_id) },
  };
}

async function ac13() {
  const buyer = 'buyer11';
  const token = await login(buyer);

  const expiredPerf = await createPerformance({ price: 10000 });
  const expiredSeat = (await availableSeats(expiredPerf, 1))[0];
  const eOrderRes = await createOrder(token, expiredPerf, [expiredSeat.session_seat_id], 'ac13-exp');
  const eOrderId = Number((await expectStatus(eOrderRes, [200, 201], 'AC-13 expired order')).order_id);
  const ePay = await createPayment(token, eOrderId, 'ac13-exp-pay');
  await forceExpired(eOrderId, 180);
  const eSim = await simulate(token, Number(ePay.payment_id), 'SUCCESS');
  await expectError(eSim, 409, 'ORDER_EXPIRED', 'AC-13 expired payment');
  const eRefund = await q("SELECT refund_id, status FROM refunds WHERE order_id = ? ORDER BY refund_id DESC LIMIT 1", [eOrderId]);
  const eTicket = await ticketForOrder(eOrderId);
  const eOrder = await dbOrder(eOrderId);
  assert(eOrder.status === 'EXPIRED', `AC-13: expired order ${eOrder.status}`);
  assert(eRefund.length === 1 && eRefund[0].status === 'PENDING', 'AC-13: expired refund missing');
  assert(!eTicket, 'AC-13: expired ticket');

  const cancelledPerf = await createPerformance({ price: 10000 });
  const cancelledSeat = (await availableSeats(cancelledPerf, 1))[0];
  const cOrderRes = await createOrder(token, cancelledPerf, [cancelledSeat.session_seat_id], 'ac13-can');
  const cOrderId = Number((await expectStatus(cOrderRes, [200, 201], 'AC-13 cancel order')).order_id);
  const cPay = await createPayment(token, cOrderId, 'ac13-can-pay');
  const cancel = await api('POST', `/orders/${cOrderId}/cancel`, { token, key: keyFor('ac13-cancel'), body: { reason: 'AC-13 test' } });
  await expectStatus(cancel, 200, 'AC-13 cancel');
  const cSim = await simulate(token, Number(cPay.payment_id), 'SUCCESS');
  await expectError(cSim, 409, 'ORDER_EXPIRED', 'AC-13 cancelled late payment');
  const cRefund = await q("SELECT refund_id, status FROM refunds WHERE order_id = ? ORDER BY refund_id DESC LIMIT 1", [cOrderId]);
  const cOrder = await dbOrder(cOrderId);
  const cSeat = await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [cancelledSeat.session_seat_id]);
  assert(cOrder.status === 'CANCELLED', `AC-13: cancelled order ${cOrder.status}`);
  assert(cRefund.length === 1 && cRefund[0].status === 'PENDING', 'AC-13: cancelled refund missing');
  assert(cSeat[0].session_seat_status === 'AVAILABLE', `AC-13: cancelled seat ${cSeat[0].session_seat_status}`);

  const normalPerf = await createPerformance({ price: 10000 });
  const normalSeat = (await availableSeats(normalPerf, 1))[0];
  const normal = await paidOrder('buyer12', normalPerf, [normalSeat.session_seat_id], 'ac13-normal');
  const retry = await api('POST', '/payments', { token: normal.token, key: keyFor('ac13-retry'), body: { order_id: normal.orderId } });
  await expectError(retry, 409, 'ORDER_NOT_PAYABLE', 'AC-13 retry normal payment');
  const normalTickets = await q('SELECT COUNT(*) AS n FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id WHERE oi.order_id = ?', [normal.orderId]);
  assert(Number(normalTickets[0].n) === 1, `AC-13: retry issued extra ticket: ${normalTickets[0].n}`);

  return {
    expired: { order_id: eOrderId, status: eOrder.status, refund_id: eRefund[0].refund_id, ticket: false },
    cancelled: { order_id: cOrderId, status: cOrder.status, refund_id: cRefund[0].refund_id, seat: cSeat[0].session_seat_status },
    normal: { order_id: normal.orderId, retry: errorCode(retry.body), tickets: Number(normalTickets[0].n) },
  };
}

async function ac18() {
  const perf = await createPerformance({ price: 10000, startsInMinutes: 30, saleStartInMinutes: -60, saleEndInMinutes: 15 });
  const seat = (await availableSeats(perf, 1))[0];
  const buyer = 'buyer19';
  const paid = await paidOrder(buyer, perf, [seat.session_seat_id], 'ac18');
  const ticket = await ticketForOrder(paid.orderId);
  assert(ticket, 'AC-18: no ticket');

  const checkers = ['checker01', 'checker02'];
  for (const name of checkers) {
    const uid = await userId(name);
    const grant = await api('POST', `/admin/users/${uid}/roles`, {
      token: await login('admin'),
      key: keyFor(`role-${name}`),
      body: { role: 'CHECKER', performance_id: perf },
    });
    await expectStatus(grant, [200, 201], `AC-18 grant ${name}`);
    tokens.delete(name);
    await login(name);
  }

  const detailRes = await api('GET', `/tickets/${ticket.ticket_id}`, { token: paid.token });
  const detail = await expectStatus(detailRes, 200, 'AC-18 ticket detail');
  assert(detail.qr_token, 'AC-18: no qr_token');

  const [r1, r2] = await Promise.all(checkers.map((name, idx) =>
    api('POST', '/admin/checkins', {
      token: tokens.get(name),
      key: keyFor(`checkin-${idx}`),
      body: { performance_id: perf, ticket_code: detail.qr_token },
    })
  ));
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  assert(statuses[0] === 200 && statuses[1] === 409, `AC-18: expected one 200 + one 409, got ${r1.status}/${r2.status}`);
  const conflict = r1.status === 409 ? r1 : r2;
  assert(errorCode(conflict.body) === 'TICKET_ALREADY_USED', `AC-18: conflict code ${errorCode(conflict.body)}`);

  const checkins = await q('SELECT checkin_id, ticket_id FROM checkins WHERE ticket_id = ?', [ticket.ticket_id]);
  assert(checkins.length === 1, `AC-18: checkins=${checkins.length}`);
  const ticketRow = await q('SELECT status FROM tickets WHERE ticket_id = ?', [ticket.ticket_id]);
  assert(ticketRow[0].status === 'USED', `AC-18: ticket ${ticketRow[0].status}`);

  const statsItem = await stats(perf);
  assert(statsItem.checked_in === 1, `AC-18: stats checked_in=${statsItem.checked_in}`);

  return { ticket_id: ticket.ticket_id, statuses, conflict_code: errorCode(conflict.body), checkins: checkins.length, ticket_status: ticketRow[0].status, checked_in: statsItem.checked_in };
}

async function ac20() {
  const perf = await createPerformance({ price: 11000 });
  const seat = (await availableSeats(perf, 1))[0];
  const buyer = 'buyer13';
  const token = await login(buyer);

  const beforeRes = await createOrder(token, perf, [seat.session_seat_id], 'ac20-before');
  const beforeOrderId = Number((await expectStatus(beforeRes, [200, 201], 'AC-20 before order')).order_id);
  const beforeOrder = await dbOrder(beforeOrderId);
  const beforeItem = await q('SELECT price_snapshot FROM order_items WHERE order_id = ?', [beforeOrderId]);

  const tier = await q('SELECT tier_id, tier_name, current_price FROM price_tiers WHERE performance_id = ? ORDER BY tier_id LIMIT 1', [perf]);
  const newPrice = 30000;
  const update = await api('PATCH', `/admin/performances/${perf}/price-tiers`, {
    token: await login('admin'),
    key: keyFor('ac20-price'),
    body: { tiers: [{ tier_id: Number(tier[0].tier_id), tier_name: tier[0].tier_name, price_cents: newPrice }] },
  });
  await expectStatus(update, 200, 'AC-20 price update');
  const cancel = await api('POST', `/orders/${beforeOrderId}/cancel`, { token, key: keyFor('ac20-cancel'), body: { reason: 'AC-20 price test' } });
  await expectStatus(cancel, 200, 'AC-20 cancel before order');

  const afterOrderRes = await createOrder(token, perf, [seat.session_seat_id], 'ac20-after');
  const afterOrderId = Number((await expectStatus(afterOrderRes, [200, 201], 'AC-20 after order')).order_id);
  const afterOrder = await dbOrder(afterOrderId);
  const afterItem = await q('SELECT price_snapshot FROM order_items WHERE order_id = ?', [afterOrderId]);
  assert(Number(beforeItem[0].price_snapshot) === 11000, `AC-20: before snapshot ${beforeItem[0].price_snapshot}`);
  assert(Number(beforeOrder.total_amount) === 11000, `AC-20: before total ${beforeOrder.total_amount}`);
  assert(Number(afterItem[0].price_snapshot) === newPrice, `AC-20: after snapshot ${afterItem[0].price_snapshot}`);
  assert(Number(afterOrder.total_amount) === newPrice, `AC-20: after total ${afterOrder.total_amount}`);

  const payment = await createPayment(token, afterOrderId, 'ac20-pay');
  await expectStatus(await simulate(token, Number(payment.payment_id), 'SUCCESS'), 200, 'AC-20 pay');
  const refundReq = await api('POST', `/orders/${afterOrderId}/refund`, { token, key: keyFor('ac20-refund'), body: { reason: 'AC-20 refund' } });
  const refundData = await expectStatus(refundReq, [200, 201], 'AC-20 refund request');
  const refundId = Number(refundData.refund_id);
  const refundRow = await q('SELECT refund_id, amount, status FROM refunds WHERE refund_id = ?', [refundId]);
  assert(Number(refundRow[0].amount) === newPrice, `AC-20: refund amount ${refundRow[0].amount}`);
  const resolve = await resolveRefund(refundId, 'SUCCEEDED', 'ac20');
  await expectStatus(resolve, 200, 'AC-20 refund resolve');
  const ticket = await ticketForOrder(afterOrderId);
  const afterRefundOrder = await dbOrder(afterOrderId);
  assert(afterRefundOrder.status === 'REFUNDED', `AC-20: order after refund ${afterRefundOrder.status}`);
  assert(ticket && ticket.status === 'VOID', 'AC-20: ticket not VOID');

  return {
    before: { order_id: beforeOrderId, total: Number(beforeOrder.total_amount), snapshot: Number(beforeItem[0].price_snapshot), cancelled: true },
    after: { order_id: afterOrderId, total: Number(afterOrder.total_amount), snapshot: Number(afterItem[0].price_snapshot), refund_amount: Number(refundRow[0].amount), ticket: ticket.status },
  };
}

async function ac21() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 2);
  const buyerA = 'buyer20';
  const buyerB = 'buyer21';
  const a = await paidOrder(buyerA, perf, [seats[0].session_seat_id], 'ac21-a');
  const b = await paidOrder(buyerB, perf, [seats[1].session_seat_id], 'ac21-b');

  const s0 = await stats(perf);
  assert(s0.gross_cents === 20000 && s0.tickets_sold === 2 && s0.refunded_cents === 0 && s0.net_cents === 20000, `AC-21: baseline ${JSON.stringify(s0)}`);

  const refundReq = await api('POST', `/orders/${a.orderId}/refund`, { token: a.token, key: keyFor('ac21-refund'), body: { reason: 'AC-21 refund' } });
  const refundData = await expectStatus(refundReq, [200, 201], 'AC-21 refund request');
  const refundId = Number(refundData.refund_id);
  const sPending = await stats(perf);
  assert(sPending.gross_cents === 20000 && sPending.tickets_sold === 2 && sPending.refunded_cents === 0 && sPending.net_cents === 20000, `AC-21: pending ${JSON.stringify(sPending)}`);

  await expectStatus(await resolveRefund(refundId, 'SUCCEEDED', 'ac21'), 200, 'AC-21 resolve');
  const sRefunded = await stats(perf);
  assert(sRefunded.gross_cents === 20000 && sRefunded.tickets_sold === 1 && sRefunded.refunded_cents === 10000 && sRefunded.net_cents === 10000, `AC-21: refunded ${JSON.stringify(sRefunded)}`);

  const dup = await resolveRefund(refundId, 'SUCCEEDED', 'ac21-dup');
  await expectStatus(dup, 200, 'AC-21 duplicate resolve');
  const sDup = await stats(perf);
  assert(JSON.stringify(sDup) === JSON.stringify(sRefunded), 'AC-21: duplicate resolve changed stats');

  return { baseline: s0, pending: sPending, refunded: sRefunded, duplicate: sDup, refund_id: refundId };
}

async function ac23() {
  const perf = await createPerformance({ price: 10000 });
  const seats = await availableSeats(perf, 4);
  assert(seats.length >= 3, 'AC-23: need 3 seats');
  const token = await login('buyer22');
  const reqs = seats.slice(0, 3).map((s, i) => createOrder(token, perf, [s.session_seat_id], `ac23-${i}`));
  const results = await Promise.all(reqs);
  const success = results.filter((r) => [200, 201].includes(r.status));
  const conflicts = results.filter((r) => r.status === 409);
  assert(success.length === 1, `AC-23: expected 1 success, got ${success.length}; statuses=${results.map((r) => r.status).join(',')}`);
  assert(conflicts.length === 2 && conflicts.every((r) => errorCode(r.body) === 'LIMIT_EXCEEDED'), `AC-23: conflict codes ${conflicts.map((r) => errorCode(r.body)).join(',')}`);

  const orders = await q("SELECT order_id, status FROM orders WHERE performance_id = ? AND status = 'PENDING_PAYMENT'", [perf]);
  assert(orders.length === 1, `AC-23: pending orders ${orders.length}`);
  const rows = await q('SELECT session_seat_status, COUNT(*) AS n FROM session_seats WHERE session_seat_id IN (?, ?, ?) GROUP BY session_seat_status', seats.slice(0, 3).map((s) => s.session_seat_id));
  const held = rows.find((r) => r.session_seat_status === 'HELD');
  const avail = rows.find((r) => r.session_seat_status === 'AVAILABLE');
  assert(held && Number(held.n) === 1 && avail && Number(avail.n) === 2, `AC-23: seats ${JSON.stringify(rows)}`);

  return { order_id: Number(success[0].body.data.order_id), pending_orders: orders.length, conflict_codes: conflicts.map((r) => errorCode(r.body)), held: Number(held.n), available: Number(avail.n) };
}

async function ac25() {
  const perf = await createPerformance({ price: 10000 });
  const row1 = await seatsInRow(perf, 'A', '1');
  assert(row1.length === 20, `AC-25: expected 20 A-1 seats, got ${row1.length}`);
  await q(
    `UPDATE session_seats ss
       JOIN seats s ON s.seat_id = ss.seat_id
        SET ss.session_seat_status = 'BLOCKED'
      WHERE ss.performance_id = ? AND s.region = 'A'
        AND CAST(s.row_no AS UNSIGNED) BETWEEN 2 AND 4`,
    [perf]
  );
  const blockedSeat = row1.find((seat) => seat.seat_no === '3');
  const soldSeat = row1.find((seat) => seat.seat_no === '7');
  await q("UPDATE session_seats SET session_seat_status = 'BLOCKED' WHERE session_seat_id = ?", [blockedSeat.session_seat_id]);
  await q("UPDATE session_seats SET session_seat_status = 'SOLD' WHERE session_seat_id = ?", [soldSeat.session_seat_id]);

  const countsBefore = await seatStatus(perf);
  const recRes = await api('GET', `/performances/${perf}/seat-recommendations?party_size=3&region=A&budget_cents=30000&limit=3`);
  const rec = await expectStatus(recRes, 200, 'AC-25 recommendation');
  assert(rec.recommendations.length >= 1, 'AC-25: no recommendation returned');
  const first = rec.recommendations[0];
  assert(first.seats.length === 3, `AC-25: group size ${first.seats.length}`);
  assert(first.total_amount_cents <= 30000, `AC-25: budget exceeded ${first.total_amount_cents}`);
  assert(first.seats.every((seat) => seat.region === 'A'), 'AC-25: crossed region');
  assert(first.seats.every((seat) => seat.row_no === '1'), 'AC-25: crossed row');
  assert(first.seats.every((seat) => seat.seat_label !== seatKey(blockedSeat) && seat.seat_label !== seatKey(soldSeat)), 'AC-25: included blocked/sold seat');
  for (let i = 1; i < first.seats.length; i += 1) {
    const prev = Number(first.seats[i - 1].seat_no);
    const next = Number(first.seats[i].seat_no);
    assert(next === prev + 1, `AC-25: non-consecutive seats ${prev},${next}`);
    assert(![5, 10, 15].includes(prev), `AC-25: crossed aisle after seat ${prev}`);
  }
  const firstLabels = first.seats.map((seat) => seat.seat_label);
  const recAgain = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=3&region=A&budget_cents=30000&limit=3`),
    200,
    'AC-25 deterministic repeat'
  );
  assert(
    JSON.stringify(recAgain.recommendations[0].seats.map((seat) => seat.seat_label)) === JSON.stringify(firstLabels),
    'AC-25: recommendation is not deterministic'
  );
  const countsAfterRead = await seatStatus(perf);
  assert(JSON.stringify(countsBefore) === JSON.stringify(countsAfterRead), 'AC-25: recommendation changed inventory');

  const lowBudget = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=3&region=A&budget_cents=29999&limit=3`),
    200,
    'AC-25 low budget'
  );
  assert(lowBudget.recommendations.length === 0 && lowBudget.total === 0, 'AC-25: budget was silently raised');

  const two = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=2&region=A&budget_cents=20000&limit=3`),
    200,
    'AC-25 party 2'
  );
  assert(two.recommendations[0].seats.length === 2 && two.recommendations[0].total_amount_cents === 20000, 'AC-25: party-of-2 mismatch');
  const four = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=4&region=A&budget_cents=40000&limit=3`),
    200,
    'AC-25 party 4'
  );
  assert(four.recommendations[0].seats.length === 4 && four.recommendations[0].total_amount_cents === 40000, 'AC-25: party-of-4 mismatch');
  for (const [label, qs] of [
    ['party 1', 'party_size=1&region=A'],
    ['missing region', 'party_size=2'],
    ['zero budget', 'party_size=2&region=A&budget_cents=0'],
    ['limit 11', 'party_size=2&region=A&limit=11'],
  ]) {
    await expectError(
      await api('GET', `/performances/${perf}/seat-recommendations?${qs}`),
      400,
      'VALIDATION_ERROR',
      `AC-25 ${label}`
    );
  }
  await expectError(
    await api('GET', '/performances/99999999/seat-recommendations?party_size=2&region=A'),
    404,
    'NOT_FOUND',
    'AC-25 unknown performance'
  );

  const buyerA = await login('buyer25');
  const takenSeat = first.seats[1];
  const taken = await createOrder(buyerA, perf, [takenSeat.session_seat_id], 'ac25-take');
  await expectStatus(taken, [200, 201], 'AC-25 take one seat');
  const takenOrderId = Number(taken.body.data.order_id);

  const recAfterHold = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=3&region=A&budget_cents=30000&limit=3`),
    200,
    'AC-25 after hold'
  );
  assert(recAfterHold.recommendations.length >= 1, 'AC-25: no replacement recommendation');
  assert(
    recAfterHold.recommendations[0].seats.every((seat) => seat.session_seat_id !== takenSeat.session_seat_id),
    'AC-25: held seat still recommended'
  );

  const buyerB = await login('buyer26');
  const buyerC = await login('buyer27');
  const second = recAfterHold.recommendations[0];
  const blockerSeat = second.seats[0];
  await expectStatus(
    await createOrder(buyerC, perf, [blockerSeat.session_seat_id], 'ac25-blocker'),
    [200, 201],
    'AC-25 second hold'
  );
  const failedGroup = await createOrder(buyerB, perf, second.seats.map((seat) => seat.session_seat_id), 'ac25-fail');
  await expectError(failedGroup, 409, 'SEAT_UNAVAILABLE', 'AC-25 group recheck');
  const buyerBOrders = await q('SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND performance_id = ?', [await userId('buyer26'), perf]);
  assert(Number(buyerBOrders[0].n) === 0, `AC-25: partial order created for buyer26: ${buyerBOrders[0].n}`);
  const secondRows = await q(
    `SELECT session_seat_status FROM session_seats WHERE session_seat_id IN (${second.seats.map(() => '?').join(',')})`,
    second.seats.map((seat) => seat.session_seat_id)
  );
  const held = secondRows.filter((row) => row.session_seat_status === 'HELD').length;
  const available = secondRows.filter((row) => row.session_seat_status === 'AVAILABLE').length;
  assert(held === 1 && available === 2, `AC-25: failed group changed siblings ${JSON.stringify(secondRows)}`);

  const buyerD = await login('buyer28');
  const third = await expectStatus(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=3&region=A&budget_cents=30000&limit=3`),
    200,
    'AC-25 fresh recommendation'
  );
  const success = await expectStatus(
    await createOrder(buyerD, perf, third.recommendations[0].seats.map((seat) => seat.session_seat_id), 'ac25-success'),
    [200, 201],
    'AC-25 group success'
  );
  const successOrderId = Number(success.order_id);
  const successItems = await q('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?', [successOrderId]);
  assert(Number(successItems[0].n) === 3, `AC-25: success order items ${successItems[0].n}`);
  const successSeats = await q(
    `SELECT session_seat_status FROM session_seats WHERE session_seat_id IN (${third.recommendations[0].seats.map(() => '?').join(',')})`,
    third.recommendations[0].seats.map((seat) => seat.session_seat_id)
  );
  assert(successSeats.every((row) => row.session_seat_status === 'HELD'), 'AC-25: success group not all HELD');

  await q('UPDATE performances SET sale_end_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE performance_id = ?', [perf]);
  await expectError(
    await api('GET', `/performances/${perf}/seat-recommendations?party_size=2&region=A`),
    409,
    'SALE_CLOSED',
    'AC-25 closed sale'
  );

  return {
    performance_id: perf,
    blocked_seat: seatKey(blockedSeat),
    sold_seat: seatKey(soldSeat),
    first_recommendation: firstLabels,
    first_total_cents: first.total_amount_cents,
    budget_cents: 30000,
    low_budget_empty: true,
    party_size_2_seats: two.recommendations[0].seats.length,
    party_size_4_seats: four.recommendations[0].seats.length,
    invalid_queries_400: 4,
    unknown_performance_404: true,
    closed_sale_409: true,
    held_order_id: takenOrderId,
    held_seat: takenSeat.seat_label,
    second_recommendation: second.seats.map((seat) => seat.seat_label),
    failed_group_status: 409,
    buyer26_order_count: Number(buyerBOrders[0].n),
    failed_group_seat_states: secondRows.map((row) => row.session_seat_status),
    success_order_id: successOrderId,
    success_group_seats: 3,
    success_group_all_held: true,
  };
}

const CASES = {
  'AC-01': { title: 'Authorization bypass and role boundaries', run: ac01 },
  'AC-02': { title: 'Independent seat inventory for the same physical seat across performances', run: ac02 },
  'AC-03': { title: 'Sales status and time windows', run: ac03 },
  'AC-04': { title: 'Seat selection validation and cross-performance rejection', run: ac04 },
  'AC-06': { title: '100 concurrent requests for the last ticket', run: ac06 },
  'AC-07': { title: 'Atomicity of a seat group', run: ac07 },
  'AC-08': { title: 'Automatic release of expired orders', run: ac08 },
  'AC-09': { title: 'Successful payment, ticket issuance, and ledger consistency', run: ac09 },
  'AC-10': { title: 'Notification idempotency and out-of-order delivery', run: ac10 },
  'AC-11': { title: 'Payment notification signature, amount, and currency validation', run: ac11 },
  'AC-12': { title: 'Payment rules at the cutoff', run: ac12 },
  'AC-13': { title: 'Duplicate payment protection for invalid orders', run: ac13 },
  'AC-18': { title: 'Concurrent check-in of the same ticket occurs only once', run: ac18 },
  'AC-20': { title: 'Price snapshot and refund amount', run: ac20 },
  'AC-21': { title: 'Refund statistics increment', run: ac21 },
  'AC-23': { title: 'Concurrent order limit per user', run: ac23 },
  'AC-25': { title: 'Group adjacent-seat recommendation and recheck after contention', run: ac25 },
};

async function main() {
  const requested = argCases();
  const unknown = requested.filter((id) => !CASES[id]);
  assert(!unknown.length, `unknown cases: ${unknown.join(', ')}`);

  pool = mysql.createPool({ ...DB, connectionLimit: 5, charset: 'utf8mb4' });
  await q('SELECT 1');
  const health = await api('GET', '/health');
  await expectStatus(health, 200, 'health');

  console.log(`[AC] base=${BASE} db=${DB.database} out=${OUT}`);
  const results = [];
  for (const id of requested) {
    const started = Date.now();
    console.log(`[AC] running ${id} ${CASES[id].title}`);
    try {
      const evidence = await CASES[id].run();
      results.push({ id, title: CASES[id].title, status: 'PASS', duration_ms: Date.now() - started, evidence });
      console.log(`[AC] PASS ${id} (${Date.now() - started} ms)`);
    } catch (err) {
      const detail = err && err.details !== undefined ? err.details : null;
      results.push({ id, title: CASES[id].title, status: 'FAIL', duration_ms: Date.now() - started, error: err.message, details: detail });
      console.error(`[AC] FAIL ${id}: ${err.message}`);
    }
  }

  const manifest = {
    version: 'v1.0',
    document_version: 'v1.0',
    run_at: new Date().toISOString(),
    run_id: RUN_ID,
    base: BASE,
    database: DB.database,
    out: OUT,
    requested,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
    },
    results,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(`[AC] summary ${manifest.summary.passed}/${manifest.summary.total} passed -> ${OUT}`);
  await pool.end();
  if (manifest.summary.failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error('[AC] fatal:', err);
  if (pool) await pool.end().catch(() => {});
  process.exitCode = 2;
});
