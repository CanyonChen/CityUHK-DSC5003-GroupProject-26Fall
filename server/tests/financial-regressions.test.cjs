// Service regression tests. SQL is simulated; InnoDB integration runs separately in CI.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const cfg = { limits: { refundCutoffHours: 24 }, payment: { mode: 'test' } };

function service(name, db) {
  const filename = path.join(__dirname, '../src/services', name + '.js');
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const stubs = {
    '../db': db, '../config': cfg, '../lib/http': { ApiError },
    '../lib/audit': { writeAudit: async () => {} },
    './orders': { releaseSeats: async () => 0, expireDueOrders: async () => 0 },
  };
  const requireStub = id => Object.hasOwn(stubs, id) ? stubs[id] : nativeRequire(id);
  new Function('require', 'module', 'exports', fs.readFileSync(filename, 'utf8'))(requireStub, module, module.exports);
  return module.exports;
}

function fixture({ orderStatus = 'REFUND_PENDING', late = false, refundStatus = 'PENDING', userId = 1, attemptResult = 'PENDING' } = {}) {
  const state = {
    order: { order_id: 10, user_id: userId, status: orderStatus, total_amount: 48000,
      currency: 'HKD', starts_at: new Date('2099-01-01'), expires_at: new Date('2098-01-01') },
    refund: { refund_id: 50, order_id: 10, payment_attempt_id: 20,
      idempotency_key: late ? 'late-20' : 'refund:10:retry-key',
      reason: late ? 'LATE_PAYMENT' : 'Customer request', status: refundStatus,
      amount: 48000, created_at: new Date(), updated_at: new Date() },
    attempt: { attempt_id: 20, order_id: 10, user_id: userId, result: attemptResult,
      amount: 48000, currency: 'HKD', handling_category: late ? 'AWAITING_REFUND' : 'NORMAL' },
    // A late payment's old seat has already been sold to another order.
    seat: 'SOLD', ticket: late ? 'VOID' : 'REFUND_PENDING', mutations: [], connectionReads: 0,
  };
  const execute = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT')) {
      if (/FROM refunds r JOIN orders o/.test(s)) return [{ ...state.refund, order_status: state.order.status, currency: 'HKD', user_id: state.order.user_id }];
      if (/FROM orders o/.test(s) || /SELECT \* FROM orders/.test(s)) return [{ ...state.order }];
      if (/FROM payment_attempts pa/.test(s)) return [{ ...state.attempt }];
      if (/FROM refunds/.test(s)) {
        if (/idempotency_key = \\?/.test(s) && params[1] !== state.refund.idempotency_key) return [];
        return [{ ...state.refund }];
      }
      if (/UTC_TIMESTAMP/.test(s)) return [{ now: new Date('2026-11-28T00:00:00Z') }];
      throw new Error('Unhandled SELECT: ' + s);
    }
    state.mutations.push(s);
    if (/UPDATE orders SET status = '([^']+)'/.test(s)) state.order.status = /UPDATE orders SET status = '([^']+)'/.exec(s)[1];
    if (/UPDATE refunds SET status/.test(s)) state.refund.status = /status = '([^']+)'/.exec(s)[1];
    if (/UPDATE tickets/.test(s)) state.ticket = /(?:t\.)?status = '([^']+)'/.exec(s)[1];
    if (/UPDATE session_seats/.test(s)) state.seat = 'AVAILABLE';
    if (/UPDATE payment_attempts SET result/.test(s)) state.attempt.result = /result = '([^']+)'/.exec(s)[1];
    if (/UPDATE payment_attempts SET handling_category/.test(s)) state.attempt.handling_category = /handling_category = '([^']+)'/.exec(s)[1];
    return { affectedRows: 1 };
  };
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    query: async (...args) => { state.connectionReads++; return [await execute(...args)]; },
  };
  const db = { query: execute, pool: { getConnection: async () => conn } };
  return { state, db };
}

test('refund replay enforces order ownership before exposing the prior record', async () => {
  const { db, state } = fixture();
  await assert.rejects(service('refunds', db).requestRefund({ orderId: 10, userId: 2, key: 'retry-key' }), e => e.status === 403);
  assert.equal(state.mutations.length, 0);
});

for (const [refundStatus, orderStatus] of [['PENDING', 'REFUND_PENDING'], ['SUCCEEDED', 'REFUNDED'], ['FAILED', 'PAID']]) {
  test('refund replay returns current state for ' + refundStatus, async () => {
    const { db, state } = fixture({ refundStatus, orderStatus });
    const result = await service('refunds', db).requestRefund({ orderId: 10, userId: 1, key: 'retry-key' });
    assert.equal(result.replayed, true);
    assert.equal(result.refund.status, refundStatus);
    assert.equal(result.orderStatus, orderStatus);
    assert.equal(state.mutations.length, 0);
    assert.ok(state.connectionReads > 0, 'replay must read under the order lock');
  });
}

