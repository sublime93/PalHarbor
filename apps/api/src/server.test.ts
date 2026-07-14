import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { ActivityRepository, createDatabase } from '@paldeck/database'
import { playerSnapshots } from './app.js'
import { createApp, type GatewayConfig } from './server.js'

const config: GatewayConfig = {
  apiUrl: 'http://palworld.test:8212/v1/api',
  username: 'admin',
  password: 'secret',
}

function testApp(fetchImpl: typeof fetch, gatewayConfig: GatewayConfig = config) {
  return createApp(gatewayConfig, fetchImpl, { logger: false, webDist: false, activity: false })
}

describe('Palworld gateway', () => {
  it('keeps finite non-negative player ping values for activity tracking', () => {
    const pings = playerSnapshots({
      players: [
        { userId: 'zero', ping: 0 },
        { userId: 'valid', ping: 18.5 },
        { userId: 'negative', ping: -1 },
        { userId: 'nan', ping: Number.NaN },
        { userId: 'infinite', ping: Number.POSITIVE_INFINITY },
        { userId: 'missing' },
      ],
    }).map((player) => player.ping)

    expect(pings).toEqual([0, 18.5, null, null, null, null])
  })

  it('reports configuration state without caching the response', async () => {
    const app = testApp(vi.fn<typeof fetch>())
    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ configured: true })
    expect(response.headers['cache-control']).toBe('no-store')
    await app.close()
  })

  it('allows each documented read endpoint and applies Basic auth', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const payload = String(input).endsWith('/game-data')
        ? { Time: '2026-07-13 12:33:00', FPS: 60, AverageFPS: 59.8, ActorData: [] }
        : { serverfps: 60 }
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      })
    })
    const app = testApp(fetchMock as typeof fetch)

    for (const endpoint of ['info', 'players', 'settings', 'metrics', 'game-data']) {
      const response = await app.inject({ method: 'GET', url: `/api/palworld/${endpoint}` })
      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
    }

    const [, init] = fetchMock.mock.calls[0]
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
    })
    await app.close()
  })

  it('allows every documented action and forwards JSON bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    const app = testApp(fetchMock as typeof fetch)
    const actions: Array<[string, Record<string, unknown> | undefined]> = [
      ['announce', { message: 'Hello' }],
      ['kick', { userid: 'steam_1', message: 'Bye' }],
      ['ban', { userid: 'steam_1', message: 'Banned' }],
      ['unban', { userid: 'steam_1' }],
      ['save', undefined],
      ['shutdown', { waittime: 30, message: 'Restarting' }],
      ['stop', undefined],
    ]

    for (const [endpoint, body] of actions) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/palworld/${endpoint}`,
        headers: { 'x-paldeck-request': '1' },
        ...(body ? { payload: body } : {}),
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    }

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ message: 'Hello' })
    await app.close()
  })

  it('requires the same-origin request marker for mutations', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const app = testApp(fetchMock as typeof fetch)
    const response = await app.inject({
      method: 'POST',
      url: '/api/palworld/save',
    })

    expect(response.statusCode).toBe(403)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('parses Palworld JSON even when the server labels it as text/plain', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"RESTAPIEnabled":true,"RESTAPIPort":8212}', {
      headers: { 'content-type': 'text/plain;charset=utf-8' },
    }))
    const app = testApp(fetchMock as typeof fetch)

    const response = await app.inject({ method: 'GET', url: '/api/palworld/settings' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ RESTAPIEnabled: true, RESTAPIPort: 8212 })
    await app.close()
  })

  it('rejects unknown endpoints and wrong methods before reaching upstream', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const app = testApp(fetchMock as typeof fetch)

    const unknown = await app.inject({ method: 'GET', url: '/api/palworld/secrets' })
    const wrongMethod = await app.inject({ method: 'POST', url: '/api/palworld/metrics' })

    expect(unknown.statusCode).toBe(404)
    expect(wrongMethod.statusCode).toBe(405)
    expect(wrongMethod.headers.allow).toBe('GET')
    expect(fetchMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('returns a useful error without leaking connection details', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => { throw new Error('connect refused') })
    const app = testApp(fetchMock as typeof fetch)
    const response = await app.inject({ method: 'GET', url: '/api/palworld/info' })
    const serialized = response.body

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toContain('could not be reached')
    expect(serialized).not.toContain(config.apiUrl)
    expect(serialized).not.toContain(config.username)
    expect(serialized).not.toContain(config.password)
    await app.close()
  })

  it('serves SPA deep links without swallowing API or non-GET 404s', async () => {
    const webDist = await mkdtemp(join(tmpdir(), 'paldeck-web-'))
    await writeFile(join(webDist, 'index.html'), '<!doctype html><title>Paldeck</title>')
    const app = createApp(config, vi.fn<typeof fetch>(), { logger: false, webDist, activity: false })

    try {
      const deepLink = await app.inject({ method: 'GET', url: '/players' })
      const missingApi = await app.inject({ method: 'GET', url: '/api/missing' })
      const nonGet = await app.inject({ method: 'POST', url: '/players' })

      expect(deepLink.statusCode).toBe(200)
      expect(deepLink.body).toContain('<title>Paldeck</title>')
      expect(missingApi.statusCode).toBe(404)
      expect(missingApi.headers['content-type']).toContain('application/json')
      expect(nonGet.statusCode).toBe(404)
      expect(nonGet.headers['content-type']).toContain('application/json')
    } finally {
      await app.close()
      await rm(webDist, { recursive: true, force: true })
    }
  })

  it('serves durable activity summaries with historical player IP observations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'paldeck-activity-route-'))
    const databasePath = join(directory, 'activity.sqlite')
    const app = createApp(config, vi.fn<typeof fetch>(), {
      logger: false,
      webDist: false,
      activity: { databasePath, pollIntervalMs: 15_000 },
    })
    await app.ready()

    const seedDatabase = createDatabase(pathToFileURL(databasePath).href)
    await seedDatabase.initialize()
    const repository = new ActivityRepository(seedDatabase.client, { closeAbandonedOnOpen: false })
    const connectedAt = Date.now() - 60_000
    await repository.reconcilePlayers([{
      userId: 'steam_123',
      playerId: 'player-123',
      name: 'Lamball Tamer',
      accountName: 'tamer',
      ip: '203.0.113.17:8211',
      level: 42,
      ping: 73,
    }], connectedAt)
    await seedDatabase.disconnect()

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/activity/summary?days=7',
      })
      const body = response.json()

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(body).toMatchObject({
        periodDays: 7,
        totals: { trackedPlayers: 1, sessions: 1, currentlyOnline: 1 },
        topPlayers: [{
          userId: 'steam_123',
          playerName: 'Lamball Tamer',
          online: true,
          averageLatencyMs: 73,
          latencySampleCount: 1,
        }],
        ipHistory: [{
          userId: 'steam_123',
          playerName: 'Lamball Tamer',
          ipAddress: '203.0.113.17',
          observationCount: 1,
          online: true,
        }],
        collector: { status: 'starting', running: false, pollIntervalSeconds: 15 },
      })

      const invalid = await app.inject({
        method: 'GET',
        url: '/api/activity/summary?days=365',
      })
      expect(invalid.statusCode).toBe(400)
    } finally {
      await app.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
