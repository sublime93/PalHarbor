---
layout: home

hero:
  name: PalHarbor
  text: Your Palworld server at a glance
  tagline: Monitor players and world health, review activity, and run administrative commands from a local-first dashboard.
  image:
    src: /logo.svg
    alt: PalHarbor status ring
  actions:
    - theme: brand
      text: Install PalHarbor
      link: /guide/getting-started
    - theme: alt
      text: Configure the gateway
      link: /guide/configuration

features:
  - title: Live operations
    details: Watch server FPS, frame time, uptime, player capacity, active players, runtime settings, and world population.
  - title: Safer administration
    details: Broadcast, moderate players, save the world, and control server lifecycle with confirmation prompts for high-impact actions.
  - title: Durable activity history
    details: Track sessions, playtime, latency trends, and connection addresses in SQLite or PostgreSQL—even when no browser is open.
---

## How PalHarbor connects

PalHarbor keeps the Palworld admin credentials in a Fastify gateway. The browser talks only to that same-origin gateway; it never receives the upstream Basic Auth password.

```text
Browser dashboard  →  PalHarbor gateway  →  Palworld REST API
   localhost             localhost          trusted LAN
```

Start with [Install and run](/guide/getting-started), then review every supported setting in [Configuration](/guide/configuration).
