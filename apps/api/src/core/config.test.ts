import { describe, expect, it } from 'vitest'
import {
  assertValidAccessConfig,
  loadAccessConfig,
  loadActivityConfig,
  loadServerConfig,
} from './config.js'

describe('configuration', () => {
  it('uses privacy-preserving activity defaults and bounds retention', () => {
    expect(loadActivityConfig({})).toMatchObject({
      enabled: true,
      pollIntervalMs: 15_000,
      retentionDays: 90,
      storeIpAddresses: false,
    })
    expect(
      loadActivityConfig({ ACTIVITY_RETENTION_DAYS: '0' }).retentionDays,
    ).toBe(90)
    expect(
      loadActivityConfig({
        ACTIVITY_ENABLED: 'false',
        ACTIVITY_RETENTION_DAYS: '365',
        STORE_PLAYER_IPS: 'true',
      }),
    ).toMatchObject({
      enabled: false,
      retentionDays: 365,
      storeIpAddresses: true,
    })
  })

  it('normalizes access allowlists and rejects partial credentials', () => {
    expect(
      loadAccessConfig({
        PALHARBOR_USERNAME: ' operator ',
        PALHARBOR_PASSWORD: 'secret',
        PALHARBOR_ALLOWED_HOSTS: 'Example.test, example.test',
        PALHARBOR_ALLOWED_ORIGINS: 'HTTPS://Example.test',
      }),
    ).toEqual({
      username: 'operator',
      password: 'secret',
      allowedHosts: ['example.test'],
      allowedOrigins: ['https://example.test'],
    })
    expect(() =>
      assertValidAccessConfig({
        username: 'operator',
        password: '',
        allowedHosts: [],
        allowedOrigins: [],
      }),
    ).toThrow(/configured together/)
  })

  it('falls back from invalid listener ports', () => {
    expect(loadServerConfig({ PORT: '-1' }).port).toBe(4174)
    expect(loadServerConfig({ HOST: '0.0.0.0', PORT: '8080' })).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      allowUnauthenticatedRemote: false,
    })
  })
})
