import type { FastifyInstance, RouteOptions } from 'fastify'

export type PrimitiveRoute = RouteOptions

/** A deliberately small registry: route modules provide definitions, this owns registration. */
export function registerRoutes(app: FastifyInstance, routes: readonly PrimitiveRoute[]): void {
  for (const route of routes) {
    app.route(route)
  }
}
