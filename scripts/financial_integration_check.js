'use strict';
// Runs only against the disposable CI database; exercises the actual HTTP API and InnoDB.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const mysql = serverRequire('mysql2/promise');
const base = process.env.BASE || 'http://127.0.0.1:3300';
const database = process.env.DB_NAME || 'ticketing_ac';
if (!/^ticketing_(?:ac|ci)(?:_|$)/.test(database)) throw new Error('Financial integration requires ticketing_ac or ticketing_ci');
let pool;
const key = () => crypto.randomUUID();
async function api(method, endpoint, { token, body, idempotencyKey, status = 200 } = {}) {
  const response = await fetch(base + endpoint, {
    method, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, status, method + ' ' + endpoint + ': ' + JSON.stringify(payload));
  return payload.data;
}
async function q(sql, params = []) { return (await pool.query(sql, params))[0]; }
async function login(user_name) {
  return (await api('POST', '/auth/login', { body: { user_name, password: 'Demo@1234' } })).token;
}
async function register(suffix) {
  const name = 'audit' + Date.now().toString(36) + suffix;
  await api('POST', '/auth/register', { body: { user_name: name, password: 'Demo@1234' }, status: 201 });
  return login(name);
}
async function reserve(token, perf, seat) {
  return api('POST', '/orders', { token, body: { performance_id: perf, session_seat_ids: [seat] }, idempotencyKey: key(), status: 201 });
}
async function payment(token, order) {
  return api('POST', '/payments', { token, body: { order_id: order.order_id }, status: 201 });
}
async function simulate(token, attempt, result, status = 200) {
  return api('POST', '/payments/' + attempt.payment_id + '/simulate', { token, body: { result }, status });
}
async function run() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database, timezone: 'Z',
  });
  const admin = await login('admin');
  const buyerA = await register('a'), buyerB = await register('b');
  const at = hours => new Date(Date.now() + hours * 3600000).toISOString();
  const draft = await api('POST', '/admin/performances', { token: admin, status: 201, body: {
    event_id: 1, venue_id: 1, starts_at: at(72), sale_start_at: at(-1), sale_end_at: at(48),
    checkin_start_at: at(71), checkin_end_at: at(74),
    price_tiers: [{ tier_name: 'Standard', price_cents: 10000 }],
  } });
  const perf = draft.performance_id;
  await api('GET', '/performances/' + perf + '/seats', { status: 404 });
  await api('GET', '/admin/performances/' + perf + '/seats', { status: 401 });
  await api('GET', '/admin/performances/' + perf + '/seats', { token: buyerA, status: 403 });
  const privateMap = await api('GET', '/admin/performances/' + perf + '/seats', { token: admin });
  assert.ok(privateMap.seats.length > 0);
  await api('POST', '/admin/performances/' + perf + '/publish', { token: admin });
  const seats = privateMap.seats.filter(s => s.status === 'AVAILABLE');
  assert.ok(seats.length >= 4);

  for (const [index, priorStatus] of ['EXPIRED', 'CANCELLED'].entries()) {
    const seat = seats[index].session_seat_id;
    const old = await reserve(buyerA, perf, seat);
    const oldPayment = await payment(buyerA, old);
    if (priorStatus === 'CANCELLED') await api('POST', '/orders/' + old.order_id + '/cancel', { token: buyerA });
    else await q("UPDATE orders SET created_at = UTC_TIMESTAMP(3) - INTERVAL 10 MINUTE, expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND WHERE order_id = ?", [old.order_id]);
    const resale = await reserve(buyerB, perf, seat);
    const resalePayment = await payment(buyerB, resale);
    await simulate(buyerB, resalePayment, 'SUCCESS');
    await simulate(buyerA, oldPayment, 'SUCCESS', 409);
    const refunds = await q("SELECT refund_id FROM refunds WHERE payment_attempt_id = ? AND status = 'PENDING'", [oldPayment.payment_id]);
    assert.equal(refunds.length, 1);
    const resolved = await api('POST', '/admin/refunds/' + refunds[0].refund_id + '/resolve', { token: admin, body: { result: 'SUCCEEDED' } });
    assert.equal(resolved.order_status, priorStatus);
    assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [seat]))[0].session_seat_status, 'SOLD');
    assert.equal((await api('GET', '/orders/' + resale.order_id, { token: buyerB })).status, 'PAID');
    assert.equal((await api('GET', '/orders/' + old.order_id, { token: buyerA })).status, priorStatus);
    const rows = await q('SELECT t.status FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id WHERE oi.order_id = ?', [resale.order_id]);
    assert.deepEqual(rows.map(t => t.status), ['VALID']);
    const settled = await simulate(buyerB, resalePayment, 'FAIL');
    assert.equal(settled.payment_status, 'SUCCEEDED');
    console.log('PASS late refund after ' + priorStatus + ' preserves the new buyer');
  }

  const order = await reserve(buyerA, perf, seats[2].session_seat_id);
  await simulate(buyerA, await payment(buyerA, order), 'SUCCESS');
  const refundKey = key();
  const endpoint = '/orders/' + order.order_id + '/refund';
  const requests = await Promise.all([0, 1].map(() => fetch(base + endpoint, {
    method: 'POST', headers: { Authorization: 'Bearer ' + buyerA, 'Idempotency-Key': refundKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Concurrent retry' }),
  })));
  assert.deepEqual(requests.map(r => r.status).sort(), [200, 201]);
  const responses = await Promise.all(requests.map(r => r.json()));
  assert.equal(responses[0].data.refund_id, responses[1].data.refund_id);
  const refundId = responses[0].data.refund_id;
  await api('POST', endpoint, { token: buyerB, idempotencyKey: refundKey, body: {}, status: 403 });
  await api('POST', '/admin/refunds/' + refundId + '/resolve', { token: admin, body: { result: 'SUCCEEDED' } });
  const replay = await api('POST', endpoint, { token: buyerA, idempotencyKey: refundKey, body: {} });
  assert.equal(replay.order_status, 'REFUNDED');
  assert.equal(replay.status, 'SUCCEEDED');
  console.log('PASS concurrent refund retries, ownership and final-state replay');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool?.end(); });
