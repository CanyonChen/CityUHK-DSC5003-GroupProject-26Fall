<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../api';
import { setSession, session, clearSession } from '../auth';

const router = useRouter();
const userName = ref('admin');
const password = ref('Demo@1234');
const error = ref('');
const busy = ref(false);

function quick(name) {
  userName.value = name;
  password.value = 'Demo@1234';
}

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    const data = await login(userName.value.trim(), password.value);
    if (!data.user.roles.includes('ADMIN') && !data.user.roles.includes('CHECKER')) {
      throw new Error('This account has no back-office role.');
    }
    setSession(data);
    router.replace(data.user.roles.includes('ADMIN') ? '/' : '/checkin');
  } catch (err) {
    clearSession();
    error.value = err.message || 'Sign-in failed';
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  if (session.token && session.user?.roles?.some((r) => ['ADMIN', 'CHECKER'].includes(r))) {
    router.replace(session.user.roles.includes('ADMIN') ? '/' : '/checkin');
  }
});
</script>

<template>
  <div class="login-screen">
    <section class="login-visual">
      <div class="login-brand"><img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="City University of Hong Kong"> CityUHK Events Hub</div>
      <p class="eyebrow">BOX OFFICE · OPERATIONS</p>
      <h1>Run the room.<br />Keep the night moving.</h1>
      <p class="login-lede">Programming, pricing, gate check-in and reconciliation — one console for campus stages.</p>
      <div class="login-stats">
        <div><strong>3</strong><span>venues</span></div>
        <div><strong>7</strong><span>live events</span></div>
        <div><strong>24h</strong><span>refund window</span></div>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <p class="eyebrow">STAFF ACCESS</p>
        <h2>Sign in to operations</h2>
        <p class="muted">Admin accounts manage the programme. Checker accounts only see assigned performances.</p>
        <form @submit.prevent="submit">
          <label>Username<input v-model="userName" autocomplete="username" required /></label>
          <label>Password<input v-model="password" type="password" autocomplete="current-password" required /></label>
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="primary-button block" :disabled="busy">{{ busy ? 'Checking…' : 'Enter console' }}</button>
        </form>
        <div class="quick-users">
          <button type="button" class="ghost-button small" @click="quick('admin')">admin</button>
          <button type="button" class="ghost-button small" @click="quick('checker01')">checker01</button>
          <span class="muted tiny">demo password Demo@1234</span>
        </div>
      </div>
    </section>
  </div>
</template>
