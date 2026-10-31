# `@tiling/geometry` (`packages/geometry/`)

The boards every game in this repo is built on: flat regular and uniform
tilings, aperiodic and fractal tilings, hyperbolic tilings, the closed solids
and the surfaces (torus, cylinder, Möbius strip, Klein bottle…). Each is a set
of cells with their vertices, adjacency and symmetries, built exactly.
Hypersweeper (`apps/hypersweeper`) plays minesweeper on them, and Rep-tiles
(`apps/reptiles`) cuts its levels from the periodic ones.

It is pure geometry: no DOM, no rendering, no mine counts, no levels, no menus.

- **Public surface:** `src/index.ts`. Games import `@tiling/geometry` and
  nothing deeper. A name a game needs gets a line there.
- **Inside the package**, modules import each other directly, never through
  the index, and import nothing from outside `src/`.
  `tests/boundaries.test.ts` holds these rules and the workspace's: no package
  imports a game, and no game imports another.
- **Source only:** `package.json` `exports` point at `src/`, and each game's
  Vite (or Vitest) compiles it. `import.meta.env.DEV` gates the builders'
  dev-only exactness checks.

```sh
cd packages/geometry
npm run typecheck   # tsc --noEmit, strict
npm run test        # vitest: the solids, volume and Klein-clip tests, and the boundaries
npm run format      # Prettier (the root .prettierrc.json)
```

Most of the geometry's tests still live in `apps/hypersweeper/tests/unit/`,
because they check a board together with the game's presets. A change here can
break either game, so also run `npm run typecheck && npm run test` in
`apps/reptiles` and `npm run typecheck` in `apps/hypersweeper`. CI runs
everything.

The board model, what ships and why: [`docs/agents/geometry.md`](../../docs/agents/geometry.md).
Adding a tiling, surface, solid or fractal board:
[`docs/agents/board-recipes.md`](../../docs/agents/board-recipes.md).
The repo rule that matters most here: **never key a vertex by rounding**.
Shared-vertex adjacency is exact.
