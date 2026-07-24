import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_CAPTURED_OUTPUT = 16_384
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const syncScript = resolve(
  currentDirectory,
  '../../scripts/sync-map-assets.mjs',
)

export type MapSyncRunner = (env: NodeJS.ProcessEnv) => Promise<string>

export function isStartupMapSyncEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configured = env.PALWORLD_MAP_SYNC_ENABLED?.trim().toLowerCase()
  return !['false', '0', 'no', 'off'].includes(configured ?? '')
}

function appendOutput(current: string, chunk: string): string {
  return `${current}${chunk}`.slice(-MAX_CAPTURED_OUTPUT)
}

async function runSyncScript(env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [syncScript], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = appendOutput(stderr, chunk)
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
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
): Promise<string | undefined> {
  if (!isStartupMapSyncEnabled(env)) return undefined
  return runner(env)
}
