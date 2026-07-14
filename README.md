# Paldeck

A local-first Vue dashboard for operating and monitoring a Palworld dedicated server. Paldeck covers every endpoint in the official `/v1/api` REST contract, adds safe auto-refresh, and keeps Basic Auth credentials in a Fastify gateway instead of the browser bundle.

## Run it

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Set the Palworld server URL and admin credentials in the ignored `apps/api/.env`, then open [http://localhost:5173](http://localhost:5173).

For a production-style local run:

```bash
pnpm build
pnpm start
```

Then open [http://localhost:4174](http://localhost:4174).

## What is covered

- Live `info`, `metrics`, and `players` monitoring with selectable 5/10/30/60-second refresh
- Lower-frequency settings refresh and a page-scoped 60-second GameData population radar
- Full player list with kick and ban controls
- Announcement, unban, save, graceful shutdown, and force-stop commands
- Typed confirmation phrases for high-impact actions
- Read-only rendering for every returned setting, including new keys unknown to the UI
- Same-origin allowlisted gateway for `info`, `players`, `settings`, `metrics`, `game-data`, `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`, and `stop`
- Durable player connection, IP, and latency history with first/last seen times, session start/end times, total playtime, daily trends, and leaderboards

## Project structure

The pnpm workspace contains two applications and one shared package:

- `apps/web` — Vue, Vite, and Vue Router. Each monitor area is a real page at `/overview`, `/players`, `/activity`, `/world`, `/settings`, or `/commands`. The persistent application shell owns one shared polling lifecycle across route changes.
- `apps/api` — Fastify and Pino. `src/core` owns configuration, structured logging, and the Fastify factory; `src/router.ts` is the primitive route registrar; `src/routes` contains HTTP route definitions; `src/palworld` owns the endpoint policy and upstream client; and `src/activity` owns the background tracker.
- `packages/database` — Prisma ORM 7, the activity repository, the canonical data model, generated SQLite/PostgreSQL clients, and provider adapters.

Production serves the built Vue application through Fastify, including history fallback for direct page links without turning missing `/api` requests into HTML responses.

## Player activity database

Activity collection runs inside Fastify and does not depend on a browser being open. Every successful Palworld player snapshot opens, updates, or closes durable sessions keyed by `userId`. Failed or malformed snapshots leave existing sessions untouched, preventing false disconnects during outages.

Prisma ORM 7 backs activity storage. SQLite remains the default through Prisma's libSQL adapter; `apps/api/data/paldeck.sqlite` is created automatically and ignored by Git along with its WAL files. PostgreSQL is supported through Prisma's `pg` adapter. Set `DATABASE_URL` to select the provider at runtime.

Both providers are generated from the single canonical model at `packages/database/prisma/schema.prisma`. Prisma embeds the datasource provider in its generated client, so the database package renders that model into ignored provider-specific schemas and initializes the matching client. Run `pnpm db:generate` after changing the canonical model.

Both providers store player IDs, names, levels, observed timestamps, historical IP-address observations, and daily latency rollups. Each player/address pair retains its first and latest sighting plus an observation count; optional client ports are removed before storage. Latency is kept as per-player daily totals and sample counts rather than raw polling records, which keeps storage bounded while supporting weighted reporting-period averages. Treat the database as sensitive. Tracking begins when Paldeck is running, so it cannot reconstruct sessions or latency from before its first observation. Connection and disconnection times are estimates within the configured polling interval.

Optional settings in `apps/api/.env`:

```dotenv
DATABASE_URL=file:./data/paldeck.sqlite
ACTIVITY_POLL_SECONDS=15
```

For PostgreSQL, create the database first and use a standard connection URL:

```dotenv
DATABASE_URL=postgresql://paldeck:replace-me@127.0.0.1:5432/paldeck
```

The legacy `ACTIVITY_DATABASE_PATH` setting is still accepted for SQLite, but `DATABASE_URL` is preferred. The Activity page reads `GET /api/activity/summary?days=7|14|30|90` and shows tracked players, sessions, total and average playtime, current sessions, daily activity, top players, per-player average latency with sample counts and quality labels, recent connection history, and IP records last observed during the selected period. Node.js 24.15 or newer is required.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
```

The supplied server was live-tested successfully for info, metrics, players, settings, and `game-data`. The World Data page plots the live actor coordinates, filters population layers, and refreshes only while that page is active. Destructive operations were contract-tested against a mocked upstream and their confirmation flows were browser-tested without kicking players or stopping the live server.

## Security

Palworld warns that its REST API is not intended for public Internet exposure. Paldeck binds to localhost by default, never sends the admin password to Vue, and does not include it in tracked files. Pino redacts authorization and credential fields, and mutation requests require a Paldeck-only request marker. Keep the gateway on the same machine or a trusted LAN/VPN. If you intentionally bind it beyond localhost, put authentication in front of Paldeck first.

The username `admin` works on the tested server but is not specified as a default in the official REST documentation. Use a unique admin password and rotate it if it has been shared.
