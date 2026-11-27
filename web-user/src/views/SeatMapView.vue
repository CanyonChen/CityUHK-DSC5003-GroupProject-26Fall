<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { createOrder, getPerformance, getSeatRecommendations, getSeats } from '../api';
import { session } from '../auth';
import { dateParts, money } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

const pendingSeatsKey = 'cityuhk-events-hub.pendingSeats';
const oldPendingSeatsKey = 'stagepass.pendingSeats';

const route = useRoute();
const router = useRouter();
const performance = ref(null);
const seatMap = ref(null);
const loading = ref(true);
const error = ref('');
const actionError = ref('');
const busy = ref(false);
const selected = ref([]);
const lastUpdated = ref('');
const recommendParty = ref(2);
const recommendRegion = ref('');
const recommendBudget = ref('');
const recommendations = ref([]);
const recommendMessage = ref('');
const recommendError = ref('');
const finding = ref(false);

const live = createLiveRefresh(() => load(true));
watch(busy, (value) => {
  if (value) live.pause();
  else live.resume();
});

function isSeatEvent(msg) {
  const current = String(route.params.id);
  if (msg.performance_id !== undefined && msg.performance_id !== null) {
    return String(msg.performance_id) === current;
  }
  const path = String(msg.path || '');
  return path.startsWith(`/performances/${current}`)
    || path.startsWith(`/admin/performances/${current}`);
}
let stopRealtime = null;

const selectedSeats = computed(() =>
  (seatMap.value?.seats || []).filter((s) => selected.value.includes(s.session_seat_id))
);
const total = computed(() => selectedSeats.value.reduce((sum, s) => sum + Number(s.price_cents || 0), 0));
const totalLabel = computed(() => money(total.value, performance.value?.currency || 'HKD'));
const maxSeats = computed(() => performance.value?.purchase_limit || 4);
const when = computed(() => (performance.value ? dateParts(performance.value.starts_at) : null));

const rows = computed(() => {
  const all = seatMap.value?.seats || [];
  const byRow = new Map();
  for (const seat of all) {
    const key = `${seat.region}-${seat.row_no}`;
    if (!byRow.has(key)) byRow.set(key, { key, region: seat.region, row_no: seat.row_no, seats: [] });
    byRow.get(key).seats.push(seat);
  }
  return [...byRow.values()]
    .sort((a, b) => {
      const ra = Number(a.row_no);
      const rb = Number(b.row_no);
      return ra === rb ? a.region.localeCompare(b.region) : ra - rb;
    })
    .map((r) => ({
      ...r,
      seats: r.seats.sort((a, b) => Number(a.seat_no) - Number(b.seat_no)),
    }));
});

const aisles = computed(() => seatMap.value?.layout?.aisles || []);
const soldOut = computed(() => !seatMap.value?.seats?.some((s) => s.status === 'AVAILABLE'));
const regionOptions = computed(() =>
  [...new Set((seatMap.value?.seats || []).map((s) => s.region))].sort()
);

async function load(silent = false) {
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    const [perf, map] = await Promise.all([
      getPerformance(route.params.id),
      getSeats(route.params.id),
    ]);
    performance.value = perf;
    seatMap.value = map;
    const available = new Set(
      map.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s.session_seat_id)
    );
    selected.value = selected.value.filter((id) => available.has(id));
    if (!recommendRegion.value || !regionOptions.value.includes(recommendRegion.value)) {
      recommendRegion.value = regionOptions.value[0] || '';
    }
    if (
      recommendations.value.length &&
      recommendations.value.some((rec) =>
        rec.seats.some((seat) => !available.has(seat.session_seat_id))
      )
    ) {
      recommendations.value = [];
      recommendMessage.value = 'Availability changed. Find seats together again.';
    }
    const pending = sessionStorage.getItem(pendingSeatsKey) ?? sessionStorage.getItem(oldPendingSeatsKey);
    if (pending) {
      try {
        const parsed = JSON.parse(pending);
        if (String(parsed.performanceId) === String(route.params.id)) {
          selected.value = (parsed.seatIds || []).filter((id) => available.has(id));
        }
      } catch {
        // ignore malformed hand-off
      }
      sessionStorage.removeItem(pendingSeatsKey);
      sessionStorage.removeItem(oldPendingSeatsKey);
    }
    lastUpdated.value = new Date().toLocaleTimeString();
  } catch (err) {
    error.value = err.message || 'Could not load this performance.';
  } finally {
    if (!silent) loading.value = false;
  }
}

