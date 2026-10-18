import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/connect',
      name: 'connect',
      component: () => import('@/views/ConnectView.vue'),
    },
    {
      path: '/einrichten',
      name: 'einrichten',
      component: () => import('@/views/EinrichtenView.vue'),
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/konsistenz',
      name: 'konsistenz',
      component: () => import('@/views/KonsistenzView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/uebernahme',
      name: 'uebernahme',
      component: () => import('@/views/UebernahmeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/nachladen',
      name: 'nachladen',
      component: () => import('@/views/NachladenView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/uebersicht',
      name: 'uebersicht',
      component: () => import('@/views/UebersichtView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/verteilen',
      name: 'verteilen',
      component: () => import('@/views/VerteilenView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/rueckspielen',
      name: 'rueckspielen',
      component: () => import('@/views/RueckspielenView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/connect',
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isConnected) {
    return { name: 'connect' }
  }
})

export default router
