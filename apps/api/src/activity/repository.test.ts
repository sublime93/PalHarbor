import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateActivityDatabase, openActivityDatabase } from './database.js'
import { ActivityRepository } from './repository.js'

const openDatabases: DatabaseSync[] = []
const temporaryDirectories: string[] = []

function memoryRepository() {
  const database = openActivityDatabase(':memory:')
  openDatabases.push(database)
  return { database, repository: new ActivityRepository(database, { closeAbandonedOnOpen: false }) }
}

afterEach(async () => {
  while (openDatabases.length) openDatabases.pop()?.close()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('ActivityRepository', () => {
  it('upgrades an existing version-one activity database in place', () => {
    const database = new DatabaseSync(':memory:')
    openDatabases.push(database)
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE activity_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      ) STRICT;
      INSERT INTO activity_migrations VALUES (1, 'players and connection sessions', 0);
      CREATE TABLE players (user_id TEXT PRIMARY KEY) STRICT;
    `)

    migrateActivityDatabase(database)

    expect(database.prepare(
      'SELECT version FROM activity_migrations ORDER BY version',
    ).all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }])
    database.prepare('INSERT INTO players (user_id) VALUES (?)').run('alice-id')
    database.prepare(`
      INSERT INTO player_ip_observations (
        user_id, ip_address, first_seen_at, last_seen_at, observation_count
      ) VALUES (?, ?, ?, ?, ?)
    `).run('alice-id', '203.0.113.9', 1_000, 2_000, 2)
    expect(database.prepare(
      'SELECT observation_count FROM player_ip_observations',
    ).get()).toEqual({ observation_count: 2 })
    database.prepare(`
      INSERT INTO player_latency_daily (
        user_id, day_start, latency_sum_ms, sample_count
      ) VALUES (?, ?, ?, ?)
    `).run('alice-id', 0, 42.5, 2)
    expect(database.prepare(
      'SELECT latency_sum_ms, sample_count FROM player_latency_daily',
    ).get()).toEqual({ latency_sum_ms: 42.5, sample_count: 2 })
  })

  it('migrates idempotently and reconciles snapshots into connection sessions', () => {
    const { database, repository } = memoryRepository()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    migrateActivityDatabase(database)
    expect(database.prepare(
      'SELECT version, name FROM activity_migrations ORDER BY version',
    ).all()).toEqual([
      { version: 1, name: 'players and connection sessions' },
      { version: 2, name: 'historical player IP observations' },
      { version: 3, name: 'daily player latency rollups' },
    ])
    expect(repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', accountName: 'alice', level: 22 },
      { userId: 'bob-id', name: 'Bob', level: 8 },
    ], startedAt)).toMatchObject({
      connectedPlayers: 2,
      startedSessions: 2,
      updatedSessions: 0,
      endedSessions: 0,
    })

    expect(repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice Updated', level: 23 },
      { userId: 'bob-id', name: 'Bob', level: 8 },
    ], startedAt + 10_000)).toMatchObject({ startedSessions: 0, updatedSessions: 2 })

    expect(repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice Updated', level: 23 },
    ], startedAt + 20_000)).toMatchObject({ endedSessions: 1, updatedSessions: 1 })
    expect(repository.reconcilePlayers([], startedAt + 30_000)).toMatchObject({ endedSessions: 1 })

    const players = database.prepare(`
      SELECT user_id, name, first_seen_at, last_seen_at FROM players ORDER BY user_id
    `).all()
    expect(players).toEqual([
      {
        user_id: 'alice-id',
        name: 'Alice Updated',
        first_seen_at: startedAt,
        last_seen_at: startedAt + 20_000,
      },
      {
        user_id: 'bob-id',
        name: 'Bob',
        first_seen_at: startedAt,
        last_seen_at: startedAt + 10_000,
      },
    ])

    const sessions = database.prepare(`
      SELECT user_id, connected_at, last_seen_at, disconnected_at, duration_seconds, active
      FROM sessions ORDER BY user_id
    `).all()
    expect(sessions).toEqual([
      {
        user_id: 'alice-id',
        connected_at: startedAt,
        last_seen_at: startedAt + 20_000,
        disconnected_at: startedAt + 30_000,
        duration_seconds: 30,
        active: 0,
      },
      {
        user_id: 'bob-id',
        connected_at: startedAt,
        last_seen_at: startedAt + 10_000,
        disconnected_at: startedAt + 20_000,
        duration_seconds: 20,
        active: 0,
      },
    ])
  })

  it('rolls finite non-negative latency samples into UTC days and ignores invalid values', () => {
    const { database, repository } = memoryRepository()
    const firstDay = Date.parse('2026-01-10T23:59:50.000Z')
    const secondDay = Date.parse('2026-01-11T00:00:10.000Z')

    repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', ping: 0 },
      { userId: 'bob-id', name: 'Bob', ping: -1 },
    ], firstDay)
    repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', ping: Number.NaN },
      { userId: 'bob-id', name: 'Bob', ping: Number.POSITIVE_INFINITY },
    ], firstDay + 5_000)
    repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', ping: 12.5 },
      { userId: 'bob-id', name: 'Bob', ping: null },
    ], secondDay)

    expect(database.prepare(`
      SELECT user_id, day_start, latency_sum_ms, sample_count
      FROM player_latency_daily
      ORDER BY day_start
    `).all()).toEqual([
      {
        user_id: 'alice-id',
        day_start: Date.parse('2026-01-10T00:00:00.000Z'),
        latency_sum_ms: 0,
        sample_count: 1,
      },
      {
        user_id: 'alice-id',
        day_start: Date.parse('2026-01-11T00:00:00.000Z'),
        latency_sum_ms: 12.5,
        sample_count: 1,
      },
    ])
    expect(repository.getOnlinePlayerCount()).toBe(2)
  })

  it('returns the JSON-safe dashboard contract and includes active reconnects', () => {
    const { repository } = memoryRepository()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', ping: 40 },
      { userId: 'bob-id', accountName: 'Bobby' },
    ], startedAt)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 60 }], startedAt + 20_000)
    repository.reconcilePlayers([], startedAt + 30_000)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 80 }], startedAt + 40_000)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 100 }], startedAt + 50_000)

    const summary = repository.getSummary(14, startedAt + 55_000)
    expect(summary.periodDays).toBe(14)
    expect(summary.generatedAt).toBe('2026-01-10T12:00:55.000Z')
    expect(summary.totals).toEqual({
      trackedPlayers: 2,
      sessions: 3,
      totalPlaytimeSeconds: 60,
      averageSessionSeconds: 20,
      currentlyOnline: 1,
    })
    expect(summary.daily).toHaveLength(14)
    expect(summary.daily.at(-1)).toEqual({
      date: '2026-01-10',
      uniquePlayers: 2,
      sessions: 3,
      playtimeSeconds: 60,
    })
    expect(summary.topPlayers).toEqual([
      {
        userId: 'alice-id',
        playerName: 'Alice',
        sessionCount: 2,
        totalPlaytimeSeconds: 40,
        lastConnectedAt: '2026-01-10T12:00:40.000Z',
        online: true,
        averageLatencyMs: 70,
        latencySampleCount: 4,
      },
      {
        userId: 'bob-id',
        playerName: 'Bobby',
        sessionCount: 1,
        totalPlaytimeSeconds: 20,
        lastConnectedAt: '2026-01-10T12:00:00.000Z',
        online: false,
        averageLatencyMs: null,
        latencySampleCount: 0,
      },
    ])
    expect(summary.recentSessions[0]).toEqual({
      id: expect.any(String),
      userId: 'alice-id',
      playerName: 'Alice',
      connectedAt: '2026-01-10T12:00:40.000Z',
      disconnectedAt: null,
      durationSeconds: 10,
      online: true,
    })
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary)
  })

  it('returns a sample-weighted player latency average scoped to the reporting period', () => {
    const { repository } = memoryRepository()
    const beforeRange = Date.parse('2026-01-03T12:00:00.000Z')
    const rangeStart = Date.parse('2026-01-04T12:00:00.000Z')
    const nextDay = Date.parse('2026-01-05T12:00:00.000Z')
    const generatedAt = Date.parse('2026-01-10T12:00:00.000Z')

    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 100 }], beforeRange)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 10 }], rangeStart)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 20 }], rangeStart + 10_000)
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 90 }], nextDay)
    repository.reconcilePlayers([], nextDay + 10_000)

    expect(repository.getSummary(7, generatedAt).topPlayers[0]).toMatchObject({
      userId: 'alice-id',
      averageLatencyMs: 40,
      latencySampleCount: 3,
    })
  })

  it('durably aggregates normalized IP observations and exposes period-scoped history', () => {
    const { database, repository } = memoryRepository()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    repository.reconcilePlayers([{
      userId: 'alice-id',
      name: 'Alice',
      ip: '203.0.113.9:8211',
    }], startedAt)
    repository.reconcilePlayers([{
      userId: 'alice-id',
      name: 'Alice',
      ip: '203.0.113.9',
    }], startedAt + 10_000)
    repository.reconcilePlayers([{
      userId: 'alice-id',
      name: 'Alice Updated',
      ip: '[2001:0DB8:0:0::7]:8211',
    }, {
      userId: 'bob-id',
      name: 'Bob',
      ip: 'fe80::1%en0',
    }], startedAt + 20_000)
    repository.reconcilePlayers([{
      userId: 'alice-id',
      name: 'Alice Updated',
      ip: '2001:db8::7',
    }, {
      userId: 'bob-id',
      name: 'Bob',
      ip: null,
    }], startedAt + 30_000)

    expect(database.prepare(`
      SELECT user_id, ip_address, first_seen_at, last_seen_at, observation_count
      FROM player_ip_observations ORDER BY first_seen_at
    `).all()).toEqual([
      {
        user_id: 'alice-id',
        ip_address: '203.0.113.9',
        first_seen_at: startedAt,
        last_seen_at: startedAt + 10_000,
        observation_count: 2,
      },
      {
        user_id: 'alice-id',
        ip_address: '2001:db8::7',
        first_seen_at: startedAt + 20_000,
        last_seen_at: startedAt + 30_000,
        observation_count: 2,
      },
    ])

    const expectedHistory = [
      {
        userId: 'alice-id',
        playerName: 'Alice Updated',
        ipAddress: '2001:db8::7',
        firstSeenAt: '2026-01-10T12:00:20.000Z',
        lastSeenAt: '2026-01-10T12:00:30.000Z',
        observationCount: 2,
        online: true,
      },
      {
        userId: 'alice-id',
        playerName: 'Alice Updated',
        ipAddress: '203.0.113.9',
        firstSeenAt: '2026-01-10T12:00:00.000Z',
        lastSeenAt: '2026-01-10T12:00:10.000Z',
        observationCount: 2,
        online: false,
      },
    ]
    expect(repository.getIpHistory(7, startedAt + 40_000)).toEqual(expectedHistory)
    expect(repository.getSummary(7, startedAt + 40_000).ipHistory).toEqual(expectedHistory)
  })

  it('splits a session across UTC calendar days without boundary double-counting', () => {
    const { repository } = memoryRepository()
    const connectedAt = Date.parse('2026-01-09T23:59:50.000Z')
    const disconnectedAt = Date.parse('2026-01-10T00:00:10.000Z')

    repository.reconcilePlayers([{ userId: 'night-id', name: 'Night Owl' }], connectedAt)
    repository.reconcilePlayers([], disconnectedAt)

    const summary = repository.getSummary(7, disconnectedAt)
    expect(summary.daily.slice(-2)).toEqual([
      { date: '2026-01-09', uniquePlayers: 1, sessions: 1, playtimeSeconds: 10 },
      { date: '2026-01-10', uniquePlayers: 1, sessions: 1, playtimeSeconds: 10 },
    ])
    expect(summary.totals.totalPlaytimeSeconds).toBe(20)

    const boundaryOnly = repository.getSummary(7, Date.parse('2026-01-17T00:00:00.000Z'))
    expect(boundaryOnly.totals).toMatchObject({ trackedPlayers: 0, sessions: 0 })
  })

  it('rejects a malformed snapshot before changing any connection state', () => {
    const { repository } = memoryRepository()
    const now = Date.parse('2026-01-10T12:00:00.000Z')
    repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice' }], now)

    expect(() => repository.reconcilePlayers([
      { userId: '', name: 'Malformed' },
    ], now + 10_000)).toThrow(/userId/)
    expect(repository.getOnlinePlayerCount()).toBe(1)
  })

  it('closes sessions abandoned by a previous process at their last confirmed sighting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'paldeck-activity-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'activity.sqlite')
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    const firstDatabase = openActivityDatabase(path)
    const firstRepository = new ActivityRepository(firstDatabase, { closeAbandonedOnOpen: false })
    firstRepository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice' }], startedAt)
    firstRepository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice' }], startedAt + 12_000)
    firstDatabase.close()

    const secondDatabase = openActivityDatabase(path)
    openDatabases.push(secondDatabase)
    const secondRepository = new ActivityRepository(secondDatabase, {
      now: () => startedAt + 100_000,
    })

    expect(secondRepository.getOnlinePlayerCount()).toBe(0)
    expect(secondDatabase.prepare(`
      SELECT disconnected_at, duration_seconds, active FROM sessions
    `).get()).toEqual({
      disconnected_at: startedAt + 12_000,
      duration_seconds: 12,
      active: 0,
    })

    secondRepository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice' }], startedAt + 101_000)
    expect(secondDatabase.prepare('SELECT COUNT(*) AS count FROM sessions').get()).toEqual({ count: 2 })
  })

  it('validates supported periods and recent-session limits', () => {
    const { repository } = memoryRepository()
    expect(() => repository.getSummary(1 as 7)).toThrow(/periodDays/)
    expect(() => repository.getSummary(7, Date.now(), 0)).toThrow(/recentLimit/)
    expect(() => repository.getIpHistory(7, Date.now(), 501)).toThrow(/limit/)
  })
})
