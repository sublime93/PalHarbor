# Security

PalHarbor is designed for a trusted administrative network. Its gateway keeps the Palworld Basic Auth credentials out of the Vue bundle and applies an allowlist of supported upstream endpoints and HTTP methods.

## Safe deployment checklist

- Keep `HOST=127.0.0.1` unless other machines must use PalHarbor.
- Keep both PalHarbor and the Palworld REST API off the public Internet.
- Use a firewall or VPN between the gateway, server, and administrators.
- If PalHarbor is reachable beyond localhost, configure `PALHARBOR_USERNAME` and `PALHARBOR_PASSWORD` or require authentication at a reverse proxy.
- Store `apps/api/.env` and the activity database with restricted file permissions.
- Use a strong Palworld administrator password and rotate it after accidental disclosure.
- Review the selected player before kick or ban actions.
- Save the world before shutdown, and prefer graceful shutdown over force stop.

## Gateway boundaries

The gateway accepts only these Palworld operations:

- Reads: `info`, `players`, `settings`, `metrics`, and `game-data`
- Mutations: `announce`, `kick`, `ban`, `unban`, `save`, `shutdown`, and `stop`

Mutation requests also require PalHarbor’s `X-PalHarbor-Request: 1` marker. This is a request-integrity check, not user authentication. The gateway sets `Cache-Control: no-store` on proxied responses and redacts authorization and credential fields from logs.

PalHarbor rejects unrecognized DNS Host headers, cross-origin mutations, and framing by other sites. Responses include a restrictive Content Security Policy and browser hardening headers. Add reverse-proxy DNS names to `PALHARBOR_ALLOWED_HOSTS`; add an origin override only when the proxy's public origin and forwarded Host intentionally differ.

## Browser exposure

The browser calls same-origin `/api` routes. It does not receive `PALWORLD_USERNAME` or `PALWORLD_PASSWORD`, and those values are not compiled into the frontend.

Anyone who passes the configured PalHarbor authentication boundary can use its administrative controls. Network access control or an authenticated proxy remains recommended when binding beyond localhost.
