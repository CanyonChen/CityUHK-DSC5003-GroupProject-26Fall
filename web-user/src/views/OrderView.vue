<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { cancelOrder, createPayment, getOrder, requestRefund, simulatePayment } from '../api';
import { countdown, dateTime, money, statusLabel } from '../format';
import { connectRealtime } from '../realtime';
import { createLiveRefresh } from '../liveRefresh';

const route = useRoute();
const router = useRouter();
const order = ref(null);
const payment = ref(null);
const loading = ref(true);
const error = ref('');
const actionError = ref('');
const actionInfo = ref('');
const busy = ref(false);
const now = ref(Date.now());
let ticker = null;
let poller = null;
let stopRealtime = null;

const remaining = computed(() => {
  if (!order.value?.expires_at) return 0;
  return new Date(order.value.expires_at).getTime() - now.value;
});
const timerText = computed(() => countdown(remaining.value));
const urgent = computed(() => remaining.value > 0 && remaining.value < 60 * 1000);
const isPending = computed(() => order.value?.status === 'PENDING_PAYMENT');
const canPay = computed(() => isPending.value && remaining.value > 0);
const hoursToStart = computed(() => {
  if (!order.value?.starts_at) return 0;
  return (new Date(order.value.starts_at).getTime() - Date.now()) / 3600000;
});
const refundable = computed(() => order.value?.status === 'PAID' && hoursToStart.value >= 24);
const live = createLiveRefresh(() => load(true, true));
watch(busy, (value) => {
  if (value) live.pause();
  else live.resume();
});

function isOrderEvent(msg) {
  const current = String(route.params.id);
  if (msg.order_id !== undefined && msg.order_id !== null) {
    return String(msg.order_id) === current;
  }
  const path = String(msg.path || '');
  return path === `/orders/${current}` || path.startsWith(`/orders/${current}/`);
}

onMounted(async () => {
  await load();
  ticker = setInterval(() => { now.value = Date.now(); }, 1000);
  poller = setInterval(() => {
    if (order.value?.status === 'PENDING_PAYMENT' && remaining.value <= 0) load(true);
  }, 15000);
  stopRealtime = connectRealtime((msg) => {
    if (isOrderEvent(msg)) live.push();
  });
});

onBeforeUnmount(() => {
  clearInterval(ticker);
  clearInterval(poller);
  stopRealtime?.();
  live.stop();
});

async function load(silent = false, keepPayment = false) {
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    order.value = await getOrder(route.params.id);
    if (!keepPayment) payment.value = null;
  } catch (err) {
    error.value = err.message || 'Could not load your order.';
  } finally {
    if (!silent) loading.value = false;
  }
}

async function startPayment() {
  actionError.value = '';
  actionInfo.value = '';
  busy.value = true;
  try {
    payment.value = await createPayment(order.value.order_id);
  } catch (err) {
    if (err.code === 'ORDER_EXPIRED') {
      actionError.value = 'This hold has expired. The seats have been released.';
      await load();
    } else if (err.code === 'ORDER_NOT_PAYABLE') {
      actionError.value = 'This order can no longer be paid.';
      await load();
    } else {
      actionError.value = err.message || 'Could not start the payment.';
    }
  } finally {
    busy.value = false;
  }
}

