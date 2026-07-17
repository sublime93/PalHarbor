import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import {
  assertValidAccessConfig,
  isAccessConfigured,
  loadAccessConfig,
  type AccessConfig,
} from './config.js'
import { createLoggerConfig } from './logger.js'

const JSON_BODY_LIMIT_BYTES = 128 * 1024

export type FastifyFactoryOptions = {
  logger?: FastifyServerOptions['logger']
  access?: AccessConfig
}

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function basicCredentials(
  header: string | undefined,
): { username: string; password: string } | undefined {
  if (!header?.startsWith('Basic ')) return undefined
  try {
    const decoded = Buffer.from(
      header.slice('Basic '.length),
      'base64',
    ).toString('utf8')
    const separator = decoded.indexOf(':')
    if (separator < 0) return undefined
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    }
  } catch {
    return undefined
  }
}

function requestHostname(host: string | undefined): string | undefined {
  if (!host) return undefined
  try {
    return new URL(`http://${host}`).hostname
      .replace(/^\[|\]$/g, '')
      .toLowerCase()
  } catch {
    return undefined
  }
}

function allowedHost(
  host: string | undefined,
  configured: readonly string[],
): boolean {
  const hostname = requestHostname(host)
  if (!hostname) return false
  return (
    hostname === 'localhost' ||
    isIP(hostname) !== 0 ||
    configured.includes(hostname)
  )
}

function normalizedOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin.toLowerCase()
  } catch {
    return undefined
  }
}

function sameRequestOrigin(origin: string, host: string | undefined): boolean {
  try {
    return new URL(origin).host.toLowerCase() === host?.toLowerCase()
  } catch {
    return false
  }
}

function registerSecurityHooks(
  app: FastifyInstance,
  access: AccessConfig,
): void {
  assertValidAccessConfig(access)

  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHost(request.headers.host, access.allowedHosts)) {
      return reply.code(421).send({ error: 'The request Host is not allowed.' })
    }

    if (isAccessConfigured(access)) {
      const credentials = basicCredentials(request.headers.authorization)
      if (
        !credentials ||
        !safeEqual(credentials.username, access.username) ||
        !safeEqual(credentials.password, access.password)
      ) {
        return reply
          .header(
            'WWW-Authenticate',
            'Basic realm="PalHarbor", charset="UTF-8"',
          )
          .code(401)
          .send({ error: 'PalHarbor authentication is required.' })
      }
    }

    const unsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    const origin = request.headers.origin
    const crossSite = request.headers['sec-fetch-site'] === 'cross-site'
    const originAllowed =
      !origin ||
      sameRequestOrigin(origin, request.headers.host) ||
      access.allowedOrigins.includes(normalizedOrigin(origin) ?? '')
    if (unsafeMethod && (crossSite || !originAllowed)) {
      return reply
        .code(403)
        .send({ error: 'Cross-origin mutations are not allowed.' })
    }
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      reply.header(name, value)
    return payload
  })
}

export function createFastify(
  options: FastifyFactoryOptions = {},
): FastifyInstance {
  const app = Fastify({
    bodyLimit: JSON_BODY_LIMIT_BYTES,
    logger: options.logger ?? createLoggerConfig(),
  })
  registerSecurityHooks(app, options.access ?? loadAccessConfig())
  return app
}
