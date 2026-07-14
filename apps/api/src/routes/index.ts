import type { GatewayConfig } from '../core/config.js'
import type { ActivityRepository, ActivityTracker } from '../activity/index.js'
import { PalworldService } from '../palworld/service.js'
import type { PrimitiveRoute } from '../router.js'
import { createHealthRoute } from './health.js'
import { createActivitySummaryRoute } from './activity.js'
import { createPalworldRoute } from './palworld.js'

export type RouteDependencies = {
  config: GatewayConfig
  fetchImpl: typeof fetch
  palworldService?: PalworldService
  activityRepository?: ActivityRepository
  activityTracker?: ActivityTracker
  activityPollIntervalMs?: number
}

export function createRoutes(dependencies: RouteDependencies): PrimitiveRoute[] {
  const palworldService = dependencies.palworldService
    ?? new PalworldService(dependencies.config, dependencies.fetchImpl)

  const routes: PrimitiveRoute[] = [
    createHealthRoute(dependencies.config),
    createPalworldRoute(dependencies.config, palworldService),
  ]

  if (dependencies.activityRepository) {
    routes.push(createActivitySummaryRoute(
      dependencies.activityRepository,
      dependencies.activityTracker,
      dependencies.activityPollIntervalMs,
    ))
  }

  return routes
}
