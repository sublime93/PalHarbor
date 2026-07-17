import { describe, expect, it, vi } from 'vitest'
import { createApp, type GatewayConfig } from '../server.js'
import { InvalidGameDataError, normalizeGameDataSnapshot } from './game-data.js'

const config: GatewayConfig = {
  apiUrl: 'http://palworld.test:8212/v1/api',
  username: 'admin',
  password: 'secret',
}

describe('Palworld GameData', () => {
  it('retains documented and server-extension fields in a valid snapshot', () => {
    const payload = {
      Time: '2026-07-13 12:33:00',
      FPS: 59.9,
      AverageFPS: 58.4,
      InGameTime: '06:45:00',
      InGameDays: 107,
      ActorData: [
        {
          Type: 'PalBox',
          Name: 'Palbox',
          GuildID: 'guild-1',
          LocationX: 123.5,
          FutureServerField: true,
        },
      ],
    }

    const snapshot = normalizeGameDataSnapshot(payload)

    expect(snapshot).toEqual(payload)
    expect(snapshot.InGameTime).toBe('06:45:00')
    expect(snapshot.ActorData[0]?.FutureServerField).toBe(true)
  })

  it.each([
    null,
    {},
    { Time: '2026-07-13 12:33:00', FPS: 60, AverageFPS: 60, ActorData: null },
    { Time: '2026-07-13 12:33:00', FPS: 60, AverageFPS: 60, ActorData: [null] },
  ])('rejects a malformed snapshot envelope', (payload) => {
    expect(() => normalizeGameDataSnapshot(payload)).toThrow(
      InvalidGameDataError,
    )
  })

  it('proxies a text/plain JSON snapshot and preserves Basic auth', async () => {
    const payload = {
      Time: '2026-07-13 12:33:00',
      FPS: 60,
      AverageFPS: 59.8,
      InGameTime: '09:12:00',
      InGameDays: 153,
      ActorData: [{ Type: 'PalBox', Name: 'Palbox' }],
    }
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(payload), {
          headers: { 'content-type': 'text/plain;charset=utf-8' },
        }),
    )
    const app = createApp(config, fetchMock as typeof fetch, {
      logger: false,
      webDist: false,
      activity: false,
    })

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/palworld/game-data',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(response.json()).toEqual(payload)
      expect(fetchMock).toHaveBeenCalledWith(
        'http://palworld.test:8212/v1/api/game-data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
          }),
        }),
      )
    } finally {
      await app.close()
    }
  })

  it('turns a malformed successful upstream response into a safe 502', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response('{"enabled":true}', {
          headers: { 'content-type': 'application/json' },
        }),
    )
    const app = createApp(config, fetchMock as typeof fetch, {
      logger: false,
      webDist: false,
      activity: false,
    })

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/palworld/game-data',
      })

      expect(response.statusCode).toBe(502)
      expect(response.json()).toEqual({
        error:
          'The Palworld GameData API did not return a valid world snapshot. Update the dedicated server to a version that supports /v1/api/game-data, then restart Palworld.',
      })
      expect(response.body).not.toContain(config.apiUrl)
      expect(response.body).not.toContain(config.username)
      expect(response.body).not.toContain(config.password)
    } finally {
      await app.close()
    }
  })
})
