import { describe, expect, it, vi } from 'vitest'
import {
  isStartupMapSyncEnabled,
  synchronizeMapsAtStartup,
} from './startup-sync.js'

describe('startup map synchronization', () => {
  it('runs by default with the built-in remote sources', async () => {
    const runner = vi.fn(async () => 'Map assets synchronized')

    await expect(synchronizeMapsAtStartup({}, runner)).resolves.toBe(
      'Map assets synchronized',
    )
    expect(runner).toHaveBeenCalledWith({})
  })

  it.each(['false', '0', 'no', 'off', ' OFF '])(
    'can be explicitly disabled with %j',
    async (value) => {
      const env = { PALWORLD_MAP_SYNC_ENABLED: value }
      const runner = vi.fn(async () => 'unused')

      expect(isStartupMapSyncEnabled(env)).toBe(false)
      await expect(
        synchronizeMapsAtStartup(env, runner),
      ).resolves.toBeUndefined()
      expect(runner).not.toHaveBeenCalled()
    },
  )

  it('propagates importer failures for the server to log and recover from', async () => {
    const failure = new Error('source image was not found')
    const runner = vi.fn(async () => Promise.reject(failure))

    await expect(
      synchronizeMapsAtStartup({ PALWORLD_MAP_SYNC_ENABLED: 'true' }, runner),
    ).rejects.toBe(failure)
  })

  it('reports a real importer process failure without exposing credentials', async () => {
    await expect(
      synchronizeMapsAtStartup({
        PALWORLD_API_URL: '',
        PALWORLD_USERNAME: '',
        PALWORLD_PASSWORD: '',
      }),
    ).rejects.toThrow(
      /Map synchronization process ended with exit code 1: Set --version or configure PALWORLD_API_URL/,
    )
  })
})
