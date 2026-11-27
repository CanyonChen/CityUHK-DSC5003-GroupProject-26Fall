<script setup>
import { useAdminI18n } from '../i18n';
import ConsoleDialog from '../ConsoleDialog.vue';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  listEvents, listVenues, listPerformances, getPerformance, createPerformance,
  updatePerformance, publishPerformance, setSales, updateTiers, getSeatMap, setSeatStatus, bulkSetSeatStatus,
} from '../api';
import { hkt, money, toLocalInput, fromLocalInput } from '../format';

const { t, status, errorMessage, n } = useAdminI18n();
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

const formTitle = computed(() => formMode.value === 'create' ? t('programme.newPerformance') : t('programme.editPerformance', { id: editingId.value }));
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
      toast.value = { key: 'programme.draftCreated' };
    } else {
      if (editingStatus.value === 'DRAFT') payload.venue_id = Number(form.venue_id);
      await updatePerformance(editingId.value, payload);
      toast.value = { key: 'programme.performanceUpdated' };
    }
    showForm.value = false;
    await load();
  } catch (err) {
    formError.value = err;
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
    error.value = err;
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
    toast.value = err;
  }
}

function addTier(zones) {
  zones.push({ tier_id: null, tier_name: '', price: 0 });
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
    toast.value = { key: 'programme.pricesUpdated' };
    await load();
  } catch (err) {
    priceError.value = err;
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
    seatsError.value = err;
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
    seatsError.value = 'programme.lockedSeats';
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
    seatsError.value = err;
  } finally {
    seatBusy.value = null;
  }
}

async function runBulk(payload) {
  bulkBusy.value = true;
  seatsError.value = '';
  try {
    const data = await bulkSetSeatStatus(seatsTarget.value.performance_id, payload);
    toast.value = {
      key: payload.status === 'BLOCKED' ? 'programme.seatsBlocked' : 'programme.seatsRestored',
      params: { updated: n(data.updated), skipped: n(data.skipped) },
    };
    selectedSeatIds.value = [];
    await refreshSeats();
    await load();
  } catch (err) {
    seatsError.value = err;
  } finally {
    bulkBusy.value = false;
  }
}

async function bulkSelected(status) {
  if (!selectedSeatIds.value.length) {
    seatsError.value = 'programme.selectSeatsFirst';
    return;
  }
  await runBulk({ status, session_seat_ids: selectedSeatIds.value });
}

async function bulkRegion(block, status) {
  const message = status === 'BLOCKED' ? 'programme.confirmBlock' : 'programme.confirmRestore';
  if (!window.confirm(t(message, { region: block.region }))) return;
  await runBulk({ status, region: block.region });
}

