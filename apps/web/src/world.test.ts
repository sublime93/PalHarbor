import { describe, expect, it } from 'vitest'
import {
  actorCategory,
  actorDisplayName,
  actorPosition,
  calculateWorldBounds,
} from './world'

describe('world actor helpers', () => {
  it('classifies characters and Palboxes', () => {
    expect(actorCategory({ Type: 'Character', UnitType: 'Player' })).toBe('Player')
    expect(actorCategory({ Type: 'Character', UnitType: 'WildPal' })).toBe('WildPal')
    expect(actorCategory({ Type: 'PalBox', UnitType: 'Player' })).toBe('PalBox')
    expect(actorCategory({ Type: 'SomethingNew' })).toBe('Unknown')
  })

  it('builds useful labels from the most specific available identity', () => {
    expect(actorDisplayName({ NickName: 'Lamball', Class: 'PalSheep' })).toBe('Lamball')
    expect(actorDisplayName({ Type: 'PalBox', Name: 'Main Base Palbox' })).toBe('Main Base Palbox')
    expect(actorDisplayName({ Type: 'PalBox', GuildName: 'Island Crew' })).toBe('Island Crew Palbox')
    expect(actorDisplayName({ Type: 'Character', UnitType: 'NPC' })).toBe('NPC')
  })

  it('accepts finite coordinates and rejects incomplete positions', () => {
    expect(actorPosition({ LocationX: 120, LocationY: -45, LocationZ: 8 })).toEqual({ x: 120, y: -45, z: 8 })
    expect(actorPosition({ LocationX: 120 })).toBeNull()
    expect(actorPosition({ LocationX: Number.NaN, LocationY: 12 })).toBeNull()
  })

  it('pads the observed world extent and gives a useful minimum viewport', () => {
    const bounds = calculateWorldBounds([
      { LocationX: -500, LocationY: -250 },
      { LocationX: 500, LocationY: 250 },
    ])
    expect(bounds.minX).toBeLessThan(-500)
    expect(bounds.maxX).toBeGreaterThan(500)
    expect(bounds.minY).toBeLessThan(-250)
    expect(bounds.maxY).toBeGreaterThan(250)
  })
})
