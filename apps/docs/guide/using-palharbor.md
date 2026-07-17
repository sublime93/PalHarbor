# Use the dashboard

PalHarbor groups day-to-day monitoring and administrative controls into six pages. The application shares one polling lifecycle across page changes and pauses browser polling while the tab is hidden.

## Overview

Use **Overview** for a fast health check:

- Server FPS and frame time
- Online players and configured capacity
- Uptime, world day, and active base count
- Server version and world identifier
- A compact list of current players

The **Auto refresh** selector in the header supports Off, 5, 10, 30, and 60 seconds. Use the refresh button for an immediate update.

## Players

**Players** lists current player identity, level, latency, location, user ID, and account or connection information. Search by player name, user ID, or IP address.

Two moderation actions are available per player:

- **Kick** disconnects the player; they can reconnect.
- **Ban** blocks the user ID until it is unbanned and requires typing `BAN`.

## Activity

**Activity** reads the local history collected by the gateway. Choose a 7, 14, 30, or 90-day reporting period to inspect playtime, sessions, latency quality, connection history, and IP observations. See [Player activity](/guide/player-activity) for retention and accuracy details.

## World data

**World data** requests the larger `game-data` snapshot only while that page is active. It provides:

- Surface maps for Palpagos and World Tree
- A local coordinate view for cave instances
- Layer controls for players, Pals, NPCs, and Palboxes
- Actor search and a directory of snapshot records
- Optional 60-second world refresh, separate from the main refresh cadence

If a new snapshot fails, the last successful data remains visible.

## Settings

**Settings** is a read-only view of the Palworld server’s active runtime configuration. Search by setting name or value. Change Palworld settings through the server’s supported configuration workflow, then reload this page to verify the active values.

## Command center

The **Command center** exposes server administration operations:

| Action            | Effect                                                           | Confirmation        |
| ----------------- | ---------------------------------------------------------------- | ------------------- |
| Broadcast         | Sends a message of up to 500 characters to connected players.    | Button click        |
| Save world        | Requests an immediate world-state save.                          | Confirmation dialog |
| Unban             | Allows a supplied platform user ID to reconnect.                 | Confirmation dialog |
| Graceful shutdown | Warns players and stops after a 0–3600 second delay.             | Type `SHUTDOWN`     |
| Force stop        | Immediately terminates the server and can lose unsaved progress. | Type `FORCE STOP`   |

::: tip Before maintenance
Broadcast the maintenance window, save the world, and prefer a graceful shutdown. Reserve force stop for emergencies.
:::

## Refresh behavior

Core polling always refreshes metrics and players. Activity refreshes at most every 30 seconds through that cycle; server info and runtime settings refresh at most every 60 seconds. The World page owns its separate 60-second GameData cadence.

The selected core refresh rate, World auto-refresh preference, and Activity reporting period are saved in the current browser.
