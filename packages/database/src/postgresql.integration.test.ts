import { afterAll, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from './client.js'
import { ActivityRepository } from './repository.js'

const databaseUrl = process.env.TEST_POSTGRES_URL
let database: Database | undefined

afterAll(async () => {
  await database?.disconnect()
})

describe.skipIf(!databaseUrl)('PostgreSQL integration', () => {
  it('initializes and reconciles activity using the PostgreSQL adapter', async () => {
    database = createDatabase(databaseUrl!)
    await database.initialize()
    const repository = new ActivityRepository(database.client, {
      closeAbandonedOnOpen: false,
    })
    await repository.deleteAllActivity()

    const now = Date.parse('2026-07-14T12:00:00.000Z')
    await repository.reconcilePlayers(
      [{ userId: 'postgres-player', name: 'Postgres Player', ping: 42 }],
      now,
    )
    const summary = await repository.getSummary(7, now + 1_000)

    expect(database.provider).toBe('postgresql')
    expect(summary.totals).toMatchObject({
      trackedPlayers: 1,
      sessions: 1,
      currentlyOnline: 1,
    })
    expect(summary.topPlayers[0]).toMatchObject({
      userId: 'postgres-player',
      averageLatencyMs: 42,
    })

    await repository.deleteAllActivity()
  })
})
