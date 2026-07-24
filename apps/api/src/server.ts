import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import {
  assertSafeServerExposure,
  loadAccessConfig,
  loadServerConfig,
} from './core/config.js'
import {
  isStartupMapSyncEnabled,
  synchronizeMapsAtStartup,
} from './maps/startup-sync.js'

export { createApp } from './app.js'
export type { CreateAppOptions } from './app.js'
export type {
  AccessConfig,
  GatewayConfig,
  ServerConfig,
} from './core/config.js'

const isMain = Boolean(
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url),
)

if (isMain) {
  const serverConfig = loadServerConfig()
  const access = loadAccessConfig()
  const { host, port } = serverConfig
  assertSafeServerExposure(serverConfig, access)
  const app = createApp(undefined, fetch, { access })

  try {
    try {
      if (isStartupMapSyncEnabled()) {
        app.log.info('Automatic map synchronization starting')
      }
      const result = await synchronizeMapsAtStartup()
      if (result) {
        app.log.info({ result }, 'Automatic map synchronization completed')
      }
    } catch (error) {
      app.log.warn(
        { err: error },
        'Automatic map synchronization failed; continuing with existing map data',
      )
    }

    const address = await app.listen({ host, port })
    app.log.info({ address }, 'PalHarbor gateway listening')

    let closing = false
    const shutdown = async (signal: string) => {
      if (closing) return
      closing = true
      app.log.info({ signal }, 'PalHarbor gateway shutting down')
      try {
        await app.close()
      } catch (error) {
        app.log.error({ err: error }, 'PalHarbor gateway shutdown failed')
        process.exitCode = 1
      }
    }
    process.once('SIGINT', () => void shutdown('SIGINT'))
    process.once('SIGTERM', () => void shutdown('SIGTERM'))
  } catch (error) {
    app.log.error({ err: error }, 'PalHarbor gateway failed to start')
    process.exitCode = 1
  }
}
