import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_CAPTURED_OUTPUT = 16_384
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const syncScript = resolve(
  currentDirectory,
  '../../scripts/sync-map-assets.mjs',
)

export type MapSyncProgress = (message: string) => void
export type MapSyncRunner = (
  env: NodeJS.ProcessEnv,
  onProgress?: MapSyncProgress,
) => Promise<string>

export interface CompleteOutput {
  lines: string[]
  remainder: string
}

export function isStartupMapSyncEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = env.PALWORLD_MAP_SYNC_ENABLED?.trim().toLowerCase()
  return !['false', '0', 'no', 'off'].includes(configured ?? '')
}

function appendOutput(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-MAX_CAPTURED_OUTPUT)
}

export function completeOutputLines(
  remainder: string,
  chunk: string,
): CompleteOutput {
  const parts = `${remainder}${chunk}`.split(/\r?\n/)
  return {
    lines: parts
      .slice(0, -1)
      .map((line) => line.trim())
      .filter(Boolean),
    remainder: parts.at(-1) ?? '',
  }
}

async function runSyncScript(
  env: NodeJS.ProcessEnv,
  onProgress?: MapSyncProgress,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [syncScript], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let pendingProgress = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = appendOutput(stdout, chunk)
      const completed = completeOutputLines(pendingProgress, chunk)
      pendingProgress = completed.remainder
      for (const line of completed.lines) onProgress?.(line)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      const finalProgress = pendingProgress.trim()
      if (finalProgress) onProgress?.(finalProgress)
      if (code === 0) {
        resolvePromise(stdout.trim())
        return
      }
      const outcome = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
      const detail = stderr.trim()
      reject(
        new Error(
          `Map synchronization process ended with ${outcome}${detail ? `: ${detail}` : '.'}`,
        ),
      )
    })
  })
}

export async function synchronizeMapsAtStartup(
  env: NodeJS.ProcessEnv = process.env,
  runner: MapSyncRunner = runSyncScript,
  onProgress?: MapSyncProgress,
): Promise<string | undefined> {
  if (!isStartupMapSyncEnabled(env)) return undefined
  return runner(env, onProgress)
}
