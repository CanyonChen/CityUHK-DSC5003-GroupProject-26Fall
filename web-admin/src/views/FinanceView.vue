<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { stats, paymentExceptions, adminRefunds, auditLogs, reconcilePayment, resolveRefund, retryRefund, reconciliationStatus, runReconciliation } from '../api';
import { hkt, money } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

import { useAdminI18n } from '../i18n';
import { auditSummary, operationName, paymentReason } from '../locales/operations';

const { t, status, errorMessage } = useAdminI18n();
const tab = ref('ledger');
const ledger = ref({ items: [], total: {} });
const exceptions = ref({ items: [], total: 0 });
const refunds = ref({ items: [], total: 0 });
const audits = ref({ items: [], total: 0 });
const loading = ref(true);
const error = ref('');
const toast = ref('');
const refundBusy = ref(null);
const retryKeys = new Map();
const rec = ref(null);
const recBusy = ref(false);
let stopRealtime = null;

const live = createLiveRefresh(() => refresh());
watch([refundBusy, recBusy], ([refund, rec]) => {
  if (refund !== null || rec) live.pause();
  else live.resume();
});

function isFinanceEvent(msg) {
  const path = String(msg.path || '');
  return ['/payments', '/admin/payments', '/admin/refunds', '/admin/reconciliation']
    .some((prefix) => path.startsWith(prefix));
}

async function loadLedger() {
  try { ledger.value = await stats(); } catch (err) { error.value = err; }
}

async function loadExceptions() {
  try { exceptions.value = await paymentExceptions({ page_size: 100 }); } catch (err) { error.value = err; }
}

async function loadRefunds() {
  try { refunds.value = await adminRefunds({ page_size: 100 }); } catch (err) { error.value = err; }
}

async function loadAudits() {
  try { audits.value = await auditLogs({ page_size: 100 }); } catch (err) { error.value = err; }
}

async function refresh() {
  error.value = '';
  if (tab.value === 'ledger') await loadLedger();
  if (tab.value === 'exceptions') await loadExceptions();
  if (tab.value === 'refunds') await loadRefunds();
  if (tab.value === 'audit') await loadAudits();
}

async function setTab(next) {
  tab.value = next;
  loading.value = true;
  await refresh();
  loading.value = false;
}

async function loadRec() {
  try { rec.value = await reconciliationStatus(); } catch (err) { error.value = err; }
}

async function runRec() {
  recBusy.value = true;
  try {
    const data = await runReconciliation();
    toast.value = () => data.skipped ? t('ops.recInProgress') : t('ops.recResult', data);
    await Promise.all([loadRec(), loadExceptions(), loadRefunds(), loadLedger()]);
  } catch (err) {
    toast.value = () => errorMessage(err);
  } finally {
    recBusy.value = false;
  }
}
async function reconcile(row) {
  try {
    const data = await reconcilePayment(row.payment_id);
    toast.value = () => t('ops.paymentResult', { id: row.payment_id, result: operationName(data.result, t, status) });
    await loadExceptions();
  } catch (err) {
    toast.value = () => errorMessage(err);
  }
}

async function retry(row) {
  live.pause();
  if (!window.confirm(t('ops.retryRefundConfirm', { id: row.refund_id }))) { live.resume(); return; }
  refundBusy.value = row.refund_id;
  const key = retryKeys.get(row.refund_id) || crypto.randomUUID();
  retryKeys.set(row.refund_id, key);
  try {
    const result = await retryRefund(row.refund_id, key);
    retryKeys.delete(row.refund_id);
    toast.value = () => t('ops.refundRetryCreated', { id: result.refund.refund_id });
    await Promise.all([loadRefunds(), loadExceptions(), loadLedger()]);
  } catch (error) { toast.value = () => errorMessage(error); }
  finally { refundBusy.value = null; }
}

async function resolve(row, result) {
  const confirmKey = row.is_anomalous
    ? (result === 'SUCCEEDED' ? 'ops.anomalousSuccessConfirm' : 'ops.anomalousFailureConfirm')
    : (result === 'SUCCEEDED' ? 'ops.refundSuccessConfirm' : 'ops.refundFailureConfirm');
  live.pause();
  if (!window.confirm(t(confirmKey, { order: row.order_no }))) {
    live.resume();
    return;
  }
  refundBusy.value = row.refund_id;
  try {
    const data = await resolveRefund(row.refund_id, result);
    toast.value = () => t(data.replayed ? 'ops.refundReplayResult' : 'ops.refundResult', {
      id: row.refund_id, refund: status(data.refund.status), order: status(data.orderStatus),
    });
    await Promise.all([loadRefunds(), loadLedger(), loadExceptions()]);
  } catch (err) {
    toast.value = () => errorMessage(err);
  } finally {
    refundBusy.value = null;
  }
}

onMounted(async () => {
  await Promise.all([loadLedger(), loadExceptions(), loadRefunds(), loadAudits(), loadRec()]);
  loading.value = false;
  stopRealtime = connectRealtime((msg) => {
    if (isFinanceEvent(msg)) live.push();
  });
});

