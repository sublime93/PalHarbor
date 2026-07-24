import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP_SOURCE_URLS,
  responseBodyWithinLimit,
  safeVersion,
  strictChildPath,
  validatedRemoteSourceUrl,
} from '../../scripts/sync-map-assets.mjs'

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

  it('uses the built-in HTTPS map source when an override is empty', () => {
    expect(validatedRemoteSourceUrl('', DEFAULT_MAP_SOURCE_URLS.palpagos)).toBe(
      DEFAULT_MAP_SOURCE_URLS.palpagos,
    )
  })

  it.each([
    'http://maps.example.test/world.webp',
    'https://user:secret@maps.example.test/world.webp',
    'https://maps.example.test/world.webp#fragment',
    'not-a-url',
  ])('rejects unsafe remote source URL %j', (url) => {
    expect(() =>
      validatedRemoteSourceUrl(url, DEFAULT_MAP_SOURCE_URLS.palpagos),
    ).toThrow(/remote map source URL|must use HTTPS/)
  })

  it('reads a bounded remote response body', async () => {
    const body = await responseBodyWithinLimit(new Response('map'), 4)
    expect(body.toString('utf8')).toBe('map')
  })

  it('rejects a remote response body that exceeds the limit', async () => {
    await expect(
      responseBodyWithinLimit(new Response('oversized'), 4),
    ).rejects.toThrow(/download limit/)
  })
})
