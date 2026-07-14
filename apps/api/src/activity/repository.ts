import { isIP } from 'node:net'
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type {
  ActivityDailyStat,
  ActivityIpHistoryEntry,
  ActivityPeriodDays,
  ActivityPlayerSnapshot,
  ActivityRecentSession,
  ActivityReconcileResult,
  ActivitySummary,
  ActivityTopPlayer,
} from './types.js'
import { ACTIVITY_PERIOD_DAYS } from './types.js'

const DAY_MS = 86_400_000

type RepositoryOptions = {
  /** Defaults to true so process restarts cannot leave phantom online players. */
  closeAbandonedOnOpen?: boolean
  now?: () => number
}

type NormalizedPlayer = {
  userId: string
  playerId: string
  name: string
  accountName: string
  ipAddress: string
  level: number | null
  latencyMs: number | null
}

type CountRow = { value: number }
type TotalsRow = {
  trackedPlayers: number
  sessions: number
  totalPlaytimeSeconds: number
  currentlyOnline: number
}

type DailyRow = {
  date: string
  uniquePlayers: number
  sessions: number
  playtimeSeconds: number
}

type TopPlayerRow = {
  userId: string
  playerName: string
  sessionCount: number
  totalPlaytimeSeconds: number
  lastConnectedAt: number
  online: number
  averageLatencyMs: number | null
  latencySampleCount: number
}

type RecentSessionRow = {
  id: number | bigint
  userId: string
  playerName: string
  connectedAt: number
  disconnectedAt: number | null
  durationSeconds: number
  online: number
}

type IpHistoryRow = {
  userId: string
  playerName: string
  ipAddress: string
  firstSeenAt: number
  lastSeenAt: number
  observationCount: number
  online: number
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function integer(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** Strips an optional game-client port and only accepts literal IPv4/IPv6 addresses. */
function normalizeIpAddress(value: string | null | undefined): string {
  const candidate = text(value)
  if (!candidate) return ''

  const bracketed = candidate.match(/^\[([^\]]+)](?::\d{1,5})?$/)
  if (bracketed && isIP(bracketed[1])) return canonicalIpAddress(bracketed[1])
  if (isIP(candidate)) return canonicalIpAddress(candidate)

  const ipv4WithPort = candidate.match(/^(.+):(\d{1,5})$/)
  if (ipv4WithPort && isIP(ipv4WithPort[1]) === 4) return ipv4WithPort[1]
  return ''
}

function canonicalIpAddress(address: string): string {
  if (isIP(address) === 4) return address
  // Zone identifiers are local interface metadata, not part of a remote address,
  // and the URL parser intentionally rejects them. Ignore them without failing
  // the otherwise valid attendance snapshot.
  if (address.includes('%')) return ''
  try {
    const hostname = new URL(`http://[${address}]/`).hostname
    return hostname.slice(1, -1)
  } catch {
    return ''
  }
}

function normalizePlayer(player: ActivityPlayerSnapshot): NormalizedPlayer | null {
  const userId = text(player.userId)
  if (!userId) return null

  return {
    userId,
    playerId: text(player.playerId),
    name: text(player.name),
    accountName: text(player.accountName),
    ipAddress: normalizeIpAddress(player.ip),
    level: integer(player.level),
    latencyMs: nonNegativeNumber(player.ping),
  }
}

function assertTimestamp(timestamp: number, label: string): number {
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new RangeError(`${label} must be a non-negative timestamp.`)
  }
  return Math.trunc(timestamp)
}

