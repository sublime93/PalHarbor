import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ...vue,
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn(),
  }
})

import { createPalworldMonitor } from './usePalworldMonitor'

describe('world snapshot polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
      clear: () => stored.clear(),
    })
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('window', {
      setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
      clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches immediately, repeats after 60 seconds, and stops when the world view deactivates', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      Time: '2026-07-13 12:30:00',
      ActorData: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const monitor = createPalworldMonitor()

    monitor.activateWorldView()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    monitor.deactivateWorldView()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
