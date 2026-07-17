# Documentation workspace

The documentation is the `@app/docs` package under `apps/docs`. It uses VitePress and is included automatically by the workspace’s `apps/*` package pattern.

## Run the documentation site

From the repository root:

```bash
pnpm docs:dev
```

Open [http://localhost:5174](http://localhost:5174). VitePress reloads the page as Markdown, theme, or configuration files change.

## Build and preview

```bash
pnpm docs:build
pnpm docs:preview
```

The static output is written to `apps/docs/.vitepress/dist`. Preview serves it at [http://localhost:4175](http://localhost:4175).

The root `pnpm build` command also builds the documentation because it runs each workspace package’s build script.

## Structure

```text
apps/docs/
├── .vitepress/
│   ├── config.mts       # Navigation, sidebar, search, and site metadata
│   └── theme/           # Default theme extension and PalHarbor styling
├── guide/               # User and contributor guides
├── public/              # Static assets copied as-is
└── index.md             # Documentation home page
```

When application behavior changes, update the relevant guide in the same change. Keep environment defaults synchronized with `apps/api/.env.example` and `apps/api/src/core/config.ts`.
