<script setup>
import { useAdminI18n } from '../i18n';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { performanceOccupancy, stats } from '../api';
import { money, shortDate } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

const { t, status, errorMessage, n, percent } = useAdminI18n();
const data = ref({ items: [], total: {} });
const occupancy = ref(null);
const selectedPerformanceId = ref(null);
const occupancyLoading = ref(false);
const loading = ref(true);
const error = ref('');
let stopRealtime = null;

const sellable = computed(() => {
  const { sold, available, held, blocked } = data.value.total;
  return (sold ?? 0) + (available ?? 0) + (held ?? 0) + (blocked ?? 0);
});
const sellThrough = computed(() => sellable.value ? Math.round((data.value.total.sold / sellable.value) * 100) : 0);
const checkinRate = computed(() => data.value.total.tickets_sold ? Math.round((data.value.total.checked_in / data.value.total.tickets_sold) * 100) : 0);

const live = createLiveRefresh(() => load(true));

async function loadOccupancy(id = selectedPerformanceId.value) {
  occupancy.value = null;
  if (!id) return;
  occupancyLoading.value = true;
  error.value = '';
  try {
    occupancy.value = await performanceOccupancy(id);
  } catch (err) {
    error.value = err;
  } finally {
    occupancyLoading.value = false;
  }
}

function isStatsEvent(msg) {
  const path = String(msg.path || '');
  return ['/orders', '/payments', '/tickets', '/admin/checkins', '/admin/refunds', '/admin/payments', '/admin/performances', '/admin/session-seats', '/performances']
    .some((prefix) => path.startsWith(prefix));
}

async function load(silent = false) {
  if (!silent) loading.value = true;
  error.value = '';
  try {
    data.value = await stats();
    const hasSelected = data.value.items.some((row) => row.performance_id === selectedPerformanceId.value);
    if (!hasSelected) selectedPerformanceId.value = data.value.items[0]?.performance_id || null;
    await loadOccupancy(selectedPerformanceId.value);
  } catch (err) {
    error.value = err;
  } finally {
    if (!silent) loading.value = false;
  }
}

