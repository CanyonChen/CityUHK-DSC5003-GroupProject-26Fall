'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { isLateRefund } = require('../src/lib/refund-kind');
test('legacy closed-order refunds and server-generated retries are anomalous', () => {
  assert.equal(isLateRefund({ order_status: 'EXPIRED', idempotency_key: 'REF-00001', payment_attempt_id: 1 }), true);
  assert.equal(isLateRefund({ order_status: 'PAID', idempotency_key: 'late-1:retry:' + 'a'.repeat(64), payment_attempt_id: 1 }), true);
});
test('free text and another payment identifier cannot classify a normal refund as anomalous', () => {
  assert.equal(isLateRefund({ order_status: 'REFUND_PENDING', idempotency_key: 'refund:1:test', reason: 'LATE_PAYMENT', payment_attempt_id: 1 }), false);
  assert.equal(isLateRefund({ order_status: 'PAID', idempotency_key: 'late-2', payment_attempt_id: 1 }), false);
});
