<p align="center">
  <img src="apps/docs/public/logo.svg" width="112" alt="PalHarbor logo">
</p>

<h1 align="center">PalHarbor</h1>

<p align="center">
  A friendly, local-first control room for your Palworld dedicated server.
</p>

<p align="center">
  <a href="https://github.com/sublime93/PalHarbor/actions/workflows/ci.yml"><img src="https://github.com/sublime93/PalHarbor/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-32c8b4.svg" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/Node.js-24.15%2B-5fa04e.svg" alt="Node.js 24.15 or newer">
</p>

PalHarbor gives server owners one clean dashboard for live health, players,
world activity, and administrative commands. The Vue frontend talks to a
same-origin Fastify gateway, so your Palworld administrator password stays on
the server and never enters the browser bundle.

> **Unofficial fan project:** PalHarbor is not affiliated with, endorsed by, or
> sponsored by Pocketpair, Inc. Palworld and its game content are property of
> Pocketpair. This repository does not distribute extracted game artwork.

## Why PalHarbor?

- **See the server at a glance.** Follow FPS, uptime, connected players,
  settings, and world population without juggling API calls.
- **Operate with guardrails.** Kick, ban, announce, save, shut down, or stop
  the server with typed confirmations for high-impact actions.
- **Keep useful history.** Review sessions, playtime, latency trends, and daily
  activity in SQLite or PostgreSQL—even when no browser is open.
- **Stay local by default.** PalHarbor binds to loopback, keeps credentials in
  the gateway, and is designed for localhost, trusted LAN, or VPN access.

## Quick start

