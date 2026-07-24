# Install and run

PalHarbor is a local-first dashboard for an existing Palworld dedicated server. Run the gateway on the same machine as the server or on a trusted host that can reach its REST API.

## Prerequisites

- Node.js 24.15 or newer
- pnpm 11.4 (managed through Corepack from `package.json`)
- A Palworld dedicated server with its REST API enabled
- The REST API URL, administrator username, and administrator password

::: warning Keep it private
The Palworld REST API and PalHarbor both grant administrative access. Keep them on localhost, a trusted LAN, or a VPN. Do not expose either service directly to the public Internet.
:::

## 1. Install dependencies

From the repository root:

```bash
corepack enable
pnpm install
```

## 2. Create the gateway configuration

Copy the tracked example to the ignored local environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

At minimum, replace these values:

```dotenv
PALWORLD_API_URL=http://127.0.0.1:8212/v1/api
PALWORLD_USERNAME=admin
PALWORLD_PASSWORD=your-strong-admin-password
```

The URL should include `/v1/api`. PalHarbor removes a trailing slash automatically. See [Configuration](/guide/configuration) for all available settings.

## 3. Start development mode

```bash
pnpm dev
```

This starts both applications:

| Service   | Address                                        | Purpose                                          |
| --------- | ---------------------------------------------- | ------------------------------------------------ |
| Dashboard | [http://localhost:5173](http://localhost:5173) | Vite development server                          |
| Gateway   | [http://127.0.0.1:4174](http://127.0.0.1:4174) | Fastify API; dashboard requests are proxied here |

Open the dashboard address. The header should show **Live**, and the Overview page should populate with the server name and metrics.

## Production-style local run

Build every workspace and start the gateway:

```bash
pnpm build
pnpm start
```

Open [http://127.0.0.1:4174](http://127.0.0.1:4174). In this mode Fastify serves the built dashboard and API from the same origin.

## Docker Compose

Set `PALWORLD_USERNAME`, `PALWORLD_PASSWORD`, `PALHARBOR_USERNAME`, and
`PALHARBOR_PASSWORD` in a local `.env` file at the repository root. Override
`PALWORLD_API_URL` if the default `http://host.docker.internal:8212/v1/api`
does not reach your server, then run:

```bash
docker compose up -d
```

The dashboard is available at [http://127.0.0.1:4174](http://127.0.0.1:4174).
The container runs as a non-root user and stores its SQLite database, remote
map-source cache, and generated tile data in the `palharbor-data` directory.
The Compose port remains bound to the host loopback interface; use a VPN or
authenticated reverse proxy rather than changing that binding for public
Internet access.

Terrain synchronization is enabled automatically with preconfigured community
sources. Override either trusted HTTPS URL in the same root `.env` when needed:

```dotenv
PALWORLD_MAP_PALPAGOS_URL=https://example.test/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_URL=https://example.test/T_TreeMap.webp
```

Set `PALWORLD_MAP_SYNC_ENABLED=false` to disable downloading and retain the
coordinate-grid fallback. No map-source bind mount is required.

## Confirm the gateway is configured

The health endpoint reports whether all three upstream connection values are present:

```bash
curl http://127.0.0.1:4174/api/health
```

Expected response:

```json
{ "configured": true }
```

This only validates that configuration is present. Use the dashboard or request a read endpoint to confirm that the Palworld server is reachable and the credentials are accepted.

## Stop PalHarbor

Press `Ctrl+C` in the terminal running PalHarbor. The gateway stops the activity tracker, closes active sessions, and disconnects the Prisma database client cleanly.
