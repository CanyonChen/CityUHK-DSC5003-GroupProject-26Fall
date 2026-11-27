'use strict';

const { query } = require('./db');

function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function matchId(path, pattern) {
  const match = String(path).match(pattern);
  return match ? toId(match[1]) : null;
}

async function orderIdForPayment(paymentId) {
  const rows = await query(
    'SELECT order_id FROM payment_attempts WHERE attempt_id = ? LIMIT 1',
    [paymentId]
  );
  return rows.length ? toId(rows[0].order_id) : null;
}

async function orderIdForRefund(refundId) {
  const rows = await query(
    'SELECT order_id FROM refunds WHERE refund_id = ? LIMIT 1',
    [refundId]
  );
  return rows.length ? toId(rows[0].order_id) : null;
}

async function performanceIdForOrder(orderId) {
  const rows = await query(
    'SELECT performance_id FROM orders WHERE order_id = ? LIMIT 1',
    [orderId]
  );
  return rows.length ? toId(rows[0].performance_id) : null;
}

async function performanceIdForSessionSeat(sessionSeatId) {
  const rows = await query(
    'SELECT performance_id FROM session_seats WHERE session_seat_id = ? LIMIT 1',
    [sessionSeatId]
  );
  return rows.length ? toId(rows[0].performance_id) : null;
}

/**
 * Resolve the smallest useful scope for a data.changed signal.
 * IDs are resource keys, not business values: clients use them to ignore
 * unrelated events and still refetch through the normal REST endpoints.
 */
async function resolveRealtimeScope(req) {
  const path = String(req.originalUrl || '').split('?')[0];
  const body = req.body || {};
  const local = (resLocals(req) && resLocals(req).realtime) || {};
  const scope = {
    order_id: toId(local.order_id),
    performance_id: toId(local.performance_id),
  };

  if (!scope.performance_id && body.performance_id !== undefined) {
    scope.performance_id = toId(body.performance_id);
  }

  if (!scope.order_id) {
    scope.order_id = matchId(path, /^\/orders\/(\d+)(?:\/|$)/);
  }
  if (!scope.order_id && path === '/payments') {
    scope.order_id = toId(body.order_id);
  }
  if (!scope.order_id && path === '/payments/notify') {
    scope.order_id = toId(body.order_id);
  }
  if (!scope.order_id && path === '/admin/refunds') {
    scope.order_id = toId(body.order_id);
  }

  const paymentId = matchId(path, /^\/payments\/(\d+)(?:\/|$)/)
    || matchId(path, /^\/admin\/payments\/(\d+)(?:\/|$)/)
    || (path === '/payments/notify' ? toId(body.payment_id) : null);
  if (!scope.order_id && paymentId) {
    scope.order_id = await orderIdForPayment(paymentId);
  }

  const refundId = matchId(path, /^\/admin\/refunds\/(\d+)(?:\/|$)/);
  if (!scope.order_id && refundId) {
    scope.order_id = await orderIdForRefund(refundId);
  }

  if (scope.order_id && !scope.performance_id) {
    scope.performance_id = await performanceIdForOrder(scope.order_id);
  }

  if (!scope.performance_id) {
    scope.performance_id = matchId(path, /^\/performances\/(\d+)(?:\/|$)/)
      || matchId(path, /^\/admin\/performances\/(\d+)(?:\/|$)/);
  }
  if (!scope.performance_id) {
    const sessionSeatId = matchId(path, /^\/admin\/session-seats\/(\d+)(?:\/|$)/);
    if (sessionSeatId) scope.performance_id = await performanceIdForSessionSeat(sessionSeatId);
  }

  if (scope.performance_id) scope.performance_id = toId(scope.performance_id);
  if (scope.order_id) scope.order_id = toId(scope.order_id);
  return scope;
}

function resLocals(req) {
  return req && req.res ? req.res.locals : null;
}

module.exports = { resolveRealtimeScope };
