'use strict';
// The course mock adapter queries durable, previously signature-verified inbox evidence.
// No result is invented from elapsed time or from a local pending order.
const crypto = require('node:crypto');
const { query } = require('../db');
const cfg = require('../config');
async function queryPayment(paymentId) {
  if (cfg.payment.mode !== 'test') return { status: 'UNKNOWN', reason: 'No payment query adapter is configured' };
  const rows = await query(`SELECT payload_json, payload_digest FROM payment_notifications
    WHERE source = 'mockpay' AND payment_attempt_id = ?
      AND processed_result <> 'REJECTED' AND payload_json IS NOT NULL
    ORDER BY received_at DESC, notice_id DESC`, [paymentId]);
  const valid = [];
  for (const row of rows) {
    if (crypto.createHash('sha256').update(row.payload_json).digest('hex') !== row.payload_digest) continue;
    try {
      const payload = JSON.parse(row.payload_json);
      if (Number(payload.payment_id) === Number(paymentId) && ['SUCCESS','FAIL'].includes(payload.result)) {
        valid.push({ payload, rawBody: row.payload_json });
      }
    } catch { /* corrupted evidence is not a provider result */ }
  }
  const evidence = valid.find(x => x.payload.result === 'SUCCESS') || valid[0];
  if (!evidence) return { status: 'UNKNOWN', reason: 'No verified provider result is available' };
  return { status: evidence.payload.result, ...evidence,
    signature: crypto.createHmac('sha256', cfg.payment.notifySecret).update(evidence.rawBody).digest('hex') };
}
async function queryRefund() {
  return { status: 'UNKNOWN', reason: 'The course mock adapter cannot query refunds; administrator confirmation is required' };
}
module.exports = { queryPayment, queryRefund };
