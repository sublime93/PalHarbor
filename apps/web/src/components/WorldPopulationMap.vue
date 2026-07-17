<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'
import type {
  ImageOverlay,
  LatLng,
  LatLngBounds,
  Map as LeafletMap,
  TileLayer,
  ZoomAnimEvent,
} from 'leaflet'
import {
  Grid3X3,
  Layers3,
  LocateFixed,
  MapPinned,
  Minus,
  Pickaxe,
  Plus,
  Scan,
  TreePine,
  X,
} from '@lucide/vue'
import type { Actor } from '../types'
import { actorStage, summarizeCaveStages, type CaveEntrance } from '../cave-map'
import {
  actorCategory,
  actorCategoryMeta,
  actorDisplayName,
  actorPosition,
  type ActorCategory,
  type WorldPosition,
} from '../world'
import {
  FLAT_MAP_BOUNDS,
  MAP_REGIONS,
  MAP_SIZE,
  locationToRegionLeaflet,
  locationToRegionMap,
  mapRegionForActor,
  mapRegionForLocation,
  type MapRegionId,
} from '../world-map'

const props = defineProps<{
  actors: Actor[]
  loading?: boolean
}>()
const region = defineModel<MapRegionId>('region', { default: 'palpagos' })

type PositionedActor = {
  actor: Actor
  category: ActorCategory
  position: WorldPosition
  mapPosition: { lat: number; lng: number }
}

type ScreenPoint = PositionedActor & {
  screenX: number
  screenY: number
}

type PositionedEntrance = {
  entrance: CaveEntrance
  mapPosition: { lat: number; lng: number }
}

type EntranceScreenPoint = PositionedEntrance & {
  screenX: number
  screenY: number
}

type MapHitTarget =
  | { kind: 'actor'; point: ScreenPoint }
  | { kind: 'entrance'; point: EntranceScreenPoint }

type TerrainState = 'loading' | 'ready' | 'error'
type MapAssetRegion = {
  fallbackUrl: string
  tileUrlTemplate: string
  tileSize: number
  minSourceZoom: number
  maxSourceZoom: number
}
type MapAssetManifest = {
  available: boolean
  gameVersion?: string
  caveEntrancesUrl?: string
  regions: Partial<Record<'palpagos' | 'world-tree', MapAssetRegion>>
}

const host = ref<HTMLElement | null>(null)
const mapElement = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const hoveredActor = ref<Actor | null>(null)
const selectedActor = ref<Actor | null>(null)
const hoveredEntrance = ref<CaveEntrance | null>(null)
const selectedEntrance = ref<CaveEntrance | null>(null)
const tooltipPosition = ref({ x: 0, y: 0 })
const terrainVisible = ref(true)
const gridVisible = ref(true)
const entrancesVisible = ref(true)
const activeCaveStage = ref('all')
const terrainState = ref<TerrainState>('loading')
const mapAssets = ref<MapAssetManifest>({ available: false, regions: {} })
const caveEntrances = ref<CaveEntrance[]>([])
const zoomLabel = ref('Fit')
const regionMeta = computed(() => MAP_REGIONS[region.value])
const mapAssetRegion = computed(() =>
  region.value === 'caves' ? undefined : mapAssets.value.regions[region.value],
)
const terrainUrl = computed(() => mapAssetRegion.value?.fallbackUrl ?? null)
const terrainTileUrl = computed(
  () => mapAssetRegion.value?.tileUrlTemplate ?? null,
)

const caveStageOptions = computed(() =>
  summarizeCaveStages(
    props.actors.filter((actor) => {
      const position = actorPosition(actor)
      return (
        position &&
        mapRegionForActor(position.x, position.y, actor.Stage) === 'caves'
      )
    }),
  ),
)

