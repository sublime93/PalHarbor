<script setup lang="ts">
import { markRaw, provide } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  Activity,
  Check,
  ChevronRight,
  CircleAlert,
  LayoutDashboard,
  Map as MapIcon,
  Pause,
  RefreshCw,
  ServerCog,
  Settings2,
  ShieldBan,
  TerminalSquare,
  Users,
  Wifi,
  WifiOff,
  X,
} from '@lucide/vue'
import {
  createPalworldMonitor,
  palworldMonitorKey,
} from '../composables/usePalworldMonitor'

const route = useRoute()
const monitor = createPalworldMonitor()
provide(palworldMonitorKey, monitor)

const navItems = [
  { route: 'overview', label: 'Overview', icon: markRaw(LayoutDashboard) },
  { route: 'players', label: 'Players', icon: markRaw(Users) },
  { route: 'activity', label: 'Activity', icon: markRaw(Activity) },
  { route: 'world', label: 'World data', icon: markRaw(MapIcon) },
  { route: 'settings', label: 'Settings', icon: markRaw(Settings2) },
  { route: 'commands', label: 'Command center', icon: markRaw(TerminalSquare) },
] as const

const {
  info,
  loading,
  refreshSeconds,
  pageVisible,
  actionBusy,
  confirmation,
  confirmationInput,
  toasts,
  connected,
  playerCount,
  maxPlayers,
  playerCapacity,
  dominantError,
  pollingActive,
  refreshCore,
  setRefresh,
  confirmAction,
} = monitor
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <span class="brand-core" />
        </div>
        <div>
          <div class="brand-name">PALDECK</div>
          <div class="brand-subtitle">SERVER COMMAND</div>
        </div>
      </div>

      <nav class="side-nav" aria-label="Main navigation">
        <RouterLink
          v-for="item in navItems"
          :key="item.route"
          class="nav-item"
          :class="{ active: route.name === item.route }"
          :to="{ name: item.route }"
          :aria-label="item.label"
        >
          <component :is="item.icon" :size="19" :stroke-width="1.8" />
          <span>{{ item.label }}</span>
          <ChevronRight v-if="route.name === item.route" :size="15" class="nav-arrow" />
        </RouterLink>
      </nav>

      <div class="sidebar-spacer" />
      <div class="server-mini-card">
        <div class="mini-card-top">
          <span class="status-dot" :class="connected ? 'online' : 'offline'" />
          <span>{{ connected ? 'SERVER ONLINE' : 'SERVER OFFLINE' }}</span>
        </div>
        <div class="mini-server-name">{{ info?.servername || '172.16.0.171' }}</div>
        <div class="mini-meta">{{ playerCount }} / {{ maxPlayers || '—' }} players</div>
        <div class="capacity-track"><span :style="{ width: `${playerCapacity}%` }" /></div>
      </div>
      <div class="local-only"><ShieldBan :size="14" /> LAN ADMIN ACCESS</div>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="server-heading">
          <span class="eyebrow">PALWORLD DEDICATED SERVER</span>
          <div class="server-title-row">
            <h1>{{ info?.servername || 'Connecting to Palworld…' }}</h1>
            <span class="connection-pill" :class="connected ? 'connected' : 'disconnected'">
              <Wifi v-if="connected" :size="13" />
              <WifiOff v-else :size="13" />
              {{ connected ? 'Live' : 'Unavailable' }}
            </span>
          </div>
        </div>

        <div class="topbar-actions">
          <div class="refresh-control">
            <span class="refresh-indicator" :class="{ spinning: pollingActive }">
              <RefreshCw :size="14" />
            </span>
            <label for="refresh-rate">Auto refresh</label>
            <select id="refresh-rate" :value="refreshSeconds" @change="setRefresh(Number(($event.target as HTMLSelectElement).value))">
              <option :value="0">Off</option>
              <option :value="5">5 sec</option>
              <option :value="10">10 sec</option>
              <option :value="30">30 sec</option>
              <option :value="60">1 min</option>
            </select>
          </div>
          <button class="icon-button" title="Refresh now" aria-label="Refresh now" @click="refreshCore(true)">
            <RefreshCw :size="18" :class="{ 'spin-once': loading.size > 0 }" />
          </button>
        </div>
      </header>

      <div v-if="!pageVisible" class="notice-banner paused-banner">
        <Pause :size="16" /> Auto-refresh is paused while this tab is hidden.
      </div>
      <div v-if="dominantError && !connected" class="notice-banner error-banner" role="alert">
        <CircleAlert :size="18" />
        <div><strong>Couldn’t reach the server.</strong><span>{{ dominantError }}</span></div>
        <button class="text-button" @click="refreshCore(true)">Try again</button>
      </div>

      <RouterView />
    </main>

    <div class="toast-region" aria-live="polite">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.kind">
        <Check v-if="item.kind === 'success'" :size="17" />
        <CircleAlert v-else :size="17" />
        {{ item.message }}
      </div>
    </div>

    <div v-if="confirmation" class="modal-backdrop" @click.self="!actionBusy && (confirmation = null)">
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button class="modal-close" aria-label="Close" :disabled="actionBusy" @click="confirmation = null"><X :size="18" /></button>
        <div class="confirm-icon" :class="{ danger: confirmation.danger }"><CircleAlert v-if="confirmation.danger" :size="23" /><ServerCog v-else :size="23" /></div>
        <h3 id="confirm-title">{{ confirmation.title }}</h3>
        <p>{{ confirmation.detail }}</p>
        <label v-if="confirmation.phrase" class="stacked-field confirm-phrase"><span>Type <strong>{{ confirmation.phrase }}</strong> to continue</span><input v-model="confirmationInput" autofocus autocomplete="off" /></label>
        <div class="modal-actions"><button class="secondary-button" :disabled="actionBusy" @click="confirmation = null">Cancel</button><button :class="confirmation.danger ? 'danger-button' : 'primary-button'" :disabled="actionBusy || Boolean(confirmation.phrase && confirmationInput !== confirmation.phrase)" @click="confirmAction"><RefreshCw v-if="actionBusy" :size="15" class="spin-once" />{{ confirmation.label }}</button></div>
      </div>
    </div>
  </div>
</template>
