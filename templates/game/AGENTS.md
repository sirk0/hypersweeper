# __TITLE__ (`apps/__KEY__/`)

A game in this repo, scaffolded by `scripts/new-game.mjs` from
`templates/game/`. As written it is the template game, Lights Out on a hex
board: pressing a cell flips it and its neighbours, and the board is solved
when every cell is dark. Replace it with the game — `src/game.ts` holds the
rules (pure, unit-tested), `src/main.ts` the page.

Read [`docs/agents/new-game.md`](../../docs/agents/new-game.md) for what the
scaffold set up and what is left to do (the Cloudflare Pages project, icons,
this file).

## Build and run

```sh
npm install          # at the repo root, first time and after a dependency change
cd apps/__KEY__
npm run dev          # Vite dev server (it picks a free port)
npm run typecheck    # tsc --noEmit, strict — also checks the packages it imports
npm run test         # vitest unit tests
npm run format       # Prettier (the root .prettierrc.json); CI runs format:check
npm run build        # typecheck + the production bundle (PWA included) into dist/
npm run e2e          # Playwright smoke test against the production bundle
npm run icons        # redraw public/ icons and packaging/icon.png
```

From the root: `make desktop-run GAME=__KEY__` runs it as a desktop app, and
`make mac-app GAME=__KEY__` packages it (macOS).

## What it is built on

- `@tiling/geometry` — the boards (`hexBoard` here; any builder in its index).
- `@tiling/platform` — `storage()` / `readObject()`, the guarded localStorage.
- `@tiling/vite-preset` — the whole build (`vite.config.ts` is one call).
- `packaging.json` — the site (`web`), the desktop app (`desktop`), and
  `bundledAssets`. CI, the deploy, the PR previews and the version bump all
  list games from these files, so nothing else names this game.

## Rules

- Import packages by name (`@tiling/geometry`), never a path into them and
  nothing from another game: `packages/geometry/tests/boundaries.test.ts`
  fails on either. Code a second game needs moves into a package then, not
  before — see "Packages" in the root `AGENTS.md`.
- Colours come from `var(--…)` in `src/styles.css`, the dark block in step.
- The page references nothing remote (the CSP in `public/_headers` forbids it,
  and the packaged build's offline check fails on it).
- Verify a visual change with a real screenshot.
