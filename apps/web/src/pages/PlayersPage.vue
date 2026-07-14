<script setup lang="ts">
import {
  Activity,
  CircleAlert,
  LogOut,
  RefreshCw,
  Search,
  ShieldBan,
  Users,
} from '@lucide/vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'

const {
  players,
  errors,
  playerSearch,
  filteredPlayers,
  refresh,
  formatNumber,
  shortId,
  kickPlayer,
  banPlayer,
} = usePalworldMonitor()
</script>

<template>
  <section class="page-content">
    <div class="page-intro">
      <div><p class="section-kicker">PLAYER OPERATIONS</p><h2>Online players</h2><p>Monitor activity and moderate active sessions.</p></div>
      <div class="player-total"><strong>{{ players.length }}</strong><span>ONLINE</span></div>
    </div>
    <div class="toolbar">
      <label class="search-field"><Search :size="17" /><input v-model="playerSearch" placeholder="Search player, user ID, or IP" /></label>
      <button class="secondary-button" @click="refresh('players')"><RefreshCw :size="15" /> Refresh players</button>
    </div>
    <div v-if="errors.players" class="inline-error" role="alert"><CircleAlert :size="16" />{{ errors.players }}</div>
    <div class="table-card">
      <table v-if="filteredPlayers.length" class="data-table">
        <thead><tr><th>Player</th><th>Level</th><th>Latency</th><th>Location</th><th>User ID</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <tr v-for="player in filteredPlayers" :key="player.userId">
            <td><div class="player-cell"><div class="avatar">{{ (player.name || player.accountName || '?').slice(0, 1).toUpperCase() }}</div><div><strong>{{ player.name || player.accountName }}</strong><span>{{ player.accountName || player.ip }}</span></div></div></td>
            <td><span class="level-chip">LV. {{ player.level }}</span></td>
            <td><span class="ping-value" :class="{ warning: player.ping > 100 }"><Activity :size="13" /> {{ formatNumber(player.ping) }} ms</span></td>
            <td class="mono">{{ formatNumber(player.location_x) }}, {{ formatNumber(player.location_y) }}</td>
            <td class="mono muted" :title="player.userId">{{ shortId(player.userId) }}</td>
            <td><div class="row-actions"><button title="Kick player" @click="kickPlayer(player)"><LogOut :size="16" /></button><button class="danger" title="Ban player" @click="banPlayer(player)"><ShieldBan :size="16" /></button></div></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty-state"><Users :size="34" /><strong>{{ players.length ? 'No players match your search' : 'No players online' }}</strong><span>{{ players.length ? 'Try a different name or ID.' : 'Active players will appear here automatically.' }}</span></div>
    </div>
  </section>
</template>
