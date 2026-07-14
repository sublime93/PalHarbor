import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadServerConfig } from './core/config.js'

export { createApp } from './app.js'
export type { CreateAppOptions } from './app.js'
export type { GatewayConfig, ServerConfig } from './core/config.js'

const isMain = Boolean(
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url),
)

if (isMain) {
  const { host, port } = loadServerConfig()
  const app = createApp()

  try {
    const address = await app.listen({ host, port })
    app.log.info({ address }, 'Paldeck gateway listening')

    let closing = false
    const shutdown = async (signal: string) => {
      if (closing) return
      closing = true
      app.log.info({ signal }, 'Paldeck gateway shutting down')
      try {
        await app.close()
      } catch (error) {
        app.log.error({ err: error }, 'Paldeck gateway shutdown failed')
        process.exitCode = 1
      }
    }
    process.once('SIGINT', () => void shutdown('SIGINT'))
    process.once('SIGTERM', () => void shutdown('SIGTERM'))
  } catch (error) {
    app.log.error({ err: error }, 'Paldeck gateway failed to start')
    process.exitCode = 1
  }
}