const positionedActors = computed<PositionedActor[]>(() =>
  props.actors.flatMap((actor) => {
    const position = actorPosition(actor)
    const actorRegion = position
      ? mapRegionForActor(position.x, position.y, actor.Stage)
      : null
    const stage = actorStage(actor)
    const matchesCaveStage =
      region.value !== 'caves' ||
      activeCaveStage.value === 'all' ||
      stage === activeCaveStage.value
    return position && actorRegion === region.value && matchesCaveStage
      ? [
          {
            actor,
            position,
            category: actorCategory(actor),
            mapPosition: locationToRegionLeaflet(
              region.value,
              position.x,
              position.y,
            ),
          },
        ]
      : []
  }),
)
const positionedEntrances = computed<PositionedEntrance[]>(() =>
  entrancesVisible.value && region.value !== 'caves'
    ? caveEntrances.value.flatMap((entrance) =>
        mapRegionForLocation(entrance.x, entrance.y) === region.value
          ? [
              {
                entrance,
                mapPosition: locationToRegionLeaflet(
                  region.value,
                  entrance.x,
                  entrance.y,
                ),
              },
            ]
          : [],
      )
    : [],
)
const categoryPriority: Record<ActorCategory, number> = {
  Unknown: 0,
  WildPal: 1,
  NPC: 2,
  BaseCampPal: 3,
  OtomoPal: 4,
  PalBox: 5,
  Player: 6,
}
const orderedPositionedActors = computed(() =>
  [...positionedActors.value].sort(
    (left, right) =>
      categoryPriority[left.category] - categoryPriority[right.category],
  ),
)
const regionOptions = [
  MAP_REGIONS.palpagos,
  MAP_REGIONS['world-tree'],
  MAP_REGIONS.caves,
]
const inspectedActor = computed(() =>
  selectedEntrance.value ? null : (selectedActor.value ?? hoveredActor.value),
)
const inspectedEntrance = computed(() =>
  selectedActor.value
    ? null
    : (selectedEntrance.value ?? hoveredEntrance.value),
)
const inspectedPosition = computed(() =>
  inspectedActor.value ? actorPosition(inspectedActor.value) : null,
)
const inspectedCategory = computed<ActorCategory>(() =>
  inspectedActor.value ? actorCategory(inspectedActor.value) : 'Unknown',
)
const tooltipStyle = computed<CSSProperties>(() => ({
  left: `${tooltipPosition.value.x}px`,
  top: `${tooltipPosition.value.y}px`,
}))
const mapStatus = computed(() => {
  if (terrainState.value === 'error')
    return 'Terrain image unavailable. Coordinate grid fallback active.'
  if (region.value === 'caves') {
    const stageCount = caveStageOptions.value.length
    return `${positionedActors.value.length.toLocaleString()} actors across ${stageCount.toLocaleString()} live interior stages on the local cave schematic.`
  }
  if (!terrainVisible.value)
    return `Terrain hidden on ${regionMeta.value.label}.`
  if (selectedEntrance.value)
    return `${selectedEntrance.value.label} selected on the surface map.`
  if (selectedActor.value)
    return `${actorDisplayName(selectedActor.value)} selected on the map.`
  return `${positionedActors.value.length.toLocaleString()} positioned actors and ${positionedEntrances.value.length.toLocaleString()} cave entrances on the ${regionMeta.value.label} map.`
})
const emptyTitle = computed(() => {
  if (props.loading) return 'Reading world snapshot…'
  if (region.value === 'caves') return 'No live actors inside an instance'
  if (props.actors.length)
    return `No reported actors in ${regionMeta.value.label}`
  return 'No positioned actors found'
})
const emptyCopy = computed(() =>
  props.loading
    ? 'The first GameData response can take a moment.'
    : region.value === 'caves'
      ? 'Enter a cave, wait for the next GameData snapshot, then choose its exact Stage above.'
      : props.actors.length
        ? 'The terrain and coordinate grid remain available; switch regions to inspect the other map.'
        : 'Try enabling another population filter or refreshing the snapshot.',
)

let map: LeafletMap | undefined
let mapBounds: LatLngBounds | undefined
let terrainLayer: ImageOverlay | TileLayer | undefined
let resizeObserver: ResizeObserver | undefined
let animationFrame: number | undefined
let screenPoints: ScreenPoint[] = []
let interactiveScreenPoints: ScreenPoint[] = []
let entranceScreenPoints: EntranceScreenPoint[] = []
let interactiveEntranceScreenPoints: EntranceScreenPoint[] = []
let pointerStart: { x: number; y: number } | undefined
let pointerTravel = 0
let disposed = false
let zoomAnimating = false
let zoomBaseTopLeft: LatLng | undefined
let zoomBaseLevel: number | undefined
let replaceTerrainLayer: (() => void) | undefined
let caveStageSelectionTouched = false

function markerRadius(category: ActorCategory): number {
  if (category === 'Player') return 5
  if (category === 'PalBox') return 4.5
  if (category === 'OtomoPal') return 3.5
  if (category === 'BaseCampPal') return 3
  return 2.2
}

function requestDraw() {
  if (zoomAnimating || animationFrame !== undefined) return
  animationFrame = requestAnimationFrame(() => {
    animationFrame = undefined
    draw()
  })
}

function resizeCanvas(
  element: HTMLCanvasElement,
  width: number,
  height: number,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const nextWidth = Math.round(width * dpr)
  const nextHeight = Math.round(height * dpr)
  if (element.width !== nextWidth) element.width = nextWidth
  if (element.height !== nextHeight) element.height = nextHeight
  const context = element.getContext('2d')
  if (!context) return null
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  return context
}

function gridValues(minimum: number, maximum: number, step: number) {
  const values: number[] = []
  for (
    let value = Math.ceil(minimum / step) * step;
    value <= maximum;
    value += step
  )
    values.push(value)
  return values
}

function gridCoordinateLabel(axis: 'X' | 'Y', value: number) {
  const compact =
    Math.abs(value) >= 1_000
      ? `${Math.round(value / 1_000)}k`
      : Math.round(value).toLocaleString()
  return `${axis} ${value > 0 ? '+' : ''}${compact}`
}

