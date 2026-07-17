import type { Actor } from './types'

export type CaveEntrance = {
  id: string
  label: string
  x: number
  y: number
}

export type CaveStageSummary = {
  stage: string
  count: number
}

export function normalizeActorStage(stage: unknown): string | null {
  if (typeof stage !== 'string') return null
  const normalized = stage.trim()
  return normalized && normalized.toLowerCase() !== 'none' ? normalized : null
}

export function actorStage(actor: Actor): string | null {
  return normalizeActorStage(actor.Stage)
}

export function summarizeCaveStages(actors: Actor[]): CaveStageSummary[] {
  const counts = new Map<string, number>()
  for (const actor of actors) {
    const stage = actorStage(actor)
    if (stage) counts.set(stage, (counts.get(stage) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.stage.localeCompare(right.stage),
    )
}
