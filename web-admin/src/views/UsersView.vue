<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { listUsers, listPerformances, grantRole, revokeRole } from '../api';
import { hkt } from '../format';

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
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function loadPerformances() {
  try {
    const data = await listPerformances({ page_size: 100 });
    performances.value = data.items;
  } catch (err) {
    error.value = err.message;
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
    formError.value = err.message;
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
    error.value = err.message;
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
      <p class="eyebrow">ACCESS CONTROL</p>
      <h1>Users &amp; roles</h1>
      <p class="muted">Grant ADMIN or per-performance CHECKER access. Revocation takes effect on the next request.</p>
    </div>
  </div>

  <p v-if="error" class="form-error">{{ error }}</p>

  <section class="panel">
    <div class="filters" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <input v-model="keyword" placeholder="Search account or name" style="max-width:260px" @keyup.enter="load" />
      <select v-model="roleFilter" style="max-width:180px" @change="load">
        <option value="">All roles</option>
        <option value="ADMIN">ADMIN</option>
        <option value="CHECKER">CHECKER</option>
      </select>
      <button class="ghost-button" @click="load">Apply</button>
    </div>

    <div v-if="loading" class="empty-state">Loading users…</div>
    <div v-else-if="!users.items.length" class="empty-state">No users match this filter.</div>
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>User</th><th>Roles</th><th>Active assignments</th><th>Created</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="user in users.items" :key="user.user_id">
            <td>
              <strong>{{ user.user_name }}</strong>
              <small class="muted">#{{ user.user_id }} · {{ user.display_name || 'No display name' }}</small>
            </td>
            <td>
              <span v-for="role in user.roles" :key="role" class="status" :data-status="role === 'ADMIN' ? 'PUBLISHED' : (role === 'CHECKER' ? 'PAUSED' : 'DRAFT')" style="margin-right:6px">{{ role }}</span>
            </td>
            <td>
              <div v-if="!user.assignments.length" class="muted">Base USER only</div>
              <div v-for="a in user.assignments" :key="a.assignment_id" style="margin-bottom:6px">
                <strong>{{ a.role }}</strong>
                <span v-if="a.role === 'CHECKER'"> · {{ a.event_name }} · {{ hkt(a.starts_at) }}</span>
                <button class="ghost-button small" style="margin-left:8px" @click="revokeTarget = { ...a, user_id: user.user_id, user_name: user.user_name }">Revoke</button>
              </div>
            </td>
            <td>{{ hkt(user.created_at, { dateOnly: true }) }}</td>
            <td class="right"><button class="primary-button small" @click="openGrant(user)">Grant role</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <div v-if="showGrant" class="modal-backdrop" @click.self="closeGrant">
    <section class="modal" style="max-width:460px">
      <div class="modal-head">
        <div>
          <p class="eyebrow">GRANT</p>
          <h2>{{ grantTarget?.user_name }}</h2>
        </div>
        <button class="icon-button" @click="closeGrant">×</button>
      </div>
      <div class="form-grid">
        <label>Role
          <select v-model="grantForm.role">
            <option value="CHECKER">CHECKER — one performance</option>
            <option value="ADMIN">ADMIN — full access</option>
          </select>
        </label>
        <label v-if="grantForm.role === 'CHECKER'">Performance
          <select v-model="grantForm.performance_id" required>
            <option v-for="p in checkerPerformances" :key="p.performance_id" :value="p.performance_id">
              {{ p.event_name }} · {{ hkt(p.starts_at) }} (#{{ p.performance_id }})
            </option>
          </select>
        </label>
        <p class="muted span-2">CHECKER can only check in tickets for the selected performance. ADMIN can manage events, refunds, seats and users.</p>
      </div>
      <p v-if="formError" class="form-error">{{ formError }}</p>
      <div class="modal-actions">
        <button class="ghost-button" @click="closeGrant">Cancel</button>
        <button class="primary-button" :disabled="saving" @click="saveGrant">{{ saving ? 'Granting…' : 'Grant role' }}</button>
      </div>
    </section>
  </div>

  <div v-if="revokeTarget" class="modal-backdrop" @click.self="revokeTarget = null">
    <section class="modal" style="max-width:440px">
      <div class="modal-head">
        <div><p class="eyebrow">REVOKE</p><h2>Remove access?</h2></div>
        <button class="icon-button" @click="revokeTarget = null">×</button>
      </div>
      <p>
        Remove <strong>{{ revokeTarget.role }}</strong> from <strong>{{ revokeTarget.user_name }}</strong>
        <span v-if="revokeTarget.event_name"> for {{ revokeTarget.event_name }}</span>.
        Their USER account stays active.
      </p>
      <div class="modal-actions">
        <button class="ghost-button" @click="revokeTarget = null">Keep access</button>
        <button class="primary-button" @click="confirmRevoke">Revoke</button>
      </div>
    </section>
  </div>
</template>