function drawCaveSchematic(context: CanvasRenderingContext2D) {
  if (!map || region.value !== 'caves') return
  const currentMap = map
  const northWest = currentMap.latLngToContainerPoint([
    FLAT_MAP_BOUNDS.maxY,
    FLAT_MAP_BOUNDS.minX,
  ])
  const southEast = currentMap.latLngToContainerPoint([
    FLAT_MAP_BOUNDS.minY,
    FLAT_MAP_BOUNDS.maxX,
  ])
  const width = southEast.x - northWest.x
  const height = southEast.y - northWest.y
  const center = currentMap.latLngToContainerPoint([
    MAP_REGIONS.caves.mapBounds.maxY / 2,
    MAP_REGIONS.caves.mapBounds.maxX / 2,
  ])

  context.save()
  context.beginPath()
  context.rect(northWest.x, northWest.y, width, height)
  context.clip()

  const glow = context.createRadialGradient(
    center.x,
    center.y,
    0,
    center.x,
    center.y,
    Math.max(Math.abs(width), Math.abs(height)) * 0.62,
  )
  glow.addColorStop(0, 'rgba(42, 103, 106, .27)')
  glow.addColorStop(0.38, 'rgba(24, 67, 72, .20)')
  glow.addColorStop(1, 'rgba(3, 15, 22, .96)')
  context.fillStyle = glow
  context.fillRect(northWest.x, northWest.y, width, height)

  const ringRadii = [1_100, 2_050, 3_150]
  for (const [ringIndex, radius] of ringRadii.entries()) {
    context.beginPath()
    for (let index = 0; index <= 32; index += 1) {
      const angle = (index / 32) * Math.PI * 2
      const wobble =
        1 +
        Math.sin(angle * (3 + ringIndex) + ringIndex * 1.7) *
          (0.08 + ringIndex * 0.015)
      const mapX =
        MAP_REGIONS.caves.mapBounds.maxX / 2 + Math.cos(angle) * radius * wobble
      const mapY =
        MAP_REGIONS.caves.mapBounds.maxY / 2 + Math.sin(angle) * radius * wobble
      const point = currentMap.latLngToContainerPoint([mapY, mapX])
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    }
    context.closePath()
    context.strokeStyle = `rgba(105, 205, 196, ${0.18 - ringIndex * 0.035})`
    context.lineWidth = ringIndex === 0 ? 1.5 : 1
    context.setLineDash(ringIndex === 1 ? [5, 6] : [])
    context.stroke()
  }
  context.setLineDash([])

  context.strokeStyle = 'rgba(247, 186, 84, .32)'
  context.lineWidth = 1
  context.beginPath()
  context.arc(center.x, center.y, 9, 0, Math.PI * 2)
  context.moveTo(center.x - 15, center.y)
  context.lineTo(center.x + 15, center.y)
  context.moveTo(center.x, center.y - 15)
  context.lineTo(center.x, center.y + 15)
  context.stroke()
  context.font = '800 8px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textAlign = 'center'
  context.fillStyle = 'rgba(192, 229, 225, .55)'
  context.fillText('LOCAL INSTANCE ORIGIN', center.x, center.y + 28)
  context.restore()
}

function drawGrid(context: CanvasRenderingContext2D) {
  if (!map) return
  const currentMap = map
  const northWest = currentMap.latLngToContainerPoint([
    FLAT_MAP_BOUNDS.maxY,
    FLAT_MAP_BOUNDS.minX,
  ])
  const southEast = currentMap.latLngToContainerPoint([
    FLAT_MAP_BOUNDS.minY,
    FLAT_MAP_BOUNDS.maxX,
  ])
  const viewport = canvas.value?.getBoundingClientRect()
  const width = southEast.x - northWest.x
  const height = southEast.y - northWest.y
  const visibleLeft = Math.max(0, northWest.x)
  const visibleTop = Math.max(0, northWest.y)
  const visibleRight = Math.min(
    viewport?.width ?? Number.POSITIVE_INFINITY,
    southEast.x,
  )
  const visibleBottom = Math.min(
    viewport?.height ?? Number.POSITIVE_INFINITY,
    southEast.y,
  )
  const { worldBounds, gridStep } = regionMeta.value
  const centerX = (worldBounds.minX + worldBounds.maxX) / 2
  const centerY = (worldBounds.minY + worldBounds.maxY) / 2
  const minorStep = gridStep / 2
  const stronger =
    region.value === 'caves' ||
    terrainState.value === 'error' ||
    !terrainVisible.value

  context.save()
  context.beginPath()
  context.rect(northWest.x, northWest.y, width, height)
  context.clip()
  context.lineWidth = 1

  context.strokeStyle = stronger
    ? 'rgba(88, 215, 221, .22)'
    : 'rgba(88, 215, 221, .10)'
  context.beginPath()
  for (const value of gridValues(
    worldBounds.minX,
    worldBounds.maxX,
    minorStep,
  )) {
    if (Math.abs(value / gridStep - Math.round(value / gridStep)) < 0.000_001)
      continue
    const { y } = locationToRegionMap(region.value, value, centerY)
    const screenY = currentMap.latLngToContainerPoint([
      y,
      FLAT_MAP_BOUNDS.minX,
    ]).y
    context.moveTo(northWest.x, screenY)
    context.lineTo(southEast.x, screenY)
  }
  for (const value of gridValues(
    worldBounds.minY,
    worldBounds.maxY,
    minorStep,
  )) {
    if (Math.abs(value / gridStep - Math.round(value / gridStep)) < 0.000_001)
      continue
    const { x } = locationToRegionMap(region.value, centerX, value)
    const screenX = currentMap.latLngToContainerPoint([
      FLAT_MAP_BOUNDS.minY,
      x,
    ]).x
    context.moveTo(screenX, northWest.y)
    context.lineTo(screenX, southEast.y)
  }
  context.stroke()

  context.strokeStyle = stronger
    ? 'rgba(88, 215, 221, .50)'
    : 'rgba(88, 215, 221, .25)'
  context.beginPath()
  for (const value of gridValues(
    worldBounds.minX,
    worldBounds.maxX,
    gridStep,
  )) {
    const { y } = locationToRegionMap(region.value, value, centerY)
    const screenY = currentMap.latLngToContainerPoint([
      y,
      FLAT_MAP_BOUNDS.minX,
    ]).y
    context.moveTo(northWest.x, screenY)
    context.lineTo(southEast.x, screenY)
  }
  for (const value of gridValues(
    worldBounds.minY,
    worldBounds.maxY,
    gridStep,
  )) {
    const { x } = locationToRegionMap(region.value, centerX, value)
    const screenX = currentMap.latLngToContainerPoint([
      FLAT_MAP_BOUNDS.minY,
      x,
    ]).x
    context.moveTo(screenX, northWest.y)
    context.lineTo(screenX, southEast.y)
  }
  context.stroke()
  context.strokeStyle = stronger
    ? 'rgba(88, 215, 221, .64)'
    : 'rgba(88, 215, 221, .35)'
  context.strokeRect(northWest.x, northWest.y, width, height)

  context.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textBaseline = 'bottom'
  context.lineJoin = 'round'
  context.lineWidth = 3
  context.strokeStyle = 'rgba(2, 13, 19, .92)'
  context.fillStyle = stronger
    ? 'rgba(190, 245, 244, .9)'
    : 'rgba(190, 235, 235, .72)'
  for (const value of gridValues(
    worldBounds.minX,
    worldBounds.maxX,
    gridStep,
  )) {
    const { y } = locationToRegionMap(region.value, value, centerY)
    const screenY = currentMap.latLngToContainerPoint([
      y,
      FLAT_MAP_BOUNDS.minX,
    ]).y
    if (screenY < visibleTop + 10 || screenY > visibleBottom) continue
    const label = gridCoordinateLabel('X', value)
    context.strokeText(label, visibleLeft + 7, screenY - 4)
    context.fillText(label, visibleLeft + 7, screenY - 4)
  }
  context.textBaseline = 'top'
  for (const value of gridValues(
    worldBounds.minY,
    worldBounds.maxY,
    gridStep,
  )) {
    const { x } = locationToRegionMap(region.value, centerX, value)
    const screenX = currentMap.latLngToContainerPoint([
      FLAT_MAP_BOUNDS.minY,
      x,
    ]).x
    if (screenX < visibleLeft || screenX > visibleRight - 42) continue
    const label = gridCoordinateLabel('Y', value)
    context.strokeText(label, screenX + 5, visibleTop + 7)
    context.fillText(label, screenX + 5, visibleTop + 7)
  }
  context.restore()
}

