import type { DatabaseClient, DatabaseProvider } from './client.js'

const sqliteStatements = [
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA journal_mode = WAL',
  `CREATE TABLE IF NOT EXISTS players (
    user_id TEXT NOT NULL PRIMARY KEY,
    player_id TEXT,
    name TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    last_level INTEGER,
    first_seen_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    connected_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    disconnected_at BIGINT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS player_ip_observations (
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    ip_address TEXT NOT NULL,
    first_seen_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    observation_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, ip_address)
  )`,
  `CREATE TABLE IF NOT EXISTS player_latency_daily (
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    day_start BIGINT NOT NULL,
    latency_sum_ms REAL NOT NULL,
    sample_count INTEGER NOT NULL,
    PRIMARY KEY (user_id, day_start)
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_player ON sessions(user_id) WHERE active = true',
  'CREATE INDEX IF NOT EXISTS sessions_connected_at ON sessions(connected_at DESC)',
  'CREATE INDEX IF NOT EXISTS sessions_user_connected_at ON sessions(user_id, connected_at DESC)',
  'CREATE INDEX IF NOT EXISTS sessions_active ON sessions(active)',
  'CREATE INDEX IF NOT EXISTS player_ip_observations_last_seen ON player_ip_observations(last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS player_ip_observations_address ON player_ip_observations(ip_address, last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS player_latency_daily_day_start ON player_latency_daily(day_start, user_id)',
]

const postgresqlStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    user_id TEXT PRIMARY KEY,
    player_id TEXT,
    name TEXT NOT NULL DEFAULT '',
    account_name TEXT NOT NULL DEFAULT '',
    last_level INTEGER,
    first_seen_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    connected_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    disconnected_at BIGINT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true
  )`,
  `CREATE TABLE IF NOT EXISTS player_ip_observations (
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    ip_address TEXT NOT NULL,
    first_seen_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    observation_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, ip_address)
  )`,
  `CREATE TABLE IF NOT EXISTS player_latency_daily (
    user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
    day_start BIGINT NOT NULL,
    latency_sum_ms DOUBLE PRECISION NOT NULL,
    sample_count INTEGER NOT NULL,
    PRIMARY KEY (user_id, day_start)
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_player ON sessions(user_id) WHERE active = true',
  'CREATE INDEX IF NOT EXISTS sessions_connected_at ON sessions(connected_at DESC)',
  'CREATE INDEX IF NOT EXISTS sessions_user_connected_at ON sessions(user_id, connected_at DESC)',
  'CREATE INDEX IF NOT EXISTS sessions_active ON sessions(active)',
  'CREATE INDEX IF NOT EXISTS player_ip_observations_last_seen ON player_ip_observations(last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS player_ip_observations_address ON player_ip_observations(ip_address, last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS player_latency_daily_day_start ON player_latency_daily(day_start, user_id)',
]

export async function initializeDatabaseSchema(
  client: DatabaseClient,
  provider: DatabaseProvider,
): Promise<void> {
  const statements =
    provider === 'sqlite' ? sqliteStatements : postgresqlStatements
  for (const statement of statements) await client.$executeRawUnsafe(statement)
}
