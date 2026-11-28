'use strict';
const crypto = require('node:crypto');
const { query } = require('../db');
const cfg = require('../config');
const { toIso, toInt } = require('../lib/format');
const { writeAudit } = require('../lib/audit');
const payments = require('./payments');
const adapter = require('./payment-adapter');
function positive(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0 || (name !== 'RECONCILE_MIN_AGE_SECONDS' && value === 0)) throw new Error(name + ' must be a valid integer');
  return value;
}
const BATCH_SIZE = positive('RECONCILE_BATCH_SIZE', 50);
const MIN_AGE_SECONDS = positive('RECONCILE_MIN_AGE_SECONDS', 30);
const INTERVAL_SECONDS = positive('RECONCILE_INTERVAL_SECONDS', 60);
let timer = null, running = false;
const sign = body => crypto.createHmac('sha256', cfg.payment.notifySecret).update(body).digest('hex');
async function status() {
  const rows = await query(`SELECT
    SUM(processed_result = 'PENDING') AS pending,
    SUM(processed_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR) AS processed_24h,
    SUM(processed_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR AND processed_result = 'FAILED') AS failed_24h
    FROM payment_notifications`);
  const runs = await query("SELECT occurred_at, state_summary FROM audit_logs WHERE action = 'RECONCILE_RUN' ORDER BY log_id DESC LIMIT 1");
  const counts = await query(`SELECT
    (SELECT COUNT(*) FROM payment_attempts WHERE result = 'PENDING') AS unknown_payments,
    (SELECT COUNT(*) FROM refunds WHERE status = 'PENDING') AS pending_refunds`);
  let lastSummary = null;
  try { lastSummary = JSON.parse(runs[0]?.state_summary); } catch { /* legacy human-readable audit */ }
  const r = rows[0] || {};
  return { pending: toInt(r.pending), processed_24h: toInt(r.processed_24h), failed_24h: toInt(r.failed_24h),
    unknown_payments: toInt(counts[0].unknown_payments), pending_refunds: toInt(counts[0].pending_refunds),
    last_run_at: toIso(runs[0]?.occurred_at), last_summary: lastSummary,
    interval_seconds: INTERVAL_SECONDS, batch_size: BATCH_SIZE, min_age_seconds: MIN_AGE_SECONDS,
    enabled: process.env.RECONCILE_ENABLED !== '0' };
}
async function audit(action, objectType, objectId, summary, actorId, requestId) {
  await writeAudit(query, { actorType: actorId ? 'ADMIN' : 'SYSTEM', actorId, objectType, objectId, action, summary, requestId });
}
async function run({ actorId = null, requestId = '-' } = {}) {
  if (running) return { skipped: true, reason: 'already running', scanned: 0, applied: 0, duplicate: 0, failed: 0 };
  running = true;
  const result = { skipped: false, scanned: 0, applied: 0, duplicate: 0, failed: 0, ignored: 0,
    payments_checked: 0, unknown: 0, refunds_checked: 0, manual_refunds: 0 };
  try {
    const pending = await query(`SELECT notice_id, notification_id, payment_attempt_id, payload_digest, payload_json
      FROM payment_notifications WHERE processed_result = 'PENDING'
      AND received_at <= UTC_TIMESTAMP(3) - INTERVAL ? SECOND ORDER BY COALESCE((SELECT MAX(a.occurred_at) FROM audit_logs a WHERE a.object_type='PAYMENT' AND a.object_id=payment_notifications.payment_attempt_id AND a.action='RECONCILE_FAILED'),received_at), notice_id LIMIT ?`, [MIN_AGE_SECONDS, BATCH_SIZE]);
    result.scanned = pending.length;
    for (const notice of pending) {
      if (!notice.payload_json || crypto.createHash('sha256').update(notice.payload_json).digest('hex') !== notice.payload_digest) {
        await query("UPDATE payment_notifications SET processed_result='IGNORED' WHERE notice_id=? AND processed_result='PENDING'", [notice.notice_id]);
        result.ignored++; continue;
      }
      try {
        const outcome = await payments.handleNotification({ payload: JSON.parse(notice.payload_json),
          rawBody: notice.payload_json, signature: sign(notice.payload_json), requestId });
        if (outcome.result === 'DUPLICATE') result.duplicate++;
        else result.applied++; // APPLIED and LATE_REFUND are both successfully processed.
      } catch (error) {
        result.failed++;
        await audit('RECONCILE_FAILED', 'PAYMENT', toInt(notice.payment_attempt_id), error.code || error.message, actorId, requestId);
      }
    }
    // Query unresolved attempts even when no notification exists, and successes missing local fulfilment.
    const attempts = await query(`SELECT pa.attempt_id FROM payment_attempts pa JOIN orders o ON o.order_id=pa.order_id
      WHERE pa.updated_at <= UTC_TIMESTAMP(3) - INTERVAL ? SECOND AND (
        pa.result='PENDING' OR (pa.result='SUCCEEDED' AND (
          o.status='PENDING_PAYMENT' OR (o.status IN ('EXPIRED','CANCELLED')
            AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.payment_attempt_id=pa.attempt_id)))))
      ORDER BY COALESCE((SELECT MAX(a.occurred_at) FROM audit_logs a WHERE a.object_type='PAYMENT' AND a.object_id=pa.attempt_id AND a.action IN ('PAYMENT_RECONCILE_UNKNOWN','RECONCILE_FAILED')),pa.updated_at), pa.attempt_id LIMIT ?`, [MIN_AGE_SECONDS, BATCH_SIZE]);
    for (const attempt of attempts) {
      result.payments_checked++;
      try {
        const evidence = await adapter.queryPayment(toInt(attempt.attempt_id));
        if (evidence.status === 'UNKNOWN') {
          result.unknown++;
          await audit('PAYMENT_RECONCILE_UNKNOWN', 'PAYMENT', toInt(attempt.attempt_id), evidence.reason, actorId, requestId);
          continue;
        }
        const outcome = await payments.handleNotification({ ...evidence, recover: true, requestId });
        if (outcome.result === 'DUPLICATE') result.duplicate++; else result.applied++;
      } catch (error) {
        result.failed++;
        await audit('RECONCILE_FAILED', 'PAYMENT', toInt(attempt.attempt_id), error.code || error.message, actorId, requestId);
      }
    }
    const refunds = await query(`SELECT refund_id FROM refunds WHERE status='PENDING'
      AND updated_at <= UTC_TIMESTAMP(3) - INTERVAL ? SECOND ORDER BY COALESCE((SELECT MAX(a.occurred_at) FROM audit_logs a WHERE a.object_type='REFUND' AND a.object_id=refunds.refund_id AND a.action='REFUND_RECONCILE_UNKNOWN'),updated_at), refund_id LIMIT ?`, [MIN_AGE_SECONDS, BATCH_SIZE]);
    for (const refund of refunds) {
      result.refunds_checked++;
      const evidence = await adapter.queryRefund(toInt(refund.refund_id));
      if (evidence.status === 'UNKNOWN') {
        result.manual_refunds++;
        await audit('REFUND_RECONCILE_UNKNOWN', 'REFUND', toInt(refund.refund_id), evidence.reason, actorId, requestId);
      }
    }
    await audit('RECONCILE_RUN', 'PAYMENT', null, JSON.stringify(result), actorId, requestId);
    return result;
  } finally { running = false; }
}
function start() {
  if (process.env.RECONCILE_ENABLED === '0') return;
  timer = setInterval(() => run({ requestId: 'worker' }).catch(err => console.error('[reconcile]', err.message)), Math.max(1, INTERVAL_SECONDS) * 1000);
  timer.unref();
  console.log('[reconcile] worker every ' + INTERVAL_SECONDS + 's');
}
function stop() { if (timer) clearInterval(timer); timer = null; }
module.exports = { run, status, start, stop, BATCH_SIZE, MIN_AGE_SECONDS, INTERVAL_SECONDS };
