import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { installAdminI18n } from './i18n';
import '../../pages/brand.css';
import './styles.css';

installAdminI18n(router);
createApp(App).use(router).mount('#app');