function clampTooltip(x: number, y: number) {
  const rect = host.value?.getBoundingClientRect()
  if (!rect) return
  const next = {
    x: Math.min(Math.max(x + 14, 12), Math.max(12, rect.width - 230)),
    y: Math.min(Math.max(y + 14, 12), Math.max(12, rect.height - 145)),
  }
  if (
    Math.abs(next.x - tooltipPosition.value.x) > 0.5 ||
    Math.abs(next.y - tooltipPosition.value.y) > 0.5
  ) {
    tooltipPosition.value = next
  }
}

function draw() {
  const element = canvas.value
  if (!element || !map) return
  const currentMap = map
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const context = resizeCanvas(element, rect.width, rect.height)
  if (!context) return

  drawCaveSchematic(context)
  if (gridVisible.value || terrainState.value === 'error') drawGrid(context)

  entranceScreenPoints = positionedEntrances.value.map((item) => {
    const point = currentMap.latLngToContainerPoint([
      item.mapPosition.lat,
      item.mapPosition.lng,
    ])
    return { ...item, screenX: point.x, screenY: point.y }
  })
  interactiveEntranceScreenPoints = []
  context.save()
  context.beginPath()
  for (const point of entranceScreenPoints) {
    if (
      point.screenX < -20 ||
      point.screenX > rect.width + 20 ||
      point.screenY < -20 ||
      point.screenY > rect.height + 20
    )
      continue
    interactiveEntranceScreenPoints.push(point)
    const size = 4.2
    context.moveTo(point.screenX, point.screenY - size)
    context.lineTo(point.screenX + size, point.screenY)
    context.lineTo(point.screenX, point.screenY + size)
    context.lineTo(point.screenX - size, point.screenY)
    context.closePath()
  }
  context.fillStyle = 'rgba(247, 186, 84, .78)'
  context.shadowColor = 'rgba(247, 186, 84, .42)'
  context.shadowBlur = 4
  context.fill()
  context.shadowBlur = 0
  context.strokeStyle = 'rgba(32, 23, 10, .86)'
  context.lineWidth = 1
  context.stroke()
  context.restore()

  screenPoints = orderedPositionedActors.value.map((item) => {
    const point = currentMap.latLngToContainerPoint([
      item.mapPosition.lat,
      item.mapPosition.lng,
    ])
    return { ...item, screenX: point.x, screenY: point.y }
  })

  const pointsByCategory = Object.fromEntries(
    (Object.keys(actorCategoryMeta) as ActorCategory[]).map((category) => [
      category,
      [] as ScreenPoint[],
    ]),
  ) as Record<ActorCategory, ScreenPoint[]>
  interactiveScreenPoints = []
  for (const point of screenPoints) {
    if (
      point.screenX < -20 ||
      point.screenX > rect.width + 20 ||
      point.screenY < -20 ||
      point.screenY > rect.height + 20
    )
      continue
    pointsByCategory[point.category].push(point)
    interactiveScreenPoints.push(point)
  }

  for (const category of Object.keys(actorCategoryMeta) as ActorCategory[]) {
    const points = pointsByCategory[category]
    if (!points.length) continue
    const radius = markerRadius(category)

    context.beginPath()
    for (const point of points) {
      context.moveTo(point.screenX + radius, point.screenY)
      context.arc(point.screenX, point.screenY, radius, 0, Math.PI * 2)
    }
    context.globalAlpha =
      category === 'WildPal' || category === 'NPC' ? 0.72 : 0.94
    context.fillStyle = actorCategoryMeta[category].color
    context.shadowColor = 'rgba(1, 11, 16, .95)'
    context.shadowBlur = 4
    context.fill()
    context.shadowBlur = 0
    context.strokeStyle = 'rgba(3, 15, 21, .72)'
    context.lineWidth = 1.2
    context.stroke()
  }
  context.globalAlpha = 1

  if (selectedActor.value) {
    const selectedPoint = screenPoints.find(
      ({ actor }) => actor === selectedActor.value,
    )
    if (selectedPoint) {
      context.strokeStyle = '#e8ffff'
      context.lineWidth = 1.8
      context.shadowColor = 'rgba(88, 215, 221, .8)'
      context.shadowBlur = 7
      context.beginPath()
      context.arc(
        selectedPoint.screenX,
        selectedPoint.screenY,
        markerRadius(selectedPoint.category) + 5,
        0,
        Math.PI * 2,
      )
      context.stroke()
      context.shadowBlur = 0
      clampTooltip(selectedPoint.screenX, selectedPoint.screenY)
    }
  }

  if (selectedEntrance.value) {
    const selectedPoint = entranceScreenPoints.find(
      ({ entrance }) => entrance === selectedEntrance.value,
    )
    if (selectedPoint) {
      context.strokeStyle = '#fff2c9'
      context.lineWidth = 1.8
      context.shadowColor = 'rgba(247, 186, 84, .82)'
      context.shadowBlur = 7
      context.beginPath()
      context.arc(
        selectedPoint.screenX,
        selectedPoint.screenY,
        10,
        0,
        Math.PI * 2,
      )
      context.stroke()
      context.shadowBlur = 0
      clampTooltip(selectedPoint.screenX, selectedPoint.screenY)
    }
  }
}

