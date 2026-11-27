<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getTicket, getTicketQrObjectUrl } from '../api';
import { countdown, dateTime, money, statusLabel } from '../format';

const route = useRoute();
const ticket = ref(null);
const qrUrl = ref('');
const loading = ref(true);
const error = ref('');
const refreshing = ref(false);
const qrExpiresAt = ref(0);
const qrPayload = ref('');
const copied = ref(false);
const now = ref(Date.now());
let ticker = null;

const qrRemaining = computed(() => Math.max(0, qrExpiresAt.value - now.value));
const qrText = computed(() => (qrRemaining.value > 0 ? `${countdown(qrRemaining.value)} left` : 'refreshing…'));

onMounted(async () => {
  try {
    ticket.value = await getTicket(route.params.id);
    qrPayload.value = ticket.value.qr_token;
    qrExpiresAt.value = Date.now() + Number(ticket.value.qr_expires_in || 60) * 1000;
    await refreshQr();
    ticker = setInterval(() => {
      now.value = Date.now();
      if (qrRemaining.value <= 0) refreshQr();
    }, 1000);
  } catch (err) {
    error.value = err.message || 'Could not load this ticket.';
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  clearInterval(ticker);
  if (qrUrl.value) URL.revokeObjectURL(qrUrl.value);
});

async function refreshQr() {
  if (refreshing.value || !ticket.value) return;
  refreshing.value = true;
  try {
    const latest = await getTicket(ticket.value.ticket_id);
    ticket.value = { ...ticket.value, ...latest };
    qrPayload.value = latest.qr_token;
    const next = await getTicketQrObjectUrl(ticket.value.ticket_id);
    if (qrUrl.value) URL.revokeObjectURL(qrUrl.value);
    qrUrl.value = next;
    qrExpiresAt.value = Date.now() + Number(latest.qr_expires_in || 60) * 1000;
    copied.value = false;
  } catch (err) {
    error.value = err.message || 'Could not refresh the QR code.';
  } finally {
    refreshing.value = false;
  }
}

async function copyGateCode() {
  if (!qrPayload.value) return;
  try {
    await navigator.clipboard.writeText(qrPayload.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  } catch {
    copied.value = false;
    error.value = 'Could not copy automatically. Select the demo code below instead.';
  }
}
</script>

<template>
  <div class="wrap">
    <div class="page-head">
      <div>
        <RouterLink to="/tickets" class="backlink">← My tickets</RouterLink>
        <h1>Your ticket</h1>
      </div>
      <RouterLink v-if="ticket" :to="`/orders/${ticket.order_id}`" class="btn btn-outline btn-sm">View order</RouterLink>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div>Loading ticket…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <div v-else-if="ticket" class="panel ticket-stub fade-in">
      <section class="stub-main">
        <div class="status-strip">{{ ticket.venue_name }}</div>
        <h1>{{ ticket.event_name }}</h1>
        <div class="meta">{{ dateTime(ticket.starts_at) }}</div>
        <div class="stub-seat">
          <div>
            <div class="k">Seat</div>
            <div class="v">{{ ticket.seat_label }}</div>
          </div>
          <div>
            <div class="k">Tier</div>
            <div class="v">{{ ticket.tier_name }}</div>
          </div>
          <div>
            <div class="k">Price</div>
            <div class="v">{{ money(ticket.price_cents, 'HKD') }}</div>
          </div>
        </div>
        <div class="meta small" style="margin-top: 30px">
          Order {{ ticket.order_no }} · Issued {{ dateTime(ticket.issued_at) }}
        </div>
        <div v-if="ticket.checkin" class="notice notice-info" style="margin-top: 18px">
          Checked in {{ dateTime(ticket.checkin.checked_in_at) }}<span v-if="ticket.checkin.checker_name"> by {{ ticket.checkin.checker_name }}</span>.
        </div>
      </section>

      <aside class="stub-side">
        <span class="status-badge" :class="`s-${ticket.status}`">{{ statusLabel(ticket.status) }}</span>
        <div class="qr-frame">
          <img v-if="qrUrl" :src="qrUrl" alt="Ticket QR code" />
          <div v-else class="loading" style="padding: 60px 20px"><div class="spinner"></div></div>
        </div>
        <div class="qr-timer">{{ qrText }}</div>
        <div class="qr-note">Show this code at the venue entrance. It refreshes automatically every minute.</div>
        <button class="btn btn-outline btn-sm" type="button" :disabled="refreshing" @click="refreshQr">
          {{ refreshing ? 'Refreshing…' : 'Refresh QR' }}
        </button>
        <button
          v-if="ticket.status === 'VALID'"
          class="btn btn-outline btn-sm"
          type="button"
          style="margin-top: 8px"
          @click="copyGateCode"
        >
          {{ copied ? 'Code copied' : 'Copy gate code (demo)' }}
        </button>
        <div v-if="ticket.status !== 'VALID'" class="notice notice-warn" style="margin-top: 8px">
          This ticket is {{ statusLabel(ticket.status).toLowerCase() }} and will be rejected at the door.
        </div>
      </aside>
    </div>
  </div>
</template>
