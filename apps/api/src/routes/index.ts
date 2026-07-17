import type { GatewayConfig } from '../core/config.js'
import type { ActivityRepository, ActivityTracker } from '../activity/index.js'
import { PalworldService } from '../palworld/service.js'
import type { PrimitiveRoute } from '../router.js'
import { createHealthRoute } from './health.js'
import { createActivityRoutes } from './activity.js'
import { createMapRoutes } from './maps.js'
import { createPalworldRoute } from './palworld.js'
import type { MapStorage } from '../maps/storage.js'

export type RouteDependencies = {
  config: GatewayConfig
  fetchImpl: typeof fetch
  palworldService?: PalworldService
  activityRepository?: ActivityRepository
  activityTracker?: ActivityTracker
  activityPollIntervalMs?: number
  activityRetentionDays?: number
  activityStoresIpAddresses?: boolean
  mapStorage?: MapStorage
}

export function createRoutes(
  dependencies: RouteDependencies,
): PrimitiveRoute[] {
  const palworldService =
    dependencies.palworldService ??
    new PalworldService(dependencies.config, dependencies.fetchImpl)

  const routes: PrimitiveRoute[] = [
    createHealthRoute(dependencies.config),
    createPalworldRoute(dependencies.config, palworldService),
  ]

  if (dependencies.activityRepository) {
    routes.push(
      ...createActivityRoutes(
        dependencies.activityRepository,
        dependencies.activityTracker,
        dependencies.activityPollIntervalMs,
        dependencies.activityRetentionDays,
        dependencies.activityStoresIpAddresses,
      ),
    )
  }
  if (dependencies.mapStorage)
    routes.push(...createMapRoutes(dependencies.mapStorage))

  return routes
}
