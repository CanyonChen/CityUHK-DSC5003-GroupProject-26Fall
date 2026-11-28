<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { checkerPerformances, checkin, listCheckins } from '../api';
import { hkt } from '../format';

import { useAdminI18n } from '../i18n';

const { t, status, errorMessage } = useAdminI18n();
const performances = ref([]);
const selectedId = ref(null);
const code = ref('');
const busy = ref(false);
const result = ref(null);
const errorText = ref('');
const history = ref([]);
const historyTotal = ref(0);
const loading = ref(true);
const inputRef = ref(null);
const now = ref(Date.now());
let clock;
onBeforeUnmount(() => clearInterval(clock));
const checkinErrors = new Set(['TICKET_ALREADY_USED', 'TICKET_INVALID', 'TICKET_QR_EXPIRED', 'CHECKIN_CONFLICT', 'OUT_OF_WINDOW', 'WRONG_PERFORMANCE', 'FORBIDDEN']);

const selected = computed(() => performances.value.find((p) => p.performance_id === selectedId.value));
const withinWindow = computed(() => {
  if (!selected.value) return false;
  return now.value >= new Date(selected.value.checkin_start_at).getTime() && now.value < new Date(selected.value.checkin_end_at).getTime();
});

async function loadHistory() {
  if (!selectedId.value) return;
  try {
    const data = await listCheckins({ performance_id: selectedId.value, page_size: 20 });
    history.value = data.items;
    historyTotal.value = data.total;
  } catch (err) {
    errorText.value = err;
  }
}

async function submit() {
  if (!selectedId.value || !code.value.trim()) return;
  busy.value = true;
  result.value = null;
  errorText.value = '';
  try {
    const data = await checkin(selectedId.value, code.value.trim());
    result.value = { ok: true, ...data };
    code.value = '';
    await loadHistory();
  } catch (err) {
    result.value = {
      ok: false,
      error: err,
      detail: err.details,
    };
    code.value = '';
  } finally {
    busy.value = false;
    await nextTick();
    inputRef.value?.focus();
  }
}

function choose(id) {
  selectedId.value = id;
  result.value = null;
  loadHistory();
  nextTick(() => inputRef.value?.focus());
}

watch(selectedId, loadHistory);

onMounted(async () => {
  clock = setInterval(() => { now.value = Date.now(); }, 1000);
  try {
    const data = await checkerPerformances();
    performances.value = data.items;
    const live = data.items.find((p) => {
      const now = Date.now();
      return now >= new Date(p.checkin_start_at).getTime() && now < new Date(p.checkin_end_at).getTime();
    });
    selectedId.value = live?.performance_id || data.items[0]?.performance_id || null;
    await loadHistory();
  } catch (err) {
    errorText.value = err;
  } finally {
    loading.value = false;
  }
  nextTick(() => inputRef.value?.focus());
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ t('ops.checkin') }}</h1>
      <p class="muted">{{ t('ops.gateIntro') }}</p>
    </div>
    <button class="ghost-button" @click="loadHistory">{{ t('ops.refresh') }}</button>
  </div>

  <p v-if="errorText" class="form-error" role="alert">{{ errorMessage(errorText) }}</p>

  <div v-if="loading" class="empty-state">{{ t('ops.loadingGates') }}</div>
  <div v-else-if="!performances.length" class="empty-state">{{ t('ops.noGates') }}</div>
  <template v-else>
    <section class="gate-grid">
      <button
        type="button"
        v-for="p in performances"
        :key="p.performance_id"
        class="gate-card"
        :class="{ active: p.performance_id === selectedId }"
        :aria-pressed="p.performance_id === selectedId"
        @click="choose(p.performance_id)"
      >
        <span class="status" :data-status="p.status">{{ status(p.status) }}</span>
        <strong>{{ p.event_name }}</strong>
        <small>{{ p.venue_name }} · {{ hkt(p.starts_at) }}</small>
        <small class="window">{{ t('ops.gateWindow', { start: hkt(p.checkin_start_at), end: hkt(p.checkin_end_at) }) }}</small>
        <span class="gate-count">{{ t('ops.gateCount', { count: p.checked_in_count }) }}</span>
      </button>
    </section>

    <section class="checkin-panel" v-if="selected">
      <div class="checkin-copy">
        <p class="eyebrow">{{ t('ops.checkingFor') }}</p>
        <h2>{{ selected.event_name }}</h2>
        <span class="muted">{{ selected.venue_name }} · {{ hkt(selected.starts_at) }}</span>
        <div class="window-pill" :class="{ live: withinWindow }">
          {{ t(withinWindow ? 'ops.gateOpen' : 'ops.outsideWindow') }}
        </div>
      </div>
      <form class="checkin-form" @submit.prevent="submit">
        <label>{{ t('ops.ticketCode') }}
          <input ref="inputRef" v-model="code" :placeholder="t('ops.pasteCode')" autocomplete="off" />
        </label>
        <button class="primary-button" :disabled="busy || !code.trim()">{{ t(busy ? 'ops.checking' : 'ops.validate') }}</button>
      </form>

      <div v-if="result" class="checkin-result" role="status" :class="result.ok ? 'ok' : 'bad'">
        <template v-if="result.ok">
          <span class="result-icon">✓</span>
          <div><strong>{{ result.seat_label }}</strong><small>{{ t('ops.ticketAccepted', { id: result.ticket_id, time: hkt(result.checked_at) }) }}</small></div>
        </template>
        <template v-else>
          <span class="result-icon">!</span>
          <div><strong>{{ t('ops.ticketRejected') }}</strong><small>{{ checkinErrors.has(result.error.code) ? t(`ops.${result.error.code}`) : errorMessage(result.error) }}</small>
            <small v-if="result.detail?.checker_name">{{ t('ops.firstCheckin', { name: result.detail.checker_name, time: hkt(result.detail.checked_in_at) }) }}</small>
          </div>
        </template>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div><h2>{{ t('ops.latestCheckins') }}</h2></div>
        <span class="muted">{{ t('ops.checkinTotal', { count: historyTotal }) }}</span>
      </div>
      <div v-if="!history.length" class="empty-state">{{ t('ops.noCheckins') }}</div>
      <ul v-else class="checkin-list">
        <li v-for="item in history" :key="item.checkin_id">
          <span class="seat-chip">{{ item.seat_label }}</span>
          <div><strong>{{ item.event_name }}</strong><small>{{ t('ops.checkedBy', { name: item.checked_by }) }}</small></div>
          <span class="muted">{{ hkt(item.checked_at) }}</span>
        </li>
      </ul>
    </section>
  </template>
</template>