You need Node.js 24.15 or newer, Corepack, and an existing Palworld dedicated
server with its REST API enabled.

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Set `PALWORLD_API_URL`, `PALWORLD_USERNAME`, and `PALWORLD_PASSWORD` in the
ignored `apps/api/.env`, then open
[http://localhost:5173](http://localhost:5173). That is enough for a first
local run.

> [!IMPORTANT]
> PalHarbor and the Palworld REST API both grant administrative access. Keep
> them on localhost, a trusted LAN, or a VPN—never directly on the public
> Internet.

For the full walkthrough, see [Getting started](apps/docs/guide/getting-started.md)
and [Configuration](apps/docs/guide/configuration.md).

### Production-style local run

```bash
pnpm build
pnpm start
```

Then open [http://localhost:4174](http://localhost:4174).

### Docker Compose

Set `PALWORLD_USERNAME`, `PALWORLD_PASSWORD`, `PALHARBOR_USERNAME`, and
`PALHARBOR_PASSWORD` in a local root `.env` file, then run:

```bash
docker compose up --build -d
```

Compose binds the dashboard to localhost, requires separate PalHarbor operator
credentials, runs as a non-root user, and persists activity and versioned map
data in the `palharbor-data` volume.

## What you get

- Live `info`, `metrics`, and `players` monitoring with selectable 5/10/30/60-second refresh
- Lower-frequency settings refresh and a page-scoped 60-second GameData population radar
- Full player list with kick and ban controls
- Announcement, unban, save, graceful shutdown, and force-stop commands
- Typed confirmation phrases for high-impact actions
- Read-only rendering for every returned setting, including new keys unknown to the UI
- Same-origin allowlisted gateway for `info`, `players`, `settings`, `metrics`, `game-data`, `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`, and `stop`
- Durable player connection and latency history with first/last seen times, session start/end times, total playtime, daily trends, and leaderboards; IP history is explicitly opt-in

## How it fits together

```text
Browser dashboard  →  PalHarbor gateway  →  Palworld REST API
   localhost             localhost          trusted LAN
```

## Project structure

The pnpm workspace contains three applications:

- `apps/web` — Vue, Vite, and Vue Router. Each monitor area is a real page at `/overview`, `/players`, `/activity`, `/world`, `/settings`, or `/commands`. The persistent application shell owns one shared polling lifecycle across route changes.
- `apps/api` — Fastify and Pino. `src/core` owns configuration, structured logging, and the Fastify factory; `src/router.ts` is the primitive route registrar; `src/routes` contains HTTP route definitions; `src/palworld` owns the endpoint policy; and `src/activity` owns the background tracker.
- `apps/docs` — VitePress user documentation for installation, configuration, operations, activity tracking, security, and troubleshooting.
- `packages/database` — Prisma ORM 7, the activity repository, generated SQLite/PostgreSQL clients, and provider adapters.

Production serves the built Vue application through Fastify, including history fallback for direct page links without turning missing `/api` requests into HTML responses.

## Documentation

The repository includes a complete VitePress guide covering installation,
configuration, day-to-day operation, activity tracking, map assets, security,
and troubleshooting. Start with the
[documentation index](apps/docs/index.md), or run it locally:

Run the documentation site locally at [http://localhost:5174](http://localhost:5174):

```bash
pnpm docs:dev
```

Use `pnpm docs:build` to validate and generate the static site, or `pnpm docs:preview` to preview the generated output at [http://localhost:4175](http://localhost:4175).

## Player activity database

Activity collection runs inside Fastify and does not depend on a browser being open. Every successful Palworld player snapshot opens, updates, or closes durable sessions keyed by `userId`. Failed or malformed snapshots leave existing sessions untouched, preventing false disconnects during outages.

Prisma 7 uses SQLite by default through its libSQL driver adapter. The database at `apps/api/data/palharbor.sqlite` is created automatically and ignored by Git along with its WAL files. Existing installations with a `paldeck.sqlite` database continue using that file so the rename does not hide collected history. The legacy `ACTIVITY_DATABASE_PATH` setting remains supported, but `DATABASE_URL` is preferred.

PostgreSQL is supported through Prisma's `pg` adapter. Create the database first, then set a standard `postgresql://` connection URL; PalHarbor creates the activity tables and indexes on startup. Both providers store the same player IDs, names, levels, timestamps, historical IP observations, sessions, and daily latency rollups. Optional client ports are removed before storage, and latency is kept as bounded daily totals and sample counts rather than raw polling records.

Optional settings in `apps/api/.env`:

```dotenv
DATABASE_URL=file:./data/palharbor.sqlite
ACTIVITY_ENABLED=true
ACTIVITY_POLL_SECONDS=15
ACTIVITY_RETENTION_DAYS=90
STORE_PLAYER_IPS=false
```

For PostgreSQL:

```dotenv
DATABASE_URL=postgresql://palharbor:replace-me@127.0.0.1:5432/palharbor
```

The Activity page reads `GET /api/activity/summary?days=7|14|30|90` and shows tracked players, sessions, total and average playtime, current sessions, daily activity, top players, per-player average latency with sample counts and quality labels, and recent connection history. IP storage is opt-in. Data older than the configured retention period is pruned automatically. Node.js 24.15 or newer is required.

## Local map assets

The Palworld REST API provides live actor coordinates but does not provide map
artwork. PalHarbor therefore keeps generated terrain tiles outside Git under
`apps/api/data/maps/<game-version>`. After exporting `T_WorldMap.webp` and
`T_TreeMap.webp` from a server installation you are authorized to use, run:

```bash
pnpm maps:sync -- --palpagos /path/to/T_WorldMap.webp --world-tree /path/to/T_TreeMap.webp
```

The command reads the current game version from `/v1/api/info`, generates a
versioned tile pyramid, and atomically selects that version. See the
documentation site’s map-assets guide for server-root discovery and explicit
version options. Setting `PALWORLD_MAP_PALPAGOS_SOURCE` and
`PALWORLD_MAP_WORLD_TREE_SOURCE` makes the same synchronization run
automatically on startup; unchanged source hashes are skipped. Optional
cave-entrance coordinates can be imported from a local JSON file; no
third-party or game-derived coordinate dataset is bundled.

## Validation

```bash
pnpm check
pnpm test:e2e
```

`pnpm check` enforces type checking, ESLint, Prettier, per-package coverage
floors, production builds, and the documentation build. The Playwright suite
starts the built application, checks client-side deep links, and runs automated
WCAG A/AA checks. CI also exercises PostgreSQL, audits production dependencies,
and builds the container.

The supplied server was live-tested successfully for info, metrics, players, settings, and `game-data`. The World Data page plots the live actor coordinates, filters population layers, and refreshes only while that page is active. Destructive operations were contract-tested against a mocked upstream and their confirmation flows were browser-tested without kicking players or stopping the live server.

## Security

Palworld warns that its REST API is not intended for public Internet exposure. PalHarbor binds to localhost by default, never sends the admin password to Vue, and does not include it in tracked files. Pino redacts authorization and credential fields, and mutation requests require a PalHarbor-only request marker. Non-loopback listeners require built-in PalHarbor credentials unless an operator explicitly acknowledges that an authenticated proxy supplies the boundary. Keep the gateway on the same machine or a trusted LAN/VPN.

The username `admin` works on the tested server but is not specified as a default in the official REST documentation. Use a unique admin password and rotate it if it has been shared.

Found a vulnerability? Please follow the private reporting process in
[SECURITY.md](SECURITY.md) rather than opening a public issue.

## Contributing

Ideas, fixes, and documentation improvements are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and pull request
checklist, and please keep game assets, credentials, player data, save files,
and production databases out of contributions.

## Author

PalHarbor was created by [Jordan Vohwinkel](https://github.com/sublime93).

## License

PalHarbor is available under the [MIT License](LICENSE).
