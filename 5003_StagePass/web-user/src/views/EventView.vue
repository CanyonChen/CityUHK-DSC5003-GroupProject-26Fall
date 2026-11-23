<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getEvent } from '../api';
import { dateParts, money } from '../format';

const route = useRoute();
const event = ref(null);
const loading = ref(true);
const error = ref('');

const cover = computed(() => event.value?.media?.[0]?.url || '');
const totalShows = computed(() => event.value?.performances?.length || 0);

onMounted(async () => {
  try {
    event.value = await getEvent(route.params.id);
  } catch (err) {
    error.value = err.message || 'Event not found.';
  } finally {
    loading.value = false;
  }
});

function soldOut(p) {
  return p.status === 'SALES_PAUSED' || p.available_seats <= 0;
}
</script>

<template>
  <div class="wrap detail-top">
    <RouterLink to="/events" class="backlink">← All productions</RouterLink>

    <div v-if="loading" class="loading"><div class="spinner"></div>Loading production…</div>
    <div v-else-if="error" class="notice notice-error">{{ error }}</div>

    <template v-else-if="event">
      <section class="detail-hero fade-in">
        <img v-if="cover" :src="cover" :alt="`${event.name} cover`" />
        <div class="detail-copy">
          <div class="organizer">{{ event.organizer }}</div>
          <h1>{{ event.name }}</h1>
          <p>{{ event.description }}</p>
          <div class="event-meta" style="color: rgba(247,245,240,.62)">
            <span>{{ totalShows }} performance{{ totalShows === 1 ? '' : 's' }}</span>
            <span>Reserved seating</span>
            <span>Mobile ticket</span>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div>
            <div class="eyebrow">Choose a date</div>
            <h2>Performances</h2>
          </div>
        </div>

        <div v-if="event.performances.length" class="perf-list">
          <div v-for="p in event.performances" :key="p.performance_id" class="perf-row">
            <div class="perf-date">
              <div class="date-block">
                <div class="d">{{ dateParts(p.starts_at).day }}</div>
                <div class="m">{{ dateParts(p.starts_at).month }}</div>
              </div>
              <div class="perf-info">
                <div class="t">{{ dateParts(p.starts_at).weekday }} · {{ dateParts(p.starts_at).time }}</div>
                <div class="s">Doors open 30 minutes before the performance</div>
              </div>
            </div>
            <div class="perf-side">
              <div class="availability">
                <strong>{{ p.available_seats }}</strong> seats left
                <div v-if="p.min_price_cents != null">from {{ money(p.min_price_cents, p.currency) }}</div>
              </div>
              <RouterLink
                v-if="!soldOut(p)"
                class="btn btn-gold btn-sm"
                :to="`/performances/${p.performance_id}/seats`"
              >
                Select seats
              </RouterLink>
              <span v-else class="chip">{{ p.status === 'SALES_PAUSED' ? 'Sales paused' : 'Sold out' }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty">No performances are currently on sale for this production.</div>
      </section>
    </template>
  </div>
</template>
