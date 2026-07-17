<script setup lang="ts">
import { RouterLink } from 'vue-router'
import {
  Activity,
  Box,
  ChevronRight,
  Clock3,
  Gauge,
  Users,
  Zap,
} from '@lucide/vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'

const {
  info,
  metrics,
  players,
  refreshSeconds,
  coreLoading,
  playerCount,
  maxPlayers,
  playerCapacity,
  lastUpdatedLabel,
  formatDuration,
  formatNumber,
  shortId,
} = usePalworldMonitor()
</script>

<template>
  <section class="page-content overview-page">
    <div class="page-intro">
      <div>
        <p class="section-kicker">LIVE OPERATIONS</p>
        <h2>Server overview</h2>
        <p>
          {{
            info?.description ||
            'Real-time health, world activity, and player load.'
          }}
        </p>
      </div>
      <div class="updated-at">
        <Clock3 :size="14" /> Updated {{ lastUpdatedLabel }}
      </div>
    </div>

    <div
      v-if="coreLoading && !metrics"
      class="metric-grid"
      role="status"
      aria-label="Loading metrics"
    >
      <div v-for="n in 4" :key="n" class="metric-card skeleton-card">
        <span /><span /><span />
      </div>
    </div>
    <div v-else class="metric-grid">
      <article class="metric-card accent-cyan">
        <div class="metric-icon"><Gauge :size="20" /></div>
        <div class="metric-label">Server FPS</div>
        <div class="metric-value">
          {{ formatNumber(metrics?.serverfps) }}<small> fps</small>
        </div>
        <div class="metric-footer">
          <span class="tiny-dot" />
          {{
            (metrics?.serverfps ?? 0) >= 50 ? 'Running smooth' : 'Below target'
          }}
        </div>
      </article>
      <article class="metric-card accent-gold">
        <div class="metric-icon"><Users :size="20" /></div>
        <div class="metric-label">Online players</div>
        <div class="metric-value">
          {{ playerCount }}<small> / {{ maxPlayers || '—' }}</small>
        </div>
        <div class="metric-footer">{{ playerCapacity }}% capacity</div>
      </article>
      <article class="metric-card accent-violet">
        <div class="metric-icon"><Activity :size="20" /></div>
        <div class="metric-label">Frame time</div>
        <div class="metric-value">
          {{ formatNumber(metrics?.serverframetime, 2) }}<small> ms</small>
        </div>
        <div class="metric-footer">
          World day {{ formatNumber(metrics?.days) }}
        </div>
      </article>
      <article class="metric-card accent-green">
        <div class="metric-icon"><Clock3 :size="20" /></div>
        <div class="metric-label">Uptime</div>
        <div class="metric-value compact">
          {{ formatDuration(metrics?.uptime) }}
        </div>
        <div class="metric-footer">
          {{ formatNumber(metrics?.basecampnum) }} active bases
        </div>
      </article>
    </div>

    <div class="overview-grid">
      <article class="panel health-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">PERFORMANCE</span>
            <h3>Server health</h3>
          </div>
          <span
            class="healthy-badge"
            :class="{ warning: (metrics?.serverfps ?? 60) < 45 }"
          >
            <Zap :size="13" />
            {{ (metrics?.serverfps ?? 60) >= 45 ? 'Healthy' : 'Degraded' }}
          </span>
        </div>
        <div class="health-gauge-wrap">
          <div
            class="radial-gauge"
            :style="{
              '--score': `${Math.min(100, Math.max(0, ((metrics?.serverfps ?? 0) / 60) * 100)) * 3.6}deg`,
            }"
          >
            <div>
              <strong>{{
                Math.round(
                  Math.min(100, ((metrics?.serverfps ?? 0) / 60) * 100),
                )
              }}</strong
              ><span>HEALTH</span>
            </div>
          </div>
          <div class="health-stats">
            <div><span>Target FPS</span><strong>60</strong></div>
            <div>
              <span>Current FPS</span
              ><strong>{{ formatNumber(metrics?.serverfps) }}</strong>
            </div>
            <div>
              <span>Frame time</span
              ><strong
                >{{ formatNumber(metrics?.serverframetime, 1) }} ms</strong
              >
            </div>
          </div>
        </div>
      </article>

      <article class="panel world-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">WORLD IDENTITY</span>
            <h3>{{ info?.servername || 'Palworld server' }}</h3>
          </div>
          <Box :size="21" />
        </div>
        <dl class="identity-list">
          <div>
            <dt>Server version</dt>
            <dd>{{ info?.version || '—' }}</dd>
          </div>
          <div>
            <dt>World GUID</dt>
            <dd class="mono">{{ shortId(info?.worldguid) }}</dd>
          </div>
          <div>
            <dt>REST API</dt>
            <dd><span class="inline-status" /> Connected via LAN</dd>
          </div>
          <div>
            <dt>Refresh cadence</dt>
            <dd>
              {{ refreshSeconds ? `${refreshSeconds} seconds` : 'Manual' }}
            </dd>
          </div>
        </dl>
      </article>

      <article class="panel player-panel">
        <div class="panel-header">
          <div>
            <span class="panel-kicker">ONLINE NOW</span>
            <h3>Players</h3>
          </div>
          <RouterLink class="text-button" :to="{ name: 'players' }"
            >View all <ChevronRight :size="14"
          /></RouterLink>
        </div>
        <div v-if="players.length" class="compact-player-list">
          <div
            v-for="player in players.slice(0, 5)"
            :key="player.userId"
            class="compact-player"
          >
            <div class="avatar">
              {{
                (player.name || player.accountName || '?')
                  .slice(0, 1)
                  .toUpperCase()
              }}
            </div>
            <div>
              <strong>{{ player.name || player.accountName }}</strong
              ><span
                >Level {{ player.level }} ·
                {{ formatNumber(player.ping) }} ms</span
              >
            </div>
            <span class="online-pip" />
          </div>
        </div>
        <div v-else class="empty-state compact-empty">
          <Users :size="28" /><strong>No players online</strong
          ><span>The island is quiet for now.</span>
        </div>
      </article>
    </div>
  </section>
</template>
