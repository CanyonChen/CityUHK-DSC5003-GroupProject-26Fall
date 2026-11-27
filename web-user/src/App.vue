<script setup>
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { session, clearSession } from './auth';
import { logout as revokeSession } from './api';

const router = useRouter();
const route = useRoute();

const displayName = computed(() => session.user?.display_name || session.user?.user_name || '');
const isLogin = computed(() => route.path === '/login');
const adminLoginUrl = import.meta.env.VITE_ADMIN_LOGIN_URL || `${location.protocol}//${location.hostname}:8081/login`;

async function logout() {
  try {
    await revokeSession();
  } catch {
    // Clear the local token even when the server is unreachable; the next 401 will require a new sign-in.
  } finally {
    clearSession();
    router.push('/login');
  }
}
</script>

<template>
  <header class="site-header">
    <div class="wrap header-inner">
      <RouterLink to="/events" class="brand" aria-label="CityUHK Events Hub home">
        <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="City University of Hong Kong">
        <span class="brand-text">CityUHK Events Hub</span>
      </RouterLink>

      <nav v-if="!isLogin" class="nav" aria-label="Main navigation">
        <RouterLink to="/events">Events</RouterLink>
        <RouterLink v-if="session.token" to="/orders">My orders</RouterLink>
        <RouterLink v-if="session.token" to="/tickets">My tickets</RouterLink>
        <a :href="adminLoginUrl">Admin sign-in</a>
      </nav>
      <a v-else class="btn btn-ghost btn-sm" :href="adminLoginUrl">Admin sign-in</a>

      <div v-if="!isLogin" class="account">
        <template v-if="session.token">
          <span class="account-name" :title="displayName">{{ displayName }}</span>
          <button class="btn btn-ghost btn-sm" type="button" @click="logout">Sign out</button>
        </template>
        <RouterLink v-else to="/login" class="btn btn-gold btn-sm">Sign in</RouterLink>
      </div>
    </div>
  </header>

  <main class="site-main">
    <RouterView />
  </main>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <div class="footer-identity">
        <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="City University of Hong Kong">
        <strong>CityUHK Events Hub</strong>
      </div>
      <div class="muted small">Demo environment · payments are simulated</div>
    </div>
  </footer>
</template>
