import {
  createMemoryHistory,
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router'
import AppShell from './layouts/AppShell.vue'
import ActivityPage from './pages/ActivityPage.vue'
import CommandsPage from './pages/CommandsPage.vue'
import OverviewPage from './pages/OverviewPage.vue'
import PlayersPage from './pages/PlayersPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import WorldPage from './pages/WorldPage.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AppShell,
    children: [
      { path: '', redirect: { name: 'overview' } },
      { path: 'overview', name: 'overview', component: OverviewPage },
      { path: 'players', name: 'players', component: PlayersPage },
      { path: 'activity', name: 'activity', component: ActivityPage },
      { path: 'world', name: 'world', component: WorldPage },
      { path: 'settings', name: 'settings', component: SettingsPage },
      { path: 'commands', name: 'commands', component: CommandsPage },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'overview' } },
]

export const router = createRouter({
  history: typeof window === 'undefined'
    ? createMemoryHistory()
    : createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})
