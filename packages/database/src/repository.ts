import { isIP } from 'node:net'
import type { DatabaseClient } from './client.js'
import type {
  ActivityDailyStat,
  ActivityExport,
  ActivityIpHistoryEntry,
  ActivityPeriodDays,
  ActivityPlayerSnapshot,
  ActivityPruneResult,
  ActivityRecentSession,
  ActivityReconcileResult,
  ActivitySummary,
  ActivityTopPlayer,
} from './types.js'
import { ACTIVITY_PERIOD_DAYS } from './types.js'

const DAY_MS = 86_400_000

export type ActivityRepositoryOptions = {
  /** Defaults to true so process restarts cannot leave phantom online players. */
  closeAbandonedOnOpen?: boolean
  now?: () => number
  /** IP collection is opt-in because connection addresses are personal data. */
  storeIpAddresses?: boolean
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

type SessionWithPlayer = Awaited<
  ReturnType<DatabaseClient['session']['findMany']>
>[number] & {
  player: {
    userId: string
    name: string
    accountName: string
  }
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function integer(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : null
}

function nonNegativeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function canonicalIpAddress(address: string): string {
  if (isIP(address) === 4) return address
  if (address.includes('%')) return ''
  try {
    const hostname = new URL(`http://[${address}]/`).hostname
    return hostname.slice(1, -1)
  } catch {
    return ''
  }
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

function normalizePlayer(
  player: ActivityPlayerSnapshot,
): NormalizedPlayer | null {
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

function assertPeriodDays(
  periodDays: number,
): asserts periodDays is ActivityPeriodDays {
  if (!(ACTIVITY_PERIOD_DAYS as readonly number[]).includes(periodDays)) {
    throw new RangeError(
      `periodDays must be one of ${ACTIVITY_PERIOD_DAYS.join(', ')}.`,
    )
  }
}

function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function playerName(player: {
  userId: string
  name: string
  accountName: string
}): string {
  return player.name || player.accountName || player.userId
}

function effectiveEnd(
  session: {
    disconnectedAt: bigint | null
    lastSeenAt: bigint
  },
  now: number,
): number {
  return session.disconnectedAt === null
    ? Math.min(Number(session.lastSeenAt), now)
    : Number(session.disconnectedAt)
}

function clippedDuration(
  start: number,
  end: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  return Math.max(
    0,
    Math.floor((Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / 1_000),
  )
}

export class ActivityRepository {
  private readonly closeAbandonedOnOpen: boolean
  private readonly now: () => number
  private readonly storeIpAddresses: boolean
  private initialized = false

  constructor(
    private readonly database: DatabaseClient,
    options: ActivityRepositoryOptions = {},
  ) {
    this.closeAbandonedOnOpen = options.closeAbandonedOnOpen !== false
    this.now = options.now ?? Date.now
    this.storeIpAddresses = options.storeIpAddresses === true
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (this.closeAbandonedOnOpen) await this.closeAbandonedSessions(this.now())
    this.initialized = true
  }

  async reconcilePlayers(
    snapshots: readonly ActivityPlayerSnapshot[],
    observedAt = Date.now(),
  ): Promise<ActivityReconcileResult> {
    const now = assertTimestamp(observedAt, 'observedAt')
    if (!Array.isArray(snapshots))
      throw new TypeError('Player snapshot must be an array.')

    const playersById = new Map<string, NormalizedPlayer>()
    let ignoredPlayers = 0
    for (const snapshot of snapshots) {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new TypeError('Every player snapshot must be an object.')
      }
      const player = normalizePlayer(snapshot)
      if (!player)
        throw new TypeError(
          'Every player snapshot must have a non-empty userId.',
        )
      if (playersById.has(player.userId)) ignoredPlayers += 1
      playersById.set(player.userId, player)
    }

    const observedIds = new Set(playersById.keys())
    const timestamp = BigInt(now)
    const dayStart = BigInt(startOfUtcDay(now))

    const result = await this.database.$transaction(
      async (tx) => {
        const activeSessions = await tx.session.findMany({
          where: { active: true },
        })
        const activeByUserId = new Map(
          activeSessions.map((session) => [session.userId, session]),
        )
        let endedSessions = 0
        let startedSessions = 0
        let updatedSessions = 0

        for (const session of activeSessions) {
          if (observedIds.has(session.userId)) continue
          await tx.session.update({
            where: { id: session.id },
            data: {
              disconnectedAt: timestamp,
              durationSeconds: Math.max(
                0,
                Math.floor((now - Number(session.connectedAt)) / 1_000),
              ),
              active: false,
            },
          })
          endedSessions += 1
        }

        for (const player of playersById.values()) {
          const existingPlayer = await tx.player.findUnique({
            where: { userId: player.userId },
          })
          await tx.player.upsert({
            where: { userId: player.userId },
            create: {
              userId: player.userId,
              playerId: player.playerId || null,
              name: player.name,
              accountName: player.accountName,
              lastLevel: player.level,
              firstSeenAt: timestamp,
              lastSeenAt: timestamp,
            },
            update: {
              ...(player.playerId ? { playerId: player.playerId } : {}),
              ...(player.name ? { name: player.name } : {}),
              ...(player.accountName
                ? { accountName: player.accountName }
                : {}),
              ...(player.level === null ? {} : { lastLevel: player.level }),
              lastSeenAt: BigInt(
                Math.max(Number(existingPlayer?.lastSeenAt ?? timestamp), now),
              ),
            },
          })

          if (this.storeIpAddresses && player.ipAddress) {
            const key = {
              userId_ipAddress: {
                userId: player.userId,
                ipAddress: player.ipAddress,
              },
            }
            const existingObservation = await tx.playerIpObservation.findUnique(
              { where: key },
            )
            await tx.playerIpObservation.upsert({
              where: key,
              create: {
                userId: player.userId,
                ipAddress: player.ipAddress,
                firstSeenAt: timestamp,
                lastSeenAt: timestamp,
                observationCount: 1,
              },
              update: {
                firstSeenAt: BigInt(
                  Math.min(
                    Number(existingObservation?.firstSeenAt ?? timestamp),
                    now,
                  ),
                ),
                lastSeenAt: BigInt(
                  Math.max(
                    Number(existingObservation?.lastSeenAt ?? timestamp),
                    now,
                  ),
                ),
                observationCount: { increment: 1 },
              },
            })
          }

          if (player.latencyMs !== null) {
            const key = { userId_dayStart: { userId: player.userId, dayStart } }
            await tx.playerLatencyDaily.upsert({
              where: key,
              create: {
                userId: player.userId,
                dayStart,
                latencySumMs: player.latencyMs,
                sampleCount: 1,
              },
              update: {
                latencySumMs: { increment: player.latencyMs },
                sampleCount: { increment: 1 },
              },
            })
          }

          const activeSession = activeByUserId.get(player.userId)
          if (activeSession) {
            const lastSeenAt = Math.max(Number(activeSession.lastSeenAt), now)
            await tx.session.update({
              where: { id: activeSession.id },
              data: {
                lastSeenAt: BigInt(lastSeenAt),
                durationSeconds: Math.max(
                  0,
                  Math.floor(
                    (lastSeenAt - Number(activeSession.connectedAt)) / 1_000,
                  ),
                ),
              },
            })
            updatedSessions += 1
          } else {
            await tx.session.create({
              data: {
                userId: player.userId,
                connectedAt: timestamp,
                lastSeenAt: timestamp,
                durationSeconds: 0,
                active: true,
              },
            })
            startedSessions += 1
          }
        }

        return { endedSessions, startedSessions, updatedSessions }
      },
      { maxWait: 10_000, timeout: 30_000 },
    )

    return {
      observedAt: iso(now),
      connectedPlayers: playersById.size,
      ...result,
      ignoredPlayers,
    }
  }

  async closeAbandonedSessions(closedAt = Date.now()): Promise<number> {
    const now = assertTimestamp(closedAt, 'closedAt')
    return this.database.$transaction(async (tx) => {
      const sessions = await tx.session.findMany({ where: { active: true } })
      for (const session of sessions) {
        const disconnectedAt = Math.min(
          Math.max(Number(session.lastSeenAt), Number(session.connectedAt)),
          now,
        )
        await tx.session.update({
          where: { id: session.id },
          data: {
            disconnectedAt: BigInt(disconnectedAt),
            durationSeconds: Math.max(
              0,
              Math.floor(
                (disconnectedAt - Number(session.connectedAt)) / 1_000,
              ),
            ),
            active: false,
          },
        })
      }
      return sessions.length
    })
  }

  async getSummary(
    periodDays: ActivityPeriodDays,
    generatedAt = Date.now(),
    recentLimit = 20,
  ): Promise<ActivitySummary> {
    assertPeriodDays(periodDays)
    const now = assertTimestamp(generatedAt, 'generatedAt')
    if (
      !Number.isInteger(recentLimit) ||
      recentLimit < 1 ||
      recentLimit > 100
    ) {
      throw new RangeError('recentLimit must be an integer from 1 through 100.')
    }

    const rangeStart = startOfUtcDay(now) - (periodDays - 1) * DAY_MS
    const [sessionRows, latencyRows, ipHistory] = await Promise.all([
      this.database.session.findMany({
        where: {
          connectedAt: { lte: BigInt(now) },
          OR: [
            { active: true },
            { disconnectedAt: { gt: BigInt(rangeStart) } },
          ],
        },
        include: { player: true },
        orderBy: [{ connectedAt: 'desc' }, { id: 'desc' }],
      }),
      this.database.playerLatencyDaily.findMany({
        where: {
          dayStart: {
            gte: BigInt(rangeStart),
            lte: BigInt(startOfUtcDay(now)),
          },
        },
      }),
      this.getIpHistory(periodDays, now),
    ])
    const sessions = sessionRows as SessionWithPlayer[]

    const latencyByPlayer = new Map<string, { sum: number; count: number }>()
    for (const row of latencyRows) {
      const current = latencyByPlayer.get(row.userId) ?? { sum: 0, count: 0 }
      current.sum += row.latencySumMs
      current.count += row.sampleCount
      latencyByPlayer.set(row.userId, current)
    }

    const daily: ActivityDailyStat[] = []
    for (
      let dayStart = rangeStart;
      dayStart <= startOfUtcDay(now);
      dayStart += DAY_MS
    ) {
      const dayEnd = dayStart + DAY_MS
      const overlapping = sessions.filter((session) => {
        const connectedAt = Number(session.connectedAt)
        const end = effectiveEnd(session, now)
        return (
          connectedAt < Math.min(dayEnd, now + 1) &&
          (session.active || end > dayStart)
        )
      })
      daily.push({
        date: new Date(dayStart).toISOString().slice(0, 10),
        uniquePlayers: new Set(overlapping.map((session) => session.userId))
          .size,
        sessions: overlapping.length,
        playtimeSeconds: overlapping.reduce(
          (total, session) =>
            total +
            clippedDuration(
              Number(session.connectedAt),
              effectiveEnd(session, now),
              dayStart,
              Math.min(dayEnd, now),
            ),
          0,
        ),
      })
    }

    const topByPlayer = new Map<
      string,
      {
        userId: string
        playerName: string
        sessionCount: number
        totalPlaytimeSeconds: number
        lastConnectedAt: number
        online: boolean
      }
    >()
    let totalPlaytimeSeconds = 0
    for (const session of sessions) {
      const duration = clippedDuration(
        Number(session.connectedAt),
        effectiveEnd(session, now),
        rangeStart,
        now,
      )
      totalPlaytimeSeconds += duration
      const row = topByPlayer.get(session.userId) ?? {
        userId: session.userId,
        playerName: playerName(session.player),
        sessionCount: 0,
        totalPlaytimeSeconds: 0,
        lastConnectedAt: 0,
        online: false,
      }
      row.sessionCount += 1
      row.totalPlaytimeSeconds += duration
      row.lastConnectedAt = Math.max(
        row.lastConnectedAt,
        Number(session.connectedAt),
      )
      row.online ||= session.active
      topByPlayer.set(session.userId, row)
    }

    const topPlayers: ActivityTopPlayer[] = [...topByPlayer.values()]
      .sort(
        (a, b) =>
          b.totalPlaytimeSeconds - a.totalPlaytimeSeconds ||
          b.lastConnectedAt - a.lastConnectedAt ||
          a.playerName.localeCompare(b.playerName, undefined, {
            sensitivity: 'base',
          }),
      )
      .slice(0, 10)
      .map((row) => {
        const latency = latencyByPlayer.get(row.userId)
        return {
          ...row,
          lastConnectedAt: iso(row.lastConnectedAt),
          averageLatencyMs: latency
            ? Math.round(latency.sum / latency.count)
            : null,
          latencySampleCount: latency?.count ?? 0,
        }
      })

    const recentSessions: ActivityRecentSession[] = sessions
      .slice(0, recentLimit)
      .map((session) => ({
        id: String(session.id),
        userId: session.userId,
        playerName: playerName(session.player),
        connectedAt: iso(Number(session.connectedAt)),
        disconnectedAt:
          session.disconnectedAt === null
            ? null
            : iso(Number(session.disconnectedAt)),
        durationSeconds: Math.max(
          0,
          Math.floor(
            (effectiveEnd(session, now) - Number(session.connectedAt)) / 1_000,
          ),
        ),
        online: session.active,
      }))

    return {
      periodDays,
      generatedAt: iso(now),
      totals: {
        trackedPlayers: topByPlayer.size,
        sessions: sessions.length,
        totalPlaytimeSeconds,
        averageSessionSeconds:
          sessions.length === 0
            ? 0
            : Math.round(totalPlaytimeSeconds / sessions.length),
        currentlyOnline: sessions.filter((session) => session.active).length,
      },
      daily,
      topPlayers,
      recentSessions,
      ipHistory,
    }
  }

  async getIpHistory(
    periodDays: ActivityPeriodDays,
    generatedAt = Date.now(),
    limit = 100,
  ): Promise<ActivityIpHistoryEntry[]> {
    assertPeriodDays(periodDays)
    const now = assertTimestamp(generatedAt, 'generatedAt')
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError('limit must be an integer from 1 through 500.')
    }
    const rangeStart = startOfUtcDay(now) - (periodDays - 1) * DAY_MS
    const rows = await this.database.playerIpObservation.findMany({
      where: {
        lastSeenAt: { gte: BigInt(rangeStart) },
        firstSeenAt: { lte: BigInt(now) },
      },
      include: {
        player: {
          include: {
            sessions: { where: { active: true }, select: { id: true } },
          },
        },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { ipAddress: 'asc' }],
      take: limit,
    })

    return rows
      .map((row) => ({
        userId: row.userId,
        playerName: playerName(row.player),
        ipAddress: row.ipAddress,
        firstSeenAt: iso(Number(row.firstSeenAt)),
        lastSeenAt: iso(Number(row.lastSeenAt)),
        observationCount: row.observationCount,
        online:
          row.lastSeenAt === row.player.lastSeenAt &&
          row.player.sessions.length > 0,
      }))
      .sort(
        (a, b) =>
          b.lastSeenAt.localeCompare(a.lastSeenAt) ||
          a.playerName.localeCompare(b.playerName, undefined, {
            sensitivity: 'base',
          }) ||
          a.ipAddress.localeCompare(b.ipAddress),
      )
  }

  async getOnlinePlayerCount(): Promise<number> {
    return this.database.session.count({ where: { active: true } })
  }

  async pruneBefore(cutoffAt: number): Promise<ActivityPruneResult> {
    const cutoff = assertTimestamp(cutoffAt, 'cutoffAt')
    const timestamp = BigInt(cutoff)

    return this.database.$transaction(async (tx) => {
      const overlappingSessions = await tx.session.findMany({
        where: {
          connectedAt: { lt: timestamp },
          OR: [{ active: true }, { disconnectedAt: { gte: timestamp } }],
        },
      })
      for (const session of overlappingSessions) {
        const end = session.disconnectedAt ?? session.lastSeenAt
        await tx.session.update({
          where: { id: session.id },
          data: {
            connectedAt: timestamp,
            durationSeconds: Math.max(
              0,
              Math.floor((Number(end) - cutoff) / 1_000),
            ),
          },
        })
      }

      const deletedSessions = await tx.session.deleteMany({
        where: { active: false, disconnectedAt: { lt: timestamp } },
      })
      const deletedLatencyDays = await tx.playerLatencyDaily.deleteMany({
        where: { dayStart: { lt: timestamp } },
      })
      const deletedIpObservations = await tx.playerIpObservation.deleteMany({
        where: { lastSeenAt: { lt: timestamp } },
      })

      const retainedIpObservations = await tx.playerIpObservation.findMany({
        where: { firstSeenAt: { lt: timestamp } },
      })
      for (const observation of retainedIpObservations) {
        await tx.playerIpObservation.update({
          where: {
            userId_ipAddress: {
              userId: observation.userId,
              ipAddress: observation.ipAddress,
            },
          },
          data: { firstSeenAt: timestamp, observationCount: 1 },
        })
      }

      await tx.player.updateMany({
        where: {
          firstSeenAt: { lt: timestamp },
          lastSeenAt: { gte: timestamp },
        },
        data: { firstSeenAt: timestamp },
      })
      const deletedPlayers = await tx.player.deleteMany({
        where: {
          lastSeenAt: { lt: timestamp },
          sessions: { none: {} },
          ipObservations: { none: {} },
          latencyDaily: { none: {} },
        },
      })

      return {
        cutoff: iso(cutoff),
        deletedSessions: deletedSessions.count,
        deletedIpObservations: deletedIpObservations.count,
        deletedLatencyDays: deletedLatencyDays.count,
        deletedPlayers: deletedPlayers.count,
      }
    })
  }

  async exportData(exportedAt = Date.now()): Promise<ActivityExport> {
    const now = assertTimestamp(exportedAt, 'exportedAt')
    const [players, sessions, ipRows, latencyDaily] = await Promise.all([
      this.database.player.findMany({ orderBy: { userId: 'asc' } }),
      this.database.session.findMany({
        orderBy: [{ connectedAt: 'asc' }, { id: 'asc' }],
      }),
      this.database.playerIpObservation.findMany({
        include: {
          player: {
            include: {
              sessions: { where: { active: true }, select: { id: true } },
            },
          },
        },
        orderBy: [{ lastSeenAt: 'asc' }, { ipAddress: 'asc' }],
      }),
      this.database.playerLatencyDaily.findMany({
        orderBy: [{ dayStart: 'asc' }, { userId: 'asc' }],
      }),
    ])
    return {
      schemaVersion: 1,
      exportedAt: iso(now),
      players: players.map((player) => ({
        userId: player.userId,
        playerId: player.playerId,
        name: player.name,
        accountName: player.accountName,
        lastLevel: player.lastLevel,
        firstSeenAt: iso(Number(player.firstSeenAt)),
        lastSeenAt: iso(Number(player.lastSeenAt)),
      })),
      sessions: sessions.map((session) => ({
        id: String(session.id),
        userId: session.userId,
        connectedAt: iso(Number(session.connectedAt)),
        lastSeenAt: iso(Number(session.lastSeenAt)),
        disconnectedAt:
          session.disconnectedAt === null
            ? null
            : iso(Number(session.disconnectedAt)),
        durationSeconds: session.durationSeconds,
        active: session.active,
      })),
      ipObservations: ipRows.map((row) => ({
        userId: row.userId,
        playerName: playerName(row.player),
        ipAddress: row.ipAddress,
        firstSeenAt: iso(Number(row.firstSeenAt)),
        lastSeenAt: iso(Number(row.lastSeenAt)),
        observationCount: row.observationCount,
        online:
          row.lastSeenAt === row.player.lastSeenAt &&
          row.player.sessions.length > 0,
      })),
      latencyDaily: latencyDaily.map((row) => ({
        userId: row.userId,
        dayStart: iso(Number(row.dayStart)),
        latencySumMs: row.latencySumMs,
        sampleCount: row.sampleCount,
      })),
    }
  }

  async deleteAllActivity(): Promise<void> {
    await this.database.$transaction(async (tx) => {
      await tx.playerLatencyDaily.deleteMany()
      await tx.playerIpObservation.deleteMany()
      await tx.session.deleteMany()
      await tx.player.deleteMany()
    })
  }
}
