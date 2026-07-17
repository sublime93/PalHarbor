import type { FastifyError, FastifyServerOptions } from 'fastify'

export type FastifyLoggerConfig = FastifyServerOptions['logger']

function redactText(value: string, secrets: readonly string[]): string {
  let redacted = value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, '$1[REDACTED]@')
    .replace(/(authorization:\s*basic\s+)[a-z0-9+/=]+/gi, '$1[REDACTED]')
  for (const secret of secrets) {
    if (secret.length >= 4) redacted = redacted.split(secret).join('[REDACTED]')
  }
  return redacted
}

function errorSerializer(env: NodeJS.ProcessEnv) {
  const secrets = [
    env.PALWORLD_USERNAME,
    env.PALWORLD_PASSWORD,
    env.PALHARBOR_USERNAME,
    env.PALHARBOR_PASSWORD,
    env.DATABASE_URL,
  ].filter((value): value is string => Boolean(value))

  return (
    value: FastifyError,
  ): { type: string; message: string; stack: string } => {
    return {
      type: value.name,
      message: redactText(value.message, secrets),
      stack: redactText(value.stack ?? '', secrets),
    }
  }
}

/**
 * Fastify creates the Pino logger from these options. Keep auth and connection
 * secrets redacted even if a future serializer starts including headers/config.
 */
export function createLoggerConfig(
  env: NodeJS.ProcessEnv = process.env,
): FastifyLoggerConfig {
  return {
    level: env.LOG_LEVEL || 'info',
    serializers: {
      err: errorSerializer(env),
    },
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