function nearestTarget(event: MouseEvent | PointerEvent): MapHitTarget | null {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return null
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  let nearest: MapHitTarget | null = null
  let nearestDistance = 12 ** 2

  for (
    let index = interactiveEntranceScreenPoints.length - 1;
    index >= 0;
    index -= 1
  ) {
    const point = interactiveEntranceScreenPoints[index]
    if (!point) continue
    const distance = (point.screenX - x) ** 2 + (point.screenY - y) ** 2
    if (distance < nearestDistance) {
      nearest = { kind: 'entrance', point }
      nearestDistance = distance
    }
  }
  for (let index = interactiveScreenPoints.length - 1; index >= 0; index -= 1) {
    const point = interactiveScreenPoints[index]
    if (!point) continue
    const distance = (point.screenX - x) ** 2 + (point.screenY - y) ** 2
    if (distance < nearestDistance) {
      nearest = { kind: 'actor', point }
      nearestDistance = distance
    }
  }
  if (nearest) clampTooltip(x, y)
  return nearest
}

function inspectPoint(event: PointerEvent) {
  if (zoomAnimating) {
    hoveredActor.value = null
    hoveredEntrance.value = null
    return
  }
  if (pointerStart) {
    pointerTravel = Math.max(
      pointerTravel,
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ),
    )
  }
  if (event.pointerType === 'mouse' && !pointerStart) {
    const target = nearestTarget(event)
    hoveredActor.value = target?.kind === 'actor' ? target.point.actor : null
    hoveredEntrance.value =
      target?.kind === 'entrance' ? target.point.entrance : null
  }
}

function beginPointer(event: PointerEvent) {
  pointerStart = { x: event.clientX, y: event.clientY }
  pointerTravel = 0
  hoveredActor.value = null
  hoveredEntrance.value = null
}

function endPointer(event: PointerEvent) {
  if (pointerStart) {
    pointerTravel = Math.max(
      pointerTravel,
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ),
    )
  }
  pointerStart = undefined
}

function leavePointer() {
  hoveredActor.value = null
  hoveredEntrance.value = null
  pointerStart = undefined
}

function selectPoint(event: MouseEvent) {
  if (zoomAnimating) return
  if (pointerTravel > 6) {
    pointerTravel = 0
    return
  }
  const target = nearestTarget(event)
  selectedActor.value = target?.kind === 'actor' ? target.point.actor : null
  selectedEntrance.value =
    target?.kind === 'entrance' ? target.point.entrance : null
  requestDraw()
}

function clearSelection() {
  selectedActor.value = null
  selectedEntrance.value = null
  requestDraw()
}

function fitMap() {
  if (map && mapBounds)
    map.fitBounds(mapBounds, { animate: true, padding: [12, 12] })
}

function zoomIn() {
  map?.zoomIn(0.5)
}

function zoomOut() {
  map?.zoomOut(0.5)
}

function toggleTerrain() {
  if (region.value === 'caves') return
  terrainVisible.value = !terrainVisible.value
  terrainLayer?.setOpacity(terrainVisible.value ? 0.9 : 0)
  requestDraw()
}

function toggleGrid() {
  gridVisible.value = !gridVisible.value
  requestDraw()
}

function toggleEntrances() {
  entrancesVisible.value = !entrancesVisible.value
  hoveredEntrance.value = null
  selectedEntrance.value = null
  requestDraw()
}

function selectRegion(nextRegion: MapRegionId) {
  if (region.value !== nextRegion) region.value = nextRegion
}

function selectCaveStage(event: Event) {
  caveStageSelectionTouched = true
  activeCaveStage.value = (event.target as HTMLSelectElement).value
  clearSelection()
}

function loadRegionTerrain() {
  hoveredActor.value = null
  selectedActor.value = null
  hoveredEntrance.value = null
  selectedEntrance.value = null
  screenPoints = []
  interactiveScreenPoints = []
  entranceScreenPoints = []
  interactiveEntranceScreenPoints = []
  replaceTerrainLayer?.()
  if (map && mapBounds)
    map.fitBounds(mapBounds, { animate: false, padding: [12, 12] })
  updateZoomLabel()
  requestDraw()
}

