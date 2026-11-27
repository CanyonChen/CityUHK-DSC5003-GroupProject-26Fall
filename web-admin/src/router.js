import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn, isAdmin, isChecker } from './auth';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import EventsView from './views/EventsView.vue';
import PerformancesView from './views/PerformancesView.vue';
import CheckinView from './views/CheckinView.vue';
import OrdersView from './views/OrdersView.vue';
import FinanceView from './views/FinanceView.vue';
import UsersView from './views/UsersView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/', component: DashboardView, meta: { admin: true } },
    { path: '/events', component: EventsView, meta: { admin: true } },
    { path: '/performances', component: PerformancesView, meta: { admin: true } },
    { path: '/checkin', component: CheckinView, meta: { checkin: true } },
    { path: '/orders', component: OrdersView, meta: { admin: true } },
    { path: '/finance', component: FinanceView, meta: { admin: true } },
    { path: '/users', component: UsersView, meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach((to) => {
  if (to.meta.public) return true;
  if (!isLoggedIn()) return '/login';
  if (to.meta.admin && !isAdmin()) return isChecker() ? '/checkin' : '/login';
  if (to.meta.checkin && !isAdmin() && !isChecker()) return '/login';
  return true;
});

export default router;