async function simulate(result) {
  if (!payment.value) return;
  actionError.value = '';
  actionInfo.value = '';
  busy.value = true;
  try {
    const data = await simulatePayment(payment.value.payment_id, result);
    if (result === 'SUCCESS' && data.order_status === 'PAID') {
      actionInfo.value = `Payment approved · ${data.tickets_issued} ticket${data.tickets_issued === 1 ? '' : 's'} issued.`;
      await load();
      setTimeout(() => router.push({ path: '/tickets', query: { paid: order.value.order_id } }), 1400);
    } else if (result === 'FAIL') {
      actionInfo.value = 'The gateway declined this attempt. Your seats are still held — try again.';
      payment.value = null;
      await load();
    } else if (result === 'TIMEOUT') {
      actionInfo.value = 'The gateway timed out. Your order is still pending; try again before the timer runs out.';
    }
  } catch (err) {
    if (err.code === 'ORDER_EXPIRED') {
      actionError.value = 'The hold expired before payment completed. A refund has been recorded for the late payment.';
      await load();
    } else {
      actionError.value = err.message || 'Payment simulation failed.';
    }
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  live.pause();
  if (!window.confirm('Cancel this order and release the seats?')) {
    live.resume();
    return;
  }
  busy.value = true;
  actionError.value = '';
  try {
    await cancelOrder(order.value.order_id);
    actionInfo.value = 'Order cancelled. The seats are available again.';
    await load();
  } catch (err) {
    if (err.code === 'ORDER_EXPIRED') {
      actionError.value = 'This order already expired.';
      await load();
    } else {
      actionError.value = err.message || 'Could not cancel the order.';
    }
  } finally {
    busy.value = false;
  }
}

async function refund() {
  live.pause();
  if (!window.confirm('Request a full refund for this order? All tickets in this order must be unused.')) {
    live.resume();
    return;
  }
  busy.value = true;
  actionError.value = '';
  actionInfo.value = '';
  try {
    const data = await requestRefund(order.value.order_id, 'Customer request');
    actionInfo.value = `Refund request #${data.refund_id} recorded (${money(data.amount_cents, order.value.currency)}). Status: ${data.status}.`;
    await load();
  } catch (err) {
    if (err.code === 'REFUND_NOT_ALLOWED') {
      actionError.value = 'This order cannot be refunded now. Refunds close 24 hours before the performance, and used or partially used orders are not eligible.';
      await load();
    } else {
      actionError.value = err.message || 'Could not request the refund.';
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="wrap">
    <div class="page-head">
      <div>
        <RouterLink to="/orders" class="backlink">← My orders</RouterLink>
        <h1>Complete your booking</h1>
      </div>
      <div v-if="order" class="toolbar">
        <span class="chip" title="Order status refreshes automatically when payment or refund state changes">● Live</span>
        <span class="status-badge" :class="`s-${order.status}`">{{ statusLabel(order.status) }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading"><div class="spinner"></div>Loading order…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <div v-else-if="order" class="checkout-grid fade-in">
      <section class="panel order-card">
        <div class="order-head">
          <div>
            <h2>{{ order.event_name }}</h2>
            <div class="muted small">{{ order.venue_name }} · {{ dateTime(order.starts_at) }}</div>
            <div class="order-no">{{ order.order_no }}</div>
          </div>
          <div v-if="isPending" class="timer" :class="{ urgent }">
            <div class="label">Seats held</div>
            <div class="value">{{ timerText }}</div>
          </div>
        </div>

        <div class="item-list">
          <div v-for="item in order.items" :key="item.order_item_id" class="item-row">
            <div class="item-main">
              <div>{{ item.seat_label }}</div>
              <div class="item-sub">{{ item.tier_name }} · {{ item.region }} row {{ item.row_no }}, seat {{ item.seat_no }}</div>
            </div>
            <div>{{ money(item.price_cents, order.currency) }}</div>
          </div>
        </div>

        <div class="totals">
          <div class="line"><span>Subtotal</span><span>{{ money(order.total_amount_cents, order.currency) }}</span></div>
          <div class="line"><span>Booking fee</span><span>Included</span></div>
          <div class="line grand"><span>Total</span><span>{{ money(order.total_amount_cents, order.currency) }}</span></div>
        </div>

        <div v-if="actionError" class="notice notice-error" style="margin-top: 16px">{{ actionError }}</div>
        <div v-if="actionInfo" class="notice notice-success" style="margin-top: 16px">{{ actionInfo }}</div>

        <div v-if="order.status === 'EXPIRED'" class="notice notice-warn" style="margin-top: 16px">
          This hold expired and the seats were released. Start a new booking from the seat map.
        </div>
        <div v-if="order.status === 'CANCELLED'" class="notice notice-info" style="margin-top: 16px">
          This order was cancelled.
        </div>

        <div v-if="order.status === 'REFUND_PENDING'" class="notice notice-warn" style="margin-top: 16px">
          Refund requested. Your tickets are frozen while the refund is processed.
        </div>
        <div v-if="order.status === 'REFUNDED'" class="notice notice-info" style="margin-top: 16px">
          This order has been refunded.
        </div>
        <div v-if="order.tickets?.length" class="notice notice-success" style="margin-top: 16px">
          Your tickets are ready.
          <RouterLink to="/tickets" style="text-decoration: underline">Open My tickets →</RouterLink>
        </div>

        <div v-if="isPending" style="margin-top: 18px">
          <button class="btn btn-danger btn-sm" type="button" :disabled="busy" @click="cancel">Cancel order</button>
        </div>
      </section>

      <aside class="panel pay-panel">
        <template v-if="order.status === 'PAID'">
          <h3>Payment complete</h3>
          <p>Paid {{ dateTime(order.paid_at) }}. Show your QR ticket at the door.</p>
          <RouterLink class="btn btn-gold btn-block" to="/tickets">View my tickets</RouterLink>
          <button
            v-if="refundable"
            class="btn btn-outline btn-block btn-sm"
            type="button"
            style="margin-top: 10px"
            :disabled="busy"
            @click="refund"
          >
            Request refund
          </button>
          <p v-else class="muted small" style="margin-top: 10px">
            Refunds close 24 hours before the performance.
          </p>
        </template>

        <template v-else-if="isPending && remaining > 0">
          <h3>Payment</h3>
          <p v-if="!payment">Start a secure payment attempt for this order. The seats stay held until the timer ends.</p>
          <p v-else>Demo gateway attempt #{{ payment.payment_id }} for {{ money(payment.amount_cents, payment.currency) }}.</p>

          <button v-if="!payment" class="btn btn-ink btn-block" type="button" :disabled="busy" @click="startPayment">
            {{ busy ? 'Starting…' : 'Continue to payment' }}
          </button>

          <div v-else class="sim-actions">
            <button class="btn btn-gold btn-block" type="button" :disabled="busy" @click="simulate('SUCCESS')">Simulate successful payment</button>
            <button class="btn btn-outline btn-block btn-sm" type="button" :disabled="busy" @click="simulate('FAIL')">Simulate decline</button>
            <button class="btn btn-outline btn-block btn-sm" type="button" :disabled="busy" @click="simulate('TIMEOUT')">Simulate timeout</button>
          </div>

          <div class="notice notice-info" style="margin-top: 14px">
            Test mode: these buttons stand in for the payment provider. No real charge is made.
          </div>
        </template>

        <template v-else-if="isPending">
          <h3>Hold expired</h3>
          <p>The 5-minute window has closed. Seats are released shortly and this order cannot be paid.</p>
          <RouterLink class="btn btn-outline btn-block" to="/events">Browse other performances</RouterLink>
        </template>

        <template v-else>
          <h3>{{ statusLabel(order.status) }}</h3>
          <p>This order is closed and cannot be paid.</p>
          <RouterLink class="btn btn-outline btn-block" to="/events">Browse events</RouterLink>
        </template>
      </aside>
    </div>
  </div>
</template>
