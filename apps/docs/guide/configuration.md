# Configuration

PalHarbor reads gateway settings from `apps/api/.env`. The file is ignored by Git so credentials and machine-specific paths stay local.

## Complete example

```dotenv
PALWORLD_API_URL=http://127.0.0.1:8212/v1/api
PALWORLD_USERNAME=admin
PALWORLD_PASSWORD=replace-with-your-admin-password
PORT=4174
HOST=127.0.0.1
LOG_LEVEL=info
PALHARBOR_USERNAME=
PALHARBOR_PASSWORD=
PALHARBOR_ALLOWED_HOSTS=
PALHARBOR_ALLOWED_ORIGINS=
ALLOW_UNAUTHENTICATED_REMOTE=false
DATABASE_URL=file:./data/palharbor.sqlite
ACTIVITY_ENABLED=true
ACTIVITY_POLL_SECONDS=15
ACTIVITY_RETENTION_DAYS=90
STORE_PLAYER_IPS=false
PALWORLD_MAP_SYNC_ENABLED=true
PALWORLD_MAP_PALPAGOS_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_WorldMap.webp
PALWORLD_MAP_WORLD_TREE_URL=https://raw.githubusercontent.com/deafdudecomputers/PalworldSaveTools/main/resources/assets/maps/T_TreeMap.webp
```

## Environment variables

<div class="env-table">

| Variable                       | Required | Default                        | Description                                                                                                                              |
| ------------------------------ | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PALWORLD_API_URL`             | Yes      | —                              | Full Palworld REST base URL, normally ending in `/v1/api`. A trailing slash is removed.                                                  |
| `PALWORLD_USERNAME`            | Yes      | —                              | REST API Basic Auth username. Use the username configured for your server.                                                               |
| `PALWORLD_PASSWORD`            | Yes      | —                              | REST API administrator password. Never commit this value.                                                                                |
| `HOST`                         | No       | `127.0.0.1`                    | Interface on which the PalHarbor gateway listens.                                                                                        |
| `PORT`                         | No       | `4174`                         | Gateway port from `0` through `65535`. Invalid values fall back to `4174`; `0` asks the OS for an available port.                        |
| `LOG_LEVEL`                    | No       | `info`                         | Pino log level, such as `trace`, `debug`, `info`, `warn`, or `error`.                                                                    |
| `PALHARBOR_USERNAME`           | No       | —                              | Enables HTTP Basic authentication for the dashboard and PalHarbor API. Must be set with `PALHARBOR_PASSWORD`.                            |
| `PALHARBOR_PASSWORD`           | No       | —                              | PalHarbor operator password. Use a value different from the upstream Palworld administrator password.                                    |
| `PALHARBOR_ALLOWED_HOSTS`      | No       | —                              | Comma-separated DNS hostnames accepted by Host validation. IP literals and `localhost` are accepted automatically.                       |
| `PALHARBOR_ALLOWED_ORIGINS`    | No       | —                              | Additional comma-separated origins permitted to make mutations when a reverse proxy changes the apparent Host.                           |
| `ALLOW_UNAUTHENTICATED_REMOTE` | No       | `false`                        | Allows a non-loopback listener without built-in authentication. Use only when an authenticated proxy or equivalent boundary is verified. |
| `DATABASE_URL`                 | No       | `file:./data/palharbor.sqlite` | Prisma connection URL. Supports local SQLite (`file:`) and PostgreSQL (`postgresql:` or `postgres:`).                                    |
| `ACTIVITY_ENABLED`             | No       | `true`                         | Enables durable player activity collection.                                                                                              |
| `ACTIVITY_DATABASE_PATH`       | No       | —                              | Deprecated SQLite-only path retained for existing installations. Ignored when `DATABASE_URL` is set.                                     |
| `ACTIVITY_POLL_SECONDS`        | No       | `15`                           | Background player snapshot interval. Accepts 5–300 seconds; an invalid value falls back to 15.                                           |
| `ACTIVITY_RETENTION_DAYS`      | No       | `90`                           | Retains activity data for 1–3650 days and prunes older records daily.                                                                    |
| `STORE_PLAYER_IPS`             | No       | `false`                        | Opts into storing player IP observations. Client ports are always removed.                                                               |
| `MAP_DATA_PATH`                | No       | `apps/api/data/maps`           | Persistent remote-source cache and versioned local terrain tile storage.                                                                 |
| `PALWORLD_MAP_SYNC_ENABLED`    | No       | `true`                         | Downloads, validates, and synchronizes terrain maps during startup. Set `false` to use the grid fallback.                                |
| `PALWORLD_MAP_PALPAGOS_URL`    | No       | Built-in community URL         | Trusted HTTPS override for the 8192 × 8192 Palpagos WebP.                                                                                |
| `PALWORLD_MAP_WORLD_TREE_URL`  | No       | Built-in community URL         | Trusted HTTPS override for the 8192 × 8192 World Tree WebP.                                                                              |

</div>

Restart PalHarbor after changing environment variables.

## Connect to a server on another host

Set `PALWORLD_API_URL` to an address reachable **from the PalHarbor gateway**, not necessarily from your browser:

```dotenv
PALWORLD_API_URL=http://192.168.1.50:8212/v1/api
```

Allow the REST port only between trusted machines. Prefer a VPN or a firewall allowlist over public port forwarding.

## Listen on your LAN

The secure default accepts connections only from the local machine. To let other trusted devices reach the dashboard, bind to all interfaces:

```dotenv
HOST=0.0.0.0
PORT=4174
PALHARBOR_USERNAME=operator
PALHARBOR_PASSWORD=replace-with-a-long-unique-password
```

Then open `http://<palharbor-host>:4174` from the other device.

::: danger Keep the authentication boundary
PalHarbor refuses a non-loopback listener unless built-in credentials are set. If an authenticated reverse proxy supplies the boundary instead, set `ALLOW_UNAUTHENTICATED_REMOTE=true` only after verifying that PalHarbor cannot be reached around the proxy.
:::

## Activity storage

Prisma uses SQLite by default. The database and its WAL files live under `apps/api/data/`; they are ignored by Git and created automatically.

Use an absolute path when you want storage outside the checkout:

```dotenv
DATABASE_URL=file:/var/lib/palharbor/palharbor.sqlite
```

The process must be able to create and write the database and its parent directory. The database contains player identifiers, names, sessions, and latency aggregates. It contains IP history only when `STORE_PLAYER_IPS=true`; back it up and protect it as sensitive data.

To use PostgreSQL, create an empty database and provide its connection URL. PalHarbor creates the activity tables and indexes at startup:

```dotenv
DATABASE_URL=postgresql://palharbor:replace-me@127.0.0.1:5432/palharbor
```

Use the TLS and credential settings required by your PostgreSQL host. The configured user needs permission to create tables and indexes on first start and to read and write them afterward.

## Tune polling

`ACTIVITY_POLL_SECONDS` controls server-side activity collection. A shorter interval estimates connect and disconnect times more precisely but sends more `players` requests to Palworld.

The browser’s **Auto refresh** selector is separate. It controls dashboard reads and is stored in that browser’s local storage. Available values are Off, 5, 10, 30, and 60 seconds.
