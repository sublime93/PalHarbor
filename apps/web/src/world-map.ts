export type CoordinateBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type WorldLocation = {
  locationX: number
  locationY: number
}

export type FlatMapPoint = {
  x: number
  y: number
}

export type LeafletCoordinate = {
  lat: number
  lng: number
}

export type MapRegionId = 'palpagos' | 'world-tree' | 'caves'

export type TerrainTileSet = {
  pathTemplate: string
  tileSize: number
  minSourceZoom: number
  maxSourceZoom: number
}

export type MapRegionMetadata = {
  id: MapRegionId
  label: string
  terrainFile: string | null
  terrainTiles: TerrainTileSet | null
  worldBounds: CoordinateBounds
  mapBounds: CoordinateBounds
  gridStep: number
}

/** Native dimensions of Palworld's square T_WorldMap texture. */
export const MAP_SIZE = 8_192

/** Current Palworld 1.0 MainMap extent from DT_WorldMapUIData. */
export const WORLD_LOCATION_BOUNDS = {
  minX: -1_099_400,
  maxX: 349_400,
  minY: -724_400,
  maxY: 724_400,
} as const satisfies CoordinateBounds

/** Current Palworld 1.0 TreeMap extent from DT_WorldMapUIData. */
export const WORLD_TREE_LOCATION_BOUNDS = {
  minX: 347_351.5,
  maxX: 689_148.5,
  minY: -818_197,
  maxY: -476_400,
} as const satisfies CoordinateBounds

/** Local coordinate plane reused by Palworld's instanced dungeons and sealed realms. */
export const CAVE_LOCATION_BOUNDS = {
  minX: -10_000,
  maxX: 10_000,
  minY: -10_000,
  maxY: 10_000,
} as const satisfies CoordinateBounds

/** Leaflet CRS.Simple bounds for the 8192-square image coordinate plane. */
export const FLAT_MAP_BOUNDS = {
  minX: 0,
  maxX: MAP_SIZE,
  minY: 0,
  maxY: MAP_SIZE,
} as const satisfies CoordinateBounds

/** Map-layer metadata used by the region selector and coordinate grid. */
export const MAP_REGIONS = {
  palpagos: {
    id: 'palpagos',
    label: 'Palpagos Islands',
    terrainFile: 'palpagos.webp',
    terrainTiles: {
      pathTemplate: 'tiles/palpagos/{z}/{x}/{y}.webp',
      tileSize: 512,
      minSourceZoom: 0,
      maxSourceZoom: 4,
    },
    worldBounds: WORLD_LOCATION_BOUNDS,
    mapBounds: FLAT_MAP_BOUNDS,
    gridStep: 200_000,
  },
  'world-tree': {
    id: 'world-tree',
    label: 'World Tree',
    terrainFile: 'world-tree.webp',
    terrainTiles: {
      pathTemplate: 'tiles/world-tree/{z}/{x}/{y}.webp',
      tileSize: 512,
      minSourceZoom: 0,
      maxSourceZoom: 4,
    },
    worldBounds: WORLD_TREE_LOCATION_BOUNDS,
    mapBounds: FLAT_MAP_BOUNDS,
    gridStep: 50_000,
  },
  caves: {
    id: 'caves',
    label: 'Caves & Instances',
    terrainFile: null,
    terrainTiles: null,
    worldBounds: CAVE_LOCATION_BOUNDS,
    mapBounds: FLAT_MAP_BOUNDS,
    gridStep: 2_500,
  },
} as const satisfies Record<MapRegionId, MapRegionMetadata>

function surfaceLocationToMap(
  bounds: CoordinateBounds,
  locationX: number,
  locationY: number,
): FlatMapPoint {
  return {
    x: ((locationY - bounds.minY) / (bounds.maxY - bounds.minY)) * MAP_SIZE,
    y: ((locationX - bounds.minX) / (bounds.maxX - bounds.minX)) * MAP_SIZE,
  }
}

function surfaceMapToLocation(bounds: CoordinateBounds, mapX: number, mapY: number): WorldLocation {
  return {
    locationX: bounds.minX + (mapY / MAP_SIZE) * (bounds.maxX - bounds.minX),
    locationY: bounds.minY + (mapX / MAP_SIZE) * (bounds.maxY - bounds.minY),
  }
}

function palpagosLocationToMap(locationX: number, locationY: number): FlatMapPoint {
  return surfaceLocationToMap(WORLD_LOCATION_BOUNDS, locationX, locationY)
}

function palpagosMapToLocation(mapX: number, mapY: number): WorldLocation {
  return surfaceMapToLocation(WORLD_LOCATION_BOUNDS, mapX, mapY)
}

function worldTreeLocationToMap(locationX: number, locationY: number): FlatMapPoint {
  return surfaceLocationToMap(WORLD_TREE_LOCATION_BOUNDS, locationX, locationY)
}

function worldTreeMapToLocation(mapX: number, mapY: number): WorldLocation {
  return surfaceMapToLocation(WORLD_TREE_LOCATION_BOUNDS, mapX, mapY)
}