function projectedContainerPoint(
  lat: number,
  lng: number,
  event: ZoomAnimEvent,
) {
  if (!map) return null
  return map
    .project([lat, lng], event.zoom)
    .subtract(map.project(event.center, event.zoom))
    .add(map.getSize().divideBy(2))
}

function animateCanvasZoom(event: ZoomAnimEvent) {
  const element = canvas.value
  const currentMap = map
  if (!element || !currentMap) return

  if (!zoomAnimating) {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    zoomAnimating = true
    zoomBaseTopLeft = currentMap.containerPointToLatLng([0, 0])
    zoomBaseLevel = currentMap.getZoom()
    host.value?.classList.add('world-map-zooming')
  }

  const baseTopLeft = zoomBaseTopLeft
  const baseLevel = zoomBaseLevel
  if (!baseTopLeft || baseLevel === undefined) return
  const targetTopLeft = projectedContainerPoint(
    baseTopLeft.lat,
    baseTopLeft.lng,
    event,
  )
  if (!targetTopLeft) return
  const scale = currentMap.getZoomScale(event.zoom, baseLevel)

  element.style.transition = 'transform 250ms cubic-bezier(0, 0, .25, 1)'
  element.style.transformOrigin = '0 0'
  element.style.transform = `translate3d(${targetTopLeft.x}px, ${targetTopLeft.y}px, 0) scale(${scale})`

  if (selectedActor.value) {
    const selected = positionedActors.value.find(
      ({ actor }) => actor === selectedActor.value,
    )
    if (selected) {
      const target = projectedContainerPoint(
        selected.mapPosition.lat,
        selected.mapPosition.lng,
        event,
      )
      if (target) clampTooltip(target.x, target.y)
    }
  } else if (selectedEntrance.value) {
    const selected = positionedEntrances.value.find(
      ({ entrance }) => entrance === selectedEntrance.value,
    )
    if (selected) {
      const target = projectedContainerPoint(
        selected.mapPosition.lat,
        selected.mapPosition.lng,
        event,
      )
      if (target) clampTooltip(target.x, target.y)
    }
  }
}

function finishCanvasZoom() {
  const element = canvas.value
  zoomAnimating = false
  zoomBaseTopLeft = undefined
  zoomBaseLevel = undefined
  host.value?.classList.remove('world-map-zooming')

  if (element) {
    element.style.transition = 'none'
    element.style.transform = 'none'
  }
  draw()
  if (element) {
    // Commit the target bitmap before allowing the next animated transform.
    void element.offsetWidth
    element.style.transition = ''
  }
}

function updateZoomLabel() {
  if (!map || !mapBounds) return
  const zoom = map.getZoom()
  zoomLabel.value = `${Math.round(2 ** (zoom - map.getBoundsZoom(mapBounds)) * 100)}%`
}

async function initializeMap() {
  if (!mapElement.value || map) return
  const leafletModule = await import('leaflet')
  if (disposed || !mapElement.value) return
  const L = leafletModule.default
  const tileAlignedCrs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, -1, MAP_SIZE),
  })
  mapBounds = L.latLngBounds(
    [FLAT_MAP_BOUNDS.minY, FLAT_MAP_BOUNDS.minX],
    [FLAT_MAP_BOUNDS.maxY, FLAT_MAP_BOUNDS.maxX],
  )
  map = L.map(mapElement.value, {
    crs: tileAlignedCrs,
    minZoom: -5,
    maxZoom: 1,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    zoomControl: false,
    attributionControl: true,
    keyboard: true,
    scrollWheelZoom: true,
    touchZoom: true,
    doubleClickZoom: true,
    boxZoom: true,
    maxBounds: mapBounds.pad(0.12),
    maxBoundsViscosity: 0.9,
  })

  map.attributionControl.setPrefix(false)
  if (mapAssets.value.available) {
    map.attributionControl.addAttribution(
      'Locally generated map © Pocketpair, Inc. · Unofficial fan project',
    )
  }
  if (caveEntrances.value.length) {
    map.attributionControl.addAttribution(
      'Cave entrances: locally imported versioned data',
    )
  }

  const mapInstance = map
  replaceTerrainLayer = () => {
    const previousLayer = terrainLayer
    terrainLayer = undefined
    previousLayer?.remove()
    previousLayer?.off()
    const tileSet = mapAssetRegion.value
    const tileUrl = terrainTileUrl.value
    const fallbackUrl = terrainUrl.value
    if (!tileSet || !tileUrl) {
      terrainState.value = region.value === 'caves' ? 'ready' : 'error'
      requestDraw()
      return
    }

    terrainState.value = 'loading'
    let loadedTileCount = 0
    let failedTileCount = 0

    const loadFallbackImage = () => {
      if (!fallbackUrl) {
        terrainState.value = 'error'
        requestDraw()
        return
      }
      const fallbackLayer = L.imageOverlay(fallbackUrl, mapBounds!, {
        alt: `${regionMeta.value.label} terrain`,
        opacity: terrainVisible.value ? 0.9 : 0,
      })
      fallbackLayer.on('load', () => {
        if (terrainLayer !== fallbackLayer) return
        terrainState.value = 'ready'
        requestDraw()
      })
      fallbackLayer.on('error', () => {
        if (terrainLayer !== fallbackLayer) return
        terrainState.value = 'error'
        requestDraw()
      })
      terrainLayer = fallbackLayer
      fallbackLayer.addTo(mapInstance)
    }

    const nextLayer = L.tileLayer(tileUrl, {
      bounds: mapBounds!,
      tileSize: tileSet.tileSize,
      zoomOffset: tileSet.maxSourceZoom,
      minZoom: -5,
      maxZoom: 1,
      minNativeZoom: tileSet.minSourceZoom - tileSet.maxSourceZoom,
      maxNativeZoom: 0,
      noWrap: true,
      detectRetina: false,
      keepBuffer: 2,
      updateWhenZooming: false,
      opacity: terrainVisible.value ? 0.9 : 0,
      className: 'world-map-terrain-tile',
    })
    nextLayer.on('tileload', () => {
      loadedTileCount += 1
    })
    nextLayer.on('tileerror', () => {
      failedTileCount += 1
    })
    nextLayer.on('load', () => {
      if (terrainLayer !== nextLayer) return
      if (loadedTileCount > 0 || failedTileCount === 0) {
        terrainState.value = 'ready'
        requestDraw()
        return
      }
      terrainLayer = undefined
      nextLayer.remove()
      nextLayer.off()
      loadFallbackImage()
    })
    terrainLayer = nextLayer
    nextLayer.addTo(mapInstance)
  }
  replaceTerrainLayer()

  map.on('move zoom resize viewreset', requestDraw)
  map.on('zoomanim', animateCanvasZoom)
  map.on('zoomend', finishCanvasZoom)
  map.on('movestart', () => {
    hoveredActor.value = null
    hoveredEntrance.value = null
  })
  map.on('zoomend moveend', updateZoomLabel)
  map.fitBounds(mapBounds, { animate: false, padding: [12, 12] })
  updateZoomLabel()
  requestDraw()
}

