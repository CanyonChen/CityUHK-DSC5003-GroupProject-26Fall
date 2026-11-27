'use strict';

const crypto = require('node:crypto');
const { query } = require('../db');
const cfg = require('../config');
const { toIso, toInt } = require('../lib/format');
const { writeAudit } = require('../lib/audit');
const payments = require('./payments');

const BATCH_SIZE = Number(process.env.RECONCILE_BATCH_SIZE || 50);
const MIN_AGE_SECONDS = Number(process.env.RECONCILE_MIN_AGE_SECONDS || 120);
const INTERVAL_SECONDS = Number(process.env.RECONCILE_INTERVAL_SECONDS || 300);

let timer = null;
let running = false;

function signatureFor(rawBody) {
  const digest = crypto
    .createHmac('sha256', cfg.payment.notifySecret)
    .update(rawBody)
    .digest('hex');
  return `sha256=${digest}`;
}

async function status() {
  const rows = await query(
    `SELECT
       SUM(processed_result = 'PENDING') AS pending,
       SUM(processed_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR) AS processed_24h,
       SUM(processed_at >= UTC_TIMESTAMP(3) - INTERVAL 24 HOUR AND processed_result = 'FAILED') AS failed_24h,
       MAX(processed_at) AS last_run_at
     FROM payment_notifications`
  );
  const r = rows[0] || {};
  return {
    pending: toInt(r.pending),
    processed_24h: toInt(r.processed_24h),
    failed_24h: toInt(r.failed_24h),
    last_run_at: toIso(r.last_run_at),
    interval_seconds: INTERVAL_SECONDS,
    batch_size: BATCH_SIZE,
    min_age_seconds: MIN_AGE_SECONDS,
    enabled: process.env.RECONCILE_ENABLED !== '0',
  };
}

async function run({ actorId = null, requestId = '-' } = {}) {
  if (running) return { skipped: true, reason: 'already running', scanned: 0, applied: 0, duplicate: 0, failed: 0 };
  running = true;
  const summary = { skipped: false, scanned: 0, applied: 0, duplicate: 0, failed: 0, ignored: 0 };
  try {
    const pending = await query(
      `SELECT notice_id, notification_id, payment_attempt_id, payload_json
         FROM payment_notifications
        WHERE processed_result = 'PENDING'
          AND received_at <= UTC_TIMESTAMP(3) - INTERVAL ? SECOND
        ORDER BY received_at ASC
        LIMIT ?`,
      [MIN_AGE_SECONDS, BATCH_SIZE]
    );
    summary.scanned = pending.length;
    for (const notice of pending) {
      if (!notice.payload_json) {
        await query(
          `UPDATE payment_notifications SET processed_result = 'IGNORED'
            WHERE notice_id = ? AND processed_result = 'PENDING'`,
          [notice.notice_id]
        );
        summary.ignored += 1;
        continue;
      }
      try {
        const payload = JSON.parse(notice.payload_json);
        const result = await payments.handleNotification({
          payload,
          rawBody: notice.payload_json,
          signature: signatureFor(notice.payload_json),
          requestId,
        });
        const normalized = ['APPLIED', 'DUPLICATE'].includes(result.result) ? result.result : 'FAILED';
        await query(
          `UPDATE payment_notifications SET processed_result = ?
            WHERE notice_id = ? AND processed_result = 'PENDING'`,
          [normalized, notice.notice_id]
        );
        if (normalized === 'APPLIED') summary.applied += 1;
        else if (normalized === 'DUPLICATE') summary.duplicate += 1;
        else summary.failed += 1;
      } catch (err) {
        await query(
          `UPDATE payment_notifications SET processed_result = 'FAILED'
            WHERE notice_id = ? AND processed_result = 'PENDING'`,
          [notice.notice_id]
        );
        summary.failed += 1;
        await writeAudit(query, {
          actorType: 'SYSTEM',
          actorId,
          objectType: 'PAYMENT',
          objectId: toInt(notice.payment_attempt_id),
          action: 'RECONCILE_FAILED',
          summary: `notification ${notice.notification_id}: ${err.message}`,
          requestId,
        });
      }
    }
    await writeAudit(query, {
      actorType: 'SYSTEM',
      actorId,
      objectType: 'PAYMENT',
      objectId: null,
      action: 'RECONCILE_RUN',
      summary: `scanned ${summary.scanned}, applied ${summary.applied}, duplicate ${summary.duplicate}, failed ${summary.failed}, ignored ${summary.ignored}`,
      requestId,
    });
    return summary;
  } finally {
    running = false;
  }
}

function start() {
  if (process.env.RECONCILE_ENABLED === '0') {
    console.log('[reconcile] disabled by RECONCILE_ENABLED=0');
    return;
  }
  const every = Math.max(10, INTERVAL_SECONDS) * 1000;
  timer = setInterval(() => {
    run({ requestId: 'worker' }).catch((err) => console.error('[reconcile] run failed:', err.message));
  }, every);
  timer.unref();
  console.log(`[reconcile] worker every ${INTERVAL_SECONDS}s, batch ${BATCH_SIZE}, min age ${MIN_AGE_SECONDS}s`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { run, status, start, stop, BATCH_SIZE, MIN_AGE_SECONDS, INTERVAL_SECONDS };
