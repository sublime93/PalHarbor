export type GatewayConfig = {
  apiUrl: string
  username: string
  password: string
}

export type ServerConfig = {
  host: string
  port: number
  allowUnauthenticatedRemote: boolean
}

export type AccessConfig = {
  username: string
  password: string
  allowedHosts: string[]
  allowedOrigins: string[]
}

export type ActivityConfig = {
  enabled: boolean
  databaseUrl?: string
  databasePath?: string
  pollIntervalMs: number
  retentionDays: number
  storeIpAddresses: boolean
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_ACTIVITY_POLL_SECONDS = 15
const DEFAULT_ACTIVITY_RETENTION_DAYS = 90

function enabled(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function list(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
}

export function loadGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  return {
    apiUrl: (env.PALWORLD_API_URL ?? '').replace(/\/+$/, ''),
    username: env.PALWORLD_USERNAME ?? '',
    password: env.PALWORLD_PASSWORD ?? '',
  }
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const port = Number(env.PORT ?? DEFAULT_PORT)

  return {
    host: env.HOST || DEFAULT_HOST,
    port:
      Number.isInteger(port) && port >= 0 && port <= 65_535
        ? port
        : DEFAULT_PORT,
    allowUnauthenticatedRemote: enabled(env.ALLOW_UNAUTHENTICATED_REMOTE),
  }
}

export function loadAccessConfig(
  env: NodeJS.ProcessEnv = process.env,
): AccessConfig {
  return {
    username: env.PALHARBOR_USERNAME?.trim() ?? '',
    password: env.PALHARBOR_PASSWORD ?? '',
    allowedHosts: list(env.PALHARBOR_ALLOWED_HOSTS),
    allowedOrigins: list(env.PALHARBOR_ALLOWED_ORIGINS),
  }
}

export function loadActivityConfig(
  env: NodeJS.ProcessEnv = process.env,
): ActivityConfig {
  const pollSeconds = Number(
    env.ACTIVITY_POLL_SECONDS ?? DEFAULT_ACTIVITY_POLL_SECONDS,
  )
  const boundedSeconds =
    Number.isFinite(pollSeconds) && pollSeconds >= 5 && pollSeconds <= 300
      ? pollSeconds
      : DEFAULT_ACTIVITY_POLL_SECONDS
  const databasePath = env.ACTIVITY_DATABASE_PATH?.trim()
  const databaseUrl = env.DATABASE_URL?.trim()
  const retentionDays = Number(
    env.ACTIVITY_RETENTION_DAYS ?? DEFAULT_ACTIVITY_RETENTION_DAYS,
  )
  const boundedRetentionDays =
    Number.isInteger(retentionDays) &&
    retentionDays >= 1 &&
    retentionDays <= 3_650
      ? retentionDays
      : DEFAULT_ACTIVITY_RETENTION_DAYS

  return {
    enabled: enabled(env.ACTIVITY_ENABLED, true),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(databasePath ? { databasePath } : {}),
    pollIntervalMs: Math.round(boundedSeconds * 1_000),
    retentionDays: boundedRetentionDays,
    storeIpAddresses: enabled(env.STORE_PLAYER_IPS, false),
  }
}

export function isGatewayConfigured(config: GatewayConfig): boolean {
  return Boolean(config.apiUrl && config.username && config.password)
}

export function isAccessConfigured(config: AccessConfig): boolean {
  return Boolean(config.username && config.password)
}

export function assertValidAccessConfig(config: AccessConfig): void {
  if (Boolean(config.username) !== Boolean(config.password)) {
    throw new Error(
      'PALHARBOR_USERNAME and PALHARBOR_PASSWORD must be configured together.',
    )
  }
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
  )
}

export function assertSafeServerExposure(
  server: ServerConfig,
  access: AccessConfig,
): void {
  assertValidAccessConfig(access)
  if (
    !isLoopbackHost(server.host) &&
    !isAccessConfigured(access) &&
    !server.allowUnauthenticatedRemote
  ) {
    throw new Error(
      'Refusing to bind PalHarbor beyond localhost without authentication. ' +
        'Set PALHARBOR_USERNAME and PALHARBOR_PASSWORD, or explicitly acknowledge the risk ' +
        'with ALLOW_UNAUTHENTICATED_REMOTE=true when an authenticated proxy protects it.',
    )
  }
}
