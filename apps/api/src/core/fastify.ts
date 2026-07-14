import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import { createLoggerConfig } from './logger.js'

const JSON_BODY_LIMIT_BYTES = 128 * 1024

export type FastifyFactoryOptions = {
  logger?: FastifyServerOptions['logger']
}

export function createFastify(options: FastifyFactoryOptions = {}): FastifyInstance {
  return Fastify({
    bodyLimit: JSON_BODY_LIMIT_BYTES,
    logger: options.logger ?? createLoggerConfig(),
  })
}
