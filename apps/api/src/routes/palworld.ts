import type { GatewayConfig } from '../core/config.js'
import { isGatewayConfigured } from '../core/config.js'
import { getEndpointRule, type PalworldEndpoint } from '../palworld/endpoints.js'
import { InvalidGameDataError } from '../palworld/game-data.js'
import { PalworldConnectionError, PalworldService } from '../palworld/service.js'
import type { PrimitiveRoute } from '../router.js'

const GATEWAY_METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const
const REQUEST_MARKER_HEADER = 'x-paldeck-request'

type PalworldParams = {
  endpoint: string
}

export function createPalworldRoute(
  config: GatewayConfig,
  service: PalworldService,
): PrimitiveRoute {
  return {
    method: [...GATEWAY_METHODS],
    url: '/api/palworld/:endpoint',
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store')

      const { endpoint } = request.params as PalworldParams
      const rule = getEndpointRule(endpoint)

      if (!rule) {
        return reply.code(404).send({ error: 'Unknown Palworld API endpoint.' })
      }

      if (!rule.methods.has(request.method)) {
        return reply
          .header('Allow', [...rule.methods].join(', '))
          .code(405)
          .send({ error: `${request.method} is not allowed for ${endpoint}.` })
      }

      if (request.method === 'POST' && request.headers[REQUEST_MARKER_HEADER] !== '1') {
        return reply.code(403).send({ error: 'This action requires a Paldeck request header.' })
      }

      if (!isGatewayConfigured(config)) {
        return reply.code(503).send({ error: 'The Palworld connection is not configured.' })
      }

      try {
        const result = await service.request(
          endpoint as PalworldEndpoint,
          rule,
          request.method,
          request.body,
        )
        return reply.code(result.status).send(result.payload)
      } catch (error) {
        const failure = error instanceof PalworldConnectionError ? error : undefined
        const invalidGameData = error instanceof InvalidGameDataError

        // Intentionally omit the caught error/config: either can contain upstream secrets.
        request.log.warn(
          { endpoint, failure: invalidGameData ? 'invalid-response' : (failure?.kind ?? 'unreachable') },
          'Palworld upstream request failed',
        )

        return reply.code(502).send({
          error: invalidGameData
            ? error.message
            : (failure?.message ?? 'The Palworld server could not be reached from this machine.'),
        })
      }
    },
  }
}
