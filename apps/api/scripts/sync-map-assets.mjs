import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import sharp from 'sharp'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const apiDirectory = resolve(scriptDirectory, '..')
dotenv.config({ path: resolve(apiDirectory, '.env'), quiet: true })

const TILE_SIZE = 512
const MAX_ZOOM = 4
const MAP_SIZE = TILE_SIZE * 2 ** MAX_ZOOM
const REGIONS = {
  palpagos: 'T_WorldMap.webp',
  'world-tree': 'T_TreeMap.webp',
}

function argumentsFrom(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (!argument.startsWith('--'))
      throw new Error(`Unexpected argument: ${argument}`)
    const [rawName, inlineValue] = argument.slice(2).split('=', 2)
    const value = inlineValue ?? argv[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`--${rawName} requires a value.`)
    values[rawName] = value
  }
  return values
}

export function safeVersion(value) {
  const version = String(value ?? '')
    .trim()
    .replace(/^v(?=\d)/, '')
  if (
    version === '.' ||
    version === '..' ||
    !/^[a-zA-Z0-9._-]{1,80}$/.test(version)
  ) {
    throw new Error(
      'The map version must be an ordinary directory name containing only letters, numbers, dots, underscores, and hyphens.',
    )
  }
  return version
}

export function strictChildPath(root, segment) {
  const base = resolve(root)
  const destination = resolve(base, segment)
  const child = relative(base, destination)
  if (
    !child ||
    child === '..' ||
    child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    throw new Error('The generated map path must stay below the map root.')
  }
  return destination
}

async function findFile(root, filename) {
  const pending = [resolve(root)]
  while (pending.length) {
    const directory = pending.shift()
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase())
        return path
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path)
    }
  }
  return undefined
}

async function serverVersion() {
  const baseUrl = (process.env.PALWORLD_API_URL ?? '').replace(/\/+$/, '')
  const username = process.env.PALWORLD_USERNAME ?? ''
  const password = process.env.PALWORLD_PASSWORD ?? ''
  if (!baseUrl || !username || !password) {
    throw new Error(
      'Set --version or configure PALWORLD_API_URL, PALWORLD_USERNAME, and PALWORLD_PASSWORD.',
    )
  }
  const response = await fetch(`${baseUrl}/info`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok)
    throw new Error(`Palworld /info returned status ${response.status}.`)
  const payload = await response.json()
  if (!payload || typeof payload.version !== 'string') {
    throw new Error('Palworld /info did not include a version string.')
  }
  return safeVersion(payload.version)
}

async function digest(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

async function versionMatchesSources(destination, gameVersion, sourceHashes) {
  try {
    const manifest = JSON.parse(
      await readFile(join(destination, 'manifest.json'), 'utf8'),
    )
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      manifest.schemaVersion !== 1 ||
      manifest.gameVersion !== gameVersion ||
      !manifest.sourceHashes ||
      typeof manifest.sourceHashes !== 'object'
    ) {
      return false
    }
    const expected = Object.entries(sourceHashes)
    const existingKeys = Object.keys(manifest.sourceHashes)
    return (
      expected.length === existingKeys.length &&
      expected.every(([key, value]) => manifest.sourceHashes[key] === value)
    )
  } catch {
    return false
  }
}

async function importCaveEntrances(path, destination) {
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(parsed) || parsed.length > 5_000) {
    throw new Error(
      'Cave entrance data must be a JSON array with at most 5,000 entries.',
    )
  }
  const entrances = parsed.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`Cave entrance ${index + 1} must be an object.`)
    }
    const x = Number(value.x)
    const y = Number(value.y)
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > 2_000_000 ||
      Math.abs(y) > 2_000_000
    ) {
      throw new Error(`Cave entrance ${index + 1} has invalid x/y coordinates.`)
    }
    const label =
      typeof value.label === 'string' && value.label.trim()
        ? value.label.trim().slice(0, 120)
        : `Cave entrance ${index + 1}`
    return {
      id: `cave:${index + 1}:${x}:${y}`,
      label,
      x,
      y,
    }
  })
  await writeFile(
    join(destination, 'cave-entrances.json'),
    `${JSON.stringify(entrances, null, 2)}\n`,
    { mode: 0o600 },
  )
}

async function verifySource(path, region) {
  const metadata = await sharp(path).metadata()
  if (metadata.width !== MAP_SIZE || metadata.height !== MAP_SIZE) {
    throw new Error(
      `${region} must be an ${MAP_SIZE} × ${MAP_SIZE} image; received ${metadata.width} × ${metadata.height}.`,
    )
  }
}

