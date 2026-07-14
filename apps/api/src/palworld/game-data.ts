export type GameDataActor = Record<string, unknown> & {
  Type?: string
  UnitType?: string
  InstanceID?: string
  NickName?: string
  Name?: string
  TrainerInstanceID?: string
  TrainerNickName?: string
  userid?: string
  ip?: string
  level?: number
  GuildID?: string
  GuildName?: string
  Class?: string
  LocationX?: number
  LocationY?: number
  LocationZ?: number
}

export type GameDataSnapshot = Record<string, unknown> & {
  Time: string
  FPS: number
  AverageFPS: number
  ActorData: GameDataActor[]
}

export class InvalidGameDataError extends Error {
  constructor() {
    super('The Palworld server returned a malformed world snapshot.')
    this.name = 'InvalidGameDataError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate the stable GameData envelope while retaining fields added by newer
 * Palworld builds. Actor properties intentionally remain forward-compatible.
 */
export function normalizeGameDataSnapshot(payload: unknown): GameDataSnapshot {
  if (!isRecord(payload)
    || typeof payload.Time !== 'string'
    || typeof payload.FPS !== 'number'
    || !Number.isFinite(payload.FPS)
    || typeof payload.AverageFPS !== 'number'
    || !Number.isFinite(payload.AverageFPS)
    || !Array.isArray(payload.ActorData)
    || !payload.ActorData.every(isRecord)) {
    throw new InvalidGameDataError()
  }

  return {
    ...payload,
    ActorData: payload.ActorData.map((actor) => ({ ...actor })),
  } as GameDataSnapshot
}
