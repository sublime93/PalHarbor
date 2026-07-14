import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import {
  ActivityRepository,
  ActivityTracker,
  openActivityDatabase,
  type ActivityPlayerSnapshot,
} from './activity/index.js'
import {
  loadActivityConfig,
  loadGatewayConfig,
  type GatewayConfig,
} from './core/config.js'
import { createFastify } from './core/fastify.js'
import { endpointRules } from './palworld/endpoints.js'
import { PalworldService } from './palworld/service.js'
import { registerRoutes } from './router.js'
import { createRoutes } from './routes/index.js'

export type CreateAppOptions = {
  logger?: FastifyServerOptions['logger']
  webDist?: string | false
  activity?: false | {
    databasePath?: string
    pollIntervalMs?: number
  }
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const defaultWebDist = resolve(currentDir, '../../web/dist')
const defaultActivityDatabase = resolve(currentDir, '../data/paldeck.sqlite')

export function playerSnapshots(payload: unknown): ActivityPlayerSnapshot[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { players?: unknown }).players)) {
    throw new Error('Palworld players response was malformed.')
  }

  const players = (payload as { players: unknown[] }).players
  return players.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Palworld players response contained an invalid player.')
    }
    const player = value as Record<string, unknown>
    if (typeof player.userId !== 'string' || !player.userId.trim()) {
      throw new Error('Palworld players response contained a player without a userId.')
    }
    return {
      userId: player.userId,
      playerId: typeof player.playerId === 'string' ? player.playerId : null,
      name: typeof player.name === 'string' ? player.name : null,
      accountName: typeof player.accountName === 'string' ? player.accountName : null,
      ip: typeof player.ip === 'string' ? player.ip : null,
      level: typeof player.level === 'number' ? player.level : null,
      ping: typeof player.ping === 'number' && Number.isFinite(player.ping) && player.ping >= 0
        ? player.ping
        : null,
    }
  })
}

function registerFrontend(app: FastifyInstance, webDist: string): void {
  void app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  })

  app.setNotFoundHandler(async (request, reply) => {
    const isApiRequest = request.url === '/api' || request.url.startsWith('/api/')

    if (request.method === 'GET' && !isApiRequest) {
      return reply.sendFile('index.html', { maxAge: 0, immutable: false })
    }

    return reply.code(404).send({ error: 'Route not found.' })
  })
}

export function createApp(
  config: GatewayConfig = loadGatewayConfig(),
  fetchImpl: typeof fetch = fetch,
  options: CreateAppOptions = {},
): FastifyInstance {
  const app = createFastify({ logger: options.logger })
  const palworldService = new PalworldService(config, fetchImpl)
  const activityConfig = loadActivityConfig()
  const activityOptions = options.activity === false
    ? undefined
    : {
        databasePath: options.activity?.databasePath
          ?? activityConfig.databasePath
          ?? defaultActivityDatabase,
        pollIntervalMs: options.activity?.pollIntervalMs ?? activityConfig.pollIntervalMs,
      }

  let activityRepository: ActivityRepository | undefined
  let activityTracker: ActivityTracker | undefined
  if (activityOptions) {
    const activityDatabase = openActivityDatabase(activityOptions.databasePath)
    activityRepository = new ActivityRepository(activityDatabase)
    activityTracker = new ActivityTracker({
      repository: activityRepository,
      intervalMs: activityOptions.pollIntervalMs,
      getPlayers: async () => {
        const result = await palworldService.request('players', endpointRules.players, 'GET', undefined)
        if (result.status !== 200) {
          throw new Error(`Palworld players request returned ${result.status}.`)
        }
        return playerSnapshots(result.payload)
      },
      onError: () => {
        app.log.warn('Player activity snapshot failed; existing sessions were left unchanged')
      },
    })

    app.addHook('onListen', async () => {
      activityTracker?.start()
      app.log.info(
        { pollIntervalSeconds: activityOptions.pollIntervalMs / 1_000 },
        'Player activity tracker started',
      )
    })
    app.addHook('onClose', async () => {
      await activityTracker?.stop()
      activityRepository?.closeAbandonedSessions()
      activityDatabase.close()
    })
  }

  registerRoutes(app, createRoutes({
    config,
    fetchImpl,
    palworldService,
    activityRepository,
    activityTracker,
    activityPollIntervalMs: activityOptions?.pollIntervalMs,
  }))

  const webDist = options.webDist === undefined ? defaultWebDist : options.webDist
  if (webDist && existsSync(webDist)) {
    registerFrontend(app, webDist)
  }

  return app
}
