import { describe, expect, it } from 'vitest'
import type { Actor } from './types'
import {
  actorStage,
  normalizeActorStage,
  summarizeCaveStages,
} from './cave-map'

describe('cave map data', () => {
  it('keeps exact non-surface Stage values and ignores blank or None values', () => {
    expect(normalizeActorStage(undefined)).toBeNull()
    expect(normalizeActorStage('')).toBeNull()
    expect(normalizeActorStage(' none ')).toBeNull()
    expect(normalizeActorStage('  6E342CCB4D5A  ')).toBe('6E342CCB4D5A')
    expect(actorStage({ Stage: 'Dungeon_Instance_01' })).toBe(
      'Dungeon_Instance_01',
    )
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
