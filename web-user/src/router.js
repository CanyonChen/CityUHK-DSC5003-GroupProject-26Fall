import { createRouter, createWebHistory } from 'vue-router';
import { isLoggedIn } from './auth';

const routes = [
  { path: '/', redirect: '/events' },
  { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/events', component: () => import('./views/EventsView.vue'), meta: { public: true } },
  { path: '/events/:id', component: () => import('./views/EventView.vue'), meta: { public: true } },
  { path: '/performances/:id/seats', component: () => import('./views/SeatMapView.vue'), meta: { public: true } },
  { path: '/orders/:id', component: () => import('./views/OrderView.vue') },
  { path: '/orders', component: () => import('./views/OrdersView.vue') },
  { path: '/tickets', component: () => import('./views/TicketsView.vue') },
  { path: '/tickets/:id', component: () => import('./views/TicketView.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/events' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  if (!to.meta.public && !isLoggedIn()) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
});
