<script setup lang="ts">
import { computed } from 'vue'
import {
  Activity,
  CalendarDays,
  CircleAlert,
  Clock3,
  History,
  Network,
  RefreshCw,
  Timer,
  Trophy,
  UserRoundCheck,
  Users,
} from '@lucide/vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'

const {
  activitySummary,
  activityDays,
  activityLoading,
  errors,
  refresh,
  setActivityDays,
  formatDuration,
  formatNumber,
  shortId,
} = usePalworldMonitor()

const totals = computed(() => activitySummary.value?.totals)
const maxDailyPlaytime = computed(() => Math.max(
  1,
  ...(activitySummary.value?.daily.map((day) => day.playtimeSeconds) ?? []),
))
const chartWidth = computed(() => `${Math.max(620, (activitySummary.value?.daily.length ?? 0) * 27)}px`)

function formatDateTime(value: string | null) {
  if (!value) return 'Still online'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function collectorTime(value: string | null) {
  return value ? formatDateTime(value) : 'Waiting for the first sample'
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function dayLabelVisible(index: number, length: number) {
  if (length <= 14) return true
  const interval = length <= 31 ? 3 : 7
  return index === 0 || index === length - 1 || index % interval === 0
}

function latencyQuality(latencyMs: number | null) {
  if (latencyMs === null || !Number.isFinite(latencyMs)) return { label: 'No data', tone: 'unknown' }
  if (latencyMs <= 50) return { label: 'Excellent', tone: 'excellent' }
  if (latencyMs <= 100) return { label: 'Good', tone: 'good' }
  if (latencyMs <= 150) return { label: 'Fair', tone: 'fair' }
  return { label: 'Poor', tone: 'poor' }
}

function latencySampleTitle(sampleCount: number) {
  return `Based on ${sampleCount.toLocaleString()} latency ${sampleCount === 1 ? 'sample' : 'samples'} in this reporting period. Excellent ≤50 ms, good ≤100 ms, fair ≤150 ms, poor >150 ms.`
}
</script>

<template>
  <section class="page-content activity-page">
    <div class="page-intro activity-intro">
      <div>
        <p class="section-kicker">PLAYER HISTORY</p>
        <h2>Server activity</h2>
        <p>Connection history, playtime, and connection quality recorded by Paldeck.</p>
      </div>
      <div class="activity-controls">
        <label for="activity-period">Reporting period</label>
        <select
          id="activity-period"
          :value="activityDays"
          @change="setActivityDays(Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="7">Last 7 days</option>
          <option :value="14">Last 14 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
        <button class="icon-button" title="Refresh activity" aria-label="Refresh activity" @click="refresh('activity')">
          <RefreshCw :size="17" :class="{ 'spin-once': activityLoading }" />
        </button>
      </div>
    </div>

    <div
      v-if="activitySummary?.collector"
      class="collector-strip"
      :class="activitySummary.collector.status"
    >
      <span class="collector-state"><i />Collector {{ activitySummary.collector.status }}</span>
      <span>Last successful sample: {{ collectorTime(activitySummary.collector.lastSuccessfulPollAt) }}</span>
      <span>Sampling every {{ activitySummary.collector.pollIntervalSeconds }} seconds</span>
    </div>

    <div v-if="errors.activity" class="inline-error" role="alert">
      <CircleAlert :size="16" />
      <span>{{ errors.activity }}</span>
      <button class="text-button" @click="refresh('activity')">Try again</button>
    </div>

    <div v-if="activityLoading && !activitySummary" class="activity-stat-grid" aria-label="Loading activity statistics">
      <div v-for="n in 5" :key="n" class="activity-stat-card skeleton-card"><span /><span /><span /></div>
    </div>
    <div v-else class="activity-stat-grid">
      <article class="activity-stat-card accent-cyan">
        <div class="metric-icon"><Users :size="19" /></div>
        <span>Tracked players</span>
        <strong>{{ totals?.trackedPlayers ?? 0 }}</strong>
        <small>in the last {{ activitySummary?.periodDays ?? activityDays }} days</small>
      </article>
      <article class="activity-stat-card accent-gold">
        <div class="metric-icon"><History :size="19" /></div>
        <span>Sessions</span>
        <strong>{{ totals?.sessions ?? 0 }}</strong>
        <small>recorded connections</small>
      </article>
      <article class="activity-stat-card accent-violet">
        <div class="metric-icon"><Clock3 :size="19" /></div>
        <span>Total playtime</span>
        <strong class="compact">{{ formatDuration(totals?.totalPlaytimeSeconds) }}</strong>
        <small>across all players</small>
      </article>
      <article class="activity-stat-card accent-green">
        <div class="metric-icon"><Timer :size="19" /></div>
        <span>Average session</span>
        <strong class="compact">{{ formatDuration(totals?.averageSessionSeconds) }}</strong>
        <small>per connection</small>
      </article>
      <article class="activity-stat-card accent-online">
        <div class="metric-icon"><UserRoundCheck :size="19" /></div>
        <span>Currently online</span>
        <strong>{{ totals?.currentlyOnline ?? 0 }}</strong>
        <small><i class="online-pip" /> live sessions</small>
      </article>
    </div>

    <div class="activity-main-grid">
      <article class="panel activity-chart-panel">
        <div class="panel-header">
          <div><span class="panel-kicker">DAILY PLAYTIME</span><h3>Activity trend</h3></div>
          <CalendarDays :size="20" />
        </div>
        <div v-if="activitySummary?.daily.length" class="activity-chart-scroll">
          <div class="activity-chart" :style="{ width: chartWidth }">
            <div
              v-for="(day, index) in activitySummary.daily"
              :key="day.date"
              class="activity-day"
              :title="`${formatDay(day.date)}: ${formatDuration(day.playtimeSeconds)}, ${day.uniquePlayers} players, ${day.sessions} sessions`"
            >
              <div class="activity-bar-track">
                <span :style="{ height: `${Math.max(day.playtimeSeconds ? 4 : 0, day.playtimeSeconds / maxDailyPlaytime * 100)}%` }" />
              </div>
              <small :class="{ hidden: !dayLabelVisible(index, activitySummary.daily.length) }">{{ formatDay(day.date) }}</small>
            </div>
          </div>
        </div>
        <div v-else class="empty-state activity-empty">
          <Activity :size="30" /><strong>No activity yet</strong><span>Daily playtime will appear after player sessions are recorded.</span>
        </div>
      </article>

      <article class="panel leaderboard-panel">
        <div class="panel-header">
          <div><span class="panel-kicker">TOP PLAYERS</span><h3>Playtime leaderboard</h3></div>
          <Trophy :size="20" />
        </div>
        <div v-if="activitySummary?.topPlayers.length" class="leaderboard-list">
          <div v-for="(player, index) in activitySummary.topPlayers.slice(0, 8)" :key="player.userId" class="leaderboard-row">
            <span class="leaderboard-rank" :class="{ podium: index < 3 }">{{ index + 1 }}</span>
            <div class="avatar">{{ (player.playerName || '?').slice(0, 1).toUpperCase() }}</div>
            <div class="leaderboard-player">
              <strong>{{ player.playerName || 'Unknown player' }} <i v-if="player.online" class="online-pip" /></strong>
              <span :title="player.userId">{{ shortId(player.userId) }} · {{ player.sessionCount }} sessions</span>
            </div>
            <div class="leaderboard-stats">
              <strong class="leaderboard-time">{{ formatDuration(player.totalPlaytimeSeconds) }}</strong>
              <span
                v-if="player.averageLatencyMs !== null"
                class="latency-quality"
                :class="latencyQuality(player.averageLatencyMs).tone"
                :title="latencySampleTitle(player.latencySampleCount)"
              >
                <Activity :size="9" />
                {{ formatNumber(player.averageLatencyMs) }} ms · {{ latencyQuality(player.averageLatencyMs).label }}
              </span>
              <span v-else class="latency-quality unknown" title="No valid latency samples in this reporting period.">
                <Activity :size="9" /> No latency data
              </span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state activity-empty"><Trophy :size="30" /><strong>No leaderboard yet</strong><span>Player totals will be ranked here.</span></div>
      </article>
    </div>

    <article class="ip-history-section">
      <div class="panel-header recent-header">
        <div><span class="panel-kicker">CONNECTION ADDRESSES</span><h3>Player IP history</h3></div>
        <span class="ip-history-note"><Network :size="13" /> Last observed in this period · counts are lifetime</span>
      </div>
      <div class="table-card ip-history-table-card">
        <table v-if="activitySummary?.ipHistory?.length" class="data-table ip-history-table">
          <thead><tr><th>Player</th><th>IP address</th><th>First seen</th><th>Last seen</th><th>Observations</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="entry in activitySummary?.ipHistory ?? []" :key="`${entry.userId}:${entry.ipAddress}`">
              <td><div class="player-cell"><div class="avatar">{{ (entry.playerName || '?').slice(0, 1).toUpperCase() }}</div><div><strong>{{ entry.playerName || 'Unknown player' }}</strong><span :title="entry.userId">{{ shortId(entry.userId) }}</span></div></div></td>
              <td><code class="ip-address">{{ entry.ipAddress || 'Unavailable' }}</code></td>
              <td>{{ formatDateTime(entry.firstSeenAt) }}</td>
              <td>{{ formatDateTime(entry.lastSeenAt) }}</td>
              <td><span class="observation-count">{{ entry.observationCount }}</span></td>
              <td><span class="session-status" :class="entry.online ? 'online' : 'complete'"><i />{{ entry.online ? 'Online' : 'Offline' }}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state ip-history-empty"><Network :size="34" /><strong>No IP history recorded</strong><span>Addresses will appear here after players connect during this reporting period.</span></div>
      </div>
    </article>

    <article class="recent-activity-section">
      <div class="panel-header recent-header">
        <div><span class="panel-kicker">CONNECTION LOG</span><h3>Recent sessions</h3></div>
        <span v-if="activitySummary?.generatedAt" class="activity-generated">Updated {{ formatDateTime(activitySummary.generatedAt) }}</span>
      </div>
      <div class="table-card activity-table-card">
        <table v-if="activitySummary?.recentSessions.length" class="data-table activity-table">
          <thead><tr><th>Player</th><th>Connected</th><th>Disconnected</th><th>Duration</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="session in activitySummary.recentSessions" :key="session.id">
              <td><div class="player-cell"><div class="avatar">{{ (session.playerName || '?').slice(0, 1).toUpperCase() }}</div><div><strong>{{ session.playerName || 'Unknown player' }}</strong><span :title="session.userId">{{ shortId(session.userId) }}</span></div></div></td>
              <td>{{ formatDateTime(session.connectedAt) }}</td>
              <td>{{ formatDateTime(session.disconnectedAt) }}</td>
              <td class="session-duration">{{ formatDuration(session.durationSeconds) }}</td>
              <td><span class="session-status" :class="session.online ? 'online' : 'complete'"><i />{{ session.online ? 'Online' : 'Complete' }}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state"><History :size="34" /><strong>No sessions recorded</strong><span>Connections will be logged automatically when players join.</span></div>
      </div>
    </article>
  </section>
</template>
