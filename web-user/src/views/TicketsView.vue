<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { listTickets } from '../api';
import { dateShort, statusLabel } from '../format';

const route = useRoute();
const tickets = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 9;
const status = ref('');
const loading = ref(true);
const error = ref('');
const justPaid = ref(Boolean(route.query.paid));

const filters = [
  { value: '', label: 'All' },
  { value: 'VALID', label: 'Valid' },
  { value: 'USED', label: 'Used' },
  { value: 'REFUND_PENDING', label: 'Refunding' },
  { value: 'VOID', label: 'Void' },
];

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = { page: page.value, page_size: pageSize };
    if (status.value) params.status = status.value;
    const data = await listTickets(params);
    tickets.value = data.items;
    total.value = data.total;
  } catch (err) {
    error.value = err.message || 'Could not load your tickets.';
  } finally {
    loading.value = false;
  }
}

watch(status, () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const pages = () => Math.max(1, Math.ceil(total.value / pageSize));
</script>

<template>
  <div class="wrap">
    <div class="page-head">
      <div>
        <h1>My tickets</h1>
        <p>Each ticket carries a rotating QR code, refreshed when you open it.</p>
      </div>
      <RouterLink to="/events" class="btn btn-outline btn-sm">Browse events</RouterLink>
    </div>

    <div v-if="justPaid" class="notice notice-success" style="margin-bottom: 18px">
      Payment approved. Your new tickets are below — open one to show its QR code.
      <button class="btn btn-outline btn-sm" type="button" style="margin-left: 10px" @click="justPaid = false">Dismiss</button>
    </div>

    <div class="toolbar" style="margin-bottom: 22px">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        class="btn btn-sm"
        :class="status === f.value ? 'btn-ink' : 'btn-outline'"
        @click="status = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div>Loading tickets…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>
    <div v-else-if="!tickets.length" class="empty">No tickets here yet. Book a performance to get started.</div>

    <div v-else class="ticket-grid fade-in">
      <RouterLink v-for="ticket in tickets" :key="ticket.ticket_id" :to="`/tickets/${ticket.ticket_id}`" class="ticket-card">
        <div class="ticket-band"></div>
        <div class="ticket-body">
          <div class="toolbar" style="justify-content: space-between">
            <span class="status-badge" :class="`s-${ticket.status}`">{{ statusLabel(ticket.status) }}</span>
            <span class="muted small">{{ ticket.venue_name }}</span>
          </div>
          <h3 style="margin-top: 12px">{{ ticket.event_name }}</h3>
          <div class="ticket-meta">{{ dateShort(ticket.starts_at) }}</div>
          <div class="ticket-seat">
            <div>
              <div class="muted small">Seat</div>
              <div class="seat-code">{{ ticket.seat_label }}</div>
            </div>
            <span class="chip">Open ticket →</span>
          </div>
        </div>
      </RouterLink>
    </div>

    <div v-if="pages() > 1" class="pagination">
      <button class="btn btn-outline btn-sm" type="button" :disabled="page <= 1" @click="page--">Previous</button>
      <span>Page {{ page }} of {{ pages() }}</span>
      <button class="btn btn-outline btn-sm" type="button" :disabled="page >= pages()" @click="page++">Next</button>
    </div>
  </div>
</template>
