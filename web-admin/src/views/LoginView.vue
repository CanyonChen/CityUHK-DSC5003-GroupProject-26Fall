<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../api';
import { setSession, session, clearSession } from '../auth';
import LanguageSwitch from '../LanguageSwitch.vue';
import { useAdminI18n } from '../i18n';
import stageCurtain from '../../../pages/media/stage-curtain.webp';
import './login.css';

const router = useRouter();
const { t, status, language, errorMessage } = useAdminI18n();
const boardUrl = computed(() => `https://canyonchen.github.io/CityUHK-Events-Hub/?lang=${language.value}`);
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
      clearSession();
      error.value = 'shell.noAccess';
      return;
    }
    setSession(data);
    router.replace(data.user.roles.includes('ADMIN') ? '/' : '/checkin');
  } catch (err) {
    clearSession();
    error.value = err;
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
        <a class="staff-brand" :href="boardUrl">
          <img class="brand-logo" src="/media/cityuhk-logo.webp" width="1151" height="647" alt="">
          <span>CityUHK <span>Events Hub</span></span>
        </a>
        <nav :aria-label="t('shell.navigation')">
          <a class="staff-back" :href="boardUrl + '#campus'">
            <span aria-hidden="true">←</span> {{ t('shell.back') }}
          </a>
        </nav>
        <LanguageSwitch />
      </div>
    </header>
    <main class="staff-wrap staff-layout" aria-labelledby="staff-title">
      <div class="staff-cover">
        <img :src="stageCurtain" alt="" fetchpriority="high">
        <div class="staff-heading">
          <h1 id="staff-title">{{ t('shell.loginTitle') }}</h1>
          <p>{{ t('shell.loginIntro') }}</p>
        </div>
      </div>
      <section class="staff-panel" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">{{ t('shell.staffSignIn') }}</h2>
        <form :aria-busy="busy" @submit.prevent="submit">
          <label for="staff-username">{{ t('shell.username') }}</label>
          <input id="staff-username" v-model="userName" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
          <label for="staff-password">{{ t('shell.password') }}</label>
          <input id="staff-password" v-model="password" type="password" name="password" autocomplete="current-password" required>
          <p v-if="error" class="staff-error" role="alert">{{ error === 'shell.noAccess' ? t(error) : errorMessage(error) }}</p>
          <button class="primary-button staff-submit" type="submit" :disabled="busy">
            {{ t(busy ? 'shell.checking' : 'shell.enterConsole') }}
          </button>
        </form>
        <div class="staff-demo">
          <h3 id="demo-accounts">{{ t('shell.demoTitle') }}</h3>
          <p>{{ t('shell.demoPassword', { password: 'Demo@1234' }) }}</p>
          <div class="staff-options" role="group" aria-labelledby="demo-accounts">
            <button type="button" @click="quick('admin')">{{ status('ADMIN') }}</button>
            <button type="button" @click="quick('checker01')">{{ status('CHECKER') }}</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
