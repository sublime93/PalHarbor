# Troubleshooting

Start with the gateway health response and the terminal running `pnpm dev` or `pnpm start`.

```bash
curl -i http://127.0.0.1:4174/api/health
```

## Dashboard says the connection is not configured

The gateway returns `503` when one or more required connection values are empty.

1. Confirm `apps/api/.env` exists.
2. Set `PALWORLD_API_URL`, `PALWORLD_USERNAME`, and `PALWORLD_PASSWORD` to non-empty values.
3. Restart PalHarbor.
4. Confirm `/api/health` returns `{"configured":true}`.

## Palworld server cannot be reached

A `502` with an unreachable or timeout message means the gateway could not complete the upstream request.

- Confirm Palworld is running.
- In the active `PalWorldSettings.ini` file, set `RESTAPIEnabled=True` and verify `RESTAPIPort`.
- Restart Palworld after changing either setting.
- Test the host and port from the machine running PalHarbor.
- Check that `PALWORLD_API_URL` includes `/v1/api`.
- Check local and host firewalls.
- If Palworld runs in a container or VM, do not use `127.0.0.1` unless the gateway shares that network namespace.

Read endpoints time out after 12 seconds except `game-data`, which allows 30 seconds.

## Credentials are rejected

An upstream `401` means the Palworld server rejected the Basic Auth values. Re-enter the REST administrator username and password in `apps/api/.env`, then restart PalHarbor.

The username `admin` works on some servers but is not assumed by PalHarbor. Use the account configured on your server.

## An endpoint is unavailable

An upstream `404` indicates that the installed Palworld server does not expose that endpoint. Update the dedicated server and verify that its REST API version supports the requested operation.

The world snapshot uses `/v1/api/game-data`, which was added to the Palworld 1.0.0 REST API. There is no separate documented GameData enable switch: update the dedicated server if this endpoint is missing, confirm `RESTAPIEnabled=True`, and restart Palworld.

## Dashboard loads but API requests fail in development

The Vite dashboard runs on port `5173` and proxies `/api` to `127.0.0.1:4174`. Make sure both `gateway` and `web` processes remain running in the terminal. A separate dashboard-only command will not start the API.

## Activity page is empty

- Activity starts when PalHarbor first runs; historical sessions cannot be reconstructed.
- Wait for at least one successful player snapshot.
- Confirm the gateway can read the Palworld `players` endpoint.
- Check that `ACTIVITY_POLL_SECONDS` is between 5 and 300.
- For SQLite, check that the process can write the directory in `DATABASE_URL`.
- For PostgreSQL, verify the connection URL, database availability, and table permissions.

## Port already in use

Change the gateway port in `apps/api/.env`:

```dotenv
PORT=4180
```

For development, also update the `/api` proxy target in `apps/web/vite.config.ts` to the same port. Production does not need a separate frontend proxy because the gateway serves the built application.

## Collect more diagnostic detail

Temporarily increase logging:

```dotenv
LOG_LEVEL=debug
```

Restart PalHarbor and reproduce the request. Logs redact authorization and known credential fields, but review diagnostic output before sharing it because server metadata can still be sensitive.
