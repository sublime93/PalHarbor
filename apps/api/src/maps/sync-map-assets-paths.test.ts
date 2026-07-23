import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeVersion, strictChildPath } from '../../scripts/sync-map-assets.mjs'

describe('map synchronization paths', () => {
  it.each(['.', '..', ' . ', ' .. '])(
    'rejects special map version segment %j',
    (version) => {
      expect(() => safeVersion(version)).toThrow(/ordinary directory name/)
    },
  )

  it.each([
    ['1.2.3', '1.2.3'],
    ['v1.2.3', '1.2.3'],
    ['release_1', 'release_1'],
    ['build-7', 'build-7'],
  ])('preserves legitimate map version %j', (version, expected) => {
    expect(safeVersion(version)).toBe(expected)
  })

  it('requires generated paths to stay below the map root', () => {
    const root = resolve('/var/lib/palharbor/maps')

    expect(strictChildPath(root, '1.2.3')).toBe(resolve(root, '1.2.3'))
    expect(() => strictChildPath(root, '.')).toThrow(/below the map root/)
    expect(() => strictChildPath(root, '..')).toThrow(/below the map root/)
    expect(() => strictChildPath(root, '/tmp/escape')).toThrow(
      /below the map root/,
    )
  })
})
