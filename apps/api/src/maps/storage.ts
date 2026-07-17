import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const MAP_REGIONS = ['palpagos', 'world-tree'] as const
export type StoredMapRegion = (typeof MAP_REGIONS)[number]

type StoredMapManifest = {
  schemaVersion: 1
  gameVersion: string
  generatedAt: string
  caveEntrances?: 'cave-entrances.json'
  regions: Record<
    StoredMapRegion,
    {
      fallback: string
      tiles: {
        pathTemplate: string
        tileSize: number
        minSourceZoom: number
        maxSourceZoom: number
      }
    }
  >
}

export type PublicMapManifest = {
  available: boolean
  gameVersion?: string
  generatedAt?: string
  caveEntrancesUrl?: string
  regions: Partial<
    Record<
      StoredMapRegion,
      {
        fallbackUrl: string
        tileUrlTemplate: string
        tileSize: number
        minSourceZoom: number
        maxSourceZoom: number
      }
    >
  >
}

function safeSegment(value: string): boolean {
  return /^[a-zA-Z0-9._-]{1,80}$/.test(value)
}

function isRegion(value: string): value is StoredMapRegion {
  return (MAP_REGIONS as readonly string[]).includes(value)
}

function validManifest(value: unknown): value is StoredMapManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<StoredMapManifest>
  return (
    manifest.schemaVersion === 1 &&
    typeof manifest.gameVersion === 'string' &&
    safeSegment(manifest.gameVersion) &&
    typeof manifest.generatedAt === 'string' &&
    (manifest.caveEntrances === undefined ||
      manifest.caveEntrances === 'cave-entrances.json') &&
    Boolean(manifest.regions) &&
    MAP_REGIONS.every((region) => {
      const entry = manifest.regions?.[region]
      return (
        entry &&
        entry.fallback === `${region}.webp` &&
        entry.tiles.pathTemplate === `tiles/${region}/{z}/{x}/{y}.webp` &&
        entry.tiles.tileSize === 512 &&
        entry.tiles.minSourceZoom === 0 &&
        entry.tiles.maxSourceZoom === 4
      )
    })
  )
}

export class MapStorage {
  constructor(private readonly root: string) {}

  private async currentVersion(): Promise<string | undefined> {
    try {
      const pointer = JSON.parse(
        await readFile(resolve(this.root, 'current.json'), 'utf8'),
      ) as { gameVersion?: unknown }
      return typeof pointer.gameVersion === 'string' &&
        safeSegment(pointer.gameVersion)
        ? pointer.gameVersion
        : undefined
    } catch {
      return undefined
    }
  }

  async manifest(): Promise<PublicMapManifest> {
    const version = await this.currentVersion()
    if (!version) return { available: false, regions: {} }
    try {
      const parsed = JSON.parse(
        await readFile(resolve(this.root, version, 'manifest.json'), 'utf8'),
      ) as unknown
      if (!validManifest(parsed) || parsed.gameVersion !== version) {
        return { available: false, regions: {} }
      }
      return {
        available: true,
        gameVersion: parsed.gameVersion,
        generatedAt: parsed.generatedAt,
        ...(parsed.caveEntrances
          ? {
              caveEntrancesUrl: `/api/maps/assets/${version}/cave-entrances.json`,
            }
          : {}),
        regions: Object.fromEntries(
          MAP_REGIONS.map((region) => [
            region,
            {
              fallbackUrl: `/api/maps/assets/${version}/${region}/fallback.webp`,
              tileUrlTemplate: `/api/maps/assets/${version}/${region}/tiles/{z}/{x}/{y}.webp`,
              ...parsed.regions[region].tiles,
            },
          ]),
        ) as PublicMapManifest['regions'],
      }
    } catch {
      return { available: false, regions: {} }
    }
  }

  async fallback(version: string, region: string): Promise<Buffer | undefined> {
    if (!safeSegment(version) || !isRegion(region)) return undefined
    const manifest = await this.manifest()
    if (
      !manifest.available ||
      manifest.gameVersion !== version ||
      !manifest.regions[region]
    )
      return undefined
    try {
      return await readFile(resolve(this.root, version, `${region}.webp`))
    } catch {
      return undefined
    }
  }

  async caveEntrances(version: string): Promise<Buffer | undefined> {
    if (!safeSegment(version)) return undefined
    const manifest = await this.manifest()
    if (manifest.gameVersion !== version || !manifest.caveEntrancesUrl)
      return undefined
    try {
      return await readFile(resolve(this.root, version, 'cave-entrances.json'))
    } catch {
      return undefined
    }
  }

  async tile(
    version: string,
    region: string,
    zValue: string,
    xValue: string,
    yValue: string,
  ): Promise<Buffer | undefined> {
    if (!safeSegment(version) || !isRegion(region)) return undefined
    const z = Number(zValue)
    const x = Number(xValue)
    const y = Number(yValue)
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 4) return undefined
    const dimension = 2 ** z
    if (x < 0 || y < 0 || x >= dimension || y >= dimension) return undefined
    const manifest = await this.manifest()
    if (
      !manifest.available ||
      manifest.gameVersion !== version ||
      !manifest.regions[region]
    )
      return undefined
    try {
      return await readFile(
        resolve(
          this.root,
          version,
          'tiles',
          region,
          String(z),
          String(x),
          `${y}.webp`,
        ),
      )
    } catch {
      return undefined
    }
  }
}