function assertPeriodDays(periodDays: number): asserts periodDays is ActivityPeriodDays {
  if (!(ACTIVITY_PERIOD_DAYS as readonly number[]).includes(periodDays)) {
    throw new RangeError(`periodDays must be one of ${ACTIVITY_PERIOD_DAYS.join(', ')}.`)
  }
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function runTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export class ActivityRepository {
  private readonly upsertPlayer: StatementSync
  private readonly activeSession: StatementSync
  private readonly insertSession: StatementSync
  private readonly updateSession: StatementSync
  private readonly disconnectMissingSessions: StatementSync
  private readonly upsertIpObservation: StatementSync
  private readonly upsertDailyLatency: StatementSync

  constructor(
    private readonly database: DatabaseSync,
    options: RepositoryOptions = {},
  ) {
    this.upsertPlayer = database.prepare(`
      INSERT INTO players (
        user_id, player_id, name, account_name, last_level,
        first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        player_id = COALESCE(NULLIF(excluded.player_id, ''), players.player_id),
        name = COALESCE(NULLIF(excluded.name, ''), players.name),
        account_name = COALESCE(NULLIF(excluded.account_name, ''), players.account_name),
        last_level = COALESCE(excluded.last_level, players.last_level),
        last_seen_at = MAX(players.last_seen_at, excluded.last_seen_at)
    `)
    this.activeSession = database.prepare(
      'SELECT id, connected_at FROM sessions WHERE user_id = ? AND active = 1',
    )
    this.insertSession = database.prepare(`
      INSERT INTO sessions (user_id, connected_at, last_seen_at, duration_seconds, active)
      VALUES (?, ?, ?, 0, 1)
    `)
    this.updateSession = database.prepare(`
      UPDATE sessions
      SET last_seen_at = MAX(last_seen_at, ?),
          duration_seconds = MAX(0, CAST((MAX(last_seen_at, ?) - connected_at) / 1000 AS INTEGER))
      WHERE id = ?
    `)
    this.disconnectMissingSessions = database.prepare(`
      UPDATE sessions
      SET disconnected_at = ?,
          duration_seconds = MAX(0, CAST((? - connected_at) / 1000 AS INTEGER)),
          active = 0
      WHERE active = 1
        AND user_id NOT IN (SELECT value FROM json_each(?))
    `)
    this.upsertIpObservation = database.prepare(`
      INSERT INTO player_ip_observations (
        user_id, ip_address, first_seen_at, last_seen_at, observation_count
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(user_id, ip_address) DO UPDATE SET
        first_seen_at = MIN(player_ip_observations.first_seen_at, excluded.first_seen_at),
        last_seen_at = MAX(player_ip_observations.last_seen_at, excluded.last_seen_at),
        observation_count = player_ip_observations.observation_count + 1
    `)
    this.upsertDailyLatency = database.prepare(`
      INSERT INTO player_latency_daily (
        user_id, day_start, latency_sum_ms, sample_count
      ) VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, day_start) DO UPDATE SET
        latency_sum_ms = player_latency_daily.latency_sum_ms + excluded.latency_sum_ms,
        sample_count = player_latency_daily.sample_count + 1
    `)

    if (options.closeAbandonedOnOpen !== false) {
      this.closeAbandonedSessions((options.now ?? Date.now)())
    }
  }

  reconcilePlayers(
    snapshots: readonly ActivityPlayerSnapshot[],
    observedAt = Date.now(),
  ): ActivityReconcileResult {
    const now = assertTimestamp(observedAt, 'observedAt')
    if (!Array.isArray(snapshots)) {
      throw new TypeError('Player snapshot must be an array.')
    }
    const playersById = new Map<string, NormalizedPlayer>()
    let ignoredPlayers = 0

    for (const snapshot of snapshots) {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new TypeError('Every player snapshot must be an object.')
      }
      const player = normalizePlayer(snapshot)
      if (!player) {
        throw new TypeError('Every player snapshot must have a non-empty userId.')
      }
      if (playersById.has(player.userId)) ignoredPlayers += 1
      playersById.set(player.userId, player)
    }

    return runTransaction(this.database, () => {
      const observedIds = [...playersById.keys()]
      const endedSessions = Number(this.disconnectMissingSessions
        .run(now, now, JSON.stringify(observedIds)).changes)
      let startedSessions = 0
      let updatedSessions = 0

      for (const player of playersById.values()) {
        this.upsertPlayer.run(
          player.userId,
          player.playerId,
          player.name,
          player.accountName,
          player.level,
          now,
          now,
        )
        if (player.ipAddress) {
          this.upsertIpObservation.run(player.userId, player.ipAddress, now, now)
        }
        if (player.latencyMs !== null) {
          this.upsertDailyLatency.run(player.userId, startOfUtcDay(now), player.latencyMs)
        }

        const existing = this.activeSession.get(player.userId) as
          | { id: number | bigint; connected_at: number }
          | undefined

        if (existing) {
          this.updateSession.run(now, now, existing.id)
          updatedSessions += 1
        } else {
          this.insertSession.run(player.userId, now, now)
          startedSessions += 1
        }
      }

      return {
        observedAt: iso(now),
        connectedPlayers: playersById.size,
        startedSessions,
        updatedSessions,
        endedSessions,
        ignoredPlayers,
      }
    })
  }

  /**
   * Ends sessions left open by a previous process at their last confirmed sighting.
   * This avoids counting server-monitor downtime as player activity.
   */
  closeAbandonedSessions(closedAt = Date.now()): number {
    const now = assertTimestamp(closedAt, 'closedAt')
    const result = this.database.prepare(`
      UPDATE sessions
      SET disconnected_at = MIN(MAX(last_seen_at, connected_at), ?),
          duration_seconds = MAX(0, CAST((MIN(MAX(last_seen_at, connected_at), ?) - connected_at) / 1000 AS INTEGER)),
          active = 0
      WHERE active = 1
    `).run(now, now)
    return Number(result.changes)
  }

  getSummary(
    periodDays: ActivityPeriodDays,
    generatedAt = Date.now(),
    recentLimit = 20,
  ): ActivitySummary {
    assertPeriodDays(periodDays)
    const now = assertTimestamp(generatedAt, 'generatedAt')
    if (!Number.isInteger(recentLimit) || recentLimit < 1 || recentLimit > 100) {
      throw new RangeError('recentLimit must be an integer from 1 through 100.')
    }

    const rangeStart = startOfUtcDay(now) - (periodDays - 1) * DAY_MS
    const totals = this.database.prepare(`
      SELECT
        COUNT(DISTINCT user_id) AS trackedPlayers,
        COUNT(*) AS sessions,
        COALESCE(SUM(MAX(0, CAST((MIN(COALESCE(disconnected_at, MIN(last_seen_at, ?)), ?) - MAX(connected_at, ?)) / 1000 AS INTEGER))), 0)
          AS totalPlaytimeSeconds,
        COALESCE(SUM(active), 0) AS currentlyOnline
      FROM sessions
      WHERE connected_at <= ? AND (active = 1 OR disconnected_at > ?)
    `).get(now, now, rangeStart, now, rangeStart) as TotalsRow

    const dailyRows = this.database.prepare(`
      WITH RECURSIVE days(day_start) AS (
        VALUES (?)
        UNION ALL
        SELECT day_start + ${DAY_MS} FROM days WHERE day_start + ${DAY_MS} <= ?
      )
      SELECT
        strftime('%Y-%m-%d', day_start / 1000, 'unixepoch') AS date,
        COUNT(DISTINCT sessions.user_id) AS uniquePlayers,
        COUNT(sessions.id) AS sessions,
        COALESCE(SUM(
          MAX(0, CAST((
            MIN(COALESCE(sessions.disconnected_at, MIN(sessions.last_seen_at, ?)), ?, day_start + ${DAY_MS})
            - MAX(sessions.connected_at, day_start)
          ) / 1000 AS INTEGER))
        ), 0) AS playtimeSeconds
      FROM days
      LEFT JOIN sessions
        ON sessions.connected_at < MIN(day_start + ${DAY_MS}, ? + 1)
        AND (sessions.active = 1 OR sessions.disconnected_at > day_start)
      GROUP BY day_start
      ORDER BY day_start
    `).all(rangeStart, startOfUtcDay(now), now, now, now) as DailyRow[]

    const topRows = this.database.prepare(`
      WITH player_activity AS (
        SELECT
          sessions.user_id AS userId,
          COALESCE(NULLIF(players.name, ''), NULLIF(players.account_name, ''), sessions.user_id) AS playerName,
          COUNT(*) AS sessionCount,
          COALESCE(SUM(MAX(0, CAST((MIN(COALESCE(sessions.disconnected_at, MIN(sessions.last_seen_at, ?)), ?) - MAX(sessions.connected_at, ?)) / 1000 AS INTEGER))), 0)
            AS totalPlaytimeSeconds,
          MAX(sessions.connected_at) AS lastConnectedAt,
          MAX(sessions.active) AS online
        FROM sessions
        JOIN players USING (user_id)
        WHERE sessions.connected_at <= ? AND (sessions.active = 1 OR sessions.disconnected_at > ?)
        GROUP BY sessions.user_id
      ), period_latency AS (
        SELECT
          user_id AS userId,
          SUM(latency_sum_ms) AS latencySumMs,
          SUM(sample_count) AS latencySampleCount
        FROM player_latency_daily
        WHERE day_start BETWEEN ? AND ?
        GROUP BY user_id
      )
      SELECT
        player_activity.*,
        CASE WHEN period_latency.latencySampleCount IS NULL THEN NULL
          ELSE period_latency.latencySumMs / period_latency.latencySampleCount END AS averageLatencyMs,
        COALESCE(period_latency.latencySampleCount, 0) AS latencySampleCount
      FROM player_activity
      LEFT JOIN period_latency ON period_latency.userId = player_activity.userId
      ORDER BY totalPlaytimeSeconds DESC, lastConnectedAt DESC, playerName COLLATE NOCASE
      LIMIT 10
    `).all(
      now,
      now,
      rangeStart,
      now,
      rangeStart,
      rangeStart,
      startOfUtcDay(now),
    ) as TopPlayerRow[]

    const recentRows = this.database.prepare(`
      SELECT
        sessions.id,
        sessions.user_id AS userId,
        COALESCE(NULLIF(players.name, ''), NULLIF(players.account_name, ''), sessions.user_id) AS playerName,
        sessions.connected_at AS connectedAt,
        sessions.disconnected_at AS disconnectedAt,
        MAX(0, CAST((COALESCE(sessions.disconnected_at, MIN(sessions.last_seen_at, ?)) - sessions.connected_at) / 1000 AS INTEGER)) AS durationSeconds,
        sessions.active AS online
      FROM sessions
      JOIN players USING (user_id)
      WHERE sessions.connected_at <= ? AND (sessions.active = 1 OR sessions.disconnected_at > ?)
      ORDER BY sessions.connected_at DESC, sessions.id DESC
      LIMIT ?
    `).all(now, now, rangeStart, recentLimit) as RecentSessionRow[]

    const totalPlaytimeSeconds = Number(totals.totalPlaytimeSeconds)
    const sessions = Number(totals.sessions)
    const daily: ActivityDailyStat[] = dailyRows.map((row) => ({
      date: row.date,
      uniquePlayers: Number(row.uniquePlayers),
      sessions: Number(row.sessions),
      playtimeSeconds: Number(row.playtimeSeconds),
    }))
    const topPlayers: ActivityTopPlayer[] = topRows.map((row) => ({
      userId: row.userId,
      playerName: row.playerName,
      sessionCount: Number(row.sessionCount),
      totalPlaytimeSeconds: Number(row.totalPlaytimeSeconds),
      lastConnectedAt: iso(Number(row.lastConnectedAt)),
      online: Boolean(row.online),
      averageLatencyMs: row.averageLatencyMs === null
        ? null
        : Math.round(Number(row.averageLatencyMs)),
      latencySampleCount: Number(row.latencySampleCount),
    }))
    const recentSessions: ActivityRecentSession[] = recentRows.map((row) => ({
      id: String(row.id),
      userId: row.userId,
      playerName: row.playerName,
      connectedAt: iso(Number(row.connectedAt)),
      disconnectedAt: row.disconnectedAt === null ? null : iso(Number(row.disconnectedAt)),
      durationSeconds: Number(row.durationSeconds),
      online: Boolean(row.online),
    }))
    const ipHistory = this.getIpHistory(periodDays, now)

    return {
      periodDays,
      generatedAt: iso(now),
      totals: {
        trackedPlayers: Number(totals.trackedPlayers),
        sessions,
        totalPlaytimeSeconds,
        averageSessionSeconds: sessions === 0 ? 0 : Math.round(totalPlaytimeSeconds / sessions),
        currentlyOnline: Number(totals.currentlyOnline),
      },
      daily,
      topPlayers,
      recentSessions,
      ipHistory,
    }
  }

  getIpHistory(
    periodDays: ActivityPeriodDays,
    generatedAt = Date.now(),
    limit = 100,
  ): ActivityIpHistoryEntry[] {
    assertPeriodDays(periodDays)
    const now = assertTimestamp(generatedAt, 'generatedAt')
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('limit must be an integer from 1 through 500.')
    }
    const rangeStart = startOfUtcDay(now) - (periodDays - 1) * DAY_MS
    const rows = this.database.prepare(`
      SELECT
        observations.user_id AS userId,
        COALESCE(NULLIF(players.name, ''), NULLIF(players.account_name, ''), observations.user_id)
          AS playerName,
        observations.ip_address AS ipAddress,
        observations.first_seen_at AS firstSeenAt,
        observations.last_seen_at AS lastSeenAt,
        observations.observation_count AS observationCount,
        CASE WHEN observations.last_seen_at = players.last_seen_at
          AND EXISTS (
            SELECT 1 FROM sessions
            WHERE sessions.user_id = observations.user_id AND sessions.active = 1
          )
          THEN 1 ELSE 0 END AS online
      FROM player_ip_observations AS observations
      JOIN players USING (user_id)
      WHERE observations.last_seen_at >= ? AND observations.first_seen_at <= ?
      ORDER BY observations.last_seen_at DESC, playerName COLLATE NOCASE, observations.ip_address
      LIMIT ?
    `).all(rangeStart, now, limit) as IpHistoryRow[]

    return rows.map((row) => ({
      userId: row.userId,
      playerName: row.playerName,
      ipAddress: row.ipAddress,
      firstSeenAt: iso(Number(row.firstSeenAt)),
      lastSeenAt: iso(Number(row.lastSeenAt)),
      observationCount: Number(row.observationCount),
      online: Boolean(row.online),
    }))
  }

  getOnlinePlayerCount(): number {
    const row = this.database.prepare(
      'SELECT COUNT(*) AS value FROM sessions WHERE active = 1',
    ).get() as CountRow
    return Number(row.value)
  }
}
