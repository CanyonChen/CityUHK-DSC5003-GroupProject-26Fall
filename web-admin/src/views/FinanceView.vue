<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { stats, paymentExceptions, adminRefunds, auditLogs, reconcilePayment, resolveRefund, reconciliationStatus, runReconciliation } from '../api';
import { hkt, money } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

const tab = ref('ledger');
const ledger = ref({ items: [], total: {} });
const exceptions = ref({ items: [], total: 0 });
const refunds = ref({ items: [], total: 0 });
const audits = ref({ items: [], total: 0 });
const loading = ref(true);
const error = ref('');
const toast = ref('');
const refundBusy = ref(null);
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
  try { ledger.value = await stats(); } catch (err) { error.value = err.message; }
}

async function loadExceptions() {
  try { exceptions.value = await paymentExceptions({ page_size: 100 }); } catch (err) { error.value = err.message; }
}

async function loadRefunds() {
  try { refunds.value = await adminRefunds({ page_size: 100 }); } catch (err) { error.value = err.message; }
}

async function loadAudits() {
  try { audits.value = await auditLogs({ page_size: 100 }); } catch (err) { error.value = err.message; }
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
  try { rec.value = await reconciliationStatus(); } catch (err) { error.value = err.message; }
}

async function runRec() {
  recBusy.value = true;
  try {
    const data = await runReconciliation();
    toast.value = data.skipped
      ? 'A reconciliation run is already in progress.'
      : `Reconciled ${data.scanned}: ${data.applied} applied, ${data.duplicate} duplicate, ${data.failed} failed, ${data.ignored} ignored.`;
    await Promise.all([loadRec(), loadExceptions()]);
  } catch (err) {
    toast.value = err.message;
  } finally {
    recBusy.value = false;
  }
}
async function reconcile(row) {
  try {
    const data = await reconcilePayment(row.payment_id);
    toast.value = `Payment #${row.payment_id}: ${data.result}`;
    await loadExceptions();
  } catch (err) {
    toast.value = err.message;
  }
}

async function resolve(row, result) {
  const label = result === 'SUCCEEDED' ? 'refund succeeded' : 'refund failed';
  const detail = result === 'SUCCEEDED'
    ? 'Tickets become VOID and the seats return to inventory.'
    : 'The order returns to PAID and the tickets become VALID again.';
  live.pause();
  if (!window.confirm(`Mark ${row.order_no} as ${label}?\n\n${detail}`)) {
    live.resume();
    return;
  }
  refundBusy.value = row.refund_id;
  try {
    const data = await resolveRefund(row.refund_id, result);
    toast.value = `Refund #${row.refund_id}: ${data.refund.status}${data.replayed ? ' (replayed)' : ''}. Order ${data.orderStatus}.`;
    await Promise.all([loadRefunds(), loadLedger()]);
  } catch (err) {
    toast.value = err.message;
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
});</script>