for (const orderStatus of ['EXPIRED', 'CANCELLED', 'PAID', 'REFUND_PENDING', 'REFUNDED']) {
  for (const result of ['SUCCEEDED', 'FAILED']) {
    test('late refund ' + result + ' preserves tickets and resold inventory on ' + orderStatus, async () => {
      const { db, state } = fixture({ late: true, orderStatus });
      const answer = await service('refunds', db).resolveRefund({ refundId: 50, result, actorId: 9 });
      assert.equal(answer.orderStatus, orderStatus);
      assert.equal(state.order.status, orderStatus);
      assert.equal(state.ticket, 'VOID');
      assert.equal(state.seat, 'SOLD');
      assert.equal(answer.released_seats, 0);
      assert.equal(state.refund.status, result);
      assert.ok(!state.mutations.some(sql => /UPDATE (?:orders|tickets|session_seats)/.test(sql)));
      if (result === 'SUCCEEDED') assert.equal(state.attempt.handling_category, 'NORMAL');
    });
  }
}

for (const result of ['SUCCEEDED', 'FAILED']) {
  test('normal refund ' + result + ' still updates order, ticket and inventory', async () => {
    const { db, state } = fixture();
    // Free text must never be the discriminator for an anomalous payment.
    state.refund.reason = 'LATE_PAYMENT';
    const answer = await service('refunds', db).resolveRefund({ refundId: 50, result, actorId: 9 });
    assert.equal(state.order.status, result === 'SUCCEEDED' ? 'REFUNDED' : 'PAID');
    assert.equal(state.ticket, result === 'SUCCEEDED' ? 'VOID' : 'VALID');
    assert.equal(state.seat, result === 'SUCCEEDED' ? 'AVAILABLE' : 'SOLD');
    assert.equal(answer.released_seats, result === 'SUCCEEDED' ? 1 : 0);
  });
}

for (const result of ['FAIL', 'TIMEOUT']) {
  test('payment ' + result + ' after success returns the settled result', async () => {
    const { db, state } = fixture({ orderStatus: 'PAID', attemptResult: 'SUCCEEDED' });
    const answer = await service('payments', db).simulate({ userId: 1, paymentId: 20, result });
    assert.equal(answer.payment_status, 'SUCCEEDED');
    assert.equal(answer.order_status, 'PAID');
    assert.equal(state.mutations.length, 0);
  });
}

test('payment timeout after failure returns FAILED', async () => {
  const { db, state } = fixture({ orderStatus: 'PENDING_PAYMENT', attemptResult: 'FAILED' });
  const answer = await service('payments', db).simulate({ userId: 1, paymentId: 20, result: 'TIMEOUT' });
  assert.equal(answer.payment_status, 'FAILED');
  assert.equal(state.mutations.length, 0);
});

test('a contradictory final refund result is rejected', async () => {
  const { db, state } = fixture({ refundStatus: 'SUCCEEDED', orderStatus: 'REFUNDED' });
  await assert.rejects(service('refunds', db).resolveRefund({ refundId: 50, result: 'FAILED' }), e => e.code === 'REFUND_ALREADY_RESOLVED');
  assert.equal(state.mutations.length, 0);
});

test('draft seat maps stay private while staff can load the same inventory', async () => {
  const db = {
    query: async (sql) => {
      if (/FROM performances p/.test(sql)) {
        return /p.status <> 'DRAFT'/.test(sql) ? [] : [{
          performance_id: 1, event_id: 1, venue_id: 1, status: 'DRAFT',
          venue_name: 'Test venue', row_count: 1, col_count: 1,
        }];
      }
      if (/FROM session_seats ss/.test(sql)) return [{
        session_seat_id: 1, region: 'A', row_no: '1', seat_no: '1', coordinates: '1,1',
        status: 'BLOCKED', price_cents: 10000, tier_name: 'Standard', currency: 'HKD',
      }];
      if (/MAX\(updated_at\)/.test(sql)) return [{ updated_at: new Date() }];
      throw new Error('Unhandled draft query');
    },
  };
  const catalog = service('catalog', db);
  await assert.rejects(catalog.getSeatMap(1, 0), e => e.status === 404);
  const staffMap = await catalog.getSeatMap(1, 9, { includeDraft: true });
  assert.equal(staffMap.seats.length, 1);
  assert.equal(staffMap.seats[0].status, 'BLOCKED');
});

test('refund keys that overflow the stored namespace return a validation error', async () => {
  const { db, state } = fixture();
  await assert.rejects(service('refunds', db).requestRefund({ orderId: 10, userId: 1, key: 'x'.repeat(100) }), e => e.status === 400);
  assert.equal(state.mutations.length, 0);
});
