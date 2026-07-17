import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import { ActivityRepository, createDatabase } from '@app/database'
import {
  ActivityTracker,
  type ActivityPlayerSnapshot,
} from './activity/index.js'
import {
  loadAccessConfig,
  loadActivityConfig,
  loadGatewayConfig,
  type AccessConfig,
  type GatewayConfig,
} from './core/config.js'
import { createFastify } from './core/fastify.js'
import { endpointRules } from './palworld/endpoints.js'
import { PalworldService } from './palworld/service.js'
import { MapStorage } from './maps/storage.js'
import { registerRoutes } from './router.js'
import { createRoutes } from './routes/index.js'

export type CreateAppOptions = {
  logger?: FastifyServerOptions['logger']
  access?: AccessConfig
  webDist?: string | false
  activity?:
    | false
    | {
        databaseUrl?: string
        /** @deprecated Prefer databaseUrl. */
        databasePath?: string
        pollIntervalMs?: number
        retentionDays?: number
        storeIpAddresses?: boolean
      }
  mapDataPath?: string
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const defaultWebDist = resolve(currentDir, '../../web/dist')
const defaultActivityDatabase = resolve(currentDir, '../data/palharbor.sqlite')
const legacyActivityDatabase = resolve(currentDir, '../data/paldeck.sqlite')
const defaultMapData = resolve(currentDir, '../data/maps')

function activityDatabaseDefault(): string {
  // Existing installations keep their collected history unless the path is
  // explicitly changed. Fresh installations use the PalHarbor filename.
  return pathToFileURL(
    existsSync(legacyActivityDatabase)
      ? legacyActivityDatabase
      : defaultActivityDatabase,
  ).href
}

export function playerSnapshots(payload: unknown): ActivityPlayerSnapshot[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { players?: unknown }).players)
  ) {
    throw new Error('Palworld players response was malformed.')
  }

  const players = (payload as { players: unknown[] }).players
  return players.map((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Palworld players response contained an invalid player.')
    }
    const player = value as Record<string, unknown>
    if (typeof player.userId !== 'string' || !player.userId.trim()) {
      throw new Error(
        'Palworld players response contained a player without a userId.',
      )
    }
    return {
      userId: player.userId,
      playerId: typeof player.playerId === 'string' ? player.playerId : null,
      name: typeof player.name === 'string' ? player.name : null,
      accountName:
        typeof player.accountName === 'string' ? player.accountName : null,
      ip: typeof player.ip === 'string' ? player.ip : null,
      level: typeof player.level === 'number' ? player.level : null,
      ping:
        typeof player.ping === 'number' &&
        Number.isFinite(player.ping) &&
        player.ping >= 0
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
    const isApiRequest =
      request.url === '/api' || request.url.startsWith('/api/')

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
  const app = createFastify({
    logger: options.logger,
    access: options.access ?? loadAccessConfig(),
  })
  const palworldService = new PalworldService(config, fetchImpl)
  const mapStorage = new MapStorage(
    resolve(options.mapDataPath ?? process.env.MAP_DATA_PATH ?? defaultMapData),
  )
  const activityConfig = loadActivityConfig()
  const requestedActivity =
    options.activity === false ? undefined : options.activity
  const activityEnabled =
    options.activity !== false &&
    (options.activity !== undefined || activityConfig.enabled)
  const activityOptions = !activityEnabled
    ? undefined
    : {
        databaseUrl:
          requestedActivity?.databaseUrl ??
          activityConfig.databaseUrl ??
          (requestedActivity?.databasePath
            ? pathToFileURL(resolve(requestedActivity.databasePath)).href
            : activityConfig.databasePath
              ? pathToFileURL(resolve(activityConfig.databasePath)).href
              : activityDatabaseDefault()),
        pollIntervalMs:
          requestedActivity?.pollIntervalMs ?? activityConfig.pollIntervalMs,
        retentionDays:
          requestedActivity?.retentionDays ?? activityConfig.retentionDays,
        storeIpAddresses:
          requestedActivity?.storeIpAddresses ??
          activityConfig.storeIpAddresses,
      }

  let activityRepository: ActivityRepository | undefined
  let activityTracker: ActivityTracker | undefined
  if (activityOptions) {
    const activityDatabase = createDatabase(activityOptions.databaseUrl)
    activityRepository = new ActivityRepository(activityDatabase.client, {
      storeIpAddresses: activityOptions.storeIpAddresses,
    })
    activityTracker = new ActivityTracker({
      repository: activityRepository,
      intervalMs: activityOptions.pollIntervalMs,
      retentionDays: activityOptions.retentionDays,
      getPlayers: async () => {
        const result = await palworldService.request(
          'players',
          endpointRules.players,
          'GET',
          undefined,
        )
        if (result.status !== 200) {
          throw new Error(`Palworld players request returned ${result.status}.`)
        }
        return playerSnapshots(result.payload)
      },
      onError: () => {
        app.log.warn(
          'Player activity snapshot failed; existing sessions were left unchanged',
        )
      },
    })

    app.addHook('onReady', async () => {
      await activityDatabase.initialize()
      await activityRepository?.initialize()
      await activityRepository?.pruneBefore(
        Date.now() - activityOptions.retentionDays * 86_400_000,
      )
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
      await activityRepository?.closeAbandonedSessions()
      await activityDatabase.disconnect()
    })
  }

  registerRoutes(
    app,
    createRoutes({
      config,
      fetchImpl,
      palworldService,
      activityRepository,
      activityTracker,
      activityPollIntervalMs: activityOptions?.pollIntervalMs,
      activityRetentionDays: activityOptions?.retentionDays,
      activityStoresIpAddresses: activityOptions?.storeIpAddresses,
      mapStorage,
    }),
  )

  const webDist =
    options.webDist === undefined ? defaultWebDist : options.webDist
  if (webDist && existsSync(webDist)) {
    registerFrontend(app, webDist)
  }

  return app
}
