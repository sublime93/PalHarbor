import type { PrimitiveRoute } from '../router.js'
import type { MapStorage } from '../maps/storage.js'

type AssetParams = { version: string; region: string }
type TileParams = AssetParams & { z: string; x: string; y: string }

export function createMapRoutes(storage: MapStorage): PrimitiveRoute[] {
  return [
    {
      method: 'GET',
      url: '/api/maps/manifest',
      handler: async (_request, reply) =>
        reply
          .header('Cache-Control', 'no-store')
          .send(await storage.manifest()),
    },
    {
      method: 'GET',
      url: '/api/maps/assets/:version/cave-entrances.json',
      handler: async (request, reply) => {
        const { version } = request.params as Pick<AssetParams, 'version'>
        const asset = await storage.caveEntrances(version)
        if (!asset)
          return reply
            .code(404)
            .send({ error: 'Cave entrance data not found.' })
        return reply
          .type('application/json; charset=utf-8')
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send(asset)
      },
    },
    {
      method: 'GET',
      url: '/api/maps/assets/:version/:region/fallback.webp',
      handler: async (request, reply) => {
        const { version, region } = request.params as AssetParams
        const asset = await storage.fallback(version, region)
        if (!asset)
          return reply.code(404).send({ error: 'Map asset not found.' })
        return reply
          .type('image/webp')
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send(asset)
      },
    },
    {
      method: 'GET',
      url: '/api/maps/assets/:version/:region/tiles/:z/:x/:y.webp',
      handler: async (request, reply) => {
        const { version, region, z, x, y } = request.params as TileParams
        const asset = await storage.tile(version, region, z, x, y)
        if (!asset)
          return reply.code(404).send({ error: 'Map tile not found.' })
        return reply
          .type('image/webp')
          .header('Cache-Control', 'public, max-age=31536000, immutable')
          .send(asset)
      },
    },
  ]
}
