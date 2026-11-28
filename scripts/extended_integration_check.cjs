'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const serverRequire = createRequire(path.resolve(__dirname, '../server/package.json'));
const mysql = serverRequire('mysql2/promise');
const WebSocket = serverRequire('ws');
const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const DB = process.env.DB_NAME || 'ticketing_ac';
if (!/^ticketing_(ac|ci)(_|$)/.test(DB)) throw new Error('Extended tests require a disposable database');
let pool;
const checks = [];
async function api(method, endpoint, { token, body, key, status = 200, origin } = {}) {
  const response = await fetch(BASE + endpoint, { method, headers: {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}),
    ...(origin ? { Origin: origin } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = await response.text(), payload = raw ? JSON.parse(raw) : null;
  assert.equal(response.status, status, method + ' ' + endpoint + ': ' + raw);
  return payload?.data;
}
async function q(sql, params = []) { return (await pool.query(sql, params))[0]; }
const key = () => crypto.randomUUID();
const at = hours => new Date(Date.now() + hours * 3600000).toISOString();
async function login(name) { return (await api('POST', '/auth/login', { body: { user_name: name, password: 'Demo@1234' } })).token; }
async function register(name) {
  await api('POST', '/auth/register', { body: { user_name: name, password: 'Demo@1234' }, status: 201 });
  return login(name);
}
async function event(admin, name) {
  return api('POST', '/admin/events', { token: admin, body: { name, organizer: 'Acceptance test', description: name }, status: 201 });
}
async function performance(admin, eventId, price, publish = true) {
  const result = await api('POST', '/admin/performances', { token: admin, status: 201, body: {
    event_id: eventId, venue_id: 1, starts_at: at(72), sale_start_at: at(-2), sale_end_at: at(48),
    checkin_start_at: at(-1), checkin_end_at: at(2), price_tiers: [{ tier_name: 'Standard', price_cents: price }],
  } });
  if (publish) await api('POST', '/admin/performances/' + result.performance_id + '/publish', { token: admin });
  return result.performance_id;
}
async function seats(id) { return (await api('GET', '/performances/' + id + '/seats')).seats.filter(s => s.status === 'AVAILABLE'); }
async function order(token, perf, seat) {
  return api('POST', '/orders', { token, key: key(), body: { performance_id: perf, session_seat_ids: [seat] }, status: 201 });
}
async function payment(token, orderId) { return api('POST', '/payments', { token, body: { order_id: orderId }, status: 201 }); }
async function success(token, paymentId, status = 200) { return api('POST', '/payments/' + paymentId + '/simulate', { token, body: { result: 'SUCCESS' }, status }); }
async function ticketRows(orderId) { return q('SELECT t.ticket_id, t.status FROM tickets t JOIN order_items oi ON oi.order_item_id = t.order_item_id WHERE oi.order_id = ?', [orderId]); }
async function main() {
  pool = mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: DB, timezone: 'Z' });
  const admin = await login('admin'), stamp = Date.now().toString(36);
  const legacy = await q(`SELECT r.refund_id, r.order_id FROM refunds r JOIN orders o ON o.order_id=r.order_id
    WHERE r.status='PENDING' AND o.status IN ('EXPIRED','CANCELLED') AND r.idempotency_key LIKE 'REF-%' LIMIT 1`);
  assert.equal(legacy.length, 1, 'legacy demonstration refund fixture exists');
  await api('POST', '/admin/refunds/' + legacy[0].refund_id + '/resolve', { token: admin, body: { result: 'FAILED' } });
  const legacyRetry = await api('POST', '/admin/refunds/' + legacy[0].refund_id + '/retry', { token: admin, key: key(), status: 201 });
  await api('POST', '/admin/refunds/' + legacyRetry.refund.refund_id + '/resolve', { token: admin, body: { result: 'SUCCEEDED' } });
  assert.equal((await q('SELECT status FROM orders WHERE order_id=?', [legacy[0].order_id]))[0].status, 'EXPIRED');
  checks.push('existing REF-* demonstration refunds can be retried without changing the expired order');
  const buyer = await register('ext' + stamp + 'a'), other = await register('ext' + stamp + 'b');
  const freeEventName = 'Browser Free ' + stamp, paidEventName = 'Browser Paid ' + stamp;
  const freeEvent = await event(admin, freeEventName), paidEvent = await event(admin, paidEventName);
  const free = await performance(admin, freeEvent.event_id, 0), paid = await performance(admin, paidEvent.event_id, 10000);
  const fsSeats = await seats(free), psSeats = await seats(paid);

  const held = await order(buyer, free, fsSeats[0].session_seat_id);
  await api('POST', '/orders/' + held.order_id + '/confirm-free', { token: other, status: 403 });
  await api('POST', '/payments', { token: buyer, body: { order_id: held.order_id }, status: 409 });
  const confirmed = await Promise.all([0, 1].map(() => api('POST', '/orders/' + held.order_id + '/confirm-free', { token: buyer })));
  assert.ok(confirmed.every(o => o.status === 'PAID' && o.is_free));
  assert.equal((await ticketRows(held.order_id)).length, 1);
  assert.equal((await q('SELECT COUNT(*) AS n FROM payment_attempts WHERE order_id = ?', [held.order_id]))[0].n, 0);
  const freeStats = (await api('GET', '/admin/stats?performance_id=' + free, { token: admin })).items[0];
  assert.equal(freeStats.gross_cents, 0);
  assert.equal(freeStats.tickets_sold, 1);
  await api('POST', '/orders/' + held.order_id + '/refund', { token: buyer, key: key(), body: {}, status: 409 });
  await api('POST', '/orders/' + held.order_id + '/cancel', { token: buyer });
  await api('POST', '/orders/' + held.order_id + '/cancel', { token: buyer });
  assert.equal((await ticketRows(held.order_id))[0].status, 'VOID');
  assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id = ?', [fsSeats[0].session_seat_id]))[0].session_seat_status, 'AVAILABLE');
  checks.push('free confirmation is atomic/idempotent; cancellation voids tickets and releases inventory without financial records');

  const used = await order(buyer, free, fsSeats[1].session_seat_id);
  const usedOrder = await api('POST', '/orders/' + used.order_id + '/confirm-free', { token: buyer });
  const ticket = await api('GET', '/tickets/' + usedOrder.tickets[0].ticket_id, { token: buyer });
  await api('POST', '/admin/checkins', { token: admin, key: key(), body: { performance_id: free, ticket_code: ticket.qr_token } });
  await api('POST', '/orders/' + used.order_id + '/cancel', { token: buyer, status: 409 });
  assert.equal((await ticketRows(used.order_id))[0].status, 'USED');
  const png = await fetch(BASE + '/tickets/' + ticket.ticket_id + '/qr.png', { headers: { Authorization: 'Bearer ' + buyer } });
  assert.equal(png.status, 200);
  assert.equal(Buffer.from(await png.arrayBuffer()).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const expiring = await order(buyer, free, fsSeats[2].session_seat_id);
  await q('UPDATE orders SET created_at=UTC_TIMESTAMP(3)-INTERVAL 10 MINUTE, expires_at=UTC_TIMESTAMP(3)-INTERVAL 1 SECOND WHERE order_id=?', [expiring.order_id]);
  await api('POST', '/orders/' + expiring.order_id + '/confirm-free', { token: buyer, status: 409 });
  assert.equal((await ticketRows(expiring.order_id)).length, 0);
  checks.push('used/expired free tickets cannot be cancelled/confirmed; QR PNG is generated');

  const old = await order(buyer, paid, psSeats[0].session_seat_id);
  const oldPayment = await payment(buyer, old.order_id);
  await api('POST', '/orders/' + old.order_id + '/confirm-free', { token: buyer, status: 409 });
  await api('POST', '/orders/' + old.order_id + '/cancel', { token: buyer });
  const resale = await order(other, paid, psSeats[0].session_seat_id);
  await success(other, (await payment(other, resale.order_id)).payment_id);
  await success(buyer, oldPayment.payment_id, 409);
  const original = (await q('SELECT refund_id FROM refunds WHERE payment_attempt_id=?', [oldPayment.payment_id]))[0];
  await api('POST', '/admin/refunds/' + original.refund_id + '/resolve', { token: admin, body: { result: 'FAILED' } });
  const list = await api('GET', '/admin/refunds?order_id=' + old.order_id, { token: admin });
  assert.equal(list.items.find(r => r.refund_id === original.refund_id).retryable, true);
  const retryPath = '/admin/refunds/' + original.refund_id + '/retry', retryKey = key();
  await api('POST', retryPath, { key: retryKey, status: 401 });
  await api('POST', retryPath, { token: buyer, key: retryKey, status: 403 });
  const retries = await Promise.all([0, 1].map(() => fetch(BASE + retryPath, { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'Idempotency-Key': retryKey } })));
  assert.deepEqual(retries.map(r => r.status).sort(), [200, 201]);
  const retryRows = await Promise.all(retries.map(r => r.json()));
  assert.equal(retryRows[0].data.refund.refund_id, retryRows[1].data.refund.refund_id);
  const firstRetry = retryRows[0].data.refund.refund_id;
  assert.notEqual(firstRetry, original.refund_id);
  await api('POST', retryPath, { token: admin, key: key(), status: 409 });
  await api('POST', '/admin/refunds/' + firstRetry + '/resolve', { token: admin, body: { result: 'FAILED' } });
  const second = await api('POST', '/admin/refunds/' + firstRetry + '/retry', { token: admin, key: key(), status: 201 });
  await api('POST', '/admin/refunds/' + second.refund.refund_id + '/resolve', { token: admin, body: { result: 'SUCCEEDED' } });
  await api('POST', retryPath, { token: admin, key: key(), status: 409 });
  const all = await q('SELECT status, amount FROM refunds WHERE payment_attempt_id=? ORDER BY refund_id', [oldPayment.payment_id]);
  assert.deepEqual(all.map(r => r.status), ['FAILED', 'FAILED', 'SUCCEEDED']);
  assert.equal(all.filter(r => r.status === 'SUCCEEDED').reduce((sum, r) => sum + Number(r.amount), 0), 10000);
  assert.equal((await ticketRows(resale.order_id))[0].status, 'VALID');
  assert.equal((await q('SELECT session_seat_status FROM session_seats WHERE session_seat_id=?', [psSeats[0].session_seat_id]))[0].session_seat_status, 'SOLD');
  const ledger = (await api('GET', '/admin/stats?performance_id=' + paid, { token: admin })).items[0];
  assert.equal(ledger.gross_cents, 10000);
  assert.equal(ledger.refunded_cents, 0);
  assert.equal(ledger.net_cents, 10000);
  assert.equal(ledger.excess_refunded_cents, 10000);
  checks.push('failed late refunds keep history, serialize retries, reject excess refunds and preserve resold tickets and sales totals');

  for (const origin of ['https://tickets.example.test', 'https://admin.example.test']) {
    const response = await fetch(BASE + '/health', { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(BASE.replace(/^http/, 'ws') + '/ws', { origin });
      socket.once('open', () => { socket.close(); resolve(); });
      socket.once('error', reject);
      socket.once('unexpected-response', (_request, response) => reject(new Error('WebSocket HTTP ' + response.statusCode)));
    });
  }
  await api('GET', '/health', { origin: 'https://unapproved.example.test', status: 403 });
  checks.push('configured HTTPS origins are accepted by REST and WebSocket; unlisted origins are rejected');

  const uiDraft = await performance(admin, freeEvent.event_id, 0, false);
  // Preserve one failed anomaly for the finance-page retry test.
  const uiOld = await order(buyer, paid, psSeats[2].session_seat_id);
  const uiPayment = await payment(buyer, uiOld.order_id);
  await api('POST', '/orders/' + uiOld.order_id + '/cancel', { token: buyer });
  await success(buyer, uiPayment.payment_id, 409);
  const uiRefund = (await q('SELECT refund_id FROM refunds WHERE payment_attempt_id=?', [uiPayment.payment_id]))[0].refund_id;
  await api('POST', '/admin/refunds/' + uiRefund + '/resolve', { token: admin, body: { result: 'FAILED' } });
  const dir = path.resolve(__dirname, '../.cache/checks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'browser-fixtures.json'), JSON.stringify({
    freeEventName, paidEventName, freeEventId: freeEvent.event_id, paidEventId: paidEvent.event_id,
    freePerformance: free, paidPerformance: paid, draftPerformance: uiDraft, retryRefundId: uiRefund, retryOrderId: uiOld.order_id, retryOrderNo: uiOld.order_no,
  }, null, 2));
  fs.writeFileSync(path.join(dir, 'extended-integration.json'), JSON.stringify({ checks, passed: checks.length }, null, 2));
  for (const check of checks) console.log('PASS EXT ' + check);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool?.end(); });
