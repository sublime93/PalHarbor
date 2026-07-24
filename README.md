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
  <img src="https://img.shields.io/badge/Docker-Compose-2496ed.svg?logo=docker&logoColor=white" alt="Docker Compose">
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

## Run with Docker

The recommended setup uses Docker Compose. You do not need Node.js, pnpm, or a
local database installation.

### Prerequisites

- Docker Engine or Docker Desktop with the Compose plugin
- An existing Palworld dedicated server with its REST API enabled
- The REST API URL, administrator username, and administrator password

The API URL must be reachable **from the container** and normally ends in
`/v1/api`. Port `8212` is common, but use the REST API port configured on your
server.

> [!IMPORTANT]
> PalHarbor and the Palworld REST API both grant administrative access. Keep
> them on the same machine, a trusted LAN, or a VPN. Do not expose either
> service directly to the public Internet.

### 1. Create the Docker configuration

Clone the repository, copy the Docker environment template, and edit `.env`:

```bash
git clone https://github.com/sublime93/PalHarbor.git
cd PalHarbor
cp .env.example .env
```

Review the API URL and usernames, then replace both `replace-me` passwords:

```dotenv
PALWORLD_API_URL=http://host.docker.internal:8212/v1/api
PALWORLD_USERNAME=admin
PALWORLD_PASSWORD=replace-me-with-your-palworld-admin-password

PALHARBOR_USERNAME=operator
PALHARBOR_PASSWORD=replace-me-with-a-long-unique-password
```

The PalHarbor login is separate from the upstream Palworld administrator
login. Use a different, unique password for each.

### 2. Start PalHarbor

```bash
docker compose up -d
```

Compose pulls the published image and then:

