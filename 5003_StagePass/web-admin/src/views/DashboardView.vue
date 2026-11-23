<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { performanceOccupancy, stats } from '../api';
import { money, shortDate } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

const data = ref({ items: [], total: {} });
const occupancy = ref(null);
const selectedPerformanceId = ref(null);
const occupancyLoading = ref(false);
const loading = ref(true);
const error = ref('');
let stopRealtime = null;

const sellable = computed(() => data.value.total.sold + data.value.total.available + data.value.total.held + data.value.total.blocked);
const sellThrough = computed(() => sellable.value ? Math.round((data.value.total.sold / sellable.value) * 100) : 0);
const checkinRate = computed(() => data.value.total.tickets_sold ? Math.round((data.value.total.checked_in / data.value.total.tickets_sold) * 100) : 0);

const live = createLiveRefresh(() => load(true));

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

async function loadOccupancy(id = selectedPerformanceId.value) {
  occupancy.value = null;
  if (!id) return;
  occupancyLoading.value = true;
  error.value = '';
  try {
    occupancy.value = await performanceOccupancy(id);
  } catch (err) {
    error.value = err.message;
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
    error.value = err.message;
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
      <p class="eyebrow">OPERATIONS OVERVIEW</p>
      <h1>Tonight, at a glance</h1>
      <p class="muted">Live numbers from the same database the box office uses. Updates automatically when orders, payments or check-ins change.</p>
    </div>
    <button class="ghost-button" @click="load">Refresh</button>
  </div>

  <p v-if="error" class="form-error">{{ error }}</p>

  <section class="metric-grid">
    <article class="metric-card">
      <span class="metric-label">Gross sales</span>
      <strong>{{ money(data.total.gross_cents) }}</strong>
      <small>Paid and refund-pending orders</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">Net after refunds</span>
      <strong>{{ money(data.total.net_cents) }}</strong>
      <small>{{ money(data.total.refunded_cents) }} refunded</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">Tickets sold</span>
      <strong>{{ data.total.tickets_sold }}</strong>
      <small>{{ data.total.checked_in }} checked in · {{ checkinRate }}%</small>
    </article>
    <article class="metric-card">
      <span class="metric-label">Seat sell-through</span>
      <strong>{{ sellThrough }}%</strong>
      <small>{{ data.total.sold }} sold / {{ sellable }} seats</small>
    </article>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">PERFORMANCE LEDGER</p>
        <h2>Sales by performance</h2>
      </div>
      <span class="muted">{{ data.items.length }} rows</span>
    </div>
    <div v-if="loading" class="empty-state">Loading ledger…</div>
    <div v-else-if="!data.items.length" class="empty-state">No performances yet.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Performance</th>
            <th>Date</th>
            <th>Status</th>
            <th class="num">Seats</th>
            <th class="num">Sold</th>
            <th class="num">Checked</th>
            <th class="num">Gross</th>
            <th class="num">Refunded</th>
            <th class="num">Net</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in data.items" :key="row.performance_id">
            <td>
              <strong>{{ row.event_name }}</strong>
              <small>{{ row.venue_name }}</small>
            </td>
            <td>{{ shortDate(row.starts_at) }}</td>
            <td><span class="status" :data-status="row.status">{{ row.status }}</span></td>
            <td class="num">{{ row.seats.sold }}/{{ row.seats.sold + row.seats.available + row.seats.held + row.seats.blocked }}</td>
            <td class="num">{{ row.tickets_sold }}</td>
            <td class="num">{{ row.checked_in }}</td>
            <td class="num">{{ money(row.gross_cents) }}</td>
            <td class="num">{{ money(row.refunded_cents) }}</td>
            <td class="num strong">{{ money(row.net_cents) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total</td>
            <td class="num">{{ data.total.sold }}</td>
            <td class="num">{{ data.total.tickets_sold }}</td>
            <td class="num">{{ data.total.checked_in }}</td>
            <td class="num">{{ money(data.total.gross_cents) }}</td>
            <td class="num">{{ money(data.total.refunded_cents) }}</td>
            <td class="num strong">{{ money(data.total.net_cents) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div>
        <p class="eyebrow">REGIONAL OCCUPANCY</p>
        <h2>Occupancy by region</h2>
      </div>
      <select v-if="data.items.length" v-model.number="selectedPerformanceId" @change="loadOccupancy()">
        <option v-for="row in data.items" :key="row.performance_id" :value="row.performance_id">
          {{ row.event_name }} — {{ shortDate(row.starts_at) }}
        </option>
      </select>
    </div>
    <div v-if="occupancyLoading" class="empty-state">Loading regional occupancy…</div>
    <div v-else-if="!occupancy || !occupancy.regions.length" class="empty-state">No regional seat data for this performance.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th class="num">Seats</th>
            <th class="num">Sellable</th>
            <th class="num">Sold</th>
            <th class="num">Checked</th>
            <th class="num">Occupancy</th>
            <th class="num">Attendance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in occupancy.regions" :key="row.region">
            <td>
              <strong>{{ row.region }}</strong>
              <small>{{ row.blocked_seats }} blocked</small>
            </td>
            <td class="num">{{ row.total_seats }}</td>
            <td class="num">{{ row.sellable_seats }}</td>
            <td class="num">{{ row.tickets_sold }}</td>
            <td class="num">{{ row.checked_in }}</td>
            <td class="num strong">{{ pct(row.occupancy_rate) }}</td>
            <td class="num">{{ pct(row.attendance_rate) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td class="num">{{ occupancy.total.total_seats }}</td>
            <td class="num">{{ occupancy.total.sellable_seats }}</td>
            <td class="num">{{ occupancy.total.tickets_sold }}</td>
            <td class="num">{{ occupancy.total.checked_in }}</td>
            <td class="num strong">{{ pct(occupancy.total.occupancy_rate) }}</td>
            <td class="num">{{ pct(occupancy.total.attendance_rate) }}</td>
          </tr>
        </tfoot>
      </table>
      <p class="muted">Occupancy = sold tickets / sellable seats (BLOCKED seats excluded). Attendance = checked-in tickets / sold tickets.</p>
    </div>
  </section>
</template>
