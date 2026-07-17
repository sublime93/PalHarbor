import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

const packageDirectory = fileURLToPath(new URL('.', import.meta.url))
const apiDirectory = resolve(packageDirectory, '../../apps/api')

loadEnv({ path: resolve(apiDirectory, '.env'), quiet: true })

const defaultDatabasePath = existsSync(
  resolve(apiDirectory, 'data/paldeck.sqlite'),
)
  ? resolve(apiDirectory, 'data/paldeck.sqlite')
  : resolve(apiDirectory, 'data/palharbor.sqlite')
const legacyPath = process.env.ACTIVITY_DATABASE_PATH?.trim()
const configuredUrl =
  process.env.DATABASE_URL?.trim() ||
  pathToFileURL(
    legacyPath ? resolve(apiDirectory, legacyPath) : defaultDatabasePath,
  ).href
const databaseUrl =
  configuredUrl.startsWith('file:') && !configuredUrl.startsWith('file://')
    ? pathToFileURL(resolve(apiDirectory, configuredUrl.slice('file:'.length)))
        .href
    : configuredUrl
const provider =
  databaseUrl.startsWith('postgres://') ||
  databaseUrl.startsWith('postgresql://')
    ? 'postgresql'
    : 'sqlite'

export default defineConfig({
  schema: `prisma/.generated/schema.${provider}.prisma`,
  datasource: { url: databaseUrl },
})
