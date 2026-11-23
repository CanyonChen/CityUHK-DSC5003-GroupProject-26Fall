<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, clearSession, isAdmin, isChecker } from './auth';
import { logout as revokeSession } from './api';

const route = useRoute();
const router = useRouter();

const showShell = computed(() => route.path !== '/login' && Boolean(session.token));
const links = computed(() => {
  if (isAdmin()) {
    return [
      { to: '/', label: 'Overview' },
      { to: '/events', label: 'Events' },
      { to: '/performances', label: 'Performances' },
      { to: '/checkin', label: 'Check-in' },
      { to: '/orders', label: 'Orders' },
      { to: '/finance', label: 'Finance' },
      { to: '/users', label: 'Users' },
    ];
  }
  if (isChecker()) return [{ to: '/checkin', label: 'Check-in' }];
  return [];
});

async function logout() {
  try {
    await revokeSession();
  } catch {
    // Clear the local token even when the server is unreachable.
  } finally {
    clearSession();
    router.replace('/login');
  }
}

function onUnauthorized() {
  clearSession();
  if (route.path !== '/login') router.replace('/login');
}

onMounted(() => window.addEventListener('stagepass.admin:unauthorized', onUnauthorized));
onBeforeUnmount(() => window.removeEventListener('stagepass.admin:unauthorized', onUnauthorized));
</script>

<template>
  <div v-if="showShell" class="admin-shell">
    <header class="admin-header">
      <div class="admin-header-inner">
        <RouterLink to="/" class="brand">
          <span class="brand-mark">L</span>
          <span>StagePass <em>Admin</em></span>
        </RouterLink>
        <nav class="admin-nav">
          <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
            {{ link.label }}
          </RouterLink>
        </nav>
        <div class="header-user">
          <span>{{ session.user?.display_name || session.user?.user_name }}</span>
          <span class="role-pill">{{ session.user?.roles?.includes('ADMIN') ? 'ADMIN' : 'CHECKER' }}</span>
          <button class="ghost-button small" @click="logout">Sign out</button>
        </div>
      </div>
    </header>
    <main class="admin-main">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>