function caveLocationToMap(locationX: number, locationY: number): FlatMapPoint {
  const span = CAVE_LOCATION_BOUNDS.maxX - CAVE_LOCATION_BOUNDS.minX
  return {
    x: ((locationY - CAVE_LOCATION_BOUNDS.minY) / span) * MAP_SIZE,
    y: MAP_SIZE - ((locationX - CAVE_LOCATION_BOUNDS.minX) / span) * MAP_SIZE,
  }
}

function caveMapToLocation(mapX: number, mapY: number): WorldLocation {
  const span = CAVE_LOCATION_BOUNDS.maxX - CAVE_LOCATION_BOUNDS.minX
  return {
    locationX: CAVE_LOCATION_BOUNDS.minX + ((MAP_SIZE - mapY) / MAP_SIZE) * span,
    locationY: CAVE_LOCATION_BOUNDS.minY + (mapX / MAP_SIZE) * span,
  }
}

export function locationToRegionMap(
  region: MapRegionId,
  locationX: number,
  locationY: number,
): FlatMapPoint {
  switch (region) {
    case 'world-tree': return worldTreeLocationToMap(locationX, locationY)
    case 'caves': return caveLocationToMap(locationX, locationY)
    case 'palpagos': return palpagosLocationToMap(locationX, locationY)
  }
}

export function regionMapToLocation(region: MapRegionId, mapX: number, mapY: number): WorldLocation {
  switch (region) {
    case 'world-tree': return worldTreeMapToLocation(mapX, mapY)
    case 'caves': return caveMapToLocation(mapX, mapY)
    case 'palpagos': return palpagosMapToLocation(mapX, mapY)
  }
}

export function locationToRegionLeaflet(
  region: MapRegionId,
  locationX: number,
  locationY: number,
): LeafletCoordinate {
  const point = locationToRegionMap(region, locationX, locationY)
  return { lat: point.y, lng: point.x }
}

export function isLocationInRegionBounds(
  region: MapRegionId,
  locationX: number,
  locationY: number,
): boolean {
  const bounds = MAP_REGIONS[region].worldBounds
  return Number.isFinite(locationX)
    && Number.isFinite(locationY)
    && locationX >= bounds.minX
    && locationX <= bounds.maxX
    && locationY >= bounds.minY
    && locationY <= bounds.maxY
}

/** Resolve overlapping surface bounds using Palworld's WorldMapPriority (Tree before MainMap). */
export function mapRegionForLocation(locationX: number, locationY: number): MapRegionId | null {
  if (isLocationInRegionBounds('world-tree', locationX, locationY)) return 'world-tree'
  if (isLocationInRegionBounds('palpagos', locationX, locationY)) return 'palpagos'
  return null
}

/**
 * Resolve an actor to a map plane. The REST API only documents Stage as a
 * string, so every non-empty, non-None value is retained as an interior stage
 * rather than guessing at undocumented dungeon-family names.
 */
export function mapRegionForActor(
  locationX: number,
  locationY: number,
  stage: unknown,
): MapRegionId | null {
  const normalizedStage = typeof stage === 'string' ? stage.trim() : ''
  if (normalizedStage && normalizedStage.toLowerCase() !== 'none') {
    return isLocationInRegionBounds('caves', locationX, locationY) ? 'caves' : null
  }
  return mapRegionForLocation(locationX, locationY)
}

/**
 * Project REST API LocationX/LocationY into T_WorldMap pixels.
 *
 * Pixel Y is deliberately bottom-up so the result can be passed directly to
 * Leaflet as latitude. The map's shifted CRS places y=MAP_SIZE at the top of
 * the image and y=0 at the bottom while keeping tile coordinates top-down.
 */
export function locationToMap(locationX: number, locationY: number): FlatMapPoint {
  return locationToRegionMap('palpagos', locationX, locationY)
}

/** Exact inverse of the current surface-map affine transform. */
export function mapToLocation(mapX: number, mapY: number): WorldLocation {
  return regionMapToLocation('palpagos', mapX, mapY)
}

export function locationToLeaflet(locationX: number, locationY: number): LeafletCoordinate {
  return locationToRegionLeaflet('palpagos', locationX, locationY)
}

export function locationToUv(locationX: number, locationY: number): { u: number; v: number } {
  const point = locationToMap(locationX, locationY)
  return {
    u: point.x / MAP_SIZE,
    v: 1 - point.y / MAP_SIZE,
  }
}

export function isLocationInWorldBounds(locationX: number, locationY: number): boolean {
  return isLocationInRegionBounds('palpagos', locationX, locationY)
}

export function isMapPointInBounds(mapX: number, mapY: number): boolean {
  return Number.isFinite(mapX)
    && Number.isFinite(mapY)
    && mapX >= FLAT_MAP_BOUNDS.minX
    && mapX <= FLAT_MAP_BOUNDS.maxX
    && mapY >= FLAT_MAP_BOUNDS.minY
    && mapY <= FLAT_MAP_BOUNDS.maxY
}
