<script setup>
import { useAdminI18n } from '../i18n';
import ConsoleDialog from '../ConsoleDialog.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { listEvents, createEvent, updateEvent } from '../api';
import { shortDate } from '../format';

const { t, status, errorMessage, n } = useAdminI18n();
const data = ref({ items: [], total: 0 });
const loading = ref(true);
const error = ref('');
const formError = ref('');
const saving = ref(false);
const editingId = ref(null);
const showForm = ref(false);
const form = reactive({ title: '', organizer_name: '', description: '', cover_url: '' });

const covers = [
  { url: '/media/thunderstorm-cover.svg', label: 'programme.coverThunder' },
  { url: '/media/city-sound-cover.svg', label: 'programme.coverCity' },
  { url: '/media/four-seasons-cover.svg', label: 'programme.coverSeasons' },
  { url: '/media/late-night-comedy-cover.svg', label: 'programme.coverComedy' },
  { url: '/media/jazz-night-cover.svg', label: 'programme.coverJazz' },
  { url: '/media/little-star-cover.svg', label: 'programme.coverStar' },
  { url: '/media/opera-gala-cover.svg', label: 'programme.coverOpera' },
  { url: '/media/light-showcase-cover.svg', label: 'programme.coverLight' },
];

const formTitle = computed(() => editingId.value ? t('programme.editEvent', { id: editingId.value }) : t('programme.newEvent'));
const coverPreview = computed(() => form.cover_url || '/media/thunderstorm-cover.svg');

function eventStatus(e) {
  if (!e.performance_count) return 'NO_PERFORMANCES';
  if (e.published_count) return 'PUBLISHED';
  if (e.paused_count) return 'SALES_PAUSED';
  return 'DRAFT';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await listEvents({ page_size: 100 });
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { title: '', organizer_name: '', description: '', cover_url: '' });
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
    formError.value = err;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ t('programme.events') }}</h1>
      <p class="muted">{{ t('programme.eventsIntro') }}</p>
    </div>
    <button class="primary-button" @click="openCreate">{{ t('programme.newEvent') }}</button>
  </div>

  <p v-if="error" class="form-error">{{ errorMessage(error) }}</p>

  <section class="panel">
    <div v-if="loading" class="empty-state">{{ t('programme.loadingEvents') }}</div>
    <div v-else-if="!data.items.length" class="empty-state">{{ t('programme.emptyEvents') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>{{ t('programme.event') }}</th><th>{{ t('programme.organizer') }}</th><th>{{ t('programme.performances') }}</th><th>{{ t('programme.status') }}</th><th>{{ t('programme.created') }}</th><th></th></tr>
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
            <td>{{ t('programme.eventCounts', { total: n(event.performance_count), published: n(event.published_count) }) }}</td>
            <td><span class="status" :data-status="eventStatus(event)">{{ eventStatus(event) === 'NO_PERFORMANCES' ? t('programme.noPerformances') : status(eventStatus(event)) }}</span></td>
            <td>{{ shortDate(event.created_at) }}</td>
            <td class="right"><button class="ghost-button small" @click="openEdit(event)">{{ t('programme.edit') }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <ConsoleDialog v-if="showForm" :label="formTitle" @dismiss="closeForm">
    <section class="modal">
      <div class="modal-head">
        <div>
          <p class="eyebrow">{{ editingId ? t('programme.edit') : t('programme.create') }}</p>
          <h2>{{ formTitle }}</h2>
        </div>
        <button class="icon-button" type="button" :aria-label="t('programme.closeDialog')" @click="closeForm">×</button>
      </div>
      <div class="form-grid">
        <label>{{ t('programme.title') }}<input v-model="form.title" maxlength="100" /></label>
        <label>{{ t('programme.organizer') }}<input v-model="form.organizer_name" maxlength="200" /></label>
        <label class="span-2">{{ t('programme.description') }}<textarea v-model="form.description" rows="4" maxlength="5000"></textarea></label>
        <label class="span-2">{{ t('programme.cover') }}
          <select v-model="form.cover_url" :aria-label="t('programme.cover')">
            <option value="">{{ t('programme.noCover') }}</option>
            <option v-for="c in covers" :key="c.url" :value="c.url">{{ t(c.label) }}</option>
          </select>
        </label>
        <div class="cover-preview span-2">
          <img :src="coverPreview" :alt="t('programme.coverPreview')" />
          <div><span class="muted">{{ t('programme.preview') }}</span><strong>{{ form.cover_url ? t('programme.selectedCover') : t('programme.defaultPoster') }}</strong></div>
        </div>
      </div>
      <p v-if="formError" class="form-error">{{ errorMessage(formError) }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="closeForm">{{ t('programme.cancel') }}</button>
        <button class="primary-button" :disabled="saving" @click="save">{{ saving ? t('programme.saving') : t('programme.saveEvent') }}</button>
      </div>
    </section>
  </ConsoleDialog>
</template>