onMounted(async () => {
  await load();
  stopRealtime = connectRealtime((msg) => {
    if (isStatsEvent(msg)) live.push();
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
      <h1>{{ t('programme.overview') }}</h1>
      <p class="muted">{{ t('programme.overviewIntro') }}</p>
    </div>
    <button class="ghost-button" @click="load">{{ t('programme.refresh') }}</button>
  </div>

  <p v-if="error" class="form-error">{{ errorMessage(error) }}</p>

  <section class="metric-grid">
    <article class="metric-card">
      <span class="metric-label">{{ t('programme.grossSales') }}</span>
      <strong>{{ money(data.total.gross_cents) }}</strong>
      <small>{{ t('programme.grossNote') }}</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">{{ t('programme.netSales') }}</span>
      <strong>{{ money(data.total.net_cents) }}</strong>
      <small>{{ t('programme.refundedAmount', { amount: money(data.total.refunded_cents) }) }}</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">{{ t('programme.ticketsSold') }}</span>
      <strong>{{ n(data.total.tickets_sold) }}</strong>
      <small>{{ t('programme.attendanceCount', { count: n(data.total.checked_in), rate: percent(checkinRate) }) }}</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">{{ t('programme.seatSellThrough') }}</span>
      <strong>{{ percent(sellThrough) }}</strong>
      <small>{{ t('programme.seatsSoldOf', { sold: n(data.total.sold), total: n(sellable) }) }}</small>
    </article>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>{{ t('programme.salesByPerformance') }}</h2>
      </div>
      <span class="muted">{{ t('programme.performanceCount', { count: n(data.items.length) }) }}</span>
    </div>
    <div v-if="loading" class="empty-state">{{ t('programme.loadingSales') }}</div>
    <div v-else-if="!data.items.length" class="empty-state">{{ t('programme.noSales') }}</div>
    <div v-else class="table-wrap">
      <p class="muted">{{ t('programme.netFormula') }}</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('programme.performance') }}</th>
            <th>{{ t('programme.date') }}</th>
            <th>{{ t('programme.status') }}</th>
            <th class="num">{{ t('programme.seats') }}</th>
            <th class="num">{{ t('programme.sold') }}</th>
            <th class="num">{{ t('programme.checked') }}</th>
            <th class="num">{{ t('programme.gross') }}</th>
            <th class="num">{{ t('programme.refunded') }}</th>
            <th class="num">{{ t('programme.excessRefunded') }}</th>
            <th class="num">{{ t('programme.totalRefunded') }}</th>
            <th class="num">{{ t('programme.net') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.items" :key="row.performance_id">
            <td>
              <strong>{{ row.event_name }}</strong>
              <small>{{ row.venue_name }}</small>
            </td>
            <td>{{ shortDate(row.starts_at) }}</td>
            <td><span class="status" :data-status="row.status">{{ status(row.status) }}</span></td>
            <td class="num">{{ n(row.seats.sold) }}/{{ n(row.seats.sold + row.seats.available + row.seats.held + row.seats.blocked) }}</td>
            <td class="num">{{ n(row.tickets_sold) }}</td>
            <td class="num">{{ n(row.checked_in) }}</td>
            <td class="num">{{ money(row.gross_cents) }}</td>
            <td class="num">{{ money(row.refunded_cents) }}</td>
            <td class="num">{{ money(row.excess_refunded_cents) }}</td>
            <td class="num">{{ money(row.total_refunded_cents) }}</td>
            <td class="num strong">{{ money(row.net_cents) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">{{ t('programme.total') }}</td>
            <td class="num">{{ n(data.total.sold) }}</td>
            <td class="num">{{ n(data.total.tickets_sold) }}</td>
            <td class="num">{{ n(data.total.checked_in) }}</td>
            <td class="num">{{ money(data.total.gross_cents) }}</td>
            <td class="num">{{ money(data.total.refunded_cents) }}</td>
            <td class="num">{{ money(data.total.excess_refunded_cents) }}</td>
            <td class="num">{{ money(data.total.total_refunded_cents) }}</td>
            <td class="num strong">{{ money(data.total.net_cents) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>{{ t('programme.regionOccupancy') }}</h2>
      </div>
      <select v-if="data.items.length" :aria-label="t('programme.choosePerformance')" v-model.number="selectedPerformanceId" @change="loadOccupancy()">
        <option v-for="row in data.items" :key="row.performance_id" :value="row.performance_id">
          {{ row.event_name }} — {{ shortDate(row.starts_at) }}
        </option>
      </select>
    </div>
    <div v-if="occupancyLoading" class="empty-state">{{ t('programme.loadingOccupancy') }}</div>
    <div v-else-if="!occupancy || !occupancy.regions.length" class="empty-state">{{ t('programme.emptyOccupancy') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('programme.region') }}</th>
            <th class="num">{{ t('programme.seats') }}</th>
            <th class="num">{{ t('programme.sellable') }}</th>
            <th class="num">{{ t('programme.sold') }}</th>
            <th class="num">{{ t('programme.checked') }}</th>
            <th class="num">{{ t('programme.occupancy') }}</th>
            <th class="num">{{ t('programme.attendance') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in occupancy.regions" :key="row.region">
            <td>
              <strong>{{ row.region }}</strong>
              <small>{{ t('programme.blockedSeats', { count: n(row.blocked_seats) }) }}</small>
            </td>
            <td class="num">{{ n(row.total_seats) }}</td>
            <td class="num">{{ n(row.sellable_seats) }}</td>
            <td class="num">{{ n(row.tickets_sold) }}</td>
            <td class="num">{{ n(row.checked_in) }}</td>
            <td class="num strong">{{ percent(row.occupancy_rate, 1) }}</td>
            <td class="num">{{ percent(row.attendance_rate, 1) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>{{ t('programme.total') }}</td>
            <td class="num">{{ n(occupancy.total.total_seats) }}</td>
            <td class="num">{{ n(occupancy.total.sellable_seats) }}</td>
            <td class="num">{{ n(occupancy.total.tickets_sold) }}</td>
            <td class="num">{{ n(occupancy.total.checked_in) }}</td>
            <td class="num strong">{{ percent(occupancy.total.occupancy_rate, 1) }}</td>
            <td class="num">{{ percent(occupancy.total.attendance_rate, 1) }}</td>
          </tr>
        </tfoot>
      </table>
      <p class="muted">{{ t('programme.occupancyNote') }}</p>
    </div>
  </section>
</template>
