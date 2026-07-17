import { describe, expect, it } from 'vitest'
import { createLoggerConfig } from './logger.js'

describe('gateway logger', () => {
  it('redacts credentials embedded in startup error strings and URLs', () => {
    const config = createLoggerConfig({
      PALWORLD_PASSWORD: 'world-secret',
      PALHARBOR_PASSWORD: 'dashboard-secret',
      DATABASE_URL:
        'postgresql://palharbor:database-secret@db.example/palharbor',
    }) as {
      serializers: {
        err: (error: unknown) => { message: string; stack?: string }
      }
    }
    const serialized = config.serializers.err(
      new Error(
        'Failed postgresql://palharbor:database-secret@db.example/palharbor with dashboard-secret and world-secret',
      ),
    )
    const output = JSON.stringify(serialized)

    expect(output).not.toContain('database-secret')
    expect(output).not.toContain('dashboard-secret')
    expect(output).not.toContain('world-secret')
    expect(output).toContain('[REDACTED]')
  })
})