onMounted(async () => {
  await load();
  stopRealtime = connectRealtime((msg) => {
    if (isSeatEvent(msg)) live.push();
  });
});

onBeforeUnmount(() => {
  stopRealtime?.();
  live.stop();
});

function toggleSeat(seat) {
  actionError.value = '';
  if (seat.status !== 'AVAILABLE') return;
  const id = seat.session_seat_id;
  const index = selected.value.indexOf(id);
  if (index >= 0) {
    selected.value.splice(index, 1);
    return;
  }
  if (selected.value.length >= maxSeats.value) {
    actionError.value = `You can reserve up to ${maxSeats.value} seats in one order.`;
    return;
  }
  selected.value.push(id);
}

function isSelected(seat) {
  return selected.value.includes(seat.session_seat_id);
}

function aisleAfter(seat) {
  return aisles.value.includes(Number(seat.seat_no));
}

function budgetInCents() {
  const raw = String(recommendBudget.value ?? '').trim();
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('Enter a budget in HKD with at most two decimal places, or leave it blank.');
  }
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isInteger(cents) || cents < 1) {
    throw new Error('Budget must be greater than zero, or leave it blank.');
  }
  return cents;
}

async function findTogether() {
  recommendError.value = '';
  recommendMessage.value = '';
  recommendations.value = [];
  const party = Number(recommendParty.value);
  if (!Number.isInteger(party) || party < 2 || party > 4) {
    recommendError.value = 'Choose 2 to 4 people.';
    return;
  }
  if (!recommendRegion.value) {
    recommendError.value = 'Choose a region first.';
    return;
  }
  let budgetCents;
  try {
    budgetCents = budgetInCents();
  } catch (err) {
    recommendError.value = err.message;
    return;
  }

  finding.value = true;
  try {
    const data = await getSeatRecommendations(Number(route.params.id), {
      partySize: party,
      region: recommendRegion.value,
      budgetCents,
      limit: 3,
    });
    recommendations.value = data.recommendations || [];
    if (!recommendations.value.length) {
      recommendMessage.value = budgetCents
        ? 'No adjacent block fits that budget. Recommendations never split a block or raise the budget.'
        : 'No adjacent block is available in this region right now.';
    }
  } catch (err) {
    if (err.code === 'SALE_CLOSED') {
      recommendError.value = 'Ticket sales for this performance have closed.';
    } else {
      recommendError.value = err.message || 'Could not look for adjacent seats.';
    }
  } finally {
    finding.value = false;
  }
}

function selectRecommendation(rec) {
  recommendError.value = '';
  const current = new Map((seatMap.value?.seats || []).map((s) => [s.session_seat_id, s]));
  const unavailable = rec.seats.filter(
    (seat) => current.get(seat.session_seat_id)?.status !== 'AVAILABLE'
  );
  if (unavailable.length) {
    recommendError.value = 'One of those seats was just taken. Refresh the map and search again.';
    recommendations.value = [];
    load();
    return;
  }
  selected.value = rec.seats.map((seat) => seat.session_seat_id);
  recommendMessage.value = 'Selected. These seats are not held until you press Reserve seats.';
}

