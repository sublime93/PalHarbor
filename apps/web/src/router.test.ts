import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { routes } from './router'

describe('application routes', () => {
  it('exposes every monitor area as a named page', () => {
    const shell = routes.find((route) => route.path === '/')
    expect(shell?.children?.map((route) => route.path)).toEqual([
      '',
      'overview',
      'players',
      'activity',
      'world',
      'settings',
      'commands',
    ])
    expect(shell?.children?.slice(1).map((route) => route.name)).toEqual([
      'overview',
      'players',
      'activity',
      'world',
      'settings',
      'commands',
    ])
  })

  it('supports direct page navigation and redirects unknown locations', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })

    await router.push('/world')
    expect(router.currentRoute.value.name).toBe('world')

    await router.push('/activity')
    expect(router.currentRoute.value.name).toBe('activity')

    await router.push('/not-a-monitor-page')
    expect(router.currentRoute.value.fullPath).toBe('/overview')
    expect(router.currentRoute.value.name).toBe('overview')
  })
})
