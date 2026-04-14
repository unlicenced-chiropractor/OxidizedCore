import { createRouter, createWebHistory } from 'vue-router'
import CreateServerView from '@/views/CreateServerView.vue'
import DashboardView from '@/views/DashboardView.vue'
import SettingsView from '@/views/SettingsView.vue'
import ServerLayoutView from '@/views/server/ServerLayoutView.vue'
import ServerGeneralView from '@/views/server/ServerGeneralView.vue'
import ServerConsoleTabView from '@/views/server/ServerConsoleTabView.vue'
import ServerBackupsView from '@/views/server/ServerBackupsView.vue'
import ServerPluginsView from '@/views/server/ServerPluginsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/servers/new', name: 'create-server', component: CreateServerView },
    { path: '/settings', name: 'settings', component: SettingsView },
    {
      path: '/servers/:id',
      component: ServerLayoutView,
      props: true,
      children: [
        { path: '', name: 'server-general', component: ServerGeneralView },
        { path: 'console', name: 'server-console', component: ServerConsoleTabView },
        { path: 'settings', redirect: (to) => ({ name: 'server-general', params: { id: to.params.id } }) },
        { path: 'plugins', name: 'server-plugins', component: ServerPluginsView },
        { path: 'backups', name: 'server-backups', component: ServerBackupsView },
      ],
    },
  ],
})

export default router
