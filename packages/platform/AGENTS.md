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

- `checkForUpdate(running, base)`: asks the server which build it serves (its
  `version.json`, off every cache) and compares it with `running`, the game's
  own `__APP_VERSION__`/`__APP_COMMIT__`; `loadDeployedBuild()` then waits for
  the service worker to take the new build and reloads. Why it asks the server
  rather than the worker is at the top of `src/update.ts` and in "Check for
  updates" in `apps/hypersweeper/docs/ui.md`. A game calls both only outside a
  packaged build (`__APP_PACKAGED__`), so the bundle inside an app never names
  `version.json` (`scripts/check-offline-assets.mjs`).

Users today: Hypersweeper's settings, best times, favourites, achievements and
iCloud record; Rep-tiles' stars (`apps/reptiles/src/progress.ts`); both games'
settings page, for the update check.

A module joins this package when a **second** game needs it (see "Packages" in
the root `AGENTS.md`). Hypersweeper's `haptics.ts`, `device.ts` and `share.ts`
are the likely next ones.

```sh
cd packages/platform && npm run typecheck && npm run test
```