- publishes the dashboard at
  [http://127.0.0.1:4174](http://127.0.0.1:4174);
- requires the `PALHARBOR_USERNAME` and `PALHARBOR_PASSWORD` login;
- runs the application as a non-root user; and
- persists the SQLite database and map data in the `palharbor-data` volume.

Open the dashboard and sign in with the PalHarbor credentials from `.env`.

### 3. Verify the container

```bash
docker compose ps
docker compose logs --tail=100 palharbor
curl --user 'operator:your-palharbor-password' \
  http://127.0.0.1:4174/api/health
```

A configured gateway returns:

```json
{ "configured": true }
```

This confirms that the three upstream values are present. The Overview page is
the final check that the container can reach Palworld and that its credentials
are accepted.

## Connecting the container to Palworld

`PALWORLD_API_URL` is resolved by the PalHarbor container, not by your browser.
Choose the address that matches your deployment:

- **Palworld on the Docker host:** keep
  `http://host.docker.internal:8212/v1/api`. The Compose file includes the
  Linux host-gateway mapping; Docker Desktop provides the same hostname.
- **Palworld on another trusted machine:** use its LAN or VPN address, for
  example `http://192.168.1.50:8212/v1/api`.
- **Palworld in Docker:** attach both services to the same Docker network and
  use the Palworld service name, such as
  `http://palworld:8212/v1/api`.

Allow the REST port only between trusted machines or containers. If the
dashboard says the gateway is configured but upstream requests fail, inspect
`docker compose logs -f palharbor` and test the configured address from the
Docker host.

## Docker configuration

The root [`.env.example`](.env.example) contains the complete Compose-oriented
configuration. Restart the container after changing `.env`:

```bash
docker compose up -d --force-recreate
```

### Required settings

| Variable             | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `PALWORLD_USERNAME`  | Username configured for the Palworld REST API.                        |
| `PALWORLD_PASSWORD`  | Palworld REST administrator password. Never commit this value.        |
| `PALHARBOR_USERNAME` | Username used to sign in to PalHarbor.                                |
| `PALHARBOR_PASSWORD` | PalHarbor password; use a value different from the Palworld password. |

`PALWORLD_API_URL` defaults to
`http://host.docker.internal:8212/v1/api`, but it must be changed when that
address does not reach your server.

### Network and access settings

| Variable                       | Default     | Purpose                                                                                                                                    |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PALHARBOR_BIND_ADDRESS`       | `127.0.0.1` | Host interface published by Compose. Keep loopback for local use or a host-local proxy; use a trusted interface address for remote access. |
| `PALHARBOR_PORT`               | `4174`      | Port opened on the Docker host. The container continues to listen internally on `4174`.                                                    |
| `PALHARBOR_ALLOWED_HOSTS`      | empty       | Comma-separated DNS hostnames accepted by Host validation. IP literals and `localhost` are accepted automatically.                         |
| `PALHARBOR_ALLOWED_ORIGINS`    | empty       | Additional comma-separated origins permitted to make mutations when a reverse proxy changes the apparent host.                             |
| `ALLOW_UNAUTHENTICATED_REMOTE` | `false`     | Runtime escape hatch for direct-image proxy deployments. The bundled Compose setup still requires PalHarbor credentials.                   |
| `LOG_LEVEL`                    | `info`      | Pino log level, such as `debug`, `info`, `warn`, or `error`.                                                                               |

To serve trusted LAN or VPN devices directly, set `PALHARBOR_BIND_ADDRESS` to
the host's address on that trusted network and keep the built-in PalHarbor
credentials enabled. Use `0.0.0.0` only when a firewall limits which networks
can connect. Prefer a VPN or an HTTPS reverse proxy; HTTP Basic credentials are
not encrypted by plain HTTP.

### Activity and database settings

| Variable                  | Default                        | Purpose                                                                              |
| ------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`            | `file:./data/palharbor.sqlite` | SQLite, `postgresql:`, or `postgres:` connection URL.                                |
| `ACTIVITY_ENABLED`        | `true`                         | Enables server-side player activity collection even when no browser is open.         |
| `ACTIVITY_POLL_SECONDS`   | `15`                           | Player snapshot interval from 5 through 300 seconds. Invalid values fall back to 15. |
| `ACTIVITY_RETENTION_DAYS` | `90`                           | Retention from 1 through 3650 days. Older activity is pruned daily.                  |
| `STORE_PLAYER_IPS`        | `false`                        | Opts into storing player IP observations. Client ports are always removed.           |

SQLite data is created automatically inside the persistent
`palharbor-data` volume. To use PostgreSQL, create an empty database first and
set a connection URL in `.env`:

```dotenv
DATABASE_URL=postgresql://palharbor:replace-me@192.168.1.20:5432/palharbor
```

The database account needs permission to create tables and indexes on first
start and read/write access afterward.

## Day-to-day Docker commands

```bash
# Follow logs
docker compose logs -f palharbor

# Restart
docker compose restart palharbor

# Stop and remove the container while preserving data
docker compose down

# Pull and recreate with the newest published images
docker compose pull
docker compose up -d
```

Do not run `docker compose down -v` unless you intentionally want to delete the
SQLite history and stored map data.

## Published container images

Tagged GitHub releases publish
`ghcr.io/sublime93/palharbor`. Stable releases also update `latest`; release
candidates keep only their full prerelease tag. Pin a numbered version for
repeatable deployments.

Once a release is available, the image can be run without cloning the source:

```bash
docker run -d \
  --name palharbor \
  --restart unless-stopped \
  --env-file .env \
  --add-host host.docker.internal:host-gateway \
  -p 127.0.0.1:4174:4174 \
  -v palharbor-data:/prod/api/data \
  ghcr.io/sublime93/palharbor:latest
```

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
  local/LAN/VPN          Docker host         trusted host
```

## Player activity database

Activity collection runs in the container and does not depend on a browser
being open. Successful Palworld player snapshots open, update, or close durable
sessions; failed snapshots do not create false disconnects.

The default SQLite database lives at `/prod/api/data/palharbor.sqlite` inside
the `palharbor-data` volume. Protect and back up that volume: it contains
player identifiers, names, sessions, levels, timestamps, playtime, and latency
aggregates. IP observations are stored only when `STORE_PLAYER_IPS=true`, and
client ports are always removed.

PostgreSQL stores the same information and can be selected with
`DATABASE_URL`. PalHarbor creates its activity tables and indexes on startup.
The Activity page provides 7, 14, 30, and 90-day views, while
`ACTIVITY_RETENTION_DAYS` controls how long the underlying records are kept.

## Automatic map assets

PalHarbor downloads the Palpagos and World Tree terrain images during startup,
validates them, and generates the local tile pyramid in the persistent
`palharbor-data` directory. No separate map-source mount or `pnpm` command is
required.

The default URLs point to the community-maintained PalworldSaveTools copies of
`T_WorldMap.webp` and `T_TreeMap.webp`. They are not bundled in the PalHarbor
container and remain Pocketpair artwork. Operators can override either trusted
HTTPS source in `.env`:

```dotenv
PALWORLD_MAP_SYNC_ENABLED=true
PALWORLD_MAP_PALPAGOS_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_TreeMap.webp
```

On each startup PalHarbor uses HTTP cache validators, validates the WebP
format and 8192 × 8192 dimensions, and hashes the sources. An unchanged source
reuses the existing tile set; a changed source or Palworld version creates and
atomically selects a new version. A validated cached download remains usable
when the remote source is temporarily unavailable. Initial generation reports
download decisions and per-region tile counts in the container logs. Set
`PALWORLD_MAP_SYNC_ENABLED=false` to opt out and use the coordinate-grid
fallback.

## Security

Palworld warns that its REST API is not intended for public Internet exposure.
PalHarbor binds to localhost by default, never sends the admin password to Vue,
and does not include it in tracked files. Pino redacts authorization and
credential fields, and mutation requests require a PalHarbor-only request
marker. Non-loopback listeners require built-in PalHarbor credentials unless
an operator explicitly acknowledges that an authenticated proxy supplies the
boundary. Keep the gateway on the same machine or a trusted LAN/VPN.

The username `admin` works on the tested server but is not specified as a
default in the official REST documentation. Use a unique admin password and
rotate it if it has been shared.

Found a vulnerability? Please follow the private reporting process in
[SECURITY.md](SECURITY.md) rather than opening a public issue.

## Development

The Docker workflow above is intended for operators. To work on PalHarbor
itself, install Node.js 24.15 or newer and use the pnpm version pinned in
`package.json`:

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Set the Palworld connection values in `apps/api/.env`, then open the Vite
development server at [http://localhost:5173](http://localhost:5173).

For a production-style local run without Docker:

```bash
pnpm build
pnpm start
```

The built application is served at
[http://127.0.0.1:4174](http://127.0.0.1:4174).

### Validation

```bash
pnpm check
pnpm test:e2e
```

`pnpm check` runs type checking, ESLint, Prettier, package coverage suites,
production builds, and the documentation build. Playwright checks production
deep links and automated WCAG A/AA rules. CI also exercises PostgreSQL, audits
production dependencies, and builds the container.

### Project structure

The pnpm workspace contains:

- `apps/web` — Vue dashboard and shared polling lifecycle
- `apps/api` — Fastify gateway, access controls, Palworld policy, maps, and
  activity tracking
- `apps/docs` — VitePress user documentation
- `packages/database` — Prisma SQLite/PostgreSQL clients and activity
  repository

Production serves the built Vue application and API from the same Fastify
origin.

### Documentation

Start with the [documentation index](apps/docs/index.md). To run the VitePress
site locally:

```bash
pnpm docs:dev
```

Use `pnpm docs:build` to validate the static site or `pnpm docs:preview` to
preview its generated output.

## Contributing

Ideas, fixes, and documentation improvements are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and pull request
checklist, and please keep game assets, credentials, player data, save files,
and production databases out of contributions.

## Author

PalHarbor was created by [Jordan Vohwinkel](https://github.com/sublime93).

## License

PalHarbor is available under the [MIT License](LICENSE).
