export type EndpointRule = {
  methods: ReadonlySet<string>
  timeoutMs: number
}

export const endpointRules = {
  info: { methods: new Set(['GET']), timeoutMs: 12_000 },
  players: { methods: new Set(['GET']), timeoutMs: 12_000 },
  settings: { methods: new Set(['GET']), timeoutMs: 12_000 },
  metrics: { methods: new Set(['GET']), timeoutMs: 12_000 },
  'game-data': { methods: new Set(['GET']), timeoutMs: 30_000 },
  announce: { methods: new Set(['POST']), timeoutMs: 12_000 },
  kick: { methods: new Set(['POST']), timeoutMs: 12_000 },
  ban: { methods: new Set(['POST']), timeoutMs: 12_000 },
  unban: { methods: new Set(['POST']), timeoutMs: 12_000 },
  save: { methods: new Set(['POST']), timeoutMs: 30_000 },
  shutdown: { methods: new Set(['POST']), timeoutMs: 12_000 },
  stop: { methods: new Set(['POST']), timeoutMs: 12_000 },
} satisfies Record<string, EndpointRule>

export type PalworldEndpoint = keyof typeof endpointRules

export function getEndpointRule(endpoint: string): EndpointRule | undefined {
  return endpointRules[endpoint as PalworldEndpoint]
}
