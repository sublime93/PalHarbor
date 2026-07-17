# Player activity

Activity collection runs in the Fastify gateway, so it continues without an open dashboard. On each successful player snapshot, PalHarbor opens, updates, or closes sessions keyed by the player’s user ID.

## What is recorded

- Player user ID, player ID, names, and level
- Session start and estimated end time
- Total and average playtime
- Daily player and session trends
- Per-player daily latency totals and sample counts
- IP addresses with first seen, last seen, and observation count, only when `STORE_PLAYER_IPS=true`

IP collection is disabled by default. When enabled, client ports are removed before addresses are stored. Latency is aggregated into daily totals rather than retaining every raw poll, which keeps database growth bounded.

Records older than `ACTIVITY_RETENTION_DAYS` are pruned at startup and daily while collection runs. The default retention period is 90 days. Set `ACTIVITY_ENABLED=false` to disable collection entirely.

## Timing accuracy

Connection and disconnection times are estimates within `ACTIVITY_POLL_SECONDS`. PalHarbor cannot reconstruct activity from before tracking began.

Failed, unauthorized, or malformed player snapshots leave open sessions untouched. This prevents a temporary server outage from recording every player as disconnected.

When PalHarbor shuts down cleanly, it closes any sessions that remain open. After an unclean stop, the next start reconciles abandoned sessions before new tracking continues.

## Reporting periods

The Activity page supports 7, 14, 30, and 90-day views. It shows:

- Tracked players, session count, playtime, and currently online count
- Daily playtime trend
- Top-player leaderboard with weighted average latency
- Recent sessions
- IP addresses last observed during the selected period

IP observation counts cover the retained period and reset when an observation crosses the retention cutoff.

## Export or delete activity data

Export the complete retained dataset while PalHarbor is running:

```bash
curl -u "$PALHARBOR_USERNAME:$PALHARBOR_PASSWORD" \
  http://127.0.0.1:4174/api/activity/export \
  --output palharbor-activity.json
```

Erase all activity records with an explicit confirmation:

```bash
curl -u "$PALHARBOR_USERNAME:$PALHARBOR_PASSWORD" \
  -X DELETE http://127.0.0.1:4174/api/activity \
  -H 'Content-Type: application/json' \
  -H 'X-PalHarbor-Request: 1' \
  --data '{"confirmation":"DELETE ACTIVITY"}'
```

## Back up or move the database

Stop PalHarbor before copying or moving the database to ensure a consistent backup. The default files are:

```text
apps/api/data/palharbor.sqlite
apps/api/data/palharbor.sqlite-shm
apps/api/data/palharbor.sqlite-wal
```

If an installation already has `apps/api/data/paldeck.sqlite`, PalHarbor keeps using that legacy file by default so existing activity history remains available. Set `DATABASE_URL` explicitly after moving the database when you want to adopt the new filename.

SQLite may not always leave `-shm` and `-wal` files behind after a clean shutdown. Set a `file:` `DATABASE_URL` to move the primary database. PostgreSQL operators should use their normal database backup tooling; see [Activity storage](/guide/configuration#activity-storage).

::: warning Personal data
The database includes player identifiers and connection addresses. Limit file access, protect backups, and follow the privacy requirements that apply where you operate the server.
:::
