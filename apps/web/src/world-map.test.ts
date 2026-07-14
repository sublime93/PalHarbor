import { describe, expect, it } from 'vitest'
import {
  CAVE_LOCATION_BOUNDS,
  FLAT_MAP_BOUNDS,
  MAP_REGIONS,
  MAP_SIZE,
  WORLD_LOCATION_BOUNDS,
  WORLD_TREE_LOCATION_BOUNDS,
  isLocationInRegionBounds,
  isLocationInWorldBounds,
  isMapPointInBounds,
  locationToLeaflet,
  locationToMap,
  locationToRegionLeaflet,
  locationToRegionMap,
  locationToUv,
  mapRegionForActor,
  mapRegionForLocation,
  mapToLocation,
  regionMapToLocation,
} from './world-map'

describe('Palworld map texture calibration', () => {
  it('places current Palpagos bounds and known landmarks on the 1.0 texture', () => {
    expect(locationToUv(WORLD_LOCATION_BOUNDS.minX, WORLD_LOCATION_BOUNDS.minY)).toEqual({ u: 0, v: 1 })
    expect(locationToUv(WORLD_LOCATION_BOUNDS.maxX, WORLD_LOCATION_BOUNDS.maxY)).toEqual({ u: 1, v: 0 })

    const summerBeach = locationToUv(-383_183.16, -210_790.92)
    expect(summerBeach.u).toBeCloseTo(0.354507, 5)
    expect(summerBeach.v).toBeCloseTo(0.505648, 5)

    const allianceTower = locationToUv(-103_434.98, 234_761.17)
    expect(allianceTower.u).toBeCloseTo(0.662038, 5)
    expect(allianceTower.v).toBeCloseTo(0.312559, 5)
  })

  it('swaps axes and keeps Leaflet in the texture pixel plane', () => {
    const west = locationToMap(0, -200_000)
    const east = locationToMap(0, 200_000)
    const south = locationToMap(-200_000, 0)
    const north = locationToMap(200_000, 0)

    expect(east.x).toBeGreaterThan(west.x)
    expect(north.y).toBeGreaterThan(south.y)
    expect(locationToLeaflet(0, 0)).toEqual({
      lat: locationToMap(0, 0).y,
      lng: locationToMap(0, 0).x,
    })
  })

  it('reverses the current affine projection without coordinate quantization', () => {
    const location = { locationX: -257_951.39, locationY: 151_247.84 }
    const point = locationToMap(location.locationX, location.locationY)
    const roundTrip = mapToLocation(point.x, point.y)

    expect(roundTrip.locationX).toBeCloseTo(location.locationX, 8)
    expect(roundTrip.locationY).toBeCloseTo(location.locationY, 8)
  })

  it('reports calibrated Palpagos and image bounds without clamping actors', () => {
    expect(isLocationInWorldBounds(WORLD_LOCATION_BOUNDS.minX, WORLD_LOCATION_BOUNDS.minY)).toBe(true)
    expect(isLocationInWorldBounds(WORLD_LOCATION_BOUNDS.maxX, WORLD_LOCATION_BOUNDS.maxY)).toBe(true)
    expect(isLocationInWorldBounds(WORLD_LOCATION_BOUNDS.maxX + 1, 0)).toBe(false)
    expect(isLocationInWorldBounds(Number.NaN, 0)).toBe(false)

    expect(isMapPointInBounds(FLAT_MAP_BOUNDS.minX, FLAT_MAP_BOUNDS.maxY)).toBe(true)
    expect(isMapPointInBounds(FLAT_MAP_BOUNDS.maxX, FLAT_MAP_BOUNDS.minY)).toBe(true)
    expect(isMapPointInBounds(-0.001, 0)).toBe(false)
    expect(isMapPointInBounds(Number.POSITIVE_INFINITY, 0)).toBe(false)
  })
})

