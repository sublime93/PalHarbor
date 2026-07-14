export type GatewayConfig = {
  apiUrl: string
  username: string
  password: string
}

export type ServerConfig = {
  host: string
  port: number
}

export type ActivityConfig = {
  databaseUrl?: string
  databasePath?: string
  pollIntervalMs: number
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_ACTIVITY_POLL_SECONDS = 15

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return {
    apiUrl: (env.PALWORLD_API_URL ?? '').replace(/\/+$/, ''),
    username: env.PALWORLD_USERNAME ?? '',
    password: env.PALWORLD_PASSWORD ?? '',
  }
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT)

  return {
    host: env.HOST || DEFAULT_HOST,
    port: Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : DEFAULT_PORT,
  }
}

export function loadActivityConfig(env: NodeJS.ProcessEnv = process.env): ActivityConfig {
  const pollSeconds = Number(env.ACTIVITY_POLL_SECONDS ?? DEFAULT_ACTIVITY_POLL_SECONDS)
  const boundedSeconds = Number.isFinite(pollSeconds) && pollSeconds >= 5 && pollSeconds <= 300
    ? pollSeconds
    : DEFAULT_ACTIVITY_POLL_SECONDS
  const databasePath = env.ACTIVITY_DATABASE_PATH?.trim()
  const databaseUrl = env.DATABASE_URL?.trim()

  return {
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(databasePath ? { databasePath } : {}),
    pollIntervalMs: Math.round(boundedSeconds * 1_000),
  }
}

export function isGatewayConfigured(config: GatewayConfig): boolean {
  return Boolean(config.apiUrl && config.username && config.password)
}