async function loadMapAssets() {
  caveEntrances.value = []
  try {
    const response = await fetch('/api/maps/manifest', {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok)
      throw new Error(`Map manifest returned ${response.status}.`)
    const value = (await response.json()) as MapAssetManifest
    mapAssets.value =
      value && typeof value.available === 'boolean' && value.regions
        ? value
        : { available: false, regions: {} }
    if (mapAssets.value.caveEntrancesUrl) {
      const caveResponse = await fetch(mapAssets.value.caveEntrancesUrl, {
        headers: { Accept: 'application/json' },
      })
      if (caveResponse.ok) {
        const caves = (await caveResponse.json()) as unknown
        if (Array.isArray(caves) && caves.length <= 5_000) {
          caveEntrances.value = caves.filter(
            (entry): entry is CaveEntrance =>
              Boolean(entry) &&
              typeof entry.id === 'string' &&
              typeof entry.label === 'string' &&
              typeof entry.x === 'number' &&
              Number.isFinite(entry.x) &&
              typeof entry.y === 'number' &&
              Number.isFinite(entry.y),
          )
        }
      }
    }
  } catch {
    mapAssets.value = { available: false, regions: {} }
    caveEntrances.value = []
  }
}

onMounted(() => {
  disposed = false
  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize({ animate: false, pan: false })
    requestDraw()
  })
  if (host.value) resizeObserver.observe(host.value)
  void nextTick(async () => {
    await loadMapAssets()
    await initializeMap()
  })
})

onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
  map?.off()
  map?.remove()
  map = undefined
  mapBounds = undefined
  terrainLayer = undefined
  replaceTerrainLayer = undefined
  zoomAnimating = false
  zoomBaseTopLeft = undefined
  zoomBaseLevel = undefined
})

watch(
  () => props.actors,
  () => {
    hoveredActor.value = null
    selectedActor.value = null
    hoveredEntrance.value = null
    requestDraw()
  },
)
watch(caveStageOptions, (options) => {
  if (!options.length) {
    activeCaveStage.value = 'all'
    caveStageSelectionTouched = false
  } else if (!caveStageSelectionTouched) {
    activeCaveStage.value = options[0]?.stage ?? 'all'
  } else if (
    activeCaveStage.value !== 'all' &&
    !options.some(({ stage }) => stage === activeCaveStage.value)
  ) {
    activeCaveStage.value = options[0]?.stage ?? 'all'
  }
  requestDraw()
})
watch(region, loadRegionTerrain)
watch(selectedActor, requestDraw)
watch(selectedEntrance, requestDraw)
</script>

