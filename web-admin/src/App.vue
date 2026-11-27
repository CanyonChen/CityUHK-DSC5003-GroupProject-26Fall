<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, clearSession, isAdmin, isChecker } from './auth';
import { logout as revokeSession } from './api';

const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const menuButton = ref(null);
const mainContent = ref(null);
const accountName = computed(() => session.user?.display_name || session.user?.user_name || '');
const roleLabel = computed(() => isAdmin() ? 'Administrator' : 'Check-in staff');

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

watch(() => route.fullPath, async () => {
  menuOpen.value = false;
  await nextTick();
  mainContent.value?.focus({ preventScroll: true });
});

function closeMenu() {
  if (menuOpen.value) {
    menuOpen.value = false;
    menuButton.value?.focus();
  }
}

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

onMounted(() => window.addEventListener('cityuhk-events-hub.admin:unauthorized', onUnauthorized));
onBeforeUnmount(() => window.removeEventListener('cityuhk-events-hub.admin:unauthorized', onUnauthorized));
</script>

<template>
  <div v-if="showShell" class="admin-shell">
    <a class="console-skip" href="#console-content">Skip to content</a>
    <header class="admin-header" @keydown.esc="closeMenu">
      <div class="admin-header-inner">
        <RouterLink to="/" class="brand" aria-label="CityUHK Events Hub admin home">
          <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="City University of Hong Kong">
          <span>CityUHK Events Hub</span>
        </RouterLink>
        <button ref="menuButton" class="nav-toggle" type="button" aria-controls="console-navigation" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">Menu</button>
        <div id="console-navigation" class="header-content" :class="{ 'is-open': menuOpen }">
          <nav class="admin-nav" aria-label="Staff navigation">
            <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link" @click="closeMenu">
              {{ link.label }}
            </RouterLink>
          </nav>
          <div class="header-user">
            <div class="account-identity">
              <strong>{{ accountName }}</strong>
              <span v-if="accountName.toLowerCase() !== roleLabel.toLowerCase()">{{ roleLabel }}</span>
            </div>
            <button class="ghost-button small" type="button" @click="logout">Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <main id="console-content" ref="mainContent" class="admin-main" tabindex="-1">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>
