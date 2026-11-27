<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, clearSession, isAdmin, isChecker } from './auth';
import { logout as revokeSession } from './api';
import { useAdminI18n } from './i18n';
import LanguageSwitch from './LanguageSwitch.vue';

const { t, status } = useAdminI18n();
const route = useRoute();
const router = useRouter();
const menuOpen = ref(false);
const menuButton = ref(null);
const mainContent = ref(null);
const accountName = computed(() => session.user?.display_name || session.user?.user_name || '');
const roleLabel = computed(() => status(isAdmin() ? 'ADMIN' : 'CHECKER'));

const showShell = computed(() => route.path !== '/login' && Boolean(session.token));
const links = computed(() => {
  if (isAdmin()) {
    return [
      { to: '/', label: 'shell.overview' },
      { to: '/events', label: 'shell.events' },
      { to: '/performances', label: 'shell.performances' },
      { to: '/checkin', label: 'shell.checkin' },
      { to: '/orders', label: 'shell.orders' },
      { to: '/finance', label: 'shell.finance' },
      { to: '/users', label: 'shell.users' },
    ];
  }
  if (isChecker()) return [{ to: '/checkin', label: 'shell.checkin' }];
  return [];
});

watch(() => route.path, async () => {
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
    <a class="console-skip" href="#console-content">{{ t('shell.skip') }}</a>
    <header class="admin-header" @keydown.esc="closeMenu">
      <div class="admin-header-inner">
        <RouterLink to="/" class="brand" :aria-label="t('shell.adminHome')">
          <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" :alt="t('shell.logo')">
          <span>CityUHK <span>Events Hub</span></span>
        </RouterLink>
        <button ref="menuButton" class="nav-toggle" type="button" aria-controls="console-navigation" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">{{ t('shell.menu') }}</button>
        <div id="console-navigation" class="header-content" :class="{ 'is-open': menuOpen }">
          <nav class="admin-nav" :aria-label="t('shell.staffNav')">
            <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link" @click="closeMenu">
              {{ t(link.label) }}
            </RouterLink>
          </nav>
          <div class="header-user">
            <div class="account-identity">
              <strong>{{ accountName }}</strong>
              <span v-if="accountName.toLowerCase() !== roleLabel.toLowerCase()">{{ roleLabel }}</span>
            </div>
            <button class="ghost-button small" type="button" @click="logout">{{ t('shell.signOut') }}</button>
          </div>
        </div>
        <LanguageSwitch />
      </div>
    </header>
    <main id="console-content" ref="mainContent" class="admin-main" tabindex="-1">
      <RouterView />
    </main>
  </div>
  <RouterView v-else />
</template>