<template>
  <div class="page-head">
    <div>
      <h1>Reconciliation</h1>
      <p class="muted">Sales ledger, gateway exceptions, refund progress and the audit trail.</p>
    </div>
    <button class="ghost-button" @click="refresh">Refresh</button>
  </div>

  <div v-if="toast" class="toast" @click="toast = ''">{{ toast }} <span>×</span></div>
  <p v-if="error" class="form-error">{{ error }}</p>

  <section v-if="rec" class="panel" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:14px 18px;margin-bottom:14px">
    <div>
      <p class="eyebrow" style="margin:0">AUTO RECONCILIATION</p>
      <strong style="font-size:15px">{{ rec.enabled ? `Every ${Math.round(rec.interval_seconds / 60)} min` : 'Disabled' }}</strong><br />
      <small class="muted">Last run {{ rec.last_run_at ? hkt(rec.last_run_at) : 'never' }}</small>
    </div>
    <div><span class="muted">Pending</span><br /><strong>{{ rec.pending }}</strong></div>
    <div><span class="muted">Processed 24h</span><br /><strong>{{ rec.processed_24h }}</strong></div>
    <div><span class="muted">Failed 24h</span><br /><strong>{{ rec.failed_24h }}</strong></div>
    <button class="ghost-button" :disabled="recBusy" @click="runRec">{{ recBusy ? 'Running…' : 'Run now' }}</button>
  </section>

  <nav class="tabs">
    <button :class="{ active: tab === 'ledger' }" @click="setTab('ledger')">Sales ledger</button>
    <button :class="{ active: tab === 'exceptions' }" @click="setTab('exceptions')">Exceptions <em v-if="exceptions.total">{{ exceptions.total }}</em></button>
    <button :class="{ active: tab === 'refunds' }" @click="setTab('refunds')">Refunds <em v-if="refunds.total">{{ refunds.total }}</em></button>
    <button :class="{ active: tab === 'audit' }" @click="setTab('audit')">Audit log</button>
  </nav>

  <div v-if="loading" class="empty-state">Loading…</div>

  <section v-else-if="tab === 'ledger'" class="panel">
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Performance</th><th>Status</th><th class="num">Sold</th><th class="num">Gross</th><th class="num">Refunded</th><th class="num">Net</th></tr></thead>
        <tbody>
          <tr v-for="row in ledger.items" :key="row.performance_id">
            <td><strong>{{ row.event_name }}</strong><small>{{ hkt(row.starts_at) }}</small></td>
            <td><span class="status" :data-status="row.status">{{ row.status }}</span></td>
            <td class="num">{{ row.tickets_sold }}</td>
            <td class="num">{{ money(row.gross_cents) }}</td>
            <td class="num">{{ money(row.refunded_cents) }}</td>
            <td class="num strong">{{ money(row.net_cents) }}</td>
          </tr>
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td class="num">{{ ledger.total.tickets_sold }}</td><td class="num">{{ money(ledger.total.gross_cents) }}</td><td class="num">{{ money(ledger.total.refunded_cents) }}</td><td class="num strong">{{ money(ledger.total.net_cents) }}</td></tr></tfoot>
      </table>
    </div>
  </section>

  <section v-else-if="tab === 'exceptions'" class="panel">
    <div class="panel-head"><div><h2>Payment exceptions</h2></div><span class="muted">{{ exceptions.total }} open</span></div>
    <div v-if="!exceptions.items.length" class="empty-state">No gateway exceptions. Clean ledger.</div>
    <ul v-else class="exception-list">
      <li v-for="row in exceptions.items" :key="row.type + row.payment_id + row.reason">
        <span class="tag" :data-kind="row.type">{{ row.type }}</span>
        <div><strong>{{ row.order_no }}</strong><small>{{ row.reason }}</small></div>
        <span>{{ money(row.amount_cents) }}</span>
        <span class="muted">{{ hkt(row.last_checked_at) }}</span>
        <button class="ghost-button small" @click="reconcile(row)">Reconcile</button>
      </li>
    </ul>
  </section>

  <section v-else-if="tab === 'refunds'" class="panel">
    <div class="panel-head"><div><h2>Refund progress</h2></div><span class="muted">{{ refunds.total }} records</span></div>
    <div v-if="!refunds.items.length" class="empty-state">No refund requests yet.</div>
    <ul v-else class="exception-list">
      <li v-for="row in refunds.items" :key="row.refund_id">
        <span class="tag" :data-kind="row.status">{{ row.status }}</span>
        <div><strong>{{ row.order_no }}</strong><small>{{ row.reason || 'Customer request' }}</small></div>
        <span>{{ money(row.amount_cents) }}</span>
        <span class="muted">{{ hkt(row.created_at) }}</span>
        <button
          v-if="row.status === 'PENDING'"
          class="ghost-button small"
          :disabled="refundBusy === row.refund_id"
          @click="resolve(row, 'SUCCEEDED')"
        >Mark succeeded</button>
        <button
          v-if="row.status === 'PENDING'"
          class="ghost-button small warn"
          :disabled="refundBusy === row.refund_id"
          @click="resolve(row, 'FAILED')"
        >Mark failed</button>
      </li>
    </ul>
  </section>

  <section v-else class="panel">
    <div class="panel-head"><div><h2>Audit trail</h2></div><span class="muted">{{ audits.total }} entries</span></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Object</th><th>Result</th></tr></thead>
        <tbody>
          <tr v-for="row in audits.items" :key="row.log_id">
            <td class="tight">{{ hkt(row.occurred_at) }}</td>
            <td>{{ row.actor_display }}<small>{{ row.actor_type }}</small></td>
            <td>{{ row.action }}</td>
            <td>{{ row.object_type }}<small>#{{ row.object_id }}</small></td>
            <td class="tight">{{ row.result }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
