import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MapStorage } from './storage.js'

const roots: string[] = []

async function mapRoot() {
  const root = await mkdtemp(join(tmpdir(), 'palharbor-maps-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('MapStorage', () => {
  it('reports missing or malformed map data as unavailable', async () => {
    const root = await mapRoot()
    const storage = new MapStorage(root)
    expect(await storage.manifest()).toEqual({ available: false, regions: {} })

    await writeFile(
      join(root, 'current.json'),
      JSON.stringify({ gameVersion: '../outside' }),
    )
    expect(await storage.manifest()).toEqual({ available: false, regions: {} })
  })

  it('serves only validated assets from the active game version', async () => {
    const root = await mapRoot()
    const version = 'v1.2.3'
    const versionRoot = join(root, version)
    const tile = Buffer.from('tile-bytes')
    await mkdir(join(versionRoot, 'tiles', 'palpagos', '0', '0'), {
      recursive: true,
    })
    await mkdir(join(versionRoot, 'tiles', 'world-tree', '0', '0'), {
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
    await writeFile(
      join(versionRoot, 'palpagos.webp'),
      Buffer.from('fallback-bytes'),
    )
    await writeFile(join(versionRoot, 'cave-entrances.json'), Buffer.from('[]'))
    await writeFile(
      join(versionRoot, 'tiles', 'palpagos', '0', '0', '0.webp'),
      tile,
    )

    const storage = new MapStorage(root)
    expect(await storage.manifest()).toMatchObject({
      available: true,
      gameVersion: version,
      caveEntrancesUrl: `/api/maps/assets/${version}/cave-entrances.json`,
      regions: {
        palpagos: {
          fallbackUrl: `/api/maps/assets/${version}/palpagos/fallback.webp`,
        },
      },
    })
    await expect(storage.fallback(version, 'palpagos')).resolves.toEqual(
      Buffer.from('fallback-bytes'),
    )
    await expect(storage.caveEntrances(version)).resolves.toEqual(
      Buffer.from('[]'),
    )
    await expect(
      storage.tile(version, 'palpagos', '0', '0', '0'),
    ).resolves.toEqual(tile)
    await expect(
      storage.tile(version, 'palpagos', '4', '16', '0'),
    ).resolves.toBeUndefined()
    await expect(
      storage.tile('../outside', 'palpagos', '0', '0', '0'),
    ).resolves.toBeUndefined()
    await expect(
      storage.fallback('old-version', 'palpagos'),
    ).resolves.toBeUndefined()
  })
})
