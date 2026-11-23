<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { listEvents, createEvent, updateEvent } from '../api';
import { shortDate } from '../format';

const data = ref({ items: [], total: 0 });
const loading = ref(true);
const error = ref('');
const formError = ref('');
const saving = ref(false);
const editingId = ref(null);
const showForm = ref(false);
const form = reactive({ title: '', organizer_name: '', description: '', cover_url: '' });

const covers = [
  { url: '/media/thunderstorm-cover.svg', label: 'Thunderstorm' },
  { url: '/media/city-sound-cover.svg', label: 'City Sound' },
  { url: '/media/four-seasons-cover.svg', label: 'Four Seasons' },
  { url: '/media/late-night-comedy-cover.svg', label: 'Late Night Comedy' },
  { url: '/media/jazz-night-cover.svg', label: 'Jazz in the Black Box' },
  { url: '/media/little-star-cover.svg', label: 'The Little Star' },
  { url: '/media/opera-gala-cover.svg', label: 'Opera Gala' },
  { url: '/media/light-showcase-cover.svg', label: 'Light Showcase' },
];

const formTitle = computed(() => (editingId.value ? `Edit event #${editingId.value}` : 'New event'));
const coverPreview = computed(() => form.cover_url || '/media/thunderstorm-cover.svg');

function eventStatus(e) {
  if (!e.performance_count) return 'NO PERFORMANCES';
  if (e.published_count) return 'PUBLISHED';
  if (e.paused_count) return 'PAUSED';
  return 'DRAFT';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await listEvents({ page_size: 100 });
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { title: '', organizer_name: 'DSC Campus Stages', description: '', cover_url: '' });
  formError.value = '';
  showForm.value = true;
}

function openEdit(event) {
  editingId.value = event.event_id;
  Object.assign(form, {
    title: event.title || event.name || '',
    organizer_name: event.organizer_name || event.organizer || '',
    description: event.description || '',
    cover_url: event.cover_url || '',
  });
  formError.value = '';
  showForm.value = true;
}

function closeForm() {
  showForm.value = false;
  formError.value = '';
}

async function save() {
  formError.value = '';
  saving.value = true;
  try {
    const body = {
      title: form.title,
      organizer_name: form.organizer_name,
      description: form.description,
      cover_url: form.cover_url,
    };
    if (editingId.value) await updateEvent(editingId.value, body);
    else await createEvent(body);
    showForm.value = false;
    await load();
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <p class="eyebrow">PROGRAMME</p>
      <h1>Events</h1>
      <p class="muted">Create the show, then add performances and publish them.</p>
    </div>
    <button class="primary-button" @click="openCreate">New event</button>
  </div>

  <p v-if="error" class="form-error">{{ error }}</p>

  <section class="panel">
    <div v-if="loading" class="empty-state">Loading events…</div>
    <div v-else-if="!data.items.length" class="empty-state">No events yet. Create the first one.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Event</th><th>Organizer</th><th>Performances</th><th>Status</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="event in data.items" :key="event.event_id">
            <td>
              <div class="event-cell">
                <img :src="event.cover_url || '/media/thunderstorm-cover.svg'" alt="" />
                <div><strong>{{ event.title || event.name }}</strong><small>#{{ event.event_id }}</small></div>
              </div>
            </td>
            <td>{{ event.organizer_name || event.organizer }}</td>
            <td>{{ event.performance_count }} total · {{ event.published_count }} published</td>
            <td><span class="status" :data-status="eventStatus(event)">{{ eventStatus(event) }}</span></td>
            <td>{{ shortDate(event.created_at) }}</td>
            <td class="right"><button class="ghost-button small" @click="openEdit(event)">Edit</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div v-if="showForm" class="modal-backdrop" @click.self="closeForm">
    <section class="modal">
      <div class="modal-head">
        <div>
          <p class="eyebrow">{{ editingId ? 'EDIT' : 'CREATE' }}</p>
          <h2>{{ formTitle }}</h2>
        </div>
        <button class="icon-button" @click="closeForm">×</button>
      </div>
      <div class="form-grid">
        <label>Title<input v-model="form.title" maxlength="100" /></label>
        <label>Organizer<input v-model="form.organizer_name" maxlength="200" /></label>
        <label class="span-2">Description<textarea v-model="form.description" rows="4" maxlength="5000"></textarea></label>
        <label class="span-2">Cover
          <select v-model="form.cover_url">
            <option value="">No cover</option>
            <option v-for="c in covers" :key="c.url" :value="c.url">{{ c.label }}</option>
          </select>
        </label>
        <div class="cover-preview span-2">
          <img :src="coverPreview" alt="Cover preview" />
          <div><span class="muted">Preview</span><strong>{{ form.cover_url ? 'Selected cover' : 'Default poster' }}</strong></div>
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="closeForm">Cancel</button>
        <button class="primary-button" :disabled="saving" @click="save">{{ saving ? 'Saving…' : 'Save event' }}</button>
      </div>
    </section>
  </div>
</template>
