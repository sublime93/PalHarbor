import type { ActivityRepository } from './repository.js'
import type { ActivityPlayerSnapshot } from './types.js'

export type ActivityTrackerOptions = {
  repository: ActivityRepository
  getPlayers: () => Promise<readonly ActivityPlayerSnapshot[]>
  intervalMs?: number
  now?: () => number
  onError?: (error: unknown) => void
}

export type ActivityTrackerStatus = {
  running: boolean
  pollInFlight: boolean
  dataStale: boolean
  lastSuccessfulPollAt: string | null
  lastFailedPollAt: string | null
}

export class ActivityTracker {
  private readonly repository: ActivityRepository
  private readonly getPlayers: () => Promise<readonly ActivityPlayerSnapshot[]>
  private readonly intervalMs: number
  private readonly now: () => number
  private readonly onError?: (error: unknown) => void
  private running = false
  private timeout: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | undefined
  private lastSuccessfulPollTimestamp: number | null = null
  private lastFailedPollTimestamp: number | null = null
  private latestPollSucceeded: boolean | null = null

  constructor(options: ActivityTrackerOptions) {
    if (!Number.isFinite(options.intervalMs ?? 15_000) || (options.intervalMs ?? 15_000) < 1) {
      throw new RangeError('intervalMs must be a positive number.')
    }

    this.repository = options.repository
    this.getPlayers = options.getPlayers
    this.intervalMs = Math.trunc(options.intervalMs ?? 15_000)
    this.now = options.now ?? Date.now
    this.onError = options.onError
  }

  get isRunning(): boolean {
    return this.running
  }

  getStatus(): ActivityTrackerStatus {
    return {
      running: this.running,
      pollInFlight: this.inFlight !== undefined,
      dataStale: this.latestPollSucceeded === false,
      lastSuccessfulPollAt: this.lastSuccessfulPollTimestamp === null
        ? null
        : new Date(this.lastSuccessfulPollTimestamp).toISOString(),
      lastFailedPollAt: this.lastFailedPollTimestamp === null
        ? null
        : new Date(this.lastFailedPollTimestamp).toISOString(),
    }
  }

  /** Starts with an immediate poll; subsequent polls wait until the previous one finishes. */
  start(): void {
    if (this.running) return
    this.running = true
    this.runPoll()
  }

  /** Prevents further reconciliation/timers and waits for an outstanding request to settle. */
  async stop(): Promise<void> {
    this.running = false
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = undefined
    await this.inFlight
  }

  private runPoll(): void {
    if (!this.running || this.inFlight) return

    const poll = this.poll()
    this.inFlight = poll
    void poll.finally(() => {
      if (this.inFlight === poll) this.inFlight = undefined
      if (this.running) {
        this.timeout = setTimeout(() => {
          this.timeout = undefined
          this.runPoll()
        }, this.intervalMs)
      }
    })
  }

  private async poll(): Promise<void> {
    try {
      const players = await this.getPlayers()
      if (this.running) {
        const observedAt = this.now()
        this.repository.reconcilePlayers(players, observedAt)
        this.lastSuccessfulPollTimestamp = observedAt
        this.latestPollSucceeded = true
      }
    } catch (error) {
      // A failed snapshot is unknown state, not evidence that everybody disconnected.
      this.lastFailedPollTimestamp = this.now()
      this.latestPollSucceeded = false
      try {
        this.onError?.(error)
      } catch {
        // Observability hooks must never stop tracking.
      }
    }
  }
}