async function action(row, kind) {
  try {
    if (kind === 'publish') await publishPerformance(row.performance_id);
    if (kind === 'pause') await setSales(row.performance_id, 'pause');
    if (kind === 'resume') await setSales(row.performance_id, 'resume');
    const messages = { publish: 'programme.published', pause: 'programme.paused', resume: 'programme.resumed' };
    toast.value = { key: messages[kind], params: { id: row.performance_id } };
    await load();
  } catch (err) {
    toast.value = err;
  }
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
    error.value = err;
  }
  await load();
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ t('programme.performances') }}</h1>
      <p class="muted">{{ t('programme.performancesIntro') }}</p>
    </div>
    <button class="primary-button" @click="resetCreate">{{ t('programme.newPerformance') }}</button>
  </div>

  <div v-if="toast" class="toast" role="status">
    {{ toast.key ? t(toast.key, toast.params) : errorMessage(toast) }}
    <button type="button" class="icon-button" :aria-label="t('programme.dismiss')" @click="toast = ''">×</button>
  </div>
  <p v-if="error" class="form-error">{{ errorMessage(error) }}</p>

  <section class="toolbar">
    <label>{{ t('programme.event') }}
      <select v-model="filters.event_id" :aria-label="t('programme.event')" @change="load">
        <option value="">{{ t('programme.allEvents') }}</option>
        <option v-for="e in events" :key="e.event_id" :value="e.event_id">{{ e.title }}</option>
      </select>
    </label>
    <label>{{ t('programme.status') }}
      <select v-model="filters.status" :aria-label="t('programme.status')" @change="load">
        <option value="">{{ t('programme.allStatuses') }}</option>
        <option value="DRAFT">{{ status('DRAFT') }}</option>
        <option value="PUBLISHED">{{ status('PUBLISHED') }}</option>
        <option value="SALES_PAUSED">{{ status('SALES_PAUSED') }}</option>
        <option value="FINISHED">{{ status('FINISHED') }}</option>
      </select>
    </label>
    <span class="muted">{{ t('programme.performanceCount', { count: n(total) }) }}</span>
  </section>

  <section class="panel">
    <div v-if="loading" class="empty-state">{{ t('programme.loadingPerformances') }}</div>
    <div v-else-if="!rows.length" class="empty-state">{{ t('programme.emptyPerformances') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table record-table" :aria-label="t('programme.performances')">
        <thead>
          <tr>
            <th>{{ t('programme.performance') }}</th><th>{{ t('programme.window') }}</th><th>{{ t('programme.status') }}</th><th class="num">{{ t('programme.seats') }}</th>
            <th class="num">{{ t('programme.from') }}</th><th class="num">{{ t('programme.checked') }}</th><th>{{ t('programme.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.performance_id">
            <td class="record-title" :data-label="t('programme.performance')">
              <strong>{{ row.event_name }}</strong>
              <small>{{ row.venue_name }} · #{{ row.performance_id }}</small>
            </td>
            <td class="tight record-wide" :data-label="t('programme.window')">
              <span>{{ hkt(row.starts_at) }}</span>
              <small>{{ t('programme.salesWindow', { start: hkt(row.sale_start_at), end: hkt(row.sale_end_at) }) }}</small>
            </td>
            <td :data-label="t('programme.status')"><span class="status" :data-status="row.status">{{ status(row.status) }}</span></td>
            <td class="num tight" :data-label="t('programme.seats')">
              <span>{{ t('programme.soldAndFree', { sold: n(row.seat_counts.sold), available: n(row.seat_counts.available) }) }}</span>
              <small>{{ t('programme.heldAndBlocked', { held: n(row.seat_counts.held), blocked: n(row.seat_counts.blocked) }) }}</small>
            </td>
            <td class="num" :data-label="t('programme.from')">{{ money(row.min_price_cents) }}</td>
            <td class="num" :data-label="t('programme.checked')">{{ n(row.checked_in_count) }}</td>
            <td class="record-wide record-actions" :data-label="t('programme.actions')"><div class="actions">
              <button class="ghost-button small" @click="openEdit(row)">{{ t('programme.edit') }}</button>
              <button class="ghost-button small" @click="openSeats(row)">{{ t('programme.seats') }}</button>
              <button class="ghost-button small" @click="openPrice(row)">{{ t('programme.prices') }}</button>
              <button v-if="row.status === 'DRAFT'" class="primary-button small" @click="action(row, 'publish')">{{ t('programme.publish') }}</button>
              <button v-if="row.status === 'PUBLISHED'" class="ghost-button small warn" @click="action(row, 'pause')">{{ t('programme.pause') }}</button>
              <button v-if="row.status === 'SALES_PAUSED'" class="primary-button small" @click="action(row, 'resume')">{{ t('programme.resume') }}</button>
            </div></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <ConsoleDialog v-if="showForm" :label="formTitle" @dismiss="showForm = false">
    <section class="modal wide">
      <div class="modal-head">
        <div><p class="eyebrow">{{ formMode === 'create' ? t('programme.createDraft') : t('programme.edit') }}</p><h2>{{ formTitle }}</h2></div>
        <button class="icon-button" type="button" :aria-label="t('programme.closeDialog')" @click="showForm = false">×</button>
      </div>
      <div class="form-grid">
        <label>{{ t('programme.event') }}
          <select v-model="form.event_id" :aria-label="t('programme.event')" :disabled="formMode === 'edit'">
            <option v-for="e in events" :key="e.event_id" :value="e.event_id">{{ e.title }}</option>
          </select>
        </label>
        <label>{{ t('programme.venue') }}
          <select v-model="form.venue_id" :aria-label="t('programme.venue')" :disabled="formMode === 'edit' && editingStatus !== 'DRAFT'">
            <option v-for="v in venues" :key="v.venue_id" :value="v.venue_id">{{ t('programme.venueSeats', { venue: v.name, count: n(v.seat_count) }) }}</option>
          </select>
        </label>
        <label>{{ t('programme.startsAt') }}<input v-model="form.starts_at" type="datetime-local" :disabled="formMode === 'edit' && editingStatus !== 'DRAFT'" /></label>
        <label>{{ t('programme.salesOpen') }}<input v-model="form.sale_start_at" type="datetime-local" /></label>
        <label>{{ t('programme.salesClose') }}<input v-model="form.sale_end_at" type="datetime-local" /></label>
        <label>{{ t('programme.gateOpens') }}<input v-model="form.checkin_start_at" type="datetime-local" /></label>
        <label>{{ t('programme.gateCloses') }}<input v-model="form.checkin_end_at" type="datetime-local" /></label>
        <div class="hint-card span-2" v-if="formMode === 'create'">
          {{ t('programme.draftHint', { count: n(totalSeatHint) }) }}
        </div>
        <div v-if="formMode === 'create'" class="span-2">
          <div class="subhead"><span>{{ t('programme.priceZones') }}</span><button class="ghost-button small" @click="addTier(tierRows)">{{ t('programme.addZone') }}</button></div>
          <div class="tier-row" v-for="(tier, i) in tierRows" :key="i">
            <input v-model="tier.tier_name" :aria-label="t('programme.zoneName')" :placeholder="t('programme.zoneName')" />
            <input v-model.number="tier.price" type="number" min="0" step="10" :aria-label="t('programme.priceHKD')" :placeholder="t('programme.priceHKD')" />
            <button class="icon-button" :aria-label="t('programme.removeZone', { number: n(i + 1) })" @click="tierRows.splice(i, 1)">×</button>
          </div>
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ errorMessage(formError) }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="showForm = false">{{ t('programme.cancel') }}</button>
        <button class="primary-button" :disabled="saving" @click="save">{{ saving ? t('programme.saving') : (formMode === 'create' ? t('programme.createDraft') : t('programme.saveChanges')) }}</button>
      </div>
    </section>
  </ConsoleDialog>

  <ConsoleDialog v-if="showPrice" :label="t('programme.editPrices')" @dismiss="showPrice = false">
    <section class="modal">
      <div class="modal-head">
        <div><p class="eyebrow">{{ t('programme.pricing') }}</p><h2>{{ priceTarget.event_name }}</h2><span class="muted">{{ hkt(priceTarget.starts_at) }}</span></div>
        <button class="icon-button" type="button" :aria-label="t('programme.closeDialog')" @click="showPrice = false">×</button>
      </div>
      <div class="tier-row" v-for="(tier, i) in priceRows" :key="i">
        <input v-model="tier.tier_name" :aria-label="t('programme.zoneName')" :placeholder="t('programme.zoneName')" />
        <input v-model.number="tier.price" type="number" min="0" step="10" :aria-label="t('programme.priceHKD')" :placeholder="t('programme.priceHKD')" />
      </div>
      <div class="subhead"><span class="muted">{{ t('programme.priceNote') }}</span><button class="ghost-button small" @click="addTier(priceRows)">{{ t('programme.addZone') }}</button></div>
      <p v-if="priceError" class="form-error">{{ errorMessage(priceError) }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="showPrice = false">{{ t('programme.cancel') }}</button>
        <button class="primary-button" :disabled="priceSaving" @click="savePrices">{{ priceSaving ? t('programme.saving') : t('programme.savePrices') }}</button>
      </div>
    </section>
  </ConsoleDialog>

  <ConsoleDialog v-if="showSeats" :label="t('programme.seatInventory')" @dismiss="showSeats = false">
    <section class="modal wide">
      <div class="modal-head">
        <div><p class="eyebrow">{{ t('programme.seatInventory') }}</p><h2>{{ seatsTarget.event_name }}</h2><span class="muted">{{ seatsTarget.venue_name }} · {{ hkt(seatsTarget.starts_at) }}</span></div>
        <button class="icon-button" type="button" :aria-label="t('programme.closeDialog')" @click="showSeats = false">×</button>
      </div>
      <div class="seat-legend">
        <span><i data-s="AVAILABLE"></i>{{ status('AVAILABLE') }}</span>
        <span><i data-s="BLOCKED"></i>{{ status('BLOCKED') }}</span>
        <span><i data-s="HELD"></i>{{ status('HELD') }}</span>
        <span><i data-s="SOLD"></i>{{ status('SOLD') }}</span>
        <small>{{ t('programme.seatToggleHint') }}</small>
      </div>
      <div class="seat-bulk-bar">
        <button class="ghost-button small" @click="toggleBatchMode">{{ batchMode ? t('programme.exitSelect') : t('programme.multiSelect') }}</button>
        <template v-if="batchMode">
          <button class="ghost-button small" :disabled="bulkBusy || !selectedSeatIds.length" @click="bulkSelected('BLOCKED')">{{ t('programme.blockSelected', { count: n(selectedSeatIds.length) }) }}</button>
          <button class="ghost-button small" :disabled="bulkBusy || !selectedSeatIds.length" @click="bulkSelected('AVAILABLE')">{{ t('programme.restoreSelected', { count: n(selectedSeatIds.length) }) }}</button>
          <small>{{ t('programme.selectionHint') }}</small>
        </template>
      </div>
      <div v-if="seatsLoading" class="empty-state">{{ t('programme.loadingSeats') }}</div>
      <p v-else-if="seatsError" class="form-error">{{ typeof seatsError === 'string' ? t(seatsError) : errorMessage(seatsError) }}</p>
      <div v-else class="seat-admin-wrap">
        <section v-for="block in seatRegionBlocks" :key="block.region" class="seat-region">
          <div class="seat-region-head">
            <h3>{{ block.region }}</h3>
            <div class="seat-region-actions">
              <button class="ghost-button small" :disabled="bulkBusy" @click="bulkRegion(block, 'BLOCKED')">{{ t('programme.blockFree') }}</button>
              <button class="ghost-button small" :disabled="bulkBusy" @click="bulkRegion(block, 'AVAILABLE')">{{ t('programme.restoreBlocked') }}</button>
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
              :aria-label="t('programme.seatLabel', { region: block.region, row: line.row, seat: seat.seat_no, status: status(seat.status) })"
              :aria-pressed="batchMode ? selectedSeatIds.includes(seat.session_seat_id) : undefined"
              :disabled="!['AVAILABLE', 'BLOCKED'].includes(seat.status) || seatBusy === seat.session_seat_id || bulkBusy"
              @click="toggleSeat(seat)"
            >{{ seat.seat_no }}</button>
          </div>
        </section>
      </div>
      <div class="modal-actions">
        <button class="ghost-button" @click="showSeats = false">{{ t('programme.close') }}</button>
      </div>
    </section>
  </ConsoleDialog>
</template>

<style scoped>
.toast .icon-button { min-width: 2.75rem; color: inherit; }
</style>
