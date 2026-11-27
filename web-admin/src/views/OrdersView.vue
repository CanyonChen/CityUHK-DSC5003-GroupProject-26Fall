<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { adminOrders, listPerformances } from '../api';
import { hkt, money } from '../format';

import { useAdminI18n } from '../i18n';

const { t, status, errorMessage } = useAdminI18n();
const orderStates = ['PENDING_PAYMENT', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'CANCELLED', 'EXPIRED'];
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
    error.value = err;
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
      <h1>{{ t('ops.orderBook') }}</h1>
      <p class="muted">{{ t('ops.ordersIntro') }}</p>
    </div>
    <button class="ghost-button" @click="load">{{ t('ops.refresh') }}</button>
  </div>

  <p v-if="error" class="form-error" role="alert">{{ errorMessage(error) }}</p>

  <section class="toolbar wrap">
    <label class="filter-keyword">{{ t('ops.keyword') }}<input v-model="filters.keyword" :placeholder="t('ops.orderSearch')" @keyup.enter="search" /></label>
    <label>{{ t('ops.status') }}
      <select v-model="filters.status" @change="search">
        <option value="">{{ t('ops.all') }}</option>
        <option v-for="value in orderStates" :key="value" :value="value">{{ status(value) }}</option>
      </select>
    </label>
    <label>{{ t('ops.performance') }}
      <select v-model="filters.performance_id" @change="search">
        <option value="">{{ t('ops.all') }}</option>
        <option v-for="p in performances" :key="p.performance_id" :value="p.performance_id">{{ p.event_name }} · #{{ p.performance_id }}</option>
      </select>
    </label>
    <label>{{ t('ops.from') }}<input v-model="filters.date_from" type="date" @change="search" /></label>
    <label>{{ t('ops.to') }}<input v-model="filters.date_to" type="date" @change="search" /></label>
    <button class="ghost-button" @click="clearFilters">{{ t('ops.clear') }}</button>
  </section>

  <section class="panel">
    <div v-if="loading" class="empty-state">{{ t('ops.loadingOrders') }}</div>
    <div v-else-if="!rows.length" class="empty-state">{{ t('ops.noOrders') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table" :aria-label="t('ops.orders')">
        <thead><tr><th>{{ t('ops.order') }}</th><th>{{ t('ops.buyer') }}</th><th>{{ t('ops.performance') }}</th><th>{{ t('ops.status') }}</th><th>{{ t('ops.payment') }}</th><th>{{ t('ops.refund') }}</th><th class="num">{{ t('ops.total') }}</th><th>{{ t('ops.created') }}</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.order_id">
            <td class="record-title" :data-label="t('ops.order')"><strong class="mono">{{ row.order_no }}</strong></td>
            <td :data-label="t('ops.buyer')">{{ row.buyer }}<small>{{ row.user_name }}</small></td>
            <td class="record-wide" :data-label="t('ops.performance')">{{ row.event_name }}<small>{{ row.venue_name }} · {{ hkt(row.starts_at) }}</small></td>
            <td :data-label="t('ops.status')"><span class="status" :data-status="row.status">{{ status(row.status) }}</span></td>
            <td :data-label="t('ops.payment')">{{ status(row.payment_status) }}</td>
            <td :data-label="t('ops.refund')">{{ row.refund_status ? status(row.refund_status) : '—' }}</td>
            <td class="num" :data-label="t('ops.total')">{{ money(row.total_amount_cents, row.currency) }}</td>
            <td :data-label="t('ops.created')">{{ hkt(row.created_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pager">
      <span class="muted">{{ t('ops.pager', { total, page, pages }) }}</span>
      <div>
        <button class="ghost-button small" :disabled="page <= 1" @click="go(page - 1)">{{ t('ops.prev') }}</button>
        <button class="ghost-button small" :disabled="page >= pages" @click="go(page + 1)">{{ t('ops.next') }}</button>
      </div>
    </div>
  </section>
</template>
