import { describe, expect, it, vi } from 'vitest'
import {
  isStartupMapSyncConfigured,
  synchronizeMapsAtStartup,
} from './startup-sync.js'

describe('startup map synchronization', () => {
  it('stays disabled without a configured local source', async () => {
    const runner = vi.fn(async () => 'unused')

    await expect(synchronizeMapsAtStartup({}, runner)).resolves.toBeUndefined()
    expect(runner).not.toHaveBeenCalled()
  })

  it.each([
    ['PALWORLD_SERVER_ROOT', '/srv/palworld'],
    ['PALWORLD_MAP_PALPAGOS_SOURCE', '/maps/T_WorldMap.webp'],
    ['PALWORLD_MAP_WORLD_TREE_SOURCE', '/maps/T_TreeMap.webp'],
  ])('is enabled by %s', async (key, value) => {
    const env = { [key]: value }
    const runner = vi.fn(async () => 'Map assets synchronized')

    expect(isStartupMapSyncConfigured(env)).toBe(true)
    await expect(synchronizeMapsAtStartup(env, runner)).resolves.toBe(
      'Map assets synchronized',
    )
    expect(runner).toHaveBeenCalledOnce()
    expect(runner).toHaveBeenCalledWith(env)
  })

  it('propagates importer failures for the server to log and recover from', async () => {
    const failure = new Error('source image was not found')
    const runner = vi.fn(async () => Promise.reject(failure))

    await expect(
      synchronizeMapsAtStartup(
        { PALWORLD_MAP_PALPAGOS_SOURCE: '/missing.webp' },
        runner,
      ),
    ).rejects.toBe(failure)
  })

  it('reports a real importer process failure without exposing credentials', async () => {
    await expect(
      synchronizeMapsAtStartup({
        PALWORLD_API_URL: '',
        PALWORLD_USERNAME: '',
        PALWORLD_PASSWORD: '',
        PALWORLD_MAP_PALPAGOS_SOURCE: '/missing/T_WorldMap.webp',
      }),
    ).rejects.toThrow(
      /Map synchronization process ended with exit code 1: Set --version or configure PALWORLD_API_URL/,
    )
  })
})
