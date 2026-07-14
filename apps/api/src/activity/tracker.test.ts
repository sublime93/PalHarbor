import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityRepository } from '@paldeck/database'
import { ActivityTracker } from './tracker.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ActivityTracker', () => {
  it('polls immediately and never overlaps a slow poll', async () => {
    vi.useFakeTimers()
    const first = deferred<readonly [{ userId: string; name: string; ping: number }]>()
    const getPlayers = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue([{ userId: 'alice-id', name: 'Alice', ping: 0 }])
    const reconcilePlayers = vi.fn()
    const repository = { reconcilePlayers } as unknown as ActivityRepository
    const tracker = new ActivityTracker({
      repository,
      getPlayers,
      intervalMs: 1_000,
      now: () => 10_000,
    })

    tracker.start()
    expect(getPlayers).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(getPlayers).toHaveBeenCalledTimes(1)

    first.resolve([{ userId: 'alice-id', name: 'Alice', ping: 0 }])
    await flushPromises()
    expect(reconcilePlayers).toHaveBeenCalledWith(
      [{ userId: 'alice-id', name: 'Alice', ping: 0 }],
      10_000,
    )

    await vi.advanceTimersByTimeAsync(999)
    expect(getPlayers).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getPlayers).toHaveBeenCalledTimes(2)
    await tracker.stop()
  })

  it('treats failed polls as unknown state and recovers on the next interval', async () => {
    vi.useFakeTimers()
    const error = new Error('Palworld unavailable')
    const getPlayers = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce([{ userId: 'alice-id', name: 'Alice' }])
    const reconcilePlayers = vi.fn()
    const onError = vi.fn()
    let now = 1_000
    const tracker = new ActivityTracker({
      repository: { reconcilePlayers } as unknown as ActivityRepository,
      getPlayers,
      intervalMs: 100,
      now: () => now,
      onError,
    })

    tracker.start()
    await flushPromises()
    expect(onError).toHaveBeenCalledWith(error)
    expect(reconcilePlayers).not.toHaveBeenCalled()
    expect(tracker.getStatus()).toMatchObject({
      running: true,
      dataStale: true,
      lastSuccessfulPollAt: null,
      lastFailedPollAt: '1970-01-01T00:00:01.000Z',
    })

    now = 2_000
    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(reconcilePlayers).toHaveBeenCalledTimes(1)
    expect(tracker.getStatus()).toMatchObject({
      dataStale: false,
      lastSuccessfulPollAt: '1970-01-01T00:00:02.000Z',
    })
    await tracker.stop()
  })

  it('stops cleanly while a poll is in flight and discards its late result', async () => {
    const pending = deferred<readonly [{ userId: string }]>()
    const reconcilePlayers = vi.fn()
    const tracker = new ActivityTracker({
      repository: { reconcilePlayers } as unknown as ActivityRepository,
      getPlayers: () => pending.promise,
      intervalMs: 10,
    })

    tracker.start()
    const stopped = tracker.stop()
    pending.resolve([{ userId: 'alice-id' }])
    await stopped

    expect(tracker.isRunning).toBe(false)
    expect(reconcilePlayers).not.toHaveBeenCalled()
  })

  it('is idempotent when start and stop are called repeatedly', async () => {
    const getPlayers = vi.fn().mockResolvedValue([])
    const tracker = new ActivityTracker({
      repository: { reconcilePlayers: vi.fn() } as unknown as ActivityRepository,
      getPlayers,
      intervalMs: 10,
    })

    tracker.start()
    tracker.start()
    await flushPromises()
    expect(getPlayers).toHaveBeenCalledTimes(1)
    await tracker.stop()
    await tracker.stop()
  })
})
