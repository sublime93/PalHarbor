# Local map assets

PalHarbor does not distribute Palworld terrain artwork. The official REST API's
`game-data` endpoint provides live actor coordinates, but it does not provide
map textures or tiles.

Generated map files live in the ignored directory:

```text
apps/api/data/maps/
├── current.json
└── <game-version>/
    ├── manifest.json
    ├── cave-entrances.json  # optional
    ├── palpagos.webp
    ├── world-tree.webp
    └── tiles/
```

Each game version remains separate. `current.json` selects the version served
by `/api/maps/manifest`; versioned tile responses are immutable and may be
cached safely.

## Generate tiles after a game update

Export these textures from a Palworld server installation you are authorized
to use:

- `T_WorldMap.webp` for Palpagos
- `T_TreeMap.webp` for World Tree

Then run:

```bash
pnpm maps:sync -- \
  --palpagos /path/to/T_WorldMap.webp \
  --world-tree /path/to/T_TreeMap.webp
```

The command queries the configured Palworld `/info` endpoint and uses its
`version` field for the data directory. It validates both source images,
generates zoom levels 0–4 and fallback images, records SHA-256 source hashes,
and changes the current-version pointer only after generation succeeds.

## Synchronize automatically during startup

Set both source locations in `apps/api/.env`:

```dotenv
PALWORLD_MAP_PALPAGOS_SOURCE=/absolute/path/to/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_SOURCE=/absolute/path/to/T_TreeMap.webp
```

When either source variable or `PALWORLD_SERVER_ROOT` is configured, PalHarbor
runs the importer before it starts listening for HTTP requests. Both textures
must ultimately be available, either from their explicit paths or by discovery
under `PALWORLD_SERVER_ROOT`.

On each startup the importer reads the live game version and hashes the source
files. It immediately reuses an existing version when those hashes match, so
unchanged maps are not regenerated. A failed import is logged as a warning and
PalHarbor continues starting with the last successfully generated map data.

For Docker Compose, put the exported files in `map-sources/` or set
`PALWORLD_MAP_SOURCE_DIR` in the root `.env` to an absolute host directory.
Source paths passed to the container must use the `/map-sources` mount:

```dotenv
PALWORLD_MAP_SOURCE_DIR=/absolute/host/path/to/exported-maps
PALWORLD_MAP_PALPAGOS_SOURCE=/map-sources/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_SOURCE=/map-sources/T_TreeMap.webp
```

Compose mounts that source directory read-only and keeps generated output in
the separate `palharbor-data` volume. The source directory is excluded from
both Git and the Docker build context.

If the server installation contains already-extracted WebP files, PalHarbor can
search it:

```bash
pnpm maps:sync -- --server-root /path/to/steamapps/common/PalServer
```

The dedicated server normally stores content in Unreal containers, so server
root discovery cannot extract textures from `.pak` or `.utoc` files. Exporting
those files requires a compatible Unreal asset tool; PalHarbor intentionally
does not download artwork from third-party repositories.

To add cave markers without redistributing a game-derived dataset, provide a
local JSON array whose entries contain numeric `x` and `y` fields and an
optional `label`:

```json
[{ "x": 12345.5, "y": -67890, "label": "Example entrance" }]
```

Pass it during the same sync:

```bash
pnpm maps:sync -- \
  --palpagos /path/to/T_WorldMap.webp \
  --world-tree /path/to/T_TreeMap.webp \
  --cave-entrances /path/to/cave-entrances.json
```

PalHarbor validates and normalizes the entries, stores them alongside that game
version, and never adds the result to Git.

Use `--version <value>` when the REST API is offline, and `--data-dir <path>`
to place generated files outside the checkout. Equivalent environment settings
are `PALWORLD_SERVER_ROOT`, `PALWORLD_MAP_PALPAGOS_SOURCE`,
`PALWORLD_MAP_WORLD_TREE_SOURCE`, `PALWORLD_CAVE_ENTRANCES_SOURCE`, and
`MAP_DATA_PATH`.