describe('region-aware Palworld map calibration', () => {
  it('publishes terrain and grid metadata for each supported region', () => {
    expect(MAP_REGIONS.palpagos).toMatchObject({
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
    })
    expect(MAP_REGIONS['world-tree']).toMatchObject({
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
    })
    expect(MAP_REGIONS.caves).toMatchObject({
      id: 'caves',
      label: 'Caves & Instances',
      terrainFile: null,
      terrainTiles: null,
      worldBounds: CAVE_LOCATION_BOUNDS,
      mapBounds: FLAT_MAP_BOUNDS,
      gridStep: 2_500,
    })
  })

  it('projects all four World Tree world corners to the matching image corners', () => {
    const { minX, maxX, minY, maxY } = WORLD_TREE_LOCATION_BOUNDS
    const corners = [
      { location: [minX, minY] as const, expected: [0, 0] as const },
      { location: [minX, maxY] as const, expected: [MAP_SIZE, 0] as const },
      { location: [maxX, minY] as const, expected: [0, MAP_SIZE] as const },
      { location: [maxX, maxY] as const, expected: [MAP_SIZE, MAP_SIZE] as const },
    ]

    for (const { location, expected } of corners) {
      const point = locationToRegionMap('world-tree', location[0], location[1])
      expect(point.x).toBe(expected[0])
      expect(point.y).toBe(expected[1])
    }
  })

  it('reverses the World Tree affine transform without Palpagos quantization', () => {
    const location = { locationX: 531_204.25, locationY: -612_488.75 }
    const point = locationToRegionMap('world-tree', location.locationX, location.locationY)
    const roundTrip = regionMapToLocation('world-tree', point.x, point.y)

    expect(roundTrip.locationX).toBeCloseTo(location.locationX, 8)
    expect(roundTrip.locationY).toBeCloseTo(location.locationY, 8)
  })

  it('projects the local cave coordinate plane and reverses it exactly', () => {
    const { minX, maxX, minY, maxY } = CAVE_LOCATION_BOUNDS
    const corners = [
      { location: [minX, minY] as const, expected: [0, MAP_SIZE] as const },
      { location: [minX, maxY] as const, expected: [MAP_SIZE, MAP_SIZE] as const },
      { location: [maxX, minY] as const, expected: [0, 0] as const },
      { location: [maxX, maxY] as const, expected: [MAP_SIZE, 0] as const },
    ]

    for (const { location, expected } of corners) {
      expect(locationToRegionMap('caves', location[0], location[1])).toEqual({
        x: expected[0],
        y: expected[1],
      })
    }

    const location = { locationX: -2_345.67, locationY: 8_765.43 }
    const point = locationToRegionMap('caves', location.locationX, location.locationY)
    expect(regionMapToLocation('caves', point.x, point.y)).toEqual(location)
  })

  it('checks locations against the selected region rather than global bounds', () => {
    const tree = WORLD_TREE_LOCATION_BOUNDS
    expect(isLocationInRegionBounds('world-tree', tree.minX, tree.minY)).toBe(true)
    expect(isLocationInRegionBounds('world-tree', tree.maxX, tree.maxY)).toBe(true)
    expect(isLocationInRegionBounds('world-tree', tree.minX - 1, tree.minY)).toBe(false)
    expect(isLocationInRegionBounds('world-tree', tree.maxX, tree.maxY + 1)).toBe(false)
    expect(isLocationInRegionBounds('world-tree', Number.NaN, tree.minY)).toBe(false)

    // This location belongs to the World Tree plane but not Palpagos.
    expect(isLocationInRegionBounds('world-tree', 500_000, -600_000)).toBe(true)
    expect(isLocationInRegionBounds('palpagos', 500_000, -600_000)).toBe(false)
  })

  it('uses World Tree priority when the published surface bounds overlap', () => {
    expect(isLocationInRegionBounds('palpagos', 348_000, -600_000)).toBe(true)
    expect(isLocationInRegionBounds('world-tree', 348_000, -600_000)).toBe(true)
    expect(mapRegionForLocation(348_000, -600_000)).toBe('world-tree')
    expect(mapRegionForLocation(0, 0)).toBe('palpagos')
    expect(mapRegionForLocation(2_000_000, 2_000_000)).toBeNull()
  })

  it('routes non-surface Stage actors to the cave plane without leaking out-of-bounds instances', () => {
    expect(mapRegionForActor(0, 0, undefined)).toBe('palpagos')
    expect(mapRegionForActor(0, 0, '')).toBe('palpagos')
    expect(mapRegionForActor(0, 0, 'None')).toBe('palpagos')
    expect(mapRegionForActor(0, 0, '  none  ')).toBe('palpagos')
    expect(mapRegionForActor(0, 0, '6E342CCB4D5A')).toBe('caves')
    expect(mapRegionForActor(CAVE_LOCATION_BOUNDS.maxX + 1, 0, 'DungeonInstance')).toBeNull()
    expect(mapRegionForActor(500_000, -600_000, 'None')).toBe('world-tree')
  })

  it('keeps legacy helpers as Palpagos wrappers and exposes region-specific Leaflet points', () => {
    const palpagosLocation = { locationX: -257_951.39, locationY: 151_247.84 }
    expect(locationToRegionMap('palpagos', palpagosLocation.locationX, palpagosLocation.locationY))
      .toEqual(locationToMap(palpagosLocation.locationX, palpagosLocation.locationY))
    expect(locationToRegionLeaflet('palpagos', palpagosLocation.locationX, palpagosLocation.locationY))
      .toEqual(locationToLeaflet(palpagosLocation.locationX, palpagosLocation.locationY))

    const treePoint = locationToRegionMap('world-tree', 500_000, -600_000)
    expect(locationToRegionLeaflet('world-tree', 500_000, -600_000)).toEqual({
      lat: treePoint.y,
      lng: treePoint.x,
    })
  })
})
