import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  type InjectionKey,
} from 'vue'
import { activityApi, ApiError, palworldApi, type ApiEndpoint } from '../api'
import type {
  ActivitySummary,
  GameData,
  Player,
  ServerInfo,
  ServerMetrics,
} from '../types'

export type ReadEndpoint =
  'info' | 'metrics' | 'players' | 'settings' | 'game-data' | 'activity'

export type Confirmation = {
  title: string
  detail: string
  label: string
  phrase?: string
  danger?: boolean
  run: () => Promise<void>
}

export type Toast = { id: number; message: string; kind: 'success' | 'error' }

const GAME_DATA_REFRESH_MS = 60_000

function storedPreference(name: string): string | null {
  const key = `palharbor-${name}`
  const current = localStorage.getItem(key)
  if (current !== null) return current

  const legacy = localStorage.getItem(`paldeck-${name}`)
  if (legacy !== null) localStorage.setItem(key, legacy)
  return legacy
}

export function createPalworldMonitor() {
  const storedRefresh = Number(storedPreference('refresh') ?? 10)
  const storedGameDataAuto = storedPreference('world-auto')
  const info = ref<ServerInfo | null>(null)
  const metrics = ref<ServerMetrics | null>(null)
  const players = ref<Player[]>([])
  const settings = ref<Record<string, unknown> | null>(null)
  const gameData = ref<GameData | null>(null)
  const activitySummary = ref<ActivitySummary | null>(null)
  const storedActivityDays = Number(storedPreference('activity-days') ?? 30)
  const activityDays = ref(
    [7, 14, 30, 90].includes(storedActivityDays) ? storedActivityDays : 30,
  )
  const errors = reactive<Partial<Record<ReadEndpoint, string>>>({})
  const loading = reactive(new Set<ReadEndpoint>())
  const lastFetched = reactive<Partial<Record<ReadEndpoint, number>>>({})
  const lastUpdated = ref<Date | null>(null)
  const refreshSeconds = ref(
    [0, 5, 10, 30, 60].includes(storedRefresh) ? storedRefresh : 10,
  )
  const pageVisible = ref(!document.hidden)
  const gameDataAuto = ref(
    storedGameDataAuto === null ? true : storedGameDataAuto === 'true',
  )
  const worldViewActive = ref(false)
  const playerSearch = ref('')
  const actorSearch = ref('')
  const settingsSearch = ref('')
  const announceMessage = ref('')
  const unbanUserId = ref('')
  const shutdownWait = ref(30)
  const shutdownMessage = ref('Server maintenance — please log out safely.')
  const actionBusy = ref(false)
  const confirmation = ref<Confirmation | null>(null)
  const confirmationInput = ref('')
  const toasts = ref<Toast[]>([])
  let toastId = 0
  let intervalId: number | undefined
  let gameDataIntervalId: number | undefined

  const connected = computed(() => Boolean(info.value || metrics.value))
  const coreLoading = computed(
    () => loading.has('info') && loading.has('metrics'),
  )
  const playerCount = computed(
    () => metrics.value?.currentplayernum ?? players.value.length,
  )
  const maxPlayers = computed(() => metrics.value?.maxplayernum ?? 0)
  const playerCapacity = computed(() =>
    maxPlayers.value
      ? Math.min(100, Math.round((playerCount.value / maxPlayers.value) * 100))
      : 0,
  )
  const dominantError = computed(
    () => errors.info ?? errors.metrics ?? errors.players ?? null,
  )
  const activityLoading = computed(() => loading.has('activity'))
  const pollingActive = computed(
    () => refreshSeconds.value > 0 && pageVisible.value,
  )
  const lastUpdatedLabel = computed(() =>
    lastUpdated.value
      ? lastUpdated.value.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'Never',
  )
  const gameDataUpdatedLabel = computed(() =>
    lastFetched['game-data']
      ? new Date(lastFetched['game-data']).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : 'Never',
  )

  const filteredPlayers = computed(() => {
    const query = playerSearch.value.trim().toLowerCase()
    if (!query) return players.value
    return players.value.filter((player) =>
      [player.name, player.accountName, player.userId, player.ip].some(
        (value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(query),
      ),
    )
  })

  const actorData = computed(() =>
    Array.isArray(gameData.value?.ActorData) ? gameData.value.ActorData : [],
  )
  const filteredActors = computed(() => {
    const query = actorSearch.value.trim().toLowerCase()
    if (!query) return actorData.value
    return actorData.value.filter((actor) =>
      Object.values(actor).some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(query),
      ),
    )
  })

  const actorGroups = computed(() => {
    const counts = new Map<string, number>()
    for (const actor of actorData.value) {
      const key = String(actor.UnitType ?? actor.Type ?? 'Unknown')
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  })

  const filteredSettings = computed(() => {
    const query = settingsSearch.value.trim().toLowerCase()
    return Object.entries(settings.value ?? {})
      .filter(
        ([key, value]) =>
          !query || `${key} ${String(value)}`.toLowerCase().includes(query),
      )
      .sort(([a], [b]) => a.localeCompare(b))
  })

  function setData(endpoint: ReadEndpoint, data: unknown) {
    if (endpoint === 'info') info.value = data as ServerInfo
    if (endpoint === 'metrics') metrics.value = data as ServerMetrics
    if (endpoint === 'players')
      players.value = (data as { players?: Player[] }).players ?? []
    if (endpoint === 'settings')
      settings.value = data as Record<string, unknown>
    if (endpoint === 'game-data') gameData.value = data as GameData
    if (endpoint === 'activity') activitySummary.value = data as ActivitySummary
  }

  async function refresh(endpoint: ReadEndpoint) {
    if (loading.has(endpoint)) return
    const requestedActivityDays = activityDays.value
    loading.add(endpoint)
    try {
      const data =
        endpoint === 'activity'
          ? await activityApi<ActivitySummary>(requestedActivityDays)
          : await palworldApi<unknown>(endpoint)
      setData(endpoint, data)
      delete errors[endpoint]
      lastFetched[endpoint] = Date.now()
      lastUpdated.value = new Date()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      errors[endpoint] =
        error instanceof Error ? error.message : 'The request failed.'
    } finally {
      const repeatActivityRefresh =
        endpoint === 'activity' && requestedActivityDays !== activityDays.value
      loading.delete(endpoint)
      if (repeatActivityRefresh) void refresh('activity')
    }
  }

  async function refreshCore(force = false) {
    const now = Date.now()
    const stale = (endpoint: ReadEndpoint, afterMs: number) =>
      force ||
      !lastFetched[endpoint] ||
      now - (lastFetched[endpoint] ?? 0) >= afterMs
    const requests = [refresh('metrics'), refresh('players')]
    if (stale('activity', 30_000)) requests.push(refresh('activity'))
    if (stale('info', 60_000)) requests.push(refresh('info'))
    if (stale('settings', 60_000)) requests.push(refresh('settings'))
    await Promise.all(requests)
  }

  function configurePolling() {
    if (intervalId) window.clearInterval(intervalId)
    intervalId = undefined
    localStorage.setItem('palharbor-refresh', String(refreshSeconds.value))
    if (pollingActive.value) {
      intervalId = window.setInterval(
        () => void refreshCore(false),
        refreshSeconds.value * 1000,
      )
    }
  }

  function configureGameDataPolling() {
    if (gameDataIntervalId) window.clearInterval(gameDataIntervalId)
    gameDataIntervalId = undefined
    if (gameDataAuto.value && worldViewActive.value && pageVisible.value) {
      gameDataIntervalId = window.setInterval(
        () => void refresh('game-data'),
        GAME_DATA_REFRESH_MS,
      )
    }
  }

  function setRefresh(value: number) {
    refreshSeconds.value = [0, 5, 10, 30, 60].includes(value) ? value : 10
    configurePolling()
  }

  function setGameDataAuto(value: boolean) {
    gameDataAuto.value = value
    localStorage.setItem('palharbor-world-auto', String(value))
    configureGameDataPolling()
    if (value && worldViewActive.value && pageVisible.value)
      void refresh('game-data')
  }

  function activateWorldView() {
    worldViewActive.value = true
    configureGameDataPolling()
    void refresh('game-data')
  }

  function deactivateWorldView() {
    worldViewActive.value = false
    configureGameDataPolling()
  }

  function setActivityDays(value: number) {
    activityDays.value = [7, 14, 30, 90].includes(value) ? value : 30
    localStorage.setItem('palharbor-activity-days', String(activityDays.value))
    void refresh('activity')
  }

  function onVisibilityChange() {
    const wasHidden = !pageVisible.value
    pageVisible.value = !document.hidden
    configurePolling()
    configureGameDataPolling()
    if (wasHidden && pageVisible.value) {
      void refreshCore(false)
      if (worldViewActive.value && gameDataAuto.value) void refresh('game-data')
    }
  }

  function formatDuration(seconds = 0) {
    if (!Number.isFinite(seconds)) return '—'
    const days = Math.floor(seconds / 86_400)
    const hours = Math.floor((seconds % 86_400) / 3_600)
    const minutes = Math.floor((seconds % 3_600) / 60)
    if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`
    if (days) return `${days}d ${hours}h`
    if (hours) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  function formatNumber(value: unknown, digits = 0) {
    const number = Number(value)
    return Number.isFinite(number)
      ? number.toLocaleString(undefined, { maximumFractionDigits: digits })
      : '—'
  }

  function shortId(value?: string) {
    if (!value) return '—'
    return value.length > 18
      ? `${value.slice(0, 10)}…${value.slice(-5)}`
      : value
  }

  function settingLabel(key: string) {
    return key
      .replace(/^b(?=[A-Z])/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
  }

  function toast(message: string, kind: Toast['kind'] = 'success') {
    const id = ++toastId
    toasts.value.push({ id, message, kind })
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((item) => item.id !== id)
    }, 4_500)
  }

  async function runAction(
    endpoint: ApiEndpoint,
    body: Record<string, unknown> | undefined,
    success: string,
  ) {
    actionBusy.value = true
    try {
      await palworldApi(endpoint, { method: 'POST', body })
      toast(success)
      if (['kick', 'ban', 'unban'].includes(endpoint)) await refresh('players')
      if (endpoint === 'announce') announceMessage.value = ''
      if (endpoint === 'unban') unbanUserId.value = ''
    } catch (error) {
      toast(
        error instanceof ApiError ? error.message : 'The command failed.',
        'error',
      )
      throw error
    } finally {
      actionBusy.value = false
    }
  }

  function ask(confirm: Confirmation) {
    confirmationInput.value = ''
    confirmation.value = confirm
  }

  async function confirmAction() {
    const pending = confirmation.value
    if (
      !pending ||
      (pending.phrase && confirmationInput.value !== pending.phrase)
    )
      return
    try {
      await pending.run()
      confirmation.value = null
    } catch {
      // The toast already explains the upstream failure; keep the dialog available to retry.
    }
  }

  function announce() {
    const message = announceMessage.value.trim()
    if (!message) return
    void runAction(
      'announce',
      { message },
      'Announcement broadcast to the server.',
    )
  }

  function kickPlayer(player: Player) {
    ask({
      title: `Kick ${player.name || player.accountName}?`,
      detail: 'They will be disconnected now, but can join the server again.',
      label: 'Kick player',
      run: () =>
        runAction(
          'kick',
          { userid: player.userId, message: 'Removed by server admin.' },
          `${player.name} was kicked.`,
        ),
    })
  }

  function banPlayer(player: Player) {
    ask({
      title: `Ban ${player.name || player.accountName}?`,
      detail: `This blocks ${player.userId} from reconnecting until you unban that user ID. Type BAN to continue.`,
      label: 'Ban player',
      phrase: 'BAN',
      danger: true,
      run: () =>
        runAction(
          'ban',
          { userid: player.userId, message: 'Banned by server admin.' },
          `${player.name} was banned.`,
        ),
    })
  }

  function unbanPlayer() {
    const userid = unbanUserId.value.trim()
    if (!userid) return
    ask({
      title: 'Unban this user?',
      detail: `${userid} will be allowed to reconnect to the server.`,
      label: 'Unban user',
      run: () => runAction('unban', { userid }, 'User was unbanned.'),
    })
  }

  function saveWorld() {
    ask({
      title: 'Save the world now?',
      detail: 'Palworld will write the current world state to disk.',
      label: 'Save world',
      run: () => runAction('save', undefined, 'World save requested.'),
    })
  }

  function scheduleShutdown() {
    const waittime = Math.max(0, Math.round(shutdownWait.value))
    ask({
      title: 'Schedule server shutdown?',
      detail: `The server will shut down in ${waittime} seconds. Type SHUTDOWN to confirm.`,
      label: 'Schedule shutdown',
      phrase: 'SHUTDOWN',
      danger: true,
      run: () =>
        runAction(
          'shutdown',
          {
            waittime,
            ...(shutdownMessage.value.trim()
              ? { message: shutdownMessage.value.trim() }
              : {}),
          },
          'Server shutdown scheduled.',
        ),
    })
  }

  function forceStop() {
    ask({
      title: 'Force-stop the server?',
      detail:
        'This immediately stops the process and may lose unsaved progress. Type FORCE STOP to confirm.',
      label: 'Force stop',
      phrase: 'FORCE STOP',
      danger: true,
      run: () => runAction('stop', undefined, 'Force-stop command sent.'),
    })
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    configurePolling()
    configureGameDataPolling()
    void refreshCore(true)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (intervalId) window.clearInterval(intervalId)
    if (gameDataIntervalId) window.clearInterval(gameDataIntervalId)
  })

  return {
    info,
    metrics,
    players,
    settings,
    gameData,
    activitySummary,
    activityDays,
    errors,
    loading,
    lastUpdated,
    refreshSeconds,
    pageVisible,
    gameDataAuto,
    playerSearch,
    actorSearch,
    settingsSearch,
    announceMessage,
    unbanUserId,
    shutdownWait,
    shutdownMessage,
    actionBusy,
    confirmation,
    confirmationInput,
    toasts,
    connected,
    coreLoading,
    playerCount,
    maxPlayers,
    playerCapacity,
    dominantError,
    activityLoading,
    pollingActive,
    lastUpdatedLabel,
    gameDataUpdatedLabel,
    filteredPlayers,
    actorData,
    filteredActors,
    actorGroups,
    filteredSettings,
    refresh,
    refreshCore,
    setRefresh,
    setGameDataAuto,
    activateWorldView,
    deactivateWorldView,
    setActivityDays,
    formatDuration,
    formatNumber,
    shortId,
    settingLabel,
    confirmAction,
    announce,
    kickPlayer,
    banPlayer,
    unbanPlayer,
    saveWorld,
    scheduleShutdown,
    forceStop,
  }
}

export type PalworldMonitor = ReturnType<typeof createPalworldMonitor>

export const palworldMonitorKey: InjectionKey<PalworldMonitor> =
  Symbol('palworld-monitor')

export function usePalworldMonitor() {
  const monitor = inject(palworldMonitorKey)
  if (!monitor)
    throw new Error('Palworld monitor is only available inside AppShell.')
  return monitor
}