<template>
  <div
    ref="host"
    class="world-map-stage"
    @pointerdown="beginPointer"
    @pointermove="inspectPoint"
    @pointerup="endPointer"
    @pointercancel="endPointer"
    @pointerleave="leavePointer"
    @click="selectPoint"
  >
    <div
      ref="mapElement"
      class="world-map-leaflet"
      role="region"
      tabindex="0"
      :aria-label="
        region === 'caves'
          ? `Interactive local cave schematic with ${positionedActors.length.toLocaleString()} positioned actors. Use arrow keys to pan and plus or minus to zoom.`
          : `Interactive ${regionMeta.label} terrain map with ${positionedActors.length.toLocaleString()} positioned actors and ${positionedEntrances.length.toLocaleString()} cave entrances. Use arrow keys to pan and plus or minus to zoom.`
      "
    />
    <canvas ref="canvas" class="world-map-canvas" aria-hidden="true" />

    <div class="world-map-regions" role="group" aria-label="World map region">
      <button
        v-for="candidate in regionOptions"
        :key="candidate.id"
        type="button"
        :aria-pressed="region === candidate.id"
        :class="{ active: region === candidate.id }"
        @click.stop="selectRegion(candidate.id)"
      >
        <TreePine v-if="candidate.id === 'world-tree'" :size="13" />
        <Pickaxe v-else-if="candidate.id === 'caves'" :size="13" />
        <MapPinned v-else :size="13" />
        {{
          candidate.id === 'palpagos'
            ? 'Islands'
            : candidate.id === 'world-tree'
              ? 'World Tree'
              : 'Caves'
        }}
      </button>
    </div>

    <label
      v-if="region === 'caves'"
      class="cave-stage-control"
      @pointerdown.stop
      @click.stop
    >
      <span>LIVE STAGE</span>
      <select
        :value="activeCaveStage"
        :disabled="!caveStageOptions.length"
        @change="selectCaveStage"
      >
        <option v-if="!caveStageOptions.length" value="all">
          Waiting for an interior Stage
        </option>
        <option v-else value="all">
          All live stages ·
          {{ caveStageOptions.reduce((sum, item) => sum + item.count, 0) }}
          actors
        </option>
        <option
          v-for="item in caveStageOptions"
          :key="item.stage"
          :value="item.stage"
          :title="item.stage"
        >
          {{ item.stage }} · {{ item.count }}
        </option>
      </select>
      <small>Exact GameData Stage values · floorplan schematic</small>
    </label>

    <div class="world-map-controls" aria-label="Map controls">
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        @click.stop="zoomIn"
      >
        <Plus :size="16" />
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        @click.stop="zoomOut"
      >
        <Minus :size="16" />
      </button>
      <button
        type="button"
        title="Fit the full map"
        aria-label="Fit the full map"
        @click.stop="fitMap"
      >
        <Scan :size="15" />
      </button>
      <button
        v-if="region !== 'caves'"
        type="button"
        title="Toggle terrain"
        aria-label="Toggle terrain"
        :aria-pressed="terrainVisible"
        :class="{ inactive: !terrainVisible }"
        @click.stop="toggleTerrain"
      >
        <Layers3 :size="15" />
      </button>
      <button
        type="button"
        title="Toggle coordinate grid"
        aria-label="Toggle coordinate grid"
        :aria-pressed="gridVisible"
        :class="{ inactive: !gridVisible }"
        @click.stop="toggleGrid"
      >
        <Grid3X3 :size="15" />
      </button>
      <button
        v-if="region !== 'caves'"
        type="button"
        title="Toggle cave entrances"
        aria-label="Toggle cave entrances"
        :aria-pressed="entrancesVisible"
        :class="{ inactive: !entrancesVisible }"
        @click.stop="toggleEntrances"
      >
        <Pickaxe :size="15" />
      </button>
      <span>{{ zoomLabel }}</span>
    </div>

    <div
      v-if="terrainState === 'error' && region !== 'caves'"
      class="world-map-fallback"
      role="status"
    >
      {{ regionMeta.label }} terrain not installed · run pnpm maps:sync · grid
      fallback active
    </div>

    <div
      v-if="!positionedActors.length"
      class="world-map-empty"
      :class="{ 'cave-empty': region === 'caves' }"
    >
      <Pickaxe v-if="region === 'caves'" :size="30" />
      <MapPinned v-else :size="34" />
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyCopy }}</span>
    </div>

    <div
      v-if="inspectedActor && inspectedPosition"
      class="map-inspector"
      :class="{ pinned: selectedActor }"
      :style="tooltipStyle"
    >
      <button
        v-if="selectedActor"
        type="button"
        aria-label="Close actor details"
        @click.stop="clearSelection"
      >
        <X :size="13" />
      </button>
      <div class="map-inspector-title">
        <span
          :style="{
            backgroundColor: actorCategoryMeta[inspectedCategory].color,
          }"
        />
        <strong>{{ actorDisplayName(inspectedActor) }}</strong>
      </div>
      <p>
        {{ actorCategoryMeta[inspectedCategory].label
        }}<template v-if="inspectedActor.level != null">
          · Level {{ inspectedActor.level }}</template
        >
      </p>
      <dl>
        <div>
          <dt>X</dt>
          <dd>{{ Math.round(inspectedPosition.x).toLocaleString() }}</dd>
        </div>
        <div>
          <dt>Y</dt>
          <dd>{{ Math.round(inspectedPosition.y).toLocaleString() }}</dd>
        </div>
        <div>
          <dt>Z</dt>
          <dd>
            {{
              inspectedPosition.z == null
                ? '—'
                : Math.round(inspectedPosition.z).toLocaleString()
            }}
          </dd>
        </div>
      </dl>
      <div v-if="actorStage(inspectedActor)" class="map-inspector-stage">
        <span>Stage</span><code>{{ actorStage(inspectedActor) }}</code>
      </div>
    </div>

    <div
      v-else-if="inspectedEntrance"
      class="map-inspector entrance-inspector"
      :class="{ pinned: selectedEntrance }"
      :style="tooltipStyle"
    >
      <button
        v-if="selectedEntrance"
        type="button"
        aria-label="Close cave entrance details"
        @click.stop="clearSelection"
      >
        <X :size="13" />
      </button>
      <div class="map-inspector-title">
        <span class="entrance-marker" />
        <strong>{{ inspectedEntrance.label }}</strong>
      </div>
      <p>Surface dungeon portal · static 1.0 map data</p>
      <dl>
        <div>
          <dt>X</dt>
          <dd>{{ Math.round(inspectedEntrance.x).toLocaleString() }}</dd>
        </div>
        <div>
          <dt>Y</dt>
          <dd>{{ Math.round(inspectedEntrance.y).toLocaleString() }}</dd>
        </div>
        <div>
          <dt>LAYER</dt>
          <dd>ENTRANCE</dd>
        </div>
      </dl>
    </div>

    <div class="map-coordinate-note">
      <LocateFixed :size="12" />
      {{
        region === 'caves'
          ? 'Local −10k…+10k instance plane · schematic, not terrain'
          : 'Live X/Y grid · gold diamonds are cave entrances'
      }}
    </div>
    <p class="sr-only" aria-live="polite">{{ mapStatus }}</p>
  </div>
</template>
