import type { GatewayConfig } from '../core/config.js'
import { isGatewayConfigured } from '../core/config.js'
import type { PrimitiveRoute } from '../router.js'

export function createHealthRoute(config: GatewayConfig): PrimitiveRoute {
  return {
    method: 'GET',
    url: '/api/health',
    handler: async (_request, reply) => {
      return reply
        .header('Cache-Control', 'no-store')
        .send({ configured: isGatewayConfigured(config) })
    },
  }
}
