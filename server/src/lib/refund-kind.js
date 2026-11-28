'use strict';
function isLateRefund(refund) {
  const prefix = 'late-' + refund.payment_attempt_id;
  // Legacy seed/history used REF-* keys. A closed, unfulfilled order cannot have a normal sale refund.
  return ['EXPIRED', 'CANCELLED'].includes(refund.order_status) || refund.idempotency_key === prefix ||
    (typeof refund.idempotency_key === 'string' && refund.idempotency_key.startsWith(prefix + ':retry:') &&
      /^[a-f0-9]{64}$/.test(refund.idempotency_key.slice((prefix + ':retry:').length)));
}
module.exports = { isLateRefund };
