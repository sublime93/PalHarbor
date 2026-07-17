# Contributing

Thanks for helping improve PalHarbor.

## Before opening a change

- Search existing issues and pull requests.
- Open an issue before undertaking a large feature or schema change.
- Never include Palworld game assets, credentials, player data, save files, or
  production database contents.
- Keep changes focused and add tests for behavior changes.

## Development setup

Requirements are Node.js 24.15 or newer and the pnpm version declared in
`package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Run the complete local gate before submitting:

```bash
pnpm check
```

## Pull requests

Explain the problem, the chosen approach, security or privacy implications,
and how the change was tested. Changes that alter stored data must include a
migration and upgrade notes. Changes that add dependencies must justify them
and keep dependency versions pinned.

By submitting a contribution, you confirm that you have the right to submit it
and agree that it may be distributed under the project's MIT License.
