# Automatic map assets

The official Palworld REST API provides live actor coordinates but not terrain
artwork. PalHarbor therefore downloads operator-configurable community copies
of the Palpagos and World Tree textures during startup, validates them, and
generates a local tile pyramid.

The source artwork is not bundled in the PalHarbor image. The generated files
and remote-source cache live under `MAP_DATA_PATH`:

```text
apps/api/data/maps/
├── .sources/
│   ├── remote-sources.json
│   ├── T_WorldMap.webp
│   └── T_TreeMap.webp
├── current.json
└── <game-version>/
    ├── manifest.json
    ├── palpagos.webp
    ├── world-tree.webp
    └── tiles/
```

Each game version remains separate. `current.json` selects the version served
by `/api/maps/manifest`; versioned tile responses are immutable and may be
cached safely.

## Startup synchronization

Automatic synchronization is enabled by default. PalHarbor:

1. Reads the live game version from Palworld's `/info` endpoint.
2. Downloads each configured HTTPS source using HTTP cache validators.
3. Rejects responses larger than 32 MiB or images that are not 8192 × 8192
   WebPs.
4. Hashes the validated sources and reuses an existing matching tile set.
5. Generates and atomically selects a new tile set when the source or game
   version changes.

Initial generation is CPU intensive, so the gateway begins listening after the
tile set is ready. Container logs report download/cache decisions and
incremental tile counts for each region throughout this work. Later startups
reuse matching tiles and complete quickly.

A temporary remote outage reuses the last validated source cache. If no valid
cache exists, PalHarbor logs a warning, starts normally, and keeps serving the
last successful map version or the coordinate-grid fallback.

## Override or disable downloads

The default URLs point to the community-maintained PalworldSaveTools copies:

```dotenv
PALWORLD_MAP_SYNC_ENABLED=true
PALWORLD_MAP_PALPAGOS_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_TreeMap.webp
```

Set either URL to another trusted HTTPS location to override its source. URLs
with embedded credentials, fragments, or non-HTTPS schemes are rejected.

Disable all startup synchronization when only the coordinate grid is wanted:

```dotenv
PALWORLD_MAP_SYNC_ENABLED=false
```

Docker Compose stores both downloaded sources and generated tiles in
`./palharbor-data`; no separate map-source directory or bind mount is required.

## Manual local generation

Developers can still generate tiles from explicitly supplied local files:

```bash
pnpm maps:sync -- \
  --palpagos /path/to/T_WorldMap.webp \
  --world-tree /path/to/T_TreeMap.webp
```

The manual command uses local files before remote sources. Use
`--version <value>` when the REST API is offline and `--data-dir <path>` to
place generated files outside the checkout.

Optional cave markers remain a local, explicit import. Provide a JSON array
whose entries contain numeric `x` and `y` fields and an optional `label`:

```json
[{ "x": 12345.5, "y": -67890, "label": "Example entrance" }]
```

Pass it with the same manual synchronization:

```bash
pnpm maps:sync -- \
  --palpagos /path/to/T_WorldMap.webp \
  --world-tree /path/to/T_TreeMap.webp \
  --cave-entrances /path/to/cave-entrances.json
```

PalHarbor validates and normalizes cave entries and never adds the result to
Git.
