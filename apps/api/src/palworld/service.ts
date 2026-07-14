import type { GatewayConfig } from '../core/config.js'
import type { EndpointRule, PalworldEndpoint } from './endpoints.js'
import { InvalidGameDataError, normalizeGameDataSnapshot } from './game-data.js'

export type PalworldProxyResponse = {
  status: number
  payload: unknown
}

export type PalworldConnectionFailure = 'timeout' | 'unreachable'

export class PalworldConnectionError extends Error {
  constructor(readonly kind: PalworldConnectionFailure) {
    super(kind === 'timeout'
      ? 'The Palworld server did not respond in time.'
      : 'The Palworld server could not be reached from this machine.')
    this.name = 'PalworldConnectionError'
  }
}

function safeUpstreamMessage(status: number): string {
  if (status === 401) return 'The Palworld server rejected the admin credentials.'
  if (status === 404) return 'This endpoint is not available on the Palworld server.'
  return `The Palworld server returned status ${status}.`
}

function looksLikeJson(contentType: string, body: string): boolean {
  return contentType.includes('application/json') || /^[\s]*[\[{]/.test(body)
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function hasJsonBody(method: string, body: unknown): boolean {
  if (method !== 'POST' || body === null || body === undefined) return false
  if (typeof body !== 'object') return true
  return Object.keys(body).length > 0
}

function normalizeSuccessfulPayload(endpoint: PalworldEndpoint, payload: unknown): unknown {
  return endpoint === 'game-data' ? normalizeGameDataSnapshot(payload) : payload
}

export class PalworldService {
  constructor(
    private readonly config: GatewayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request(
    endpoint: PalworldEndpoint,
    rule: EndpointRule,
    method: string,
    body: unknown,
  ): Promise<PalworldProxyResponse> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), rule.timeoutMs)

    try {
      const includeBody = hasJsonBody(method, body)
      const upstream = await this.fetchImpl(`${this.config.apiUrl}/${endpoint}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
          Accept: 'application/json',
          ...(includeBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: includeBody ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      const bodyText = await upstream.text()
      const contentType = upstream.headers.get('content-type') ?? ''

      if (!upstream.ok) {
        const detail = bodyText && looksLikeJson(contentType, bodyText)
          ? parseJson(bodyText)
          : undefined

        return {
          status: upstream.status,
          payload: {
            error: safeUpstreamMessage(upstream.status),
            ...(detail ? { detail } : {}),
          },
        }
      }

      if (!bodyText) {
        if (endpoint === 'game-data') throw new InvalidGameDataError()
        return { status: upstream.status, payload: { ok: true } }
      }

      if (looksLikeJson(contentType, bodyText)) {
        const parsed = parseJson(bodyText)
        if (parsed !== undefined) {
          return {
            status: upstream.status,
            payload: normalizeSuccessfulPayload(endpoint, parsed),
          }
        }
      }

      if (endpoint === 'game-data') throw new InvalidGameDataError()

      return {
        status: upstream.status,
        payload: { ok: true, message: bodyText.slice(0, 2_000) },
      }
    } catch (error) {
      if (error instanceof InvalidGameDataError) throw error
      const timedOut = error instanceof Error && error.name === 'AbortError'
      throw new PalworldConnectionError(timedOut ? 'timeout' : 'unreachable')
    } finally {
      clearTimeout(timeout)
    }
  }
}