async function reserve() {
  actionError.value = '';
  if (!selected.value.length) {
    actionError.value = 'Choose at least one seat first.';
    return;
  }
  if (!session.token) {
    sessionStorage.setItem(
      pendingSeatsKey,
      JSON.stringify({ performanceId: route.params.id, seatIds: selected.value })
    );
    router.push({ path: '/login', query: { redirect: route.fullPath } });
    return;
  }
  busy.value = true;
  try {
    const order = await createOrder(Number(route.params.id), selected.value);
    router.push(`/orders/${order.order_id}`);
  } catch (err) {
    if (err.code === 'SEAT_UNAVAILABLE') {
      actionError.value = 'Another guest just took one of those seats. Refresh the map and try again.';
      await load();
    } else if (err.code === 'LIMIT_EXCEEDED') {
      actionError.value = err.details?.existing_order_id
        ? 'You already have a pending order for this performance. Finish or cancel it before booking again.'
        : `You can reserve up to ${maxSeats.value} seats per order.`;
    } else if (err.code === 'SALE_CLOSED') {
      actionError.value = 'Ticket sales for this performance have closed.';
    } else {
      actionError.value = err.message || 'Could not reserve these seats.';
    }
  } finally {
    busy.value = false;
  }
}

function clearSelection() {
  selected.value = [];
}
</script>

