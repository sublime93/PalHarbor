import { afterEach, describe, expect, it, vi } from 'vitest'
import { activityApi, ApiError, palworldApi } from './api'

describe('Palworld client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads documented endpoints through the local gateway', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ serverfps: 60 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(palworldApi('metrics')).resolves.toEqual({ serverfps: 60 })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/palworld/metrics',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('loads world actor snapshots through the GameData gateway route', async () => {
    const snapshot = {
      Time: '2026-07-13 12:30:00',
      InGameTime: '14:22:10',
      InGameDays: 412,
      FPS: 59.8,
      AverageFPS: 58.9,
      ActorData: [
        { Type: 'PalBox', Name: 'Main Base', LocationX: 1200, LocationY: -800 },
      ],
    }
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(palworldApi('game-data')).resolves.toEqual(snapshot)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/palworld/game-data',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('sends action bodies as JSON', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await palworldApi('announce', {
      method: 'POST',
      body: { message: 'Hello Pals' },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/palworld/announce',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Hello Pals' }),
        headers: {
          'Content-Type': 'application/json',
          'X-PalHarbor-Request': '1',
        },
      }),
    )
  })

  it('marks bodyless mutations as PalHarbor requests', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await palworldApi('save', { method: 'POST' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/palworld/save',
      expect.objectContaining({
        method: 'POST',
        headers: { 'X-PalHarbor-Request': '1' },
      }),
    )
  })

  it('surfaces gateway error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Server unavailable' }), {
            status: 502,
          }),
      ),
    )

    await expect(palworldApi('info')).rejects.toMatchObject({
      message: 'Server unavailable',
      status: 502,
    } satisfies Partial<ApiError>)
  })

  it('loads an activity summary for the selected reporting period', async () => {
    const summary = {
      periodDays: 30,
      totals: { trackedPlayers: 2 },
      topPlayers: [
        {
          userId: 'steam-user-1',
          averageLatencyMs: 47,
          latencySampleCount: 125,
        },
      ],
      ipHistory: [
        {
          userId: 'steam-user-1',
          playerName: 'Lamball Wrangler',
          ipAddress: '172.16.0.42',
          firstSeenAt: '2026-07-01T12:00:00.000Z',
          lastSeenAt: '2026-07-12T18:30:00.000Z',
          observationCount: 7,
          online: false,
        },
      ],
    }
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(summary), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await activityApi<typeof summary>(30)
    expect(result).toEqual(summary)
    expect(result.topPlayers[0]).toMatchObject({
      averageLatencyMs: 47,
      latencySampleCount: 125,
    })
    expect(result.ipHistory[0]?.ipAddress).toBe('172.16.0.42')
    expect(fetchMock).toHaveBeenCalledWith('/api/activity/summary?days=30', {
      signal: undefined,
    })
  })

  it('surfaces activity API errors consistently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'Activity store unavailable' }),
            { status: 503 },
          ),
      ),
    )

    await expect(activityApi(7)).rejects.toMatchObject({
      message: 'Activity store unavailable',
      status: 503,
    } satisfies Partial<ApiError>)
  })
})
