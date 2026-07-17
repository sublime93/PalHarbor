import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { ActivityRepository, createDatabase } from '@app/database'
import { playerSnapshots } from './app.js'
import {
  assertSafeServerExposure,
  type AccessConfig,
  type ServerConfig,
} from './core/config.js'
import { createApp, type GatewayConfig } from './server.js'

const config: GatewayConfig = {
  apiUrl: 'http://palworld.test:8212/v1/api',
  username: 'admin',
  password: 'secret',
}
const noAccess: AccessConfig = {
  username: '',
  password: '',
  allowedHosts: [],
  allowedOrigins: [],
}

function testApp(
  fetchImpl: typeof fetch,
  gatewayConfig: GatewayConfig = config,
) {
  return createApp(gatewayConfig, fetchImpl, {
    logger: false,
    webDist: false,
    activity: false,
    access: noAccess,
  })
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
    expect(response.headers['x-frame-options']).toBe('DENY')
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    )
    await app.close()
  })

  it('enforces dashboard authentication, Host validation, and same-origin mutations', async () => {
    const access: AccessConfig = {
      username: 'operator',
      password: 'dashboard-secret',
      allowedHosts: [],
      allowedOrigins: [],
    }
    const app = createApp(config, vi.fn<typeof fetch>(), {
      logger: false,
      webDist: false,
      activity: false,
      access,
    })
    const unauthorized = await app.inject({ method: 'GET', url: '/api/health' })
    const authorization = `Basic ${Buffer.from('operator:dashboard-secret').toString('base64')}`
    const authorized = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { authorization },
    })
    const invalidHost = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { authorization, host: 'attacker.example' },
    })
    const crossOrigin = await app.inject({
      method: 'POST',
      url: '/api/palworld/save',
      headers: {
        authorization,
        host: '127.0.0.1:4174',
        origin: 'https://attacker.example',
        'x-palharbor-request': '1',
      },
    })

    expect(unauthorized.statusCode).toBe(401)
    expect(unauthorized.headers['www-authenticate']).toContain('Basic')
    expect(authorized.statusCode).toBe(200)
    expect(invalidHost.statusCode).toBe(421)
    expect(crossOrigin.statusCode).toBe(403)
    await app.close()
  })

  it('refuses an unauthenticated non-loopback listener unless explicitly acknowledged', () => {
    const remote: ServerConfig = {
      host: '0.0.0.0',
      port: 4174,
      allowUnauthenticatedRemote: false,
    }
    expect(() => assertSafeServerExposure(remote, noAccess)).toThrow(
      /Refusing to bind/,
    )
    expect(() =>
      assertSafeServerExposure(
        { ...remote, allowUnauthenticatedRemote: true },
        noAccess,
      ),
    ).not.toThrow()
    expect(() =>
      assertSafeServerExposure(remote, {
        ...noAccess,
        username: 'operator',
        password: 'secret',
      }),
    ).not.toThrow()
  })

  it('allows each documented read endpoint and applies Basic auth', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const payload = String(input).endsWith('/game-data')
        ? {
            Time: '2026-07-13 12:33:00',
            FPS: 60,
            AverageFPS: 59.8,
            ActorData: [],
          }
        : { serverfps: 60 }
      return new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json' },
      })
    })
    const app = testApp(fetchMock as typeof fetch)

    for (const endpoint of [
      'info',
      'players',
      'settings',
      'metrics',
      'game-data',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/palworld/${endpoint}`,
      })
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
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    )
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
        headers: { 'x-palharbor-request': '1' },
        ...(body ? { payload: body } : {}),
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    }

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      message: 'Hello',
    })
    await app.close()
  })

  it('validates every mutation body before contacting Palworld', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const app = testApp(fetchMock as typeof fetch)
    const invalidBodies: Array<[string, unknown]> = [
      ['announce', { message: '' }],
      ['kick', { userid: '', unexpected: true }],
      ['ban', { userid: 'x', message: 'x'.repeat(501) }],
      ['unban', { userid: 123 }],
      ['save', { unexpected: true }],
      ['shutdown', { waittime: 3_601 }],
      ['stop', { unexpected: true }],
    ]
    for (const [endpoint, payload] of invalidBodies) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/palworld/${endpoint}`,
        headers: { 'x-palharbor-request': '1' },
        payload,
      })
      expect(response.statusCode, endpoint).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
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
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response('{"RESTAPIEnabled":true,"RESTAPIPort":8212}', {
          headers: { 'content-type': 'text/plain;charset=utf-8' },
        }),
    )
    const app = testApp(fetchMock as typeof fetch)

    const response = await app.inject({
      method: 'GET',
      url: '/api/palworld/settings',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ RESTAPIEnabled: true, RESTAPIPort: 8212 })
    await app.close()
  })

  it('rejects unknown endpoints and wrong methods before reaching upstream', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const app = testApp(fetchMock as typeof fetch)

    const unknown = await app.inject({
      method: 'GET',
      url: '/api/palworld/secrets',
    })
    const wrongMethod = await app.inject({
      method: 'POST',
      url: '/api/palworld/metrics',
    })

    expect(unknown.statusCode).toBe(404)
    expect(wrongMethod.statusCode).toBe(405)
    expect(wrongMethod.headers.allow).toBe('GET')
    expect(fetchMock).not.toHaveBeenCalled()
    await app.close()
  })

  it('returns a useful error without leaking connection details', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new Error('connect refused')
    })
    const app = testApp(fetchMock as typeof fetch)
    const response = await app.inject({
      method: 'GET',
      url: '/api/palworld/info',
    })
    const serialized = response.body

    expect(response.statusCode).toBe(502)
    expect(response.json().error).toContain('RESTAPIEnabled=True')
    expect(response.json().error).toContain('RESTAPIPort')
    expect(response.json().error).toContain('restart Palworld')
    expect(serialized).not.toContain(config.apiUrl)
    expect(serialized).not.toContain(config.username)
    expect(serialized).not.toContain(config.password)
    await app.close()
  })

  it('explains how to finish an incomplete PalHarbor connection setup', async () => {
    const app = testApp(vi.fn<typeof fetch>(), {
      apiUrl: '',
      username: '',
      password: '',
    })
    const response = await app.inject({
      method: 'GET',
      url: '/api/palworld/info',
    })

    expect(response.statusCode).toBe(503)
    expect(response.json().error).toContain('PALWORLD_API_URL')
    expect(response.json().error).toContain('PALWORLD_USERNAME')
    expect(response.json().error).toContain('PALWORLD_PASSWORD')
    expect(response.json().error).toContain('restart PalHarbor')
    await app.close()
  })

  it('gives endpoint-specific guidance when GameData is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('Not Found', { status: 404 }),
    )
    const app = testApp(fetchMock as typeof fetch)
    const response = await app.inject({
      method: 'GET',
      url: '/api/palworld/game-data',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().error).toContain('GameData API is not available')
    expect(response.json().error).toContain('/v1/api/game-data')
    expect(response.json().error).toContain('restart Palworld')
    await app.close()
  })

  it('serves SPA deep links without swallowing API or non-GET 404s', async () => {
    const webDist = await mkdtemp(join(tmpdir(), 'palharbor-web-'))
    await writeFile(
      join(webDist, 'index.html'),
      '<!doctype html><title>PalHarbor</title>',
    )
    const app = createApp(config, vi.fn<typeof fetch>(), {
      logger: false,
      webDist,
      activity: false,
      access: noAccess,
    })

    try {
      const deepLink = await app.inject({ method: 'GET', url: '/players' })
      const missingApi = await app.inject({
        method: 'GET',
        url: '/api/missing',
      })
      const nonGet = await app.inject({ method: 'POST', url: '/players' })

      expect(deepLink.statusCode).toBe(200)
      expect(deepLink.body).toContain('<title>PalHarbor</title>')
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
    const directory = await mkdtemp(join(tmpdir(), 'palharbor-activity-route-'))
    const databasePath = join(directory, 'activity.sqlite')
    const app = createApp(config, vi.fn<typeof fetch>(), {
      logger: false,
      webDist: false,
      activity: {
        databasePath,
        pollIntervalMs: 15_000,
        storeIpAddresses: true,
      },
      access: noAccess,
    })
    await app.ready()

    const seedDatabase = createDatabase(pathToFileURL(databasePath).href)
    await seedDatabase.initialize()
    const repository = new ActivityRepository(seedDatabase.client, {
      closeAbandonedOnOpen: false,
      storeIpAddresses: true,
    })
    const connectedAt = Date.now() - 60_000
    await repository.reconcilePlayers(
      [
        {
          userId: 'steam_123',
          playerId: 'player-123',
          name: 'Lamball Tamer',
          accountName: 'tamer',
          ip: '203.0.113.17:8211',
          level: 42,
          ping: 73,
        },
      ],
      connectedAt,
    )
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
        topPlayers: [
          {
            userId: 'steam_123',
            playerName: 'Lamball Tamer',
            online: true,
            averageLatencyMs: 73,
            latencySampleCount: 1,
          },
        ],
        ipHistory: [
          {
            userId: 'steam_123',
            playerName: 'Lamball Tamer',
            ipAddress: '203.0.113.17',
            observationCount: 1,
            online: true,
          },
        ],
        collector: {
          status: 'starting',
          running: false,
          pollIntervalSeconds: 15,
        },
      })

      const invalid = await app.inject({
        method: 'GET',
        url: '/api/activity/summary?days=365',
      })
      expect(invalid.statusCode).toBe(400)

      const exported = await app.inject({
        method: 'GET',
        url: '/api/activity/export',
      })
      expect(exported.statusCode).toBe(200)
      expect(exported.headers['content-disposition']).toContain(
        'palharbor-activity-',
      )
      expect(exported.json().players).toHaveLength(1)

      const rejectedDelete = await app.inject({
        method: 'DELETE',
        url: '/api/activity',
      })
      expect(rejectedDelete.statusCode).toBe(403)
      const deleted = await app.inject({
        method: 'DELETE',
        url: '/api/activity',
        headers: { 'x-palharbor-request': '1' },
        payload: { confirmation: 'DELETE ACTIVITY' },
      })
      expect(deleted.statusCode).toBe(200)
      const empty = await app.inject({
        method: 'GET',
        url: '/api/activity/summary?days=7',
      })
      expect(empty.json().totals.trackedPlayers).toBe(0)
    } finally {
      await app.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('serves only the active versioned map assets with immutable caching', async () => {
    const root = await mkdtemp(join(tmpdir(), 'palharbor-map-route-'))
    const version = '1.2.3'
    const versionRoot = join(root, version)
    await mkdir(join(versionRoot, 'tiles', 'palpagos', '0', '0'), {
      recursive: true,
    })
    await writeFile(
      join(root, 'current.json'),
      JSON.stringify({ gameVersion: version }),
    )
    await writeFile(
      join(versionRoot, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        gameVersion: version,
        generatedAt: '2026-07-14T00:00:00.000Z',
        caveEntrances: 'cave-entrances.json',
        regions: Object.fromEntries(
          ['palpagos', 'world-tree'].map((region) => [
            region,
            {
              fallback: `${region}.webp`,
              tiles: {
                pathTemplate: `tiles/${region}/{z}/{x}/{y}.webp`,
                tileSize: 512,
                minSourceZoom: 0,
                maxSourceZoom: 4,
              },
            },
          ]),
        ),
      }),
    )
    await writeFile(join(versionRoot, 'palpagos.webp'), Buffer.from('fallback'))
    await writeFile(join(versionRoot, 'cave-entrances.json'), Buffer.from('[]'))
    await writeFile(
      join(versionRoot, 'tiles', 'palpagos', '0', '0', '0.webp'),
      Buffer.from('tile'),
    )
    const app = createApp(config, vi.fn<typeof fetch>(), {
      logger: false,
      webDist: false,
      activity: false,
      access: noAccess,
      mapDataPath: root,
    })

    try {
      const manifest = await app.inject({
        method: 'GET',
        url: '/api/maps/manifest',
      })
      expect(manifest.statusCode).toBe(200)
      expect(manifest.headers['cache-control']).toBe('no-store')
      expect(manifest.json()).toMatchObject({
        available: true,
        gameVersion: version,
      })

      const tile = await app.inject({
        method: 'GET',
        url: `/api/maps/assets/${version}/palpagos/tiles/0/0/0.webp`,
      })
      expect(tile.statusCode).toBe(200)
      expect(tile.headers['content-type']).toContain('image/webp')
      expect(tile.headers['cache-control']).toContain('immutable')
      expect(tile.rawPayload).toEqual(Buffer.from('tile'))

      const caves = await app.inject({
        method: 'GET',
        url: `/api/maps/assets/${version}/cave-entrances.json`,
      })
      expect(caves.statusCode).toBe(200)
      expect(caves.headers['cache-control']).toContain('immutable')
      expect(caves.json()).toEqual([])

      const inactive = await app.inject({
        method: 'GET',
        url: '/api/maps/assets/old-version/palpagos/fallback.webp',
      })
      expect(inactive.statusCode).toBe(404)
    } finally {
      await app.close()
      await rm(root, { recursive: true, force: true })
    }
  })
})