onBeforeUnmount(() => {
  stopRealtime?.();
  live.stop();
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ t('ops.finance') }}</h1>
      <p class="muted">{{ t('ops.financeIntro') }}</p>
    </div>
    <button class="ghost-button" @click="refresh">{{ t('ops.refresh') }}</button>
  </div>

  <button v-if="toast" type="button" class="toast" aria-live="polite"
    :aria-label="t('ops.dismissMessage', { message: toast() })" @click="toast = ''">{{ toast() }} <span aria-hidden="true">×</span></button>
  <p v-if="error" class="form-error" role="alert">{{ errorMessage(error) }}</p>

  <section v-if="rec" class="panel" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:14px 18px;margin-bottom:14px">
    <div>
      <p class="eyebrow" style="margin:0">{{ t('ops.autoRec') }}</p>
      <strong style="font-size:15px">{{ rec.enabled ? t('ops.frequency', { minutes: Math.round(rec.interval_seconds / 60) }) : t('ops.disabled') }}</strong><br />
      <small class="muted">{{ rec.last_run_at ? t('ops.lastRun', { time: hkt(rec.last_run_at) }) : t('ops.never') }}</small>
    </div>
    <div><span class="muted">{{ t('ops.pending') }}</span><br /><strong>{{ rec.pending }}</strong></div>
    <div><span class="muted">{{ t('ops.processed24') }}</span><br /><strong>{{ rec.processed_24h }}</strong></div>
    <div><span class="muted">{{ t('ops.failed24') }}</span><br /><strong>{{ rec.failed_24h }}</strong></div>
    <div><span class="muted">{{ t('ops.unknownPayments') }}</span><br /><strong>{{ rec.unknown_payments }}</strong></div>
    <div><span class="muted">{{ t('ops.manualRefunds') }}</span><br /><strong>{{ rec.pending_refunds }}</strong></div>
    <small v-if="rec.last_summary" class="muted">{{ t('ops.recChecked', { payments: rec.last_summary.payments_checked, refunds: rec.last_summary.manual_refunds }) }}</small>
    <button class="ghost-button" :disabled="recBusy" @click="runRec">{{ t(recBusy ? 'ops.running' : 'ops.runNow') }}</button>
  </section>

  <nav class="tabs" :aria-label="t('ops.financeNav')">
    <button :class="{ active: tab === 'ledger' }" :aria-pressed="tab === 'ledger'" @click="setTab('ledger')">{{ t('ops.ledger') }}</button>
    <button :class="{ active: tab === 'exceptions' }" :aria-pressed="tab === 'exceptions'" @click="setTab('exceptions')">{{ t('ops.exceptions') }} <em v-if="exceptions.total">{{ exceptions.total }}</em></button>
    <button :class="{ active: tab === 'refunds' }" :aria-pressed="tab === 'refunds'" @click="setTab('refunds')">{{ t('ops.refunds') }} <em v-if="refunds.total">{{ refunds.total }}</em></button>
    <button :class="{ active: tab === 'audit' }" :aria-pressed="tab === 'audit'" @click="setTab('audit')">{{ t('ops.audit') }}</button>
  </nav>

  <div v-if="loading" class="empty-state">{{ t('ops.loading') }}</div>

  <section v-else-if="tab === 'ledger'" class="panel">
    <p class="muted">{{ t('ops.netFormula') }}</p>
    <div v-if="!ledger.items.length" class="empty-state">{{ t('ops.ledgerEmpty') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table ledger-table" :aria-label="t('ops.ledger')">
        <thead><tr><th scope="col">{{ t('ops.performance') }}</th><th scope="col">{{ t('ops.status') }}</th><th scope="col" class="num">{{ t('ops.sold') }}</th><th scope="col" class="num">{{ t('ops.gross') }}</th><th scope="col" class="num">{{ t('ops.refunded') }}</th><th scope="col" class="num">{{ t('ops.excessRefunded') }}</th><th scope="col" class="num">{{ t('ops.totalRefunded') }}</th><th scope="col" class="num">{{ t('ops.net') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in ledger.items" :key="row.performance_id">
            <td class="record-title" :data-label="t('ops.performance')"><strong>{{ row.event_name }}</strong><small>{{ hkt(row.starts_at) }}</small></td>
            <td :data-label="t('ops.status')"><span class="status" :data-status="row.status">{{ status(row.status) }}</span></td>
            <td class="num" :data-label="t('ops.sold')">{{ row.tickets_sold }}</td>
            <td class="num" :data-label="t('ops.gross')">{{ money(row.gross_cents) }}</td>
            <td class="num" :data-label="t('ops.refunded')">{{ money(row.refunded_cents) }}</td>
            <td class="num" :data-label="t('ops.excessRefunded')">{{ money(row.excess_refunded_cents) }}</td>
            <td class="num" :data-label="t('ops.totalRefunded')">{{ money(row.total_refunded_cents) }}</td>
            <td class="num strong" :data-label="t('ops.net')">{{ money(row.net_cents) }}</td>
          </tr>
        </tbody>
        <tfoot><tr>
          <td colspan="2">{{ t('ops.total') }}</td>
          <td class="num" :data-label="t('ops.sold')">{{ ledger.total.tickets_sold }}</td>
          <td class="num" :data-label="t('ops.gross')">{{ money(ledger.total.gross_cents) }}</td>
          <td class="num" :data-label="t('ops.refunded')">{{ money(ledger.total.refunded_cents) }}</td>
          <td class="num" :data-label="t('ops.excessRefunded')">{{ money(ledger.total.excess_refunded_cents) }}</td>
            <td class="num" :data-label="t('ops.totalRefunded')">{{ money(ledger.total.total_refunded_cents) }}</td>
            <td class="num strong" :data-label="t('ops.net')">{{ money(ledger.total.net_cents) }}</td>
        </tr></tfoot>
      </table>
    </div>
  </section>

  <section v-else-if="tab === 'exceptions'" class="panel">
    <div class="panel-head"><div><h2>{{ t('ops.paymentExceptions') }}</h2></div><span class="muted">{{ t('ops.openCount', { count: exceptions.total }) }}</span></div>
    <div v-if="!exceptions.items.length" class="empty-state">{{ t('ops.noExceptions') }}</div>
    <ul v-else class="exception-list">
      <li v-for="row in exceptions.items" :key="row.type + row.payment_id + row.reason">
        <span class="tag" :data-kind="row.type">{{ operationName(row.type, t, status) }}</span>
        <div><strong>{{ row.order_no }}</strong><small>{{ paymentReason(row.reason, t) }}</small></div>
        <span>{{ money(row.amount_cents) }}</span>
        <span class="muted">{{ hkt(row.last_checked_at) }}</span>
        <button class="ghost-button small" @click="reconcile(row)">{{ t('ops.reconcile') }}</button>
      </li>
    </ul>
  </section>

  <section v-else-if="tab === 'refunds'" class="panel">
    <div class="panel-head"><div><h2>{{ t('ops.refundProgress') }}</h2></div><span class="muted">{{ t('ops.records', { count: refunds.total }) }}</span></div>
    <div v-if="!refunds.items.length" class="empty-state">{{ t('ops.noRefunds') }}</div>
    <ul v-else class="exception-list">
      <li v-for="row in refunds.items" :key="row.refund_id">
        <span class="tag" :data-kind="row.status">{{ status(row.status) }}</span>
        <div><strong>{{ row.order_no }}</strong><small>{{ row.reason ? paymentReason(row.reason, t) : t('ops.customerRequest') }}</small></div>
        <span>{{ money(row.amount_cents) }}</span>
        <span class="muted">{{ hkt(row.created_at) }}</span>
        <button v-if="row.retryable" class="ghost-button small" :disabled="refundBusy === row.refund_id" @click="retry(row)">{{ t('ops.retryRefund') }}</button>
        <button
          v-if="row.status === 'PENDING'"
          class="ghost-button small"
          :disabled="refundBusy === row.refund_id"
          @click="resolve(row, 'SUCCEEDED')"
        >{{ t('ops.markSucceeded') }}</button>
        <button
          v-if="row.status === 'PENDING'"
          class="ghost-button small warn"
          :disabled="refundBusy === row.refund_id"
          @click="resolve(row, 'FAILED')"
        >{{ t('ops.markFailed') }}</button>
      </li>
    </ul>
  </section>

  <section v-else class="panel">
    <div class="panel-head"><div><h2>{{ t('ops.auditTrail') }}</h2></div><span class="muted">{{ t('ops.entries', { count: audits.total }) }}</span></div>
    <div v-if="!audits.items.length" class="empty-state">{{ t('ops.auditEmpty') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table" :aria-label="t('ops.auditTrail')">
        <thead><tr><th scope="col">{{ t('ops.time') }}</th><th scope="col">{{ t('ops.actor') }}</th><th scope="col">{{ t('ops.action') }}</th><th scope="col">{{ t('ops.object') }}</th><th scope="col">{{ t('ops.result') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in audits.items" :key="row.log_id">
            <td class="tight" :data-label="t('ops.time')">{{ hkt(row.occurred_at) }}</td>
            <td :data-label="t('ops.actor')">{{ row.actor_type === 'SYSTEM' ? operationName('SYSTEM', t, status) : row.actor_display }}<small>{{ operationName(row.actor_type, t, status) }}</small></td>
            <td :data-label="t('ops.action')">{{ operationName(row.action, t, status) }}</td>
            <td :data-label="t('ops.object')">{{ operationName(row.object_type, t, status) }}<small v-if="row.object_id != null">#{{ row.object_id }}</small></td>
            <td class="tight" :data-label="t('ops.result')">{{ auditSummary(row.result, t, status) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
@media (max-width: 700px) {
  .ledger-table tfoot { display: block; padding: 1rem; border-top: 2px solid var(--rose); }
  .ledger-table tfoot tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem 1rem; }
  .ledger-table tfoot td { display: block; padding: 0; border: 0; background: transparent; text-align: start; }
  .ledger-table tfoot td:first-child { grid-column: 1 / -1; }
}
</style>
