<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { cancelOrder, listOrders, requestRefund } from '../api';
import { dateShort, money, statusLabel } from '../format';

const router = useRouter();
const orders = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const status = ref('');
const loading = ref(true);
const error = ref('');
const actionError = ref('');
const actionInfo = ref('');
const busyId = ref(null);

const filters = [
  { value: '', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Pending' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'REFUND_PENDING', label: 'Refund' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = { page: page.value, page_size: pageSize };
    if (status.value) params.status = status.value;
    const data = await listOrders(params);
    orders.value = data.items;
    total.value = data.total;
  } catch (err) {
    error.value = err.message || 'Could not load your orders.';
  } finally {
    loading.value = false;
  }
}

watch(status, () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

function open(order) {
  router.push(`/orders/${order.order_id}`);
}

async function cancel(order) {
  if (!window.confirm(`Cancel order ${order.order_no} and release its seats?`)) return;
  busyId.value = order.order_id;
  actionError.value = '';
  try {
    await cancelOrder(order.order_id);
    await load();
  } catch (err) {
    actionError.value = err.message || 'Could not cancel this order.';
  } finally {
    busyId.value = null;
  }
}

function refundable(order) {
  return order.status === 'PAID' && (new Date(order.starts_at).getTime() - Date.now()) >= 24 * 3600000;
}

async function refund(order) {
  if (!window.confirm('Request a full refund for this order? All tickets must be unused.')) return;
  busyId.value = order.order_id;
  actionError.value = '';
  try {
    const data = await requestRefund(order.order_id, 'Customer request');
    actionInfo.value = `Refund request #${data.refund_id} recorded. Status: ${data.status}.`;
    actionError.value = '';
    await load();
  } catch (err) {
    actionError.value = err.code === 'REFUND_NOT_ALLOWED'
      ? 'This order is not eligible for a refund. Refunds close 24 hours before the performance and used tickets cannot be refunded.'
      : (err.message || 'Could not request the refund.');
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="wrap">
    <div class="page-head">
      <div>
        <h1>My orders</h1>
        <p>Pending holds expire after five minutes. Paid orders keep their seats.</p>
      </div>
      <RouterLink to="/events" class="btn btn-outline btn-sm">Browse events</RouterLink>
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

    <div v-if="actionInfo" class="notice notice-success" style="margin-bottom: 14px">{{ actionInfo }}</div>
    <div v-if="actionError" class="notice notice-error" style="margin-bottom: 14px">{{ actionError }}</div>
    <div v-if="loading" class="loading"><div class="spinner"></div>Loading orders…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>
    <div v-else-if="!orders.length" class="empty">No orders in this view yet.</div>

    <div v-else class="order-list fade-in">
      <article v-for="order in orders" :key="order.order_id" class="panel order-row" role="button" tabindex="0" @click="open(order)" @keyup.enter="open(order)">
        <div>
          <div class="title">{{ order.event_name }}</div>
          <div class="sub">{{ order.venue_name }} · {{ dateShort(order.starts_at) }}</div>
          <div class="sub">{{ order.order_no }}</div>
        </div>
        <div class="side">
          <span class="status-badge" :class="`s-${order.status}`">{{ statusLabel(order.status) }}</span>
          <span class="price">{{ money(order.total_amount_cents, order.currency) }}</span>
          <div class="toolbar" @click.stop>
            <button v-if="order.status === 'PENDING_PAYMENT'" class="btn btn-gold btn-sm" type="button" @click="open(order)">Pay now</button>
            <button
              v-if="order.status === 'PENDING_PAYMENT'"
              class="btn btn-danger btn-sm"
              type="button"
              :disabled="busyId === order.order_id"
              @click="cancel(order)"
            >
              Cancel
            </button>
            <RouterLink v-if="order.status === 'PAID'" class="btn btn-outline btn-sm" to="/tickets">Tickets</RouterLink>
            <button
              v-if="refundable(order)"
              class="btn btn-outline btn-sm"
              type="button"
              :disabled="busyId === order.order_id"
              @click="refund(order)"
            >
              Refund
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button class="btn btn-outline btn-sm" type="button" :disabled="page <= 1" @click="page--">Previous</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button class="btn btn-outline btn-sm" type="button" :disabled="page >= totalPages" @click="page++">Next</button>
    </div>
  </div>
</template>
