<script setup>
import ConsoleDialog from '../ConsoleDialog.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { listUsers, listPerformances, grantRole, revokeRole } from '../api';
import { hkt } from '../format';
import { useAdminI18n } from '../i18n';

const { t, status, errorMessage } = useAdminI18n();
const users = ref({ items: [], total: 0 });
const performances = ref([]);
const loading = ref(true);
const error = ref('');
const keyword = ref('');
const roleFilter = ref('');
const showGrant = ref(false);
const grantTarget = ref(null);
const grantForm = reactive({ role: 'CHECKER', performance_id: '' });
const saving = ref(false);
const formError = ref('');
const revokeTarget = ref(null);

const checkerPerformances = computed(() => performances.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = { page_size: 100 };
    if (keyword.value.trim()) params.keyword = keyword.value.trim();
    if (roleFilter.value) params.role = roleFilter.value;
    users.value = await listUsers(params);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function loadPerformances() {
  try {
    const data = await listPerformances({ page_size: 100 });
    performances.value = data.items;
  } catch (err) {
    error.value = err;
  }
}

function openGrant(user) {
  grantTarget.value = user;
  grantForm.role = 'CHECKER';
  grantForm.performance_id = performances.value[0]?.performance_id || '';
  formError.value = '';
  showGrant.value = true;
}

function closeGrant() {
  showGrant.value = false;
  grantTarget.value = null;
  formError.value = '';
}

async function saveGrant() {
  formError.value = '';
  saving.value = true;
  try {
    const body = { role: grantForm.role };
    if (grantForm.role === 'CHECKER') body.performance_id = Number(grantForm.performance_id);
    await grantRole(grantTarget.value.user_id, body);
    showGrant.value = false;
    await load();
  } catch (err) {
    formError.value = err;
  } finally {
    saving.value = false;
  }
}

async function confirmRevoke() {
  error.value = '';
  try {
    await revokeRole(revokeTarget.value.user_id, revokeTarget.value.assignment_id);
    revokeTarget.value = null;
    await load();
  } catch (err) {
    error.value = err;
    revokeTarget.value = null;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadPerformances()]);
});
</script>

<template>
  <div class="page-head">
    <div>
      <h1>{{ t('shell.usersTitle') }}</h1>
      <p class="muted">{{ t('shell.usersHint') }}</p>
    </div>
  </div>

  <p v-if="error" class="form-error" role="alert">{{ errorMessage(error) }}</p>

  <section class="panel">
    <div class="filters" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <input v-model="keyword" :placeholder="t('shell.search')" :aria-label="t('shell.search')" style="max-width:260px" @keyup.enter="load" />
      <select v-model="roleFilter" :aria-label="t('shell.roleFilter')" style="max-width:180px" @change="load">
        <option value="">{{ t('shell.allRoles') }}</option>
        <option value="ADMIN">{{ status('ADMIN') }}</option>
        <option value="CHECKER">{{ status('CHECKER') }}</option>
      </select>
      <button class="ghost-button" @click="load">{{ t('shell.apply') }}</button>
    </div>

    <div v-if="loading" class="empty-state" role="status">{{ t('shell.usersLoading') }}</div>
    <div v-else-if="!users.items.length" class="empty-state">{{ t('shell.noUsers') }}</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>{{ t('shell.user') }}</th><th>{{ t('shell.roles') }}</th><th>{{ t('shell.assignments') }}</th><th>{{ t('shell.created') }}</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="user in users.items" :key="user.user_id">
            <td>
              <strong>{{ user.user_name }}</strong>
              <small class="muted">#{{ user.user_id }} · {{ user.display_name || t('shell.noName') }}</small>
            </td>
            <td>
              <span v-for="role in user.roles" :key="role" class="status" :data-status="role === 'ADMIN' ? 'PUBLISHED' : (role === 'CHECKER' ? 'PAUSED' : 'DRAFT')" style="margin-right:6px">{{ status(role) }}</span>
            </td>
            <td>
              <div v-if="!user.assignments.length" class="muted">{{ t('shell.baseOnly') }}</div>
              <div v-for="a in user.assignments" :key="a.assignment_id" style="margin-bottom:6px">
                <strong>{{ status(a.role) }}</strong>
                <span v-if="a.role === 'CHECKER'"> · {{ a.event_name }} · {{ hkt(a.starts_at) }}</span>
                <button class="ghost-button small" style="margin-left:8px" @click="revokeTarget = { ...a, user_id: user.user_id, user_name: user.user_name }">{{ t('shell.revoke') }}</button>
              </div>
            </td>
            <td>{{ hkt(user.created_at, { dateOnly: true }) }}</td>
            <td class="right"><button class="primary-button small" @click="openGrant(user)">{{ t('shell.grant') }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <ConsoleDialog v-if="showGrant" :label="t('shell.grantAccess')" @dismiss="closeGrant">
    <section class="modal" style="max-width:460px">
      <div class="modal-head">
        <div>
          <p class="eyebrow">{{ t('shell.grantAccess') }}</p>
          <h2>{{ grantTarget?.user_name }}</h2>
        </div>
        <button class="icon-button" type="button" :aria-label="t('shell.closeDialog')" @click="closeGrant">×</button>
      </div>
      <div class="form-grid">
        <label>{{ t('shell.role') }}
          <select v-model="grantForm.role">
            <option value="CHECKER">{{ t('shell.checkerScope') }}</option>
            <option value="ADMIN">{{ t('shell.adminScope') }}</option>
          </select>
        </label>
        <label v-if="grantForm.role === 'CHECKER'">{{ t('shell.performance') }}
          <select v-model="grantForm.performance_id" required>
            <option v-for="p in checkerPerformances" :key="p.performance_id" :value="p.performance_id">
              {{ p.event_name }} · {{ hkt(p.starts_at) }} (#{{ p.performance_id }})
            </option>
          </select>
        </label>
        <p class="muted span-2">{{ t('shell.scopeHint') }}</p>
      </div>
      <p v-if="formError" class="form-error" role="alert">{{ errorMessage(formError) }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="closeGrant">{{ t('shell.cancel') }}</button>
        <button class="primary-button" :disabled="saving" @click="saveGrant">{{ t(saving ? 'shell.granting' : 'shell.grant') }}</button>
      </div>
    </section>
  </ConsoleDialog>

  <ConsoleDialog v-if="revokeTarget" :label="t('shell.removeAccess')" @dismiss="revokeTarget = null">
    <section class="modal" style="max-width:440px">
      <div class="modal-head">
        <div><h2>{{ t('shell.removeTitle') }}</h2></div>
        <button class="icon-button" type="button" :aria-label="t('shell.closeDialog')" @click="revokeTarget = null">×</button>
      </div>
      <p>{{ t(revokeTarget.event_name ? 'shell.removeAssignment' : 'shell.removeRole', {
        role: status(revokeTarget.role), user: revokeTarget.user_name, event: revokeTarget.event_name,
      }) }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="revokeTarget = null">{{ t('shell.keepAccess') }}</button>
        <button class="primary-button" @click="confirmRevoke">{{ t('shell.revoke') }}</button>
      </div>
    </section>
  </ConsoleDialog>
</template>
