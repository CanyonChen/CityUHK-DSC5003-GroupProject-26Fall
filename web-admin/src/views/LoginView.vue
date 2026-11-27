<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../api';
import { setSession, session, clearSession } from '../auth';
import stageCurtain from '../../../pages/media/stage-curtain.webp';
import './login.css';

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
  <div class="staff-entry">
    <header class="staff-header">
      <div class="staff-wrap staff-bar">
        <a class="staff-brand" href="https://canyonchen.github.io/CityUHK-Events-Hub/">
          <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="">
          <span>CityUHK <span>Events Hub</span></span>
        </a>
        <nav aria-label="Site navigation">
          <a class="staff-back" href="https://canyonchen.github.io/CityUHK-Events-Hub/#campus">
            <span aria-hidden="true">←</span> Back to events
          </a>
        </nav>
      </div>
    </header>
    <main class="staff-wrap staff-layout" aria-labelledby="staff-title">
      <div class="staff-cover">
        <img :src="stageCurtain" alt="" fetchpriority="high">
        <div class="staff-heading">
          <h1 id="staff-title">Ticketing administration</h1>
          <p>Manage performances and ticket sales, or check guests in at the door.</p>
        </div>
      </div>
      <section class="staff-panel" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">Staff sign-in</h2>
        <form :aria-busy="busy" @submit.prevent="submit">
          <label for="staff-username">Username</label>
          <input id="staff-username" v-model="userName" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
          <label for="staff-password">Password</label>
          <input id="staff-password" v-model="password" type="password" name="password" autocomplete="current-password" required>
          <p v-if="error" class="staff-error" role="alert">{{ error }}</p>
          <button class="primary-button staff-submit" type="submit" :disabled="busy">
            {{ busy ? 'Checking…' : 'Enter console' }}
          </button>
        </form>
        <div class="staff-demo">
          <h3 id="demo-accounts">Try a demo account</h3>
          <p>Both accounts use the password <code>Demo@1234</code>.</p>
          <div class="staff-options" role="group" aria-labelledby="demo-accounts">
            <button type="button" @click="quick('admin')">Administrator</button>
            <button type="button" @click="quick('checker01')">Ticket checker</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
