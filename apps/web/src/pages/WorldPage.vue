<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  CircleAlert,
  Database,
  LocateFixed,
  Map as MapIcon,
  RefreshCw,
  Search,
  Users,
} from '@lucide/vue'
import WorldPopulationMap from '../components/WorldPopulationMap.vue'
import { usePalworldMonitor } from '../composables/usePalworldMonitor'
import { CAVE_ENTRANCES, actorStage } from '../cave-map'
import { MAP_REGIONS, type MapRegionId } from '../world-map'
import {
  actorCategory,
  actorCategoryMeta,
  actorCategoryOrder,
  actorDisplayName,
  actorPosition,
  type ActorCategory,
} from '../world'

const {
  gameData,
  errors,
  loading,
  gameDataAuto,
  gameDataUpdatedLabel,
  actorSearch,
  actorData,
  filteredActors,
  refresh,
  setGameDataAuto,
  activateWorldView,
  deactivateWorldView,
  formatNumber,
} = usePalworldMonitor()

const enabledCategories = ref<Set<ActorCategory>>(new Set(actorCategoryOrder))
const activeMapRegion = ref<MapRegionId>('palpagos')
const activeMapMeta = computed(() => MAP_REGIONS[activeMapRegion.value])
const categoryStats = computed(() => actorCategoryOrder.map((category) => ({
  category,
  count: actorData.value.filter((actor) => actorCategory(actor) === category).length,
  ...actorCategoryMeta[category],
})))
const visibleActors = computed(() => filteredActors.value.filter((actor) =>
  enabledCategories.value.has(actorCategory(actor)),
))
const positionedCount = computed(() => actorData.value.filter((actor) => actorPosition(actor)).length)
const caveActorCount = computed(() => actorData.value.filter((actor) => actorStage(actor)).length)
const playerCount = computed(() => categoryStats.value.find(({ category }) => category === 'Player')?.count ?? 0)
const palCount = computed(() => categoryStats.value
  .filter(({ category }) => ['OtomoPal', 'BaseCampPal', 'WildPal'].includes(category))
  .reduce((total, item) => total + item.count, 0))
const mapFootnote = computed(() => activeMapRegion.value === 'caves'
  ? `${caveActorCount.value.toLocaleString()} actors currently report a non-None Stage. Each exact Stage is isolated on Palworld's local −10k…+10k instance plane; the contours are a schematic, not a floorplan.`
  : `Live GameData positions use the selected surface projection. ${CAVE_ENTRANCES.length.toLocaleString()} gold entrance markers come from the pinned Palworld 1.0 map dataset.`)

function toggleCategory(category: ActorCategory) {
  const next = new Set(enabledCategories.value)
  if (next.has(category)) next.delete(category)
  else next.add(category)
  enabledCategories.value = next
}

function handleAutoRefresh(event: Event) {
  setGameDataAuto((event.target as HTMLInputElement).checked)
}

function coordinate(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number).toLocaleString() : '—'
}

onMounted(activateWorldView)
onBeforeUnmount(deactivateWorldView)
</script>

