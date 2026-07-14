import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient as PostgresqlPrismaClient } from '../generated/postgresql/client.js'
import { PrismaClient as SqlitePrismaClient } from '../generated/sqlite/client.js'
import { initializeDatabaseSchema } from './schema.js'

export type DatabaseProvider = 'sqlite' | 'postgresql'
export type DatabaseClient = SqlitePrismaClient

export type Database = {
  client: DatabaseClient
  provider: DatabaseProvider
  url: string
  initialize: () => Promise<void>
  disconnect: () => Promise<void>
}

function providerForUrl(url: string): DatabaseProvider {
  if (url.startsWith('file:')) return 'sqlite'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql'
  throw new TypeError('DATABASE_URL must use file:, postgres:, or postgresql:.')
}

function sqlitePath(url: string): string | undefined {
  const withoutQuery = url.replace(/[?#].*$/, '')
  if (withoutQuery === 'file::memory:') return undefined
  try {
    if (withoutQuery.startsWith('file://')) return fileURLToPath(withoutQuery)
  } catch {
    return undefined
  }
  const path = decodeURIComponent(withoutQuery.slice('file:'.length))
  return resolve(process.cwd(), path)
}

export function createDatabase(url: string): Database {
  const normalizedUrl = url.trim()
  const provider = providerForUrl(normalizedUrl)

  if (provider === 'sqlite') {
    const filePath = sqlitePath(normalizedUrl)
    if (filePath) {
      mkdirSync(dirname(filePath), { recursive: true })
      if (existsSync(filePath)) {
        try {
          chmodSync(filePath, 0o600)
        } catch {
          // Permission modes are best-effort on platforms without POSIX semantics.
        }
      }
    }
    const client = new SqlitePrismaClient({
      adapter: new PrismaLibSql({ url: normalizedUrl }),
    })
    return {
      client,
      provider,
      url: normalizedUrl,
      initialize: async () => {
        await initializeDatabaseSchema(client, provider)
        if (filePath && existsSync(filePath)) {
          try {
            chmodSync(filePath, 0o600)
          } catch {
            // Permission modes are best-effort on platforms without POSIX semantics.
          }
        }
      },
      disconnect: () => client.$disconnect(),
    }
  }

  const postgresqlClient = new PostgresqlPrismaClient({
    adapter: new PrismaPg({
      connectionString: normalizedUrl,
      connectionTimeoutMillis: 5_000,
    }),
  })
  // Both generated clients share the same data model. The provider-specific
  // output is needed only so Prisma can pair each query compiler with its adapter.
  const client = postgresqlClient as unknown as DatabaseClient
  return {
    client,
    provider,
    url: normalizedUrl,
    initialize: () => initializeDatabaseSchema(client, provider),
    disconnect: () => postgresqlClient.$disconnect(),
  }
}
