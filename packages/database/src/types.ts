export const ACTIVITY_PERIOD_DAYS = [7, 14, 30, 90] as const

export type ActivityPeriodDays = (typeof ACTIVITY_PERIOD_DAYS)[number]

export type ActivityPlayerSnapshot = {
  userId: string
  playerId?: string | null
  name?: string | null
  accountName?: string | null
  ip?: string | null
  level?: number | null
  ping?: number | null
}

export type ActivityReconcileResult = {
  observedAt: string
  connectedPlayers: number
  startedSessions: number
  updatedSessions: number
  endedSessions: number
  ignoredPlayers: number
}

export type ActivityDailyStat = {
  date: string
  uniquePlayers: number
  sessions: number
  playtimeSeconds: number
}

export type ActivityTopPlayer = {
  userId: string
  playerName: string
  sessionCount: number
  totalPlaytimeSeconds: number
  lastConnectedAt: string
  online: boolean
  averageLatencyMs: number | null
  latencySampleCount: number
}

export type ActivityRecentSession = {
  id: string
  userId: string
  playerName: string
  connectedAt: string
  disconnectedAt: string | null
  durationSeconds: number
  online: boolean
}

export type ActivityIpHistoryEntry = {
  userId: string
  playerName: string
  ipAddress: string
  firstSeenAt: string
  lastSeenAt: string
  observationCount: number
  online: boolean
}

export type ActivitySummary = {
  periodDays: ActivityPeriodDays
  generatedAt: string
  totals: {
    trackedPlayers: number
    sessions: number
    totalPlaytimeSeconds: number
    averageSessionSeconds: number
    currentlyOnline: number
  }
  daily: ActivityDailyStat[]
  topPlayers: ActivityTopPlayer[]
  recentSessions: ActivityRecentSession[]
  ipHistory: ActivityIpHistoryEntry[]
}
