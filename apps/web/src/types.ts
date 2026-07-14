export type ServerInfo = {
  version: string
  servername: string
  description: string
  worldguid: string
}

export type ServerMetrics = {
  serverfps: number
  currentplayernum: number
  serverframetime: number
  maxplayernum: number
  uptime: number
  basecampnum: number
  days: number
}

export type Player = {
  name: string
  accountName: string
  playerId: string
  userId: string
  ip: string
  ping: number
  location_x: number
  location_y: number
  level: number
  building_count: number
}

export type ActorUnitType = 'Player' | 'OtomoPal' | 'BaseCampPal' | 'WildPal' | 'NPC'

export type Actor = Record<string, unknown> & {
  Type?: 'Character' | 'PalBox' | string
  Name?: string
  InstanceID?: string
  UnitType?: ActorUnitType | string
  NickName?: string
  TrainerInstanceID?: string
  TrainerNickName?: string
  TrainerClass?: string
  userid?: string
  ip?: string
  GuildName?: string
  GuildID?: string
  Class?: string
  level?: number
  HP?: number
  MaxHP?: number
  Action?: string
  AI_Action?: string
  LocationX?: number
  LocationY?: number
  LocationZ?: number
  RotationX?: number
  RotationY?: number
  RotationZ?: number
  Stage?: string
  IsActive?: boolean | 'true' | 'false' | string
}

export type GameData = {
  Time?: string
  InGameTime?: string
  InGameDays?: number
  FPS?: number
  AverageFPS?: number
  ActorData?: Actor[]
  [key: string]: unknown
}

export type ActivityTotals = {
  trackedPlayers: number
  sessions: number
  totalPlaytimeSeconds: number
  averageSessionSeconds: number
  currentlyOnline: number
}

export type DailyActivity = {
  date: string
  uniquePlayers: number
  sessions: number
  playtimeSeconds: number
}

export type PlayerActivity = {
  userId: string
  playerName: string
  sessionCount: number
  totalPlaytimeSeconds: number
  averageLatencyMs: number | null
  latencySampleCount: number
  lastConnectedAt: string | null
  online: boolean
}

export type ActivitySession = {
  id: string
  userId: string
  playerName: string
  connectedAt: string
  disconnectedAt: string | null
  durationSeconds: number
  online: boolean
}

export type PlayerIpHistory = {
  userId: string
  playerName: string
  ipAddress: string
  firstSeenAt: string
  lastSeenAt: string
  observationCount: number
  online: boolean
}

export type ActivitySummary = {
  periodDays: number
  generatedAt: string
  collector: {
    status: 'starting' | 'healthy' | 'degraded'
    running: boolean
    pollInFlight: boolean
    pollIntervalSeconds: number
    lastSuccessfulPollAt: string | null
    lastFailedPollAt: string | null
  }
  totals: ActivityTotals
  daily: DailyActivity[]
  topPlayers: PlayerActivity[]
  ipHistory: PlayerIpHistory[]
  recentSessions: ActivitySession[]
}
