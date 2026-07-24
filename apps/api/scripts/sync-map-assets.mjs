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
const TILES_PER_REGION = Array.from(
  { length: MAX_ZOOM + 1 },
  (_, zoom) => 4 ** zoom,
).reduce((total, count) => total + count, 0)
const MAX_REMOTE_SOURCE_BYTES = 32 * 1024 * 1024
const REMOTE_SOURCE_TIMEOUT_MS = 30_000
const REMOTE_SOURCE_METADATA = 'remote-sources.json'
const REGIONS = {
  palpagos: 'T_WorldMap.webp',
  'world-tree': 'T_TreeMap.webp',
}

function reportProgress(message) {
  process.stdout.write(`${message}\n`)
}
export const DEFAULT_MAP_SOURCE_URLS = {
  palpagos:
    'https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_WorldMap.webp',
  'world-tree':
    'https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_TreeMap.webp',
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

export function validatedRemoteSourceUrl(value, fallback) {
  const configured = String(value ?? '').trim() || fallback
  let parsed
  try {
    parsed = new URL(configured)
  } catch {
    throw new Error(`Invalid remote map source URL: ${configured}`)
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error(
      `Remote map source URLs must use HTTPS without credentials or fragments: ${configured}`,
    )
  }
  return parsed.href
}

export async function responseBodyWithinLimit(
  response,
  maxBytes = MAX_REMOTE_SOURCE_BYTES,
) {
  const advertisedLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    throw new Error(
      `Remote map source exceeds the ${maxBytes} byte download limit.`,
    )
  }
  if (!response.body) {
    throw new Error('Remote map source returned an empty response body.')
  }

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(
        `Remote map source exceeds the ${maxBytes} byte download limit.`,
      )
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks, total)
}

async function readRemoteSourceMetadata(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    if (
      parsed?.schemaVersion === 1 &&
      parsed.sources &&
      typeof parsed.sources === 'object'
    ) {
      return parsed
    }
  } catch {
    // A missing or malformed cache manifest is repaired after downloading.
  }
  return { schemaVersion: 1, sources: {} }
}

async function isValidCachedSource(path, region) {
  try {
    await verifySource(path, region)
    return true
  } catch {
    return false
  }
}

