import type { FastifyServerOptions } from 'fastify'

export type FastifyLoggerConfig = FastifyServerOptions['logger']

/**
 * Fastify creates the Pino logger from these options. Keep auth and connection
 * secrets redacted even if a future serializer starts including headers/config.
 */
export function createLoggerConfig(env: NodeJS.ProcessEnv = process.env): FastifyLoggerConfig {
  return {
    level: env.LOG_LEVEL || 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'request.headers.authorization',
        'headers.authorization',
        'authorization',
        'username',
        'password',
        'config.username',
        'config.password',
        '*.authorization',
        '*.username',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  }
}