<template>
  <section class="page-content">
    <div class="page-intro world-intro">
      <div>
        <p class="section-kicker">WORLD TELEMETRY</p>
        <h2>Live world map</h2>
        <p>Overlay every reported player, Pal, NPC, and Palbox on Palpagos, World Tree, and the live local coordinate plane used by cave instances.</p>
      </div>
      <div class="world-refresh-controls">
        <span class="updated-at"><Activity :size="12" /> Snapshot fetched {{ gameDataUpdatedLabel }}</span>
        <label class="switch-label">
          <input :checked="gameDataAuto" type="checkbox" @change="handleAutoRefresh" />
          <span class="switch" /> Refresh world every 60s
        </label>
      </div>
    </div>

    <div class="world-summary">
      <article><Database :size="20" /><div><strong>{{ formatNumber(actorData.length) }}</strong><span>Total actors</span></div></article>
      <article><LocateFixed :size="20" /><div><strong>{{ formatNumber(positionedCount) }}</strong><span>Mapped positions</span></div></article>
      <article><Users :size="20" /><div><strong>{{ formatNumber(playerCount) }}</strong><span>Players in snapshot</span></div></article>
      <article><Activity :size="20" /><div><strong>{{ formatNumber(gameData?.FPS, 1) }}</strong><span>Server FPS</span></div></article>
    </div>

    <div v-if="errors['game-data']" class="world-api-error" role="alert">
      <CircleAlert :size="19" />
      <div>
        <strong>World snapshot unavailable</strong>
        <span>{{ errors['game-data'] }} Existing data remains visible when available.</span>
      </div>
      <button class="secondary-button" :disabled="loading.has('game-data')" @click="refresh('game-data')">Try again</button>
    </div>

    <div class="world-live-grid">
      <article class="panel world-map-panel">
        <header class="world-panel-header">
          <div>
            <p class="section-kicker">{{ activeMapMeta.label.toUpperCase() }} MAP</p>
            <h3>Live population</h3>
          </div>
          <div class="snapshot-meta">
            <span>
              {{ gameData?.Time || 'Waiting for snapshot' }}
              <small v-if="gameData?.InGameDays != null || gameData?.InGameTime">Day {{ gameData?.InGameDays ?? '—' }} · {{ gameData?.InGameTime ?? '—' }}</small>
            </span>
            <button class="icon-button compact" title="Refresh world snapshot" aria-label="Refresh world snapshot" :disabled="loading.has('game-data')" @click="refresh('game-data')">
              <RefreshCw :size="15" :class="{ 'spin-once': loading.has('game-data') }" />
            </button>
          </div>
        </header>
        <WorldPopulationMap v-model:region="activeMapRegion" :actors="visibleActors" :loading="loading.has('game-data')" />
      </article>

      <aside class="panel population-panel">
        <div class="world-panel-header">
          <div><p class="section-kicker">LAYERS</p><h3>Population mix</h3></div>
          <strong class="population-total">{{ palCount.toLocaleString() }} <small>Pals</small></strong>
        </div>
        <p class="population-copy">Toggle a layer to focus both the map and actor results.</p>
        <div class="population-layers">
          <button
            v-for="item in categoryStats"
            :key="item.category"
            type="button"
            class="population-layer"
            :class="{ disabled: !enabledCategories.has(item.category) }"
            :disabled="item.count === 0"
            :aria-pressed="enabledCategories.has(item.category)"
            @click="toggleCategory(item.category)"
          >
            <span class="layer-marker" :style="{ '--layer-color': item.color }" />
            <span>{{ item.label }}</span>
            <strong>{{ item.count.toLocaleString() }}</strong>
          </button>
        </div>
        <div class="population-footnote">
          <MapIcon :size="14" />
          <span>{{ mapFootnote }}</span>
        </div>
      </aside>
    </div>

    <div class="world-actor-section">
      <div class="world-actor-heading">
        <div><p class="section-kicker">ACTOR DIRECTORY</p><h3>Snapshot actors</h3></div>
        <span>{{ visibleActors.length.toLocaleString() }} visible of {{ actorData.length.toLocaleString() }}</span>
      </div>
      <div class="toolbar">
        <label class="search-field wide"><Search :size="17" /><input v-model="actorSearch" placeholder="Search nickname, guild, type, class, or ID" /></label>
        <button class="primary-button" :disabled="loading.has('game-data')" @click="refresh('game-data')"><RefreshCw :size="15" :class="{ 'spin-once': loading.has('game-data') }" /> Refresh snapshot</button>
      </div>
      <div class="table-card actor-table-card">
        <table v-if="visibleActors.length" class="data-table world-actor-table">
          <thead><tr><th>Actor</th><th>Population</th><th>Level</th><th>Guild / trainer</th><th>Coordinates</th><th>Stage</th><th>Class</th></tr></thead>
          <tbody>
            <tr v-for="(actor, index) in visibleActors.slice(0, 500)" :key="String(actor.InstanceID ?? `${actor.Type}-${index}`)">
              <td><strong>{{ actorDisplayName(actor) }}</strong></td>
              <td><span class="type-chip"><i :style="{ backgroundColor: actorCategoryMeta[actorCategory(actor)].color }" />{{ actorCategoryMeta[actorCategory(actor)].label }}</span></td>
              <td>{{ actor.level ?? '—' }}</td>
              <td>{{ actor.GuildName || actor.TrainerNickName || '—' }}</td>
              <td class="mono coordinate-cell">{{ coordinate(actor.LocationX) }}, {{ coordinate(actor.LocationY) }}</td>
              <td class="mono muted stage-cell" :title="actorStage(actor) || 'Surface'">{{ actorStage(actor) || 'Surface' }}</td>
              <td class="mono muted">{{ actor.Class || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">
          <Database :size="34" />
          <strong>{{ loading.has('game-data') ? 'Loading world population…' : gameData ? 'No actors match these filters' : 'Waiting for the first world snapshot' }}</strong>
          <span>{{ errors['game-data'] ? 'Retry the endpoint when the server is available.' : 'Adjust the population layers or search query.' }}</span>
        </div>
      </div>
      <p v-if="visibleActors.length > 500" class="result-note">Showing the first 500 of {{ visibleActors.length.toLocaleString() }} matching actors.</p>
    </div>
  </section>
</template>
