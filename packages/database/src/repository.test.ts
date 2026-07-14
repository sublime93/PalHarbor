import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from './client.js'
import { ActivityRepository } from './repository.js'

const databases: Database[] = []
const directories: string[] = []

async function testRepository(options: ConstructorParameters<typeof ActivityRepository>[1] = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'palharbor-prisma-'))
  directories.push(directory)
  const database = createDatabase(pathToFileURL(join(directory, 'activity.sqlite')).href)
  databases.push(database)
  await database.initialize()
  return {
    database,
    repository: new ActivityRepository(database.client, {
      closeAbandonedOnOpen: false,
      ...options,
    }),
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.disconnect()))
  await Promise.all(directories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('ActivityRepository', () => {
  it('initializes idempotently and reconciles player sessions through Prisma', async () => {
    const { database, repository } = await testRepository()
    await database.initialize()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    await expect(repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', level: 22 },
      { userId: 'bob-id', name: 'Bob', level: 8 },
    ], startedAt)).resolves.toMatchObject({ startedSessions: 2, updatedSessions: 0 })
    await expect(repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice Updated', level: 23 },
    ], startedAt + 20_000)).resolves.toMatchObject({ endedSessions: 1, updatedSessions: 1 })
    await repository.reconcilePlayers([], startedAt + 30_000)

    const players = await database.client.player.findMany({ orderBy: { userId: 'asc' } })
    expect(players.map(({ userId, name, firstSeenAt, lastSeenAt }) => ({
      userId,
      name,
      firstSeenAt: Number(firstSeenAt),
      lastSeenAt: Number(lastSeenAt),
    }))).toEqual([
      { userId: 'alice-id', name: 'Alice Updated', firstSeenAt: startedAt, lastSeenAt: startedAt + 20_000 },
      { userId: 'bob-id', name: 'Bob', firstSeenAt: startedAt, lastSeenAt: startedAt },
    ])
    expect(await database.client.session.count()).toBe(2)
    expect(await repository.getOnlinePlayerCount()).toBe(0)
  })

  it('returns the JSON-safe dashboard contract with weighted latency', async () => {
    const { repository } = await testRepository()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    await repository.reconcilePlayers([
      { userId: 'alice-id', name: 'Alice', ping: 40 },
      { userId: 'bob-id', accountName: 'Bobby' },
    ], startedAt)
    await repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 60 }], startedAt + 20_000)
    await repository.reconcilePlayers([], startedAt + 30_000)
    await repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 80 }], startedAt + 40_000)
    await repository.reconcilePlayers([{ userId: 'alice-id', name: 'Alice', ping: 100 }], startedAt + 50_000)

    const summary = await repository.getSummary(14, startedAt + 55_000)
    expect(summary.totals).toEqual({
      trackedPlayers: 2,
      sessions: 3,
      totalPlaytimeSeconds: 60,
      averageSessionSeconds: 20,
      currentlyOnline: 1,
    })
    expect(summary.daily.at(-1)).toEqual({
      date: '2026-01-10', uniquePlayers: 2, sessions: 3, playtimeSeconds: 60,
    })
    expect(summary.topPlayers[0]).toMatchObject({
      userId: 'alice-id', averageLatencyMs: 70, latencySampleCount: 4, online: true,
    })
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary)
  })

  it('normalizes and aggregates IP observations without retaining ports', async () => {
    const { repository } = await testRepository()
    const startedAt = Date.parse('2026-01-10T12:00:00.000Z')

    await repository.reconcilePlayers([{
      userId: 'alice-id', name: 'Alice', ip: '203.0.113.9:8211',
    }], startedAt)
    await repository.reconcilePlayers([{
      userId: 'alice-id', name: 'Alice Updated', ip: '203.0.113.9',
    }], startedAt + 10_000)
    await repository.reconcilePlayers([{
      userId: 'alice-id', name: 'Alice Updated', ip: '[2001:0DB8:0:0::7]:8211',
    }], startedAt + 20_000)

    expect(await repository.getIpHistory(7, startedAt + 30_000)).toEqual([
      expect.objectContaining({
        ipAddress: '2001:db8::7', observationCount: 1, online: true,
      }),
      expect.objectContaining({
        ipAddress: '203.0.113.9', observationCount: 2, online: false,
      }),
    ])
  })

  it('splits sessions across UTC days and closes abandoned sessions at last sighting', async () => {
    const { database, repository } = await testRepository()
    const connectedAt = Date.parse('2026-01-09T23:59:50.000Z')
    await repository.reconcilePlayers([{ userId: 'night-id', name: 'Night Owl' }], connectedAt)
    await repository.reconcilePlayers([{ userId: 'night-id', name: 'Night Owl' }], connectedAt + 20_000)

    const reopened = new ActivityRepository(database.client, { now: () => connectedAt + 100_000 })
    await reopened.initialize()
    const summary = await reopened.getSummary(7, connectedAt + 100_000)
    expect(summary.daily.slice(-2)).toEqual([
      { date: '2026-01-09', uniquePlayers: 1, sessions: 1, playtimeSeconds: 10 },
      { date: '2026-01-10', uniquePlayers: 1, sessions: 1, playtimeSeconds: 10 },
    ])
    expect(await reopened.getOnlinePlayerCount()).toBe(0)
  })

  it('validates inputs before changing state', async () => {
    const { repository } = await testRepository()
    await expect(repository.reconcilePlayers([{ userId: '' }])).rejects.toThrow(/userId/)
    await expect(repository.getSummary(1 as 7)).rejects.toThrow(/periodDays/)
    await expect(repository.getSummary(7, Date.now(), 0)).rejects.toThrow(/recentLimit/)
    await expect(repository.getIpHistory(7, Date.now(), 501)).rejects.toThrow(/limit/)
    expect(() => createDatabase('mysql://localhost/palharbor')).toThrow(/DATABASE_URL/)
  })
})
