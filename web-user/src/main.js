import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { clearSession } from './auth';
import './styles.css';

window.addEventListener('cityuhk-events-hub:unauthorized', () => {
  clearSession();
  if (router.currentRoute.value.path !== '/login') {
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath, expired: '1' } });
  }
});

createApp(App).use(router).mount('#app');
