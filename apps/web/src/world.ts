import type { Actor } from './types'

export const actorCategoryOrder = [
  'Player',
  'OtomoPal',
  'BaseCampPal',
  'WildPal',
  'NPC',
  'PalBox',
  'Unknown',
] as const

export type ActorCategory = typeof actorCategoryOrder[number]

export const actorCategoryMeta: Record<ActorCategory, { label: string; color: string }> = {
  Player: { label: 'Players', color: '#58d7dd' },
  OtomoPal: { label: 'Companion Pals', color: '#f7ba54' },
  BaseCampPal: { label: 'Base Pals', color: '#6bd59b' },
  WildPal: { label: 'Wild Pals', color: '#ae8df4' },
  NPC: { label: 'NPCs', color: '#ef7c8e' },
  PalBox: { label: 'Palboxes', color: '#78a5ff' },
  Unknown: { label: 'Other actors', color: '#78949d' },
}

export type WorldPosition = {
  x: number
  y: number
  z: number | null
}

export type WorldBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

export function actorCategory(actor: Actor): ActorCategory {
  if (actor.Type === 'PalBox') return 'PalBox'
  if (actorCategoryOrder.includes(actor.UnitType as ActorCategory)) {
    return actor.UnitType as ActorCategory
  }
  return 'Unknown'
}

export function actorDisplayName(actor: Actor): string {
  return actor.NickName
    || actor.Name
    || actor.TrainerNickName
    || (actor.Type === 'PalBox' ? actor.GuildName && `${actor.GuildName} Palbox` : undefined)
    || actor.Class
    || actor.UnitType
    || actor.Type
    || 'Unknown actor'
}

export function actorPosition(actor: Actor): WorldPosition | null {
  const x = finiteNumber(actor.LocationX)
  const y = finiteNumber(actor.LocationY)
  if (x === null || y === null) return null
  return { x, y, z: finiteNumber(actor.LocationZ) }
}

export function calculateWorldBounds(actors: Actor[]): WorldBounds {
  const positions = actors.map(actorPosition).filter((value): value is WorldPosition => value !== null)
  if (!positions.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 }

  let minX = positions[0]?.x ?? -1
  let maxX = minX
  let minY = positions[0]?.y ?? -1
  let maxY = minY
  for (const position of positions.slice(1)) {
    minX = Math.min(minX, position.x)
    maxX = Math.max(maxX, position.x)
    minY = Math.min(minY, position.y)
    maxY = Math.max(maxY, position.y)
  }
  const minimumSpan = 1_000
  const xSpan = Math.max(maxX - minX, minimumSpan)
  const ySpan = Math.max(maxY - minY, minimumSpan)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const paddingX = xSpan * 0.04
  const paddingY = ySpan * 0.04

  minX = centerX - xSpan / 2 - paddingX
  maxX = centerX + xSpan / 2 + paddingX
  minY = centerY - ySpan / 2 - paddingY
  maxY = centerY + ySpan / 2 + paddingY
  return { minX, maxX, minY, maxY }
}
