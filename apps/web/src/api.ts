export type ApiEndpoint =
  | 'info'
  | 'players'
  | 'settings'
  | 'metrics'
  | 'game-data'
  | 'announce'
  | 'kick'
  | 'ban'
  | 'unban'
  | 'save'
  | 'shutdown'
  | 'stop'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function palworldApi<T>(
  endpoint: ApiEndpoint,
  options?: {
    method?: 'GET' | 'POST'
    body?: Record<string, unknown>
    signal?: AbortSignal
  },
): Promise<T> {
  const response = await fetch(`/api/palworld/${endpoint}`, {
    method: options?.method ?? 'GET',
    headers:
      options?.method === 'POST'
        ? {
            'X-PalHarbor-Request': '1',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          }
        : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: options?.signal,
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  } & T
  if (!response.ok) {
    throw new ApiError(
      payload.error ?? `Request failed with status ${response.status}.`,
      response.status,
    )
  }
  return payload
}

export async function activityApi<T>(
  days: number,
  signal?: AbortSignal,
): Promise<T> {
  const search = new URLSearchParams({ days: String(days) })
  const response = await fetch(`/api/activity/summary?${search}`, { signal })
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
  } & T

  if (!response.ok) {
    throw new ApiError(
      payload.error ?? `Request failed with status ${response.status}.`,
      response.status,
    )
  }
  return payload
}
