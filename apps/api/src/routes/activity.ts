import type { ActivityRepository, ActivityTracker } from '../activity/index.js'
import {
  ACTIVITY_PERIOD_DAYS,
  type ActivityPeriodDays,
} from '../activity/index.js'
import type { PrimitiveRoute } from '../router.js'

type ActivitySummaryQuery = {
  days?: string | number
}

const REQUEST_MARKER_HEADER = 'x-palharbor-request'

export function createActivityRoutes(
  repository: ActivityRepository,
  tracker?: ActivityTracker,
  pollIntervalMs = 15_000,
  retentionDays = 90,
  storesIpAddresses = false,
): PrimitiveRoute[] {
  return [
    {
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

        const summary = await repository.getSummary(days as ActivityPeriodDays)
        const trackerStatus = tracker?.getStatus()
        const lastSuccessfulPollAt = trackerStatus?.lastSuccessfulPollAt ?? null
        const lastFailedPollAt = trackerStatus?.lastFailedPollAt ?? null
        const collectorStatus =
          lastFailedPollAt &&
          (!lastSuccessfulPollAt || lastFailedPollAt > lastSuccessfulPollAt)
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
            retentionDays,
            storesIpAddresses,
            lastSuccessfulPollAt,
            lastFailedPollAt,
          },
        })
      },
    },
    {
      method: 'GET',
      url: '/api/activity/export',
      handler: async (_request, reply) => {
        const exported = await repository.exportData()
        return reply
          .header('Cache-Control', 'no-store')
          .header(
            'Content-Disposition',
            `attachment; filename="palharbor-activity-${exported.exportedAt.slice(0, 10)}.json"`,
          )
          .send(exported)
      },
    },
    {
      method: 'DELETE',
      url: '/api/activity',
      handler: async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        if (request.headers[REQUEST_MARKER_HEADER] !== '1') {
          return reply
            .code(403)
            .send({ error: 'This action requires a PalHarbor request header.' })
        }
        const body = request.body as { confirmation?: unknown } | undefined
        if (
          !body ||
          body.confirmation !== 'DELETE ACTIVITY' ||
          Object.keys(body).length !== 1
        ) {
          return reply.code(400).send({
            error:
              'Set confirmation to DELETE ACTIVITY to erase all activity data.',
          })
        }
        await repository.deleteAllActivity()
        return reply.send({ ok: true })
      },
    },
  ]
}
