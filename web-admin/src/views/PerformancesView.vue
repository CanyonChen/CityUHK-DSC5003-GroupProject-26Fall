<script setup>
import ConsoleDialog from '../ConsoleDialog.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  listEvents, listVenues, listPerformances, getPerformance, createPerformance,
  updatePerformance, publishPerformance, setSales, updateTiers, getSeatMap, setSeatStatus, bulkSetSeatStatus,
} from '../api';
import { hkt, money, toLocalInput, fromLocalInput } from '../format';

const events = ref([]);
const venues = ref([]);
const rows = ref([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const toast = ref('');
const filters = reactive({ event_id: '', status: '' });

const showForm = ref(false);
const formMode = ref('create');
const editingId = ref(null);
const formError = ref('');
const saving = ref(false);
const editingStatus = ref('DRAFT');
const form = reactive({
  event_id: '', venue_id: '', starts_at: '', sale_start_at: '', sale_end_at: '',
  checkin_start_at: '', checkin_end_at: '',
});
const tierRows = ref([]);

const showPrice = ref(false);
const priceTarget = ref(null);
const priceRows = ref([]);
const priceError = ref('');
const priceSaving = ref(false);

const showSeats = ref(false);
const seatsTarget = ref(null);
const seats = ref([]);
const seatsError = ref('');
const seatsLoading = ref(false);
const seatBusy = ref(null);
const batchMode = ref(false);
const selectedSeatIds = ref([]);
const bulkBusy = ref(false);

const seatRegionBlocks = computed(() => {
  const blocks = new Map();
  for (const seat of seats.value) {
    if (!blocks.has(seat.region)) blocks.set(seat.region, new Map());
    const rows = blocks.get(seat.region);
    if (!rows.has(seat.row_no)) rows.set(seat.row_no, []);
    rows.get(seat.row_no).push(seat);
  }
  return [...blocks.entries()].map(([region, rowMap]) => ({
    region,
    rows: [...rowMap.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([row, list]) => ({
      row,
      seats: list.sort((a, b) => Number(a.seat_no) - Number(b.seat_no)),
    })),
  }));
});

const venuePresets = {
  1: [['VIP', 480], ['Standard', 320], ['Economy', 180]],
  2: [['Premium', 380], ['Standard', 260], ['Economy', 150]],
  3: [['Stalls', 580], ['Circle', 380], ['Balcony', 220]],
};

const formTitle = computed(() => (formMode.value === 'create' ? 'New performance' : `Edit performance #${editingId.value}`));
const selectedVenue = computed(() => venues.value.find((v) => String(v.venue_id) === String(form.venue_id)));
const totalSeatHint = computed(() => selectedVenue.value?.seat_count || 0);

function addDays(base, days, hour = 19, minute = 30) {
  const d = new Date(base.getTime() + days * 86400000);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function shift(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function applyPreset() {
  if (formMode.value !== 'create') return;
  const preset = venuePresets[form.venue_id] || venuePresets[1];
  tierRows.value = preset.map(([name, price]) => ({ tier_name: name, price }));
}

function resetCreate() {
  formMode.value = 'create';
  editingId.value = null;
  editingStatus.value = 'DRAFT';
  const starts = addDays(new Date(), 7);
  Object.assign(form, {
    event_id: events.value[0]?.event_id || '',
    venue_id: venues.value[0]?.venue_id || 1,
    starts_at: toLocalInput(starts),
    sale_start_at: toLocalInput(new Date()),
    sale_end_at: toLocalInput(shift(starts, -120)),
    checkin_start_at: toLocalInput(shift(starts, -90)),
    checkin_end_at: toLocalInput(shift(starts, 30)),
  });
  applyPreset();
  formError.value = '';
  showForm.value = true;
}

function openEdit(row) {
  formMode.value = 'edit';
  editingId.value = row.performance_id;
  editingStatus.value = row.status;
  Object.assign(form, {
    event_id: row.event_id,
    venue_id: row.venue_id,
    starts_at: toLocalInput(row.starts_at),
    sale_start_at: toLocalInput(row.sale_start_at),
    sale_end_at: toLocalInput(row.sale_end_at),
    checkin_start_at: toLocalInput(row.checkin_start_at),
    checkin_end_at: toLocalInput(row.checkin_end_at),
  });
  formError.value = '';
  showForm.value = true;
}

async function save() {
  formError.value = '';
  saving.value = true;
  try {
    const payload = {
      starts_at: fromLocalInput(form.starts_at),
      sale_start_at: fromLocalInput(form.sale_start_at),
      sale_end_at: fromLocalInput(form.sale_end_at),
      checkin_start_at: fromLocalInput(form.checkin_start_at),
      checkin_end_at: fromLocalInput(form.checkin_end_at),
    };
    if (formMode.value === 'create') {
      payload.event_id = Number(form.event_id);
      payload.venue_id = Number(form.venue_id);
      payload.price_tiers = tierRows.value.map((t) => ({
        tier_name: t.tier_name,
        price_cents: Math.round(Number(t.price) * 100),
      }));
      await createPerformance(payload);
      toast.value = 'Draft performance created with seats and price zones.';
    } else {
      if (editingStatus.value === 'DRAFT') payload.venue_id = Number(form.venue_id);
      await updatePerformance(editingId.value, payload);
      toast.value = 'Performance updated.';
    }
    showForm.value = false;
    await load();
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listPerformances({ ...filters, page_size: 100 });
    rows.value = data.items;
    total.value = data.total;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function openPrice(row) {
  priceTarget.value = row;
  priceError.value = '';
  try {
    const detail = await getPerformance(row.performance_id);
    priceRows.value = detail.price_tiers.map((t) => ({ tier_id: t.tier_id, tier_name: t.tier_name, price: t.price_cents / 100 }));
    showPrice.value = true;
  } catch (err) {
    toast.value = err.message;
  }
}

function addTier() {
  priceRows.value.push({ tier_id: null, tier_name: '', price: 0 });
}

async function savePrices() {
  priceError.value = '';
  priceSaving.value = true;
  try {
    await updateTiers(priceTarget.value.performance_id, priceRows.value.map((t) => ({
      tier_id: t.tier_id || undefined,
      tier_name: t.tier_name,
      price_cents: Math.round(Number(t.price) * 100),
    })));
    showPrice.value = false;
    toast.value = 'Price zones updated.';
    await load();
  } catch (err) {
    priceError.value = err.message;
  } finally {
    priceSaving.value = false;
  }
}

async function openSeats(row) {
  seatsTarget.value = row;
  seatsError.value = '';
  seatsLoading.value = true;
  batchMode.value = false;
  selectedSeatIds.value = [];
  showSeats.value = true;
  try {
    const data = await getSeatMap(row.performance_id);
    seats.value = data.seats;
  } catch (err) {
    seatsError.value = err.message;
  } finally {
    seatsLoading.value = false;
  }
}

async function refreshSeats() {
  const data = await getSeatMap(seatsTarget.value.performance_id);
  seats.value = data.seats;
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value;
  selectedSeatIds.value = [];
  seatsError.value = '';
}

function toggleSeat(seat) {
  if (!['AVAILABLE', 'BLOCKED'].includes(seat.status)) {
    seatsError.value = 'Only free or blocked seats can be changed. Held and sold seats are locked.';
    return;
  }
  if (batchMode.value) {
    const id = seat.session_seat_id;
    selectedSeatIds.value = selectedSeatIds.value.includes(id)
      ? selectedSeatIds.value.filter((x) => x !== id)
      : [...selectedSeatIds.value, id];
    seatsError.value = '';
    return;
  }
  return toggleSingleSeat(seat);
}

async function toggleSingleSeat(seat) {
  seatBusy.value = seat.session_seat_id;
  seatsError.value = '';
  try {
    await setSeatStatus(seat.session_seat_id, seat.status === 'BLOCKED' ? 'AVAILABLE' : 'BLOCKED');
    await refreshSeats();
    await load();
  } catch (err) {
    seatsError.value = err.message;
  } finally {
    seatBusy.value = null;
  }
}

async function runBulk(payload, label) {
  bulkBusy.value = true;
  seatsError.value = '';
  try {
    const data = await bulkSetSeatStatus(seatsTarget.value.performance_id, payload);
    toast.value = `${label}: ${data.updated} changed, ${data.skipped} locked skipped.`;
    selectedSeatIds.value = [];
    await refreshSeats();
    await load();
  } catch (err) {
    seatsError.value = err.message;
  } finally {
    bulkBusy.value = false;
  }
}

async function bulkSelected(status) {
  if (!selectedSeatIds.value.length) {
    seatsError.value = 'Select at least one free or blocked seat.';
    return;
  }
  await runBulk({ status, session_seat_ids: selectedSeatIds.value }, status === 'BLOCKED' ? 'Block selected' : 'Restore selected');
}

async function bulkRegion(block, status) {
  const label = status === 'BLOCKED' ? 'Block region' : 'Restore region';
  if (!window.confirm(`${label} ${block.region}? Held and sold seats are skipped.`)) return;
  await runBulk({ status, region: block.region }, label);
}

async function action(row, kind) {
  try {
    if (kind === 'publish') await publishPerformance(row.performance_id);
    if (kind === 'pause') await setSales(row.performance_id, 'pause');
    if (kind === 'resume') await setSales(row.performance_id, 'resume');
    toast.value = `Performance #${row.performance_id}: ${kind} done.`;
    await load();
  } catch (err) {
    toast.value = err.message;
  }
}

function statusLabel(s) {
  return s === 'SALES_PAUSED' ? 'PAUSED' : s;
}

watch(() => form.venue_id, (next, prev) => {
  if (formMode.value === 'create' && next !== prev) applyPreset();
});

onMounted(async () => {
  try {
    const [ev, vn] = await Promise.all([listEvents({ page_size: 100 }), listVenues()]);
    events.value = ev.items;
    venues.value = vn.items;
  } catch (err) {
    error.value = err.message;
  }
  await load();
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>Performances</h1>
      <p class="muted">Set performance times, sales windows and seat prices.</p>
    </div>
    <button class="primary-button" @click="resetCreate">New performance</button>
  </div>

  <div v-if="toast" class="toast" @click="toast = ''">{{ toast }} <span>×</span></div>
  <p v-if="error" class="form-error">{{ error }}</p>

  <section class="toolbar">
    <label>Event
      <select v-model="filters.event_id" @change="load">
        <option value="">All events</option>
        <option v-for="e in events" :key="e.event_id" :value="e.event_id">{{ e.title }}</option>
      </select>
    </label>
    <label>Status
      <select v-model="filters.status" @change="load">
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="PUBLISHED">Published</option>
        <option value="SALES_PAUSED">Sales paused</option>
        <option value="FINISHED">Finished</option>
      </select>
    </label>
    <span class="muted">{{ total }} performances</span>
  </section>

  <section class="panel">
    <div v-if="loading" class="empty-state">Loading performances…</div>
    <div v-else-if="!rows.length" class="empty-state">No performances match this filter.</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table" aria-label="Performances">
        <thead>
          <tr>
            <th>Performance</th><th>Window</th><th>Status</th><th class="num">Seats</th>
            <th class="num">From</th><th class="num">Gate</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.performance_id">
            <td class="record-title" data-label="Performance">
              <strong>{{ row.event_name }}</strong>
              <small>{{ row.venue_name }} · #{{ row.performance_id }}</small>
            </td>
            <td class="tight record-wide" data-label="Window">
              <span>{{ hkt(row.starts_at) }}</span>
              <small>Sales {{ hkt(row.sale_start_at) }} → {{ hkt(row.sale_end_at) }}</small>
            </td>
            <td data-label="Status"><span class="status" :data-status="row.status">{{ statusLabel(row.status) }}</span></td>
            <td class="num tight" data-label="Seats">
              <span>{{ row.seat_counts.sold }} sold · {{ row.seat_counts.available }} free</span>
              <small>{{ row.seat_counts.held }} held · {{ row.seat_counts.blocked }} blocked</small>
            </td>
            <td class="num" data-label="From">{{ money(row.min_price_cents) }}</td>
            <td class="num" data-label="Gate">{{ row.checked_in_count }}</td>
            <td class="record-wide record-actions" data-label="Actions"><div class="actions">
              <button class="ghost-button small" @click="openEdit(row)">Edit</button>
              <button class="ghost-button small" @click="openSeats(row)">Seats</button>
              <button class="ghost-button small" @click="openPrice(row)">Prices</button>
              <button v-if="row.status === 'DRAFT'" class="primary-button small" @click="action(row, 'publish')">Publish</button>
              <button v-if="row.status === 'PUBLISHED'" class="ghost-button small warn" @click="action(row, 'pause')">Pause</button>
              <button v-if="row.status === 'SALES_PAUSED'" class="primary-button small" @click="action(row, 'resume')">Resume</button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <ConsoleDialog v-if="showForm" :label="formTitle" @dismiss="showForm = false">
    <section class="modal wide">
      <div class="modal-head">
        <div><p class="eyebrow">{{ formMode === 'create' ? 'CREATE DRAFT' : 'EDIT' }}</p><h2>{{ formTitle }}</h2></div>
        <button class="icon-button" type="button" aria-label="Close dialog" @click="showForm = false">×</button>
      </div>
      <div class="form-grid">
        <label>Event
          <select v-model="form.event_id" :disabled="formMode === 'edit'">
            <option v-for="e in events" :key="e.event_id" :value="e.event_id">{{ e.title }}</option>
          </select>
        </label>
        <label>Venue
          <select v-model="form.venue_id" :disabled="formMode === 'edit' && editingStatus !== 'DRAFT'">
            <option v-for="v in venues" :key="v.venue_id" :value="v.venue_id">{{ v.name }} · {{ v.seat_count }} seats</option>
          </select>
        </label>
        <label>Starts at (HKT)<input v-model="form.starts_at" type="datetime-local" :disabled="formMode === 'edit' && editingStatus !== 'DRAFT'" /></label>
        <label>Sales open<input v-model="form.sale_start_at" type="datetime-local" /></label>
        <label>Sales close<input v-model="form.sale_end_at" type="datetime-local" /></label>
        <label>Gate opens<input v-model="form.checkin_start_at" type="datetime-local" /></label>
        <label>Gate closes<input v-model="form.checkin_end_at" type="datetime-local" /></label>
        <div class="hint-card span-2" v-if="formMode === 'create'">
          This draft will create <strong>{{ totalSeatHint }}</strong> seats. Price rows map to venue regions in order.
        </div>
        <div v-if="formMode === 'create'" class="span-2">
          <div class="subhead"><span>Price zones</span><button class="ghost-button small" @click="addTier">+ Add zone</button></div>
          <div class="tier-row" v-for="(tier, i) in tierRows" :key="i">
            <input v-model="tier.tier_name" placeholder="Zone name" />
            <input v-model.number="tier.price" type="number" min="0" step="10" placeholder="Price (HKD)" />
            <button class="icon-button" @click="tierRows.splice(i, 1)">×</button>
          </div>
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="showForm = false">Cancel</button>
        <button class="primary-button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : (formMode === 'create' ? 'Create draft' : 'Save changes') }}</button>
      </div>
    </section>
  </ConsoleDialog>

  <ConsoleDialog v-if="showPrice" label="Edit performance prices" @dismiss="showPrice = false">
    <section class="modal">
      <div class="modal-head">
        <div><p class="eyebrow">PRICING</p><h2>{{ priceTarget.event_name }}</h2><span class="muted">{{ hkt(priceTarget.starts_at) }}</span></div>
        <button class="icon-button" type="button" aria-label="Close dialog" @click="showPrice = false">×</button>
      </div>
      <div class="tier-row" v-for="(tier, i) in priceRows" :key="i">
        <input v-model="tier.tier_name" placeholder="Zone name" />
        <input v-model.number="tier.price" type="number" min="0" step="10" placeholder="Price (HKD)" />
      </div>
      <div class="subhead"><span class="muted">Prices update instantly for new orders.</span><button class="ghost-button small" @click="addTier">+ Add zone</button></div>
      <p v-if="priceError" class="form-error">{{ priceError }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="showPrice = false">Cancel</button>
        <button class="primary-button" :disabled="priceSaving" @click="savePrices">{{ priceSaving ? 'Saving…' : 'Save prices' }}</button>
      </div>
    </section>
  </ConsoleDialog>

  <ConsoleDialog v-if="showSeats" label="Seat inventory" @dismiss="showSeats = false">
    <section class="modal wide">
      <div class="modal-head">
        <div><p class="eyebrow">SEAT INVENTORY</p><h2>{{ seatsTarget.event_name }}</h2><span class="muted">{{ seatsTarget.venue_name }} · {{ hkt(seatsTarget.starts_at) }}</span></div>
        <button class="icon-button" type="button" aria-label="Close dialog" @click="showSeats = false">×</button>
      </div>
      <div class="seat-legend">
        <span><i data-s="AVAILABLE"></i>Free</span>
        <span><i data-s="BLOCKED"></i>Blocked</span>
        <span><i data-s="HELD"></i>Held</span>
        <span><i data-s="SOLD"></i>Sold</span>
        <small>Click a free or blocked seat to toggle it.</small>
      </div>
      <div class="seat-bulk-bar">
        <button class="ghost-button small" @click="toggleBatchMode">{{ batchMode ? 'Exit select mode' : 'Select multiple' }}</button>
        <template v-if="batchMode">
          <button class="ghost-button small" :disabled="bulkBusy || !selectedSeatIds.length" @click="bulkSelected('BLOCKED')">Block selected ({{ selectedSeatIds.length }})</button>
          <button class="ghost-button small" :disabled="bulkBusy || !selectedSeatIds.length" @click="bulkSelected('AVAILABLE')">Restore selected ({{ selectedSeatIds.length }})</button>
          <small>Selected seats are outlined; held and sold seats cannot be selected.</small>
        </template>
      </div>
      <div v-if="seatsLoading" class="empty-state">Loading seats…</div>
      <p v-else-if="seatsError" class="form-error">{{ seatsError }}</p>
      <div v-else class="seat-admin-wrap">
        <section v-for="block in seatRegionBlocks" :key="block.region" class="seat-region">
          <div class="seat-region-head">
            <h3>{{ block.region }}</h3>
            <div class="seat-region-actions">
              <button class="ghost-button small" :disabled="bulkBusy" @click="bulkRegion(block, 'BLOCKED')">Block free</button>
              <button class="ghost-button small" :disabled="bulkBusy" @click="bulkRegion(block, 'AVAILABLE')">Restore blocked</button>
            </div>
          </div>
          <div v-for="line in block.rows" :key="line.row" class="seat-line">
            <span class="seat-row-label">{{ line.row }}</span>
            <button
              v-for="seat in line.seats"
              :key="seat.session_seat_id"
              class="seat-cell"
              :class="{ selected: batchMode && selectedSeatIds.includes(seat.session_seat_id) }"
              :data-s="seat.status"
              :disabled="!['AVAILABLE', 'BLOCKED'].includes(seat.status) || seatBusy === seat.session_seat_id || bulkBusy"
              @click="toggleSeat(seat)"
            >{{ seat.seat_no }}</button>
          </div>
        </section>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" @click="showSeats = false">Close</button>
      </div>
    </section>
  </ConsoleDialog>
</template>
