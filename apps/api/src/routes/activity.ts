import type { ActivityRepository, ActivityTracker } from '../activity/index.js'
import { ACTIVITY_PERIOD_DAYS, type ActivityPeriodDays } from '../activity/index.js'
import type { PrimitiveRoute } from '../router.js'

type ActivitySummaryQuery = {
  days?: string | number
}

export function createActivitySummaryRoute(
  repository: ActivityRepository,
  tracker?: ActivityTracker,
  pollIntervalMs = 15_000,
): PrimitiveRoute {
  return {
    method: 'GET',
    url: '/api/activity/summary',
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store')
      const query = request.query as ActivitySummaryQuery
      const days = Number(query.days ?? 30)

      if (!(ACTIVITY_PERIOD_DAYS as readonly number[]).includes(days)) {
        return reply.code(400).send({
          error: `days must be one of ${ACTIVITY_PERIOD_DAYS.join(', ')}.`,
        })
      }

      const summary = repository.getSummary(days as ActivityPeriodDays)
      const trackerStatus = tracker?.getStatus()
      const lastSuccessfulPollAt = trackerStatus?.lastSuccessfulPollAt ?? null
      const lastFailedPollAt = trackerStatus?.lastFailedPollAt ?? null
      const collectorStatus = lastFailedPollAt
        && (!lastSuccessfulPollAt || lastFailedPollAt > lastSuccessfulPollAt)
        ? 'degraded'
        : lastSuccessfulPollAt
          ? 'healthy'
          : 'starting'

      return reply.send({
        ...summary,
        collector: {
          status: collectorStatus,
          running: trackerStatus?.running ?? false,
          pollInFlight: trackerStatus?.pollInFlight ?? false,
          pollIntervalSeconds: pollIntervalMs / 1_000,
          lastSuccessfulPollAt,
          lastFailedPollAt,
        },
      })
    },
  }
}
