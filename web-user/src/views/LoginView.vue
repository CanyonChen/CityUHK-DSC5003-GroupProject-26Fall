<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { login, register } from '../api';
import { setSession } from '../auth';

const route = useRoute();
const router = useRouter();

const mode = ref('signin');
const userName = ref('buyer01');
const password = ref('Demo@1234');
const displayName = ref('');
const busy = ref(false);
const error = ref('');
const expired = ref(route.query.expired === '1');

async function submit() {
  error.value = '';
  const account = userName.value.trim();
  if (!account || !password.value) {
    error.value = 'Please enter both your account and password.';
    return;
  }
  if (mode.value === 'register') {
    if (account.length < 4 || account.length > 20) {
      error.value = 'Account must be 4–20 characters.';
      return;
    }
    if (password.value.length < 8 || password.value.length > 64) {
      error.value = 'Password must be 8–64 characters.';
      return;
    }
  }
  busy.value = true;
  try {
    if (mode.value === 'register') {
      await register(account, password.value, displayName.value.trim());
    }
    const data = await login(account, password.value);
    setSession(data);
    const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/events';
    router.push(target);
  } catch (err) {
    error.value = err.message || (mode.value === 'register' ? 'Registration failed.' : 'Sign-in failed.');
  } finally {
    busy.value = false;
  }
}

function switchMode(next) {
  mode.value = next;
  error.value = '';
  if (next === 'register') {
    userName.value = '';
    password.value = '';
    displayName.value = '';
  } else if (!userName.value) {
    userName.value = 'buyer01';
    password.value = 'Demo@1234';
  }
}

function useDemo(name) {
  mode.value = 'signin';
  userName.value = name;
  password.value = 'Demo@1234';
}
</script>

<template>
  <div class="login-wrap">
    <section class="login-art">
      <div class="hero-kicker">CityU MDS · DSC5003</div>
      <h1>Your seat at the show.</h1>
      <p>Browse campus performances, pick your exact seat, and keep every ticket in one place. Reserved seating, live availability, and a 5-minute hold to complete checkout.</p>
    </section>

    <section class="login-form-wrap">
      <form class="login-form fade-in" @submit.prevent="submit">
        <h2>{{ mode === 'register' ? 'Create account' : 'Sign in' }}</h2>
        <p class="hint">
          {{ mode === 'register' ? 'New accounts can buy tickets. Admin and checker roles are granted by an administrator.' : 'Use your ticketing account. Demo accounts are listed below.' }}
        </p>

        <div v-if="expired" class="notice notice-warn">Your session has ended. Please sign in again.</div>
        <div v-if="error" class="notice notice-error" style="margin-top: 12px">{{ error }}</div>

        <label class="label" for="userName">Account</label>
        <input id="userName" v-model="userName" class="input" autocomplete="username" placeholder="buyer01" />

        <template v-if="mode === 'register'">
          <label class="label" for="displayName">Display name <span class="muted">(optional)</span></label>
          <input id="displayName" v-model="displayName" class="input" autocomplete="name" placeholder="Your name" />
        </template>

        <label class="label" for="password">Password</label>
        <input id="password" v-model="password" class="input" type="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" placeholder="Demo@1234" />

        <button class="btn btn-ink btn-block" style="margin-top: 22px" type="submit" :disabled="busy">
          {{ busy ? (mode === 'register' ? 'Creating…' : 'Signing in…') : (mode === 'register' ? 'Create account' : 'Sign in') }}
        </button>

        <p class="hint" style="margin-top: 14px">
          <template v-if="mode === 'register'">
            Already have an account?
            <button type="button" class="link-button" @click="switchMode('signin')">Sign in</button>
          </template>
          <template v-else>
            New to CityUHK Events Hub?
            <button type="button" class="link-button" @click="switchMode('register')">Create an account</button>
          </template>
        </p>

        <div v-if="mode === 'signin'" class="demo-box">
          Demo buyer: <code>buyer01</code>–<code>buyer30</code> · password <code>Demo@1234</code><br />
          <button type="button" @click="useDemo('buyer01')">Use buyer01</button>
          <span class="muted"> · </span>
          <button type="button" @click="useDemo('buyer07')">Use buyer07</button>
        </div>
      </form>
    </section>
  </div>
</template>