<template>
  <div class="wrap">
    <div class="page-head">
      <div>
        <RouterLink v-if="performance" :to="`/events/${performance.event_id}`" class="backlink">← Back to production</RouterLink>
        <div v-if="when" class="eyebrow">{{ when.weekday }} · {{ when.day }} {{ when.month }} · {{ when.time }}</div>
        <h1>{{ performance ? performance.event_name : 'Seat map' }}</h1>
        <p v-if="performance">{{ performance.venue.name }} · Reserved seating</p>
      </div>
      <div v-if="performance" class="toolbar">
        <span class="chip">{{ performance.seat_counts.available }} available</span>
        <span class="chip">{{ performance.currency }}</span>
        <span class="chip" title="Seats refresh automatically when another visitor books or releases a seat">● Live</span>
      </div>
    </div>

    <p v-if="lastUpdated" class="muted small" style="margin: -8px 0 16px">Last updated {{ lastUpdated }}</p>

    <div v-if="loading" class="loading"><div class="spinner"></div>Loading seat map…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <div v-else class="seat-layout fade-in">
      <section class="panel panel-pad">
        <div class="section-head" style="margin-bottom: 16px">
          <div>
            <div class="eyebrow">Pick your seats</div>
            <h2 style="font-size: 24px">Auditorium plan</h2>
          </div>
          <button class="btn btn-outline btn-sm" type="button" @click="load">Refresh</button>
        </div>

        <div class="stage">Stage</div>

        <div class="seat-canvas">
          <div class="rows" role="group" aria-label="Seat map">
            <div v-for="row in rows" :key="row.key" class="seat-row">
              <span class="row-label">{{ row.row_no }}</span>
              <span class="region-tag">{{ row.region }}</span>
              <button
                v-for="seat in row.seats"
                :key="seat.session_seat_id"
                type="button"
                class="seat"
                :class="[
                  seat.status.toLowerCase(),
                  { selected: isSelected(seat), mine: seat.holder_mine, 'aisle-after': aisleAfter(seat) },
                ]"
                :disabled="seat.status !== 'AVAILABLE'"
                :aria-label="`${seat.region} row ${seat.row_no} seat ${seat.seat_no}, ${seat.status.toLowerCase()}`"
                :title="`${seat.tier_name} · ${money(seat.price_cents, seat.currency)}`"
                @click="toggleSeat(seat)"
              >
                <span class="dot"></span>
              </button>
            </div>
          </div>
        </div>

        <div class="legend">
          <span><i class="l-avail"></i>Available</span>
          <span><i class="l-sel"></i>Selected</span>
          <span><i class="l-held"></i>On hold</span>
          <span><i class="l-sold"></i>Sold</span>
          <span><i class="l-blocked"></i>Blocked</span>
          <span><i class="l-mine"></i>Your hold</span>
        </div>

        <div v-if="soldOut" class="notice notice-warn" style="margin-top: 16px">This performance has no seats available.</div>
      </section>

      <aside class="panel summary">
        <div class="recommend-box">
          <div class="eyebrow">Seats together</div>
          <h3 style="font-size: 18px">Find an adjacent block</h3>
          <p class="muted small">
            Same row, same region, no aisle crossed. Total price must stay within your budget.
          </p>
          <div class="recommend-controls">
            <label class="recommend-field">
              <span>People</span>
              <select v-model.number="recommendParty" class="input">
                <option v-for="n in [2, 3, 4]" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
            <label class="recommend-field">
              <span>Region</span>
              <select v-model="recommendRegion" class="input">
                <option v-for="r in regionOptions" :key="r" :value="r">{{ r }}</option>
              </select>
            </label>
            <label class="recommend-field">
              <span>Budget (HKD)</span>
              <input
                v-model="recommendBudget"
                class="input"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="Any"
              />
            </label>
          </div>
          <button
            class="btn btn-outline btn-sm btn-block"
            type="button"
            :disabled="finding || !regionOptions.length"
            @click="findTogether"
          >
            {{ finding ? 'Searching…' : 'Find seats together' }}
          </button>
          <div v-if="recommendError" class="notice notice-error" style="margin-top: 10px">
            {{ recommendError }}
          </div>
          <div v-if="recommendMessage" class="notice notice-warn" style="margin-top: 10px">
            {{ recommendMessage }}
          </div>
          <div v-if="recommendations.length" class="recommend-list">
            <div v-for="rec in recommendations" :key="rec.seats.map((s) => s.session_seat_id).join('-')" class="recommend-card">
              <div class="recommend-head">
                <div>
                  <strong>{{ rec.seats.map((s) => s.seat_label).join(', ') }}</strong>
                  <div class="muted small">{{ rec.seats[0].tier_name }} · {{ rec.seats[0].row_no }} row</div>
                </div>
                <span>{{ money(rec.total_amount_cents, rec.currency) }}</span>
              </div>
              <div class="recommend-reason">{{ rec.reason }}</div>
              <button class="btn btn-gold btn-sm btn-block" type="button" @click="selectRecommendation(rec)">
                Select these seats
              </button>
            </div>
          </div>
        </div>

        <h3 style="margin-top: 22px">Your selection</h3>
        <div class="venue">{{ performance.venue.name }}</div>
        <div class="muted small" style="margin-top: 6px">Up to {{ maxSeats }} seats · held for 5 minutes at checkout</div>

        <div class="summary-seats">
          <div v-if="!selectedSeats.length" class="muted small">Tap an available seat on the plan to add it here.</div>
          <div v-for="seat in selectedSeats" :key="seat.session_seat_id" class="summary-seat">
            <span>
              <strong>{{ seat.region + '-' + seat.row_no + '-' + seat.seat_no }}</strong>
              <span class="muted"> · {{ seat.tier_name }}</span>
            </span>
            <span>{{ money(seat.price_cents, seat.currency) }}</span>
          </div>
        </div>

        <div v-if="actionError" class="notice notice-error">{{ actionError }}</div>

        <div class="summary-total">
          <span>{{ selectedSeats.length }} seat{{ selectedSeats.length === 1 ? '' : 's' }}</span>
          <strong>{{ totalLabel }}</strong>
        </div>
        <div class="summary-note">Price includes all fees. Payment is completed in the next step.</div>

        <div class="summary-actions">
          <button class="btn btn-gold btn-block" type="button" :disabled="busy || !selectedSeats.length" @click="reserve">
            {{ busy ? 'Reserving…' : (session.token ? 'Reserve seats' : 'Sign in to reserve') }}
          </button>
          <button v-if="selectedSeats.length" class="btn btn-outline btn-block btn-sm" type="button" @click="clearSelection">Clear selection</button>
        </div>
      </aside>
    </div>
  </div>
</template>
