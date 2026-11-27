<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { adminOrders, listPerformances } from '../api';
import { hkt, money } from '../format';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const error = ref('');
const performances = ref([]);
const filters = reactive({ status: '', performance_id: '', keyword: '', date_from: '', date_to: '' });

const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await adminOrders({ ...filters, page: page.value, page_size: pageSize });
    rows.value = data.items;
    total.value = data.total;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

function go(next) {
  if (next < 1 || next > pages.value) return;
  page.value = next;
  load();
}

function clearFilters() {
  Object.assign(filters, { status: '', performance_id: '', keyword: '', date_from: '', date_to: '' });
  search();
}

onMounted(async () => {
  try {
    const data = await listPerformances({ page_size: 100 });
    performances.value = data.items;
  } catch {
    performances.value = [];
  }
  await load();
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Order book</h1>
      <p class="muted">Search by order number or buyer to review payments and refunds.</p>
    </div>
    <button class="ghost-button" @click="load">Refresh</button>
  </div>

  <p v-if="error" class="form-error">{{ error }}</p>

  <section class="toolbar wrap">
    <label class="filter-keyword">Keyword<input v-model="filters.keyword" placeholder="Order number or buyer" @keyup.enter="search" /></label>
    <label>Status
      <select v-model="filters.status" @change="search">
        <option value="">All</option>
        <option>PENDING_PAYMENT</option><option>PAID</option><option>REFUND_PENDING</option>
        <option>REFUNDED</option><option>CANCELLED</option><option>EXPIRED</option>
      </select>
    </label>
    <label>Performance
      <select v-model="filters.performance_id" @change="search">
        <option value="">All</option>
        <option v-for="p in performances" :key="p.performance_id" :value="p.performance_id">{{ p.event_name }} · #{{ p.performance_id }}</option>
      </select>
    </label>
    <label>From<input v-model="filters.date_from" type="date" @change="search" /></label>
    <label>To<input v-model="filters.date_to" type="date" @change="search" /></label>
    <button class="ghost-button" @click="clearFilters">Clear</button>
  </section>

  <section class="panel">
    <div v-if="loading" class="empty-state">Loading orders…</div>
    <div v-else-if="!rows.length" class="empty-state">No orders match.</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table" aria-label="Orders">
        <thead><tr><th>Order</th><th>Buyer</th><th>Performance</th><th>Status</th><th>Payment</th><th>Refund</th><th class="num">Total</th><th>Created</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.order_id">
            <td class="record-title" data-label="Order"><strong class="mono">{{ row.order_no }}</strong></td>
            <td data-label="Buyer">{{ row.buyer }}<small>{{ row.user_name }}</small></td>
            <td class="record-wide" data-label="Performance">{{ row.event_name }}<small>{{ row.venue_name }} · {{ hkt(row.starts_at) }}</small></td>
            <td data-label="Status"><span class="status" :data-status="row.status">{{ row.status }}</span></td>
            <td data-label="Payment">{{ row.payment_status }}</td>
            <td data-label="Refund">{{ row.refund_status || '—' }}</td>
            <td class="num" data-label="Total">{{ money(row.total_amount_cents, row.currency) }}</td>
            <td data-label="Created">{{ hkt(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pager">
      <span class="muted">{{ total }} orders · page {{ page }} / {{ pages }}</span>
      <div>
        <button class="ghost-button small" :disabled="page <= 1" @click="go(page - 1)">Prev</button>
        <button class="ghost-button small" :disabled="page >= pages" @click="go(page + 1)">Next</button>
      </div>
    </div>
  </section>
</template>
