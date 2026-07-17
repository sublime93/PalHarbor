import type { PalworldEndpoint } from './endpoints.js'

type JsonObject = Record<string, unknown>

export class InvalidPalworldRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPalworldRequestError'
  }
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidPalworldRequestError(
      'The request body must be a JSON object.',
    )
  }
  return value as JsonObject
}

function exactKeys(value: JsonObject, allowed: readonly string[]): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length) {
    throw new InvalidPalworldRequestError(
      `Unexpected request field: ${unexpected[0]}.`,
    )
  }
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  options: { optional?: boolean } = {},
): string | undefined {
  if (value === undefined && options.optional) return undefined
  if (typeof value !== 'string') {
    throw new InvalidPalworldRequestError(`${label} must be a string.`)
  }
  const normalized = value.trim()
  if (!normalized)
    throw new InvalidPalworldRequestError(`${label} must not be empty.`)
  if (normalized.length > maximum) {
    throw new InvalidPalworldRequestError(
      `${label} must be ${maximum} characters or fewer.`,
    )
  }
  return normalized
}

function noBody(value: unknown): undefined {
  if (value === undefined || value === null) return undefined
  const body = object(value)
  exactKeys(body, [])
  return undefined
}

export function validatePalworldRequestBody(
  endpoint: PalworldEndpoint,
  method: string,
  value: unknown,
): unknown {
  if (method !== 'POST') return undefined

  switch (endpoint) {
    case 'announce': {
      const body = object(value)
      exactKeys(body, ['message'])
      return { message: text(body.message, 'message', 500) }
    }
    case 'kick':
    case 'ban': {
      const body = object(value)
      exactKeys(body, ['userid', 'message'])
      const message = text(body.message, 'message', 500, { optional: true })
      return {
        userid: text(body.userid, 'userid', 256),
        ...(message ? { message } : {}),
      }
    }
    case 'unban': {
      const body = object(value)
      exactKeys(body, ['userid'])
      return { userid: text(body.userid, 'userid', 256) }
    }
    case 'shutdown': {
      const body = object(value)
      exactKeys(body, ['waittime', 'message'])
      if (
        !Number.isInteger(body.waittime) ||
        (body.waittime as number) < 0 ||
        (body.waittime as number) > 3_600
      ) {
        throw new InvalidPalworldRequestError(
          'waittime must be an integer from 0 through 3600.',
        )
      }
      const message = text(body.message, 'message', 500, { optional: true })
      return {
        waittime: body.waittime,
        ...(message ? { message } : {}),
      }
    }
    case 'save':
    case 'stop':
      return noBody(value)
    case 'info':
    case 'players':
    case 'settings':
    case 'metrics':
    case 'game-data':
      return undefined
  }
}
