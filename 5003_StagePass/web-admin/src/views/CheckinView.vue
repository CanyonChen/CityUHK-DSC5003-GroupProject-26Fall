<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { checkerPerformances, checkin, listCheckins } from '../api';
import { hkt } from '../format';

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
const CHECKIN_ERRORS = {
  TICKET_ALREADY_USED: 'This ticket has already been checked in.',
  TICKET_INVALID: 'This code is not a valid ticket.',
  OUT_OF_WINDOW: 'The gate is outside its check-in window.',
  WRONG_PERFORMANCE: 'This ticket belongs to another performance.',
  FORBIDDEN: 'This account is not allowed to check in tickets.',
};

const selected = computed(() => performances.value.find((p) => p.performance_id === selectedId.value));
const withinWindow = computed(() => {
  if (!selected.value) return false;
  const now = Date.now();
  return now >= new Date(selected.value.checkin_start_at).getTime() && now < new Date(selected.value.checkin_end_at).getTime();
});

async function loadHistory() {
  if (!selectedId.value) return;
  try {
    const data = await listCheckins({ performance_id: selectedId.value, page_size: 20 });
    history.value = data.items;
    historyTotal.value = data.total;
  } catch (err) {
    errorText.value = err.message;
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
      code: err.code,
      message: CHECKIN_ERRORS[err.code] || err.message,
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
    errorText.value = err.message;
  } finally {
    loading.value = false;
  }
  nextTick(() => inputRef.value?.focus());
});
</script>

<template>
  <div class="page-head">
    <div>
      <p class="eyebrow">GATE</p>
      <h1>Check-in</h1>
      <p class="muted">Pick your performance, then enter or paste a ticket code. Each code works once.</p>
    </div>
    <button class="ghost-button" @click="loadHistory">Refresh</button>
  </div>

  <p v-if="errorText" class="form-error">{{ errorText }}</p>

  <div v-if="loading" class="empty-state">Loading gate list…</div>
  <div v-else-if="!performances.length" class="empty-state">No performances assigned to this account.</div>
  <template v-else>
    <section class="gate-grid">
      <article
        v-for="p in performances"
        :key="p.performance_id"
        class="gate-card"
        :class="{ active: p.performance_id === selectedId }"
        @click="choose(p.performance_id)"
      >
        <span class="status" :data-status="p.status">{{ p.status }}</span>
        <strong>{{ p.event_name }}</strong>
        <small>{{ p.venue_name }} · {{ hkt(p.starts_at) }}</small>
        <small class="window">Gate {{ hkt(p.checkin_start_at) }} – {{ hkt(p.checkin_end_at) }}</small>
        <div class="gate-count">{{ p.checked_in_count }} checked in</div>
      </article>
    </section>

    <section class="checkin-panel" v-if="selected">
      <div class="checkin-copy">
        <p class="eyebrow">CHECKING IN FOR</p>
        <h2>{{ selected.event_name }}</h2>
        <span class="muted">{{ selected.venue_name }} · {{ hkt(selected.starts_at) }}</span>
        <div class="window-pill" :class="{ live: withinWindow }">
          {{ withinWindow ? 'Gate is open' : 'Outside gate window' }}
        </div>
      </div>
      <form class="checkin-form" @submit.prevent="submit">
        <label>Ticket code
          <input ref="inputRef" v-model="code" placeholder="Paste QR payload or 64-char code" autocomplete="off" />
        </label>
        <button class="primary-button" :disabled="busy || !code.trim()">{{ busy ? 'Checking…' : 'Validate ticket' }}</button>
      </form>

      <div v-if="result" class="checkin-result" :class="result.ok ? 'ok' : 'bad'">
        <template v-if="result.ok">
          <span class="result-icon">✓</span>
          <div><strong>{{ result.seat_label }}</strong><small>Ticket #{{ result.ticket_id }} · checked at {{ hkt(result.checked_at) }}</small></div>
        </template>
        <template v-else>
          <span class="result-icon">!</span>
          <div><strong>{{ result.code || 'ERROR' }}</strong><small>{{ result.message }}</small>
            <small v-if="result.detail?.checker_name">First checked in by {{ result.detail.checker_name }} · {{ hkt(result.detail.checked_in_at) }}</small>
          </div>
        </template>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div><p class="eyebrow">RECENT</p><h2>Latest check-ins</h2></div>
        <span class="muted">{{ historyTotal }} total</span>
      </div>
      <div v-if="!history.length" class="empty-state">No check-ins recorded for this performance yet.</div>
      <ul v-else class="checkin-list">
        <li v-for="item in history" :key="item.checkin_id">
          <span class="seat-chip">{{ item.seat_label }}</span>
          <div><strong>{{ item.event_name }}</strong><small>by {{ item.checked_by }}</small></div>
          <span class="muted">{{ hkt(item.checked_at) }}</span>
        </li>
      </ul>
    </section>
  </template>
</template>
