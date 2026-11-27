<script setup>
import { onMounted, ref, watch } from 'vue';
import { listEvents } from '../api';
import { money, dateShort } from '../format';

const events = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 9;
const keyword = ref('');
const loading = ref(true);
const error = ref('');
let timer = null;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await listEvents({ page: page.value, page_size: pageSize, keyword: keyword.value.trim() });
    events.value = data.items;
    total.value = data.total;
  } catch (err) {
    error.value = err.message || 'Could not load events.';
  } finally {
    loading.value = false;
  }
}

watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    load();
  }, 350);
});

watch(page, load);
onMounted(load);

function coverFallback(e) {
  e.target.style.display = 'none';
}
</script>

<template>
  <section class="hero">
    <div class="wrap">
      <div class="hero-kicker">Season 2026 · Campus stages</div>
      <h1>Small theatres. Big nights.</h1>
      <p class="hero-sub">Seven productions, three venues, one place to book. Choose a show, pick a seat, and hold it while you pay.</p>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head">
        <div>
          <div class="eyebrow">Now on sale</div>
          <h2>Upcoming performances</h2>
        </div>
        <div class="toolbar">
          <label class="field">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input v-model="keyword" type="search" placeholder="Search productions" aria-label="Search productions" />
          </label>
        </div>
      </div>

      <div v-if="error" class="notice notice-error">{{ error }}</div>

      <div v-if="loading" class="loading"><div class="spinner"></div>Loading productions…</div>

      <div v-else-if="events.length" class="event-grid fade-in">
        <RouterLink v-for="ev in events" :key="ev.event_id" :to="`/events/${ev.event_id}`" class="event-card">
          <div class="cover">
            <img v-if="ev.cover_url" :src="ev.cover_url" :alt="`${ev.name} cover`" @error="coverFallback" />
          </div>
          <div class="event-body">
            <div class="event-meta">
              <span>{{ ev.venue_name }}</span>
              <span v-if="ev.next_performance_at">Next · {{ dateShort(ev.next_performance_at) }}</span>
            </div>
            <h3>{{ ev.name }}</h3>
            <div class="event-foot">
              <span class="price" v-if="ev.min_price_cents != null">From {{ money(ev.min_price_cents, ev.currency) }}</span>
              <span class="price" v-else>See dates</span>
              <span class="chip">Select seats →</span>
            </div>
          </div>
        </RouterLink>
      </div>

      <div v-else class="empty">
        <p>No productions match “{{ keyword }}”.</p>
        <button v-if="keyword" class="btn btn-outline btn-sm" type="button" @click="keyword = ''">Clear search</button>
      </div>

      <div v-if="total > pageSize" class="pagination">
        <button class="btn btn-outline btn-sm" type="button" :disabled="page <= 1" @click="page--">Previous</button>
        <span>Page {{ page }} · {{ total }} productions</span>
        <button class="btn btn-outline btn-sm" type="button" :disabled="page * pageSize >= total" @click="page++">Next</button>
      </div>
    </div>
  </section>
</template>