async function fetchRemoteSource(
  region,
  sourceUrl,
  cacheRoot,
  previousMetadata,
  fetchImpl = fetch,
) {
  const destination = join(cacheRoot, REGIONS[region])
  const cacheIsValid = await isValidCachedSource(destination, region)
  const headers = { Accept: 'image/webp,application/octet-stream;q=0.8' }
  if (cacheIsValid && previousMetadata?.url === sourceUrl) {
    if (previousMetadata.etag) {
      headers['If-None-Match'] = previousMetadata.etag
    }
    if (previousMetadata.lastModified) {
      headers['If-Modified-Since'] = previousMetadata.lastModified
    }
  }

  let response
  try {
    response = await fetchImpl(sourceUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(REMOTE_SOURCE_TIMEOUT_MS),
    })
  } catch (error) {
    if (cacheIsValid) {
      return {
        path: destination,
        metadata: previousMetadata ?? {
          url: sourceUrl,
          sha256: await digest(destination),
        },
        message: `${region} remote source was unavailable; reused the validated cache`,
      }
    }
    throw new Error(
      `Unable to download ${region} map source from ${sourceUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    )
  }

  if (response.status === 304 && cacheIsValid) {
    return {
      path: destination,
      metadata: previousMetadata,
      message: `${region} remote source is unchanged`,
    }
  }
  if (!response.ok) {
    if (cacheIsValid) {
      return {
        path: destination,
        metadata: previousMetadata ?? {
          url: sourceUrl,
          sha256: await digest(destination),
        },
        message: `${region} remote source returned ${response.status}; reused the validated cache`,
      }
    }
    throw new Error(
      `${region} remote map source returned status ${response.status}.`,
    )
  }
  if (new URL(response.url || sourceUrl).protocol !== 'https:') {
    throw new Error(`${region} remote map source redirected away from HTTPS.`)
  }

  const temporary = `${destination}.tmp-${process.pid}`
  await writeFile(temporary, await responseBodyWithinLimit(response), {
    mode: 0o600,
  })
  try {
    await verifySource(temporary, region)
    await rename(temporary, destination)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }

  return {
    path: destination,
    metadata: {
      url: sourceUrl,
      etag: response.headers.get('etag') || undefined,
      lastModified: response.headers.get('last-modified') || undefined,
      sha256: await digest(destination),
      downloadedAt: new Date().toISOString(),
    },
    message: `Downloaded ${region} map source`,
  }
}

async function downloadRemoteSources(
  dataRoot,
  sourceUrls,
  fetchImpl = fetch,
  onProgress = reportProgress,
) {
  const cacheRoot = join(dataRoot, '.sources')
  const metadataPath = join(cacheRoot, REMOTE_SOURCE_METADATA)
  await mkdir(cacheRoot, { recursive: true, mode: 0o700 })
  const metadata = await readRemoteSourceMetadata(metadataPath)
  const sources = {}

  for (const region of Object.keys(sourceUrls)) {
    onProgress(`Checking ${region} remote map source`)
    const result = await fetchRemoteSource(
      region,
      sourceUrls[region],
      cacheRoot,
      metadata.sources[region],
      fetchImpl,
    )
    sources[region] = result.path
    metadata.sources[region] = result.metadata
    onProgress(result.message)
  }

  await atomicJson(metadataPath, metadata)
  return sources
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
  if (
    metadata.format !== 'webp' ||
    metadata.width !== MAP_SIZE ||
    metadata.height !== MAP_SIZE
  ) {
    throw new Error(
      `${region} must be an ${MAP_SIZE} × ${MAP_SIZE} WebP image; received ${metadata.format ?? 'unknown'} ${metadata.width} × ${metadata.height}.`,
    )
  }
}

async function generateRegion(
  source,
  region,
  destination,
  onProgress = reportProgress,
) {
  onProgress(`Validating ${region} map source`)
  await verifySource(source, region)
  onProgress(`Generating ${region} fallback image`)
  const fallback = join(destination, `${region}.webp`)
  await sharp(source)
    .resize(MAP_SIZE / 2, MAP_SIZE / 2, { fit: 'fill' })
    .webp({ quality: 88, smartSubsample: true })
    .toFile(fallback)

  let completedTiles = 0
  onProgress(`Generating ${region} tile pyramid (${TILES_PER_REGION} tiles)`)
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
      completedTiles += dimension
      const percent = Math.round((completedTiles / TILES_PER_REGION) * 100)
      onProgress(
        `${region} tile progress: ${completedTiles}/${TILES_PER_REGION} (${percent}%)`,
      )
    }
  }
  onProgress(`Finished ${region} map assets`)
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
  reportProgress(`Synchronizing map assets for Palworld ${gameVersion}`)
  const dataRoot = resolve(
    args['data-dir'] ??
      process.env.MAP_DATA_PATH ??
      resolve(apiDirectory, 'data/maps'),
  )
  await mkdir(dataRoot, { recursive: true, mode: 0o700 })
  const serverRoot = args['server-root']
  const caveEntrancesSource = args['cave-entrances']
  const sources = {
    palpagos: args.palpagos,
    'world-tree': args['world-tree'],
  }

  if (serverRoot) {
    for (const [region, filename] of Object.entries(REGIONS)) {
      sources[region] ??= await findFile(serverRoot, filename)
    }
  }

  const remoteSourceUrls = {}
  for (const region of Object.keys(REGIONS)) {
    if (sources[region]) continue
    const environmentName =
      region === 'palpagos'
        ? 'PALWORLD_MAP_PALPAGOS_URL'
        : 'PALWORLD_MAP_WORLD_TREE_URL'
    remoteSourceUrls[region] = validatedRemoteSourceUrl(
      args[`${region}-url`] ?? process.env[environmentName],
      DEFAULT_MAP_SOURCE_URLS[region],
    )
  }
  if (Object.keys(remoteSourceUrls).length) {
    Object.assign(
      sources,
      await downloadRemoteSources(dataRoot, remoteSourceUrls),
    )
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

  const destination = strictChildPath(dataRoot, gameVersion)
  if (await versionMatchesSources(destination, gameVersion, sourceHashes)) {
    await atomicJson(join(dataRoot, 'current.json'), { gameVersion })
    reportProgress(
      `Palworld ${gameVersion} map assets already match the configured sources`,
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
    reportProgress(
      `Generating ${Object.keys(REGIONS).length * TILES_PER_REGION} map tiles for Palworld ${gameVersion}`,
    )
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
    reportProgress(
      `Generated Palworld ${gameVersion} map assets in ${destination}`,
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