async function generateRegion(source, region, destination) {
  await verifySource(source, region)
  const fallback = join(destination, `${region}.webp`)
  await sharp(source)
    .resize(MAP_SIZE / 2, MAP_SIZE / 2, { fit: 'fill' })
    .webp({ quality: 88, smartSubsample: true })
    .toFile(fallback)

  for (let zoom = 0; zoom <= MAX_ZOOM; zoom += 1) {
    const dimension = 2 ** zoom
    const levelSize = dimension * TILE_SIZE
    const level = await sharp(source)
      .resize(levelSize, levelSize, { fit: 'fill' })
      .webp({ quality: 88, smartSubsample: true })
      .toBuffer()
    for (let x = 0; x < dimension; x += 1) {
      for (let y = 0; y < dimension; y += 1) {
        const tilePath = join(
          destination,
          'tiles',
          region,
          String(zoom),
          String(x),
          `${y}.webp`,
        )
        await mkdir(dirname(tilePath), { recursive: true })
        await sharp(level)
          .extract({
            left: x * TILE_SIZE,
            top: y * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
          })
          .webp({ quality: 88, smartSubsample: true })
          .toFile(tilePath)
      }
    }
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, path)
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2))
  const gameVersion = safeVersion(args.version ?? (await serverVersion()))
  const dataRoot = resolve(
    args['data-dir'] ??
      process.env.MAP_DATA_PATH ??
      resolve(apiDirectory, 'data/maps'),
  )
  const serverRoot = args['server-root'] ?? process.env.PALWORLD_SERVER_ROOT
  const caveEntrancesSource =
    args['cave-entrances'] ?? process.env.PALWORLD_CAVE_ENTRANCES_SOURCE
  const sources = {
    palpagos: args.palpagos ?? process.env.PALWORLD_MAP_PALPAGOS_SOURCE,
    'world-tree':
      args['world-tree'] ?? process.env.PALWORLD_MAP_WORLD_TREE_SOURCE,
  }

  if (serverRoot) {
    for (const [region, filename] of Object.entries(REGIONS)) {
      sources[region] ??= await findFile(serverRoot, filename)
    }
  }
  for (const [region, filename] of Object.entries(REGIONS)) {
    if (!sources[region]) {
      throw new Error(
        `No ${region} source was found. The Palworld REST API does not expose terrain artwork. ` +
          `Export ${filename} from a server installation you are authorized to use, then pass ` +
          `--${region} <path> or set PALWORLD_MAP_${region === 'palpagos' ? 'PALPAGOS' : 'WORLD_TREE'}_SOURCE.`,
      )
    }
  }

  const resolvedSources = {
    palpagos: resolve(sources.palpagos),
    'world-tree': resolve(sources['world-tree']),
  }
  const resolvedCaveEntrances = caveEntrancesSource
    ? resolve(caveEntrancesSource)
    : undefined
  const sourceHashes = {
    palpagos: await digest(resolvedSources.palpagos),
    'world-tree': await digest(resolvedSources['world-tree']),
    ...(resolvedCaveEntrances
      ? { caveEntrances: await digest(resolvedCaveEntrances) }
      : {}),
  }

  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const destination = strictChildPath(dataRoot, gameVersion)
  if (await versionMatchesSources(destination, gameVersion, sourceHashes)) {
    await atomicJson(join(dataRoot, 'current.json'), { gameVersion })
    process.stdout.write(
      `Palworld ${gameVersion} map assets already match the configured sources\n`,
    )
    return
  }

  const temporary = strictChildPath(
    dataRoot,
    `.generating-${gameVersion}-${process.pid}`,
  )
  await rm(temporary, { recursive: true, force: true })
  await mkdir(temporary, { recursive: true, mode: 0o700 })

  try {
    await generateRegion(resolvedSources.palpagos, 'palpagos', temporary)
    await generateRegion(resolvedSources['world-tree'], 'world-tree', temporary)
    if (resolvedCaveEntrances) {
      await importCaveEntrances(resolvedCaveEntrances, temporary)
    }
    const manifest = {
      schemaVersion: 1,
      gameVersion,
      generatedAt: new Date().toISOString(),
      sourceHashes,
      ...(resolvedCaveEntrances
        ? { caveEntrances: 'cave-entrances.json' }
        : {}),
      regions: Object.fromEntries(
        Object.keys(REGIONS).map((region) => [
          region,
          {
            fallback: `${region}.webp`,
            tiles: {
              pathTemplate: `tiles/${region}/{z}/{x}/{y}.webp`,
              tileSize: TILE_SIZE,
              minSourceZoom: 0,
              maxSourceZoom: MAX_ZOOM,
            },
          },
        ]),
      ),
    }
    await atomicJson(join(temporary, 'manifest.json'), manifest)
    await rm(destination, { recursive: true, force: true })
    await rename(temporary, destination)
    await atomicJson(join(dataRoot, 'current.json'), { gameVersion })
    process.stdout.write(
      `Generated Palworld ${gameVersion} map assets in ${destination}\n`,
    )
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  })
}
