import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Migration = {
  version: number
  name: string
  sql: string
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'players and connection sessions',
    sql: `
      CREATE TABLE players (
        user_id TEXT PRIMARY KEY,
        player_id TEXT,
        name TEXT NOT NULL DEFAULT '',
        account_name TEXT NOT NULL DEFAULT '',
        last_level INTEGER,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
        connected_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        disconnected_at INTEGER,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        CHECK (
          (active = 1 AND disconnected_at IS NULL)
          OR (active = 0 AND disconnected_at IS NOT NULL)
        )
      ) STRICT;

      CREATE UNIQUE INDEX one_active_session_per_player
        ON sessions(user_id) WHERE active = 1;
      CREATE INDEX sessions_connected_at ON sessions(connected_at DESC);
      CREATE INDEX sessions_user_connected_at ON sessions(user_id, connected_at DESC);
      CREATE INDEX sessions_active ON sessions(active);
    `,
  },
  {
    version: 2,
    name: 'historical player IP observations',
    sql: `
      CREATE TABLE player_ip_observations (
        user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
        ip_address TEXT NOT NULL CHECK (length(ip_address) BETWEEN 2 AND 45),
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count >= 1),
        PRIMARY KEY (user_id, ip_address),
        CHECK (first_seen_at <= last_seen_at)
      ) STRICT;

      CREATE INDEX player_ip_observations_last_seen
        ON player_ip_observations(last_seen_at DESC);
      CREATE INDEX player_ip_observations_address
        ON player_ip_observations(ip_address, last_seen_at DESC);
    `,
  },
  {
    version: 3,
    name: 'daily player latency rollups',
    sql: `
      CREATE TABLE player_latency_daily (
        user_id TEXT NOT NULL REFERENCES players(user_id) ON DELETE CASCADE,
        day_start INTEGER NOT NULL CHECK (day_start >= 0 AND day_start % 86400000 = 0),
        latency_sum_ms REAL NOT NULL CHECK (latency_sum_ms >= 0),
        sample_count INTEGER NOT NULL CHECK (sample_count >= 1),
        PRIMARY KEY (user_id, day_start)
      ) STRICT;

      CREATE INDEX player_latency_daily_day_start
        ON player_latency_daily(day_start, user_id);
    `,
  },
]

export function migrateActivityDatabase(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS activity_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `)

  const appliedRows = database
    .prepare('SELECT version FROM activity_migrations')
    .all() as Array<{ version: number }>
  const applied = new Set(appliedRows.map((row) => Number(row.version)))
  const recordMigration = database.prepare(
    'INSERT INTO activity_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue

    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      recordMigration.run(migration.version, migration.name, Date.now())
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

export function openActivityDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })

  const database = new DatabaseSync(filePath)
  try {
    if (filePath !== ':memory:') {
      database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
      try {
        chmodSync(filePath, 0o600)
      } catch {
        // Permission modes are best-effort on platforms without POSIX semantics.
      }
    }
    migrateActivityDatabase(database)
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
