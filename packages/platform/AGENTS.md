# `@tiling/platform` (`packages/platform/`)

What a game needs from the browser it runs in, guarded so it works anywhere the
game does: a private window, blocked site data, a packaged app, the vitest node
environment. Games import the index (`@tiling/platform`) alone.

- `storage()`: `localStorage`, or `null` where it is missing or touching it
  throws.
- `readObject(key)`: the JSON object stored at `key`, or `null` for anything
  missing, truncated, mangled or not a plain object. Reading is total, and a
  caller falls back to its defaults. Writes stay in each caller, inside its own
  `try`.

Users today: Hypersweeper's settings, best times, favourites, achievements and
iCloud record; Rep-tiles' stars (`apps/reptiles/src/progress.ts`).

A module joins this package when a **second** game needs it (see "Packages" in
the root `AGENTS.md`). Hypersweeper's `update.ts`, `haptics.ts`, `device.ts` and
`share.ts` are the likely next ones, once Rep-tiles is deployed and packaged.

```sh
cd packages/platform && npm run typecheck && npm run test
```
