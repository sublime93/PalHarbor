import { describe, expect, it } from 'vitest'
import type { Actor } from './types'
import {
  CAVE_ENTRANCES,
  actorStage,
  normalizeActorStage,
  summarizeCaveStages,
} from './cave-map'
import { isLocationInRegionBounds } from './world-map'

describe('cave map data', () => {
  it('publishes the Palworld 1.0 dungeon entrance dataset inside Palpagos bounds', () => {
    expect(CAVE_ENTRANCES).toHaveLength(170)
    expect(new Set(CAVE_ENTRANCES.map(({ id }) => id)).size).toBe(CAVE_ENTRANCES.length)
    expect(new Set(CAVE_ENTRANCES.map(({ x, y }) => `${x},${y}`)).size).toBe(CAVE_ENTRANCES.length)
    expect(CAVE_ENTRANCES.every(({ x, y }) => isLocationInRegionBounds('palpagos', x, y))).toBe(true)
  })

  it('keeps exact non-surface Stage values and ignores blank or None values', () => {
    expect(normalizeActorStage(undefined)).toBeNull()
    expect(normalizeActorStage('')).toBeNull()
    expect(normalizeActorStage(' none ')).toBeNull()
    expect(normalizeActorStage('  6E342CCB4D5A  ')).toBe('6E342CCB4D5A')
    expect(actorStage({ Stage: 'Dungeon_Instance_01' })).toBe('Dungeon_Instance_01')
  })

  it('groups actors only by their exact raw Stage value', () => {
    const actors: Actor[] = [
      { Stage: 'None' },
      { Stage: 'Dungeon-A' },
      { Stage: 'Dungeon-B' },
      { Stage: 'Dungeon-A' },
    ]
    expect(summarizeCaveStages(actors)).toEqual([
      { stage: 'Dungeon-A', count: 2 },
      { stage: 'Dungeon-B', count: 1 },
    ])
  })
})
