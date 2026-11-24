# Adding a game

A game in this repo is a folder, `apps/<key>/`, built on the shared packages.
CI, the deploy, the PR previews, the version bump and the desktop shell all
find a game by its `apps/<key>/packaging.json` (`scripts/games.mjs` lists
them). So adding a game means writing that folder. The scaffold writes it, and
nothing is left to do outside the repo: the game is deployed to a folder of the
shared site, `https://tiling-games.pages.dev/<key>/` (`site/`,
`scripts/build-site.mjs`), and gets a card on its landing page.

## 1. Scaffold it

```sh
node scripts/new-game.mjs <key> "<Title>"      # e.g. tile-slide "Tile Slide"
```

The `key` is the game's folder, npm package name and its folder on the shared
site. Use lowercase letters, digits and single hyphens.

The scaffold copies `templates/game/` into `apps/<key>/`, filling in the key,
the title, a desktop app id and a `vite preview` port of the game's own. It
takes the dev-tool versions (the exact Playwright pin included) from
Hypersweeper's `package.json`, so the lockfile gains nothing new. It then:

- adds the game's manifest to the Docker e2e runner (`Dockerfile.e2e`,
  `.dockerignore`) — the one list not derived from `packaging.json`, which
  `dockerE2e.test.ts` checks;
- runs `npm install` (the root workspace's `apps/*` picks the folder up);
- draws the icons (`npm run icons`);
- runs Prettier over what it wrote.

`--no-install` skips those last three.

What you get is a small but complete game: Lights Out on a hex board. It has
every seam a real game here needs:

| File | What it is |
|---|---|
| `src/game.ts` | the rules, pure — no DOM — and unit-tested (`tests/unit/game.test.ts`) |
| `src/main.ts` | the page: a board from `@tiling/geometry` drawn as SVG, the best score kept with `@tiling/platform`, `body[data-ready]` set for the desktop smoke run |
| `src/styles.css` | colours as `var(--…)` tokens, with the dark block in step |
| `vite.config.ts` | one `gameConfig({...})` call (`@tiling/vite-preset`): site, PWA, its preview port |
| `public/_headers` | the security policy (Hypersweeper's), applied at the edge and by `vite dev` / `vite preview` |
| `packaging.json` | `web` (its folder on the shared site, and its URL), `description` (the landing page's card), `desktop` (app id, icon, colours, smoke check), `bundledAssets` |
| `playwright.config.ts`, `tests/e2e/smoke.spec.ts` | the smoke test against the production bundle, under the real CSP |
| `scripts/make-icons.mts` | draws `public/` icons and `packaging/icon.png` from one SVG |
| `AGENTS.md`, `CLAUDE.md` | the game's guide — rewrite it once the game is yours |

## 2. Where it is deployed

Nowhere new: the shared site builds every game with a `web` block into a
folder of its own (`VITE_BASE=/<key>/`), so the game must work under a subpath.
The template does — it reads `import.meta.env.BASE_URL`, and Vite rewrites
`url("/…")` in CSS. What Vite does *not* rewrite is a file copied from
`public/` verbatim: an HTML page there (a privacy policy, say) links its assets
relatively. The game's `public/_headers` is moved under its folder by
`scripts/build-site.mjs`.

A game that should not be deployed yet can drop `web` from `packaging.json`.
A game that needs a Pages project of its own (Hypersweeper, for now) sets
`web.project`; the shared site then redirects its folder there
(`scripts/lib/games.mjs` explains the fields).

## 3. Make it the game

- **Rules first:** replace `src/game.ts` and its tests, then the page in
  `src/main.ts`. Any board builder in `packages/geometry/src/index.ts` works
  where `hexBoard` is. Exact coordinates, if the game needs them, are
  Rep-tiles' `apps/reptiles/src/geometry/` — see the next section.
- **The smoke test** should play a move of the real game (Rep-tiles' drags a
  tile in). It runs in CI as `game-e2e (<key>, 1/1)`. Once a game's unit or
  e2e tests grow past a few minutes, split them over runners with
  `packaging.json`'s `"ci": { "e2eShards": n, "unitShards": n }`: e2e is
  sharded by Playwright's `--shard`, and the unit tests are told their share
  by `TEST_SHARD="i/n"`, which the game's tests must honour (Rep-tiles'
  `tests/unit/shard.ts` and `vitest.config.ts`).
- **`packaging.json`:** set `desktop.smokeRoute` to a screen with a board on
  it, and `desktop.smokePainted` to what proves it painted.
- **Icons:** draw the game's picture in `scripts/make-icons.mts` and run
  `npm run icons`.
- **Docs:** rewrite the game's `AGENTS.md`, and add the game to the "Games"
  table in the root `AGENTS.md` and to the README.

## 4. Share only what two games use

The repo's rule (the root `AGENTS.md`, "Packages") is to **promote on the
second user**. Code moves into `packages/` when a second game needs it, not
before. Until then the new game copies nothing from another game: it imports
packages by name (`@tiling/geometry`), and
`packages/geometry/tests/boundaries.test.ts` fails on a deep import or one
game importing another. When the new game needs something a game already
has — Rep-tiles' exact geometry, Hypersweeper's device flags or share
links — the job is to move it into a package, or a new `packages/<name>/`,
with both games importing it.

## 5. What runs, once it is in

| Where | What |
|---|---|
| CI `game-checks (<key>)` | typecheck, Prettier, build, the packaged bundle's offline check, the desktop shell's tests |
| CI `game-unit (<key>, i/n)` | the unit tests, one job per shard (one, unless `packaging.json` `ci.unitShards` says more) |
| CI `game-e2e (<key>, i/n)` | the Playwright smoke test, one job per shard (`ci.e2eShards`) |
| CI `template-check` | scaffolds a throwaway game on every change and runs all of the above on it, so the template stays working |
| `deploy-cloudflare.yml` | on every push to `master`, builds it into the shared site and publishes it at `https://tiling-games.pages.dev/<key>/` |
| `pr-preview.yml` | `https://pr-<n>.tiling-games.pages.dev/<key>/` per pull request (and `alpha.tiling-games.pages.dev/<key>/`, the latest PR's), in the one sticky comment |
| `bump-version.yml` | bumps its patch version on a push that changes its folder, `packages/` or `data/`. Its first push lands at its own version, 0.1.0. With `"sharedVersion": true` in its `packaging.json` (as Rep-tiles has) it has Hypersweeper's version instead, written into its `package.json` on every Hypersweeper bump (`scripts/bump_version.py`), and set it to Hypersweeper's to start |
| `make desktop-run GAME=<key>`, `make mac-app GAME=<key>` | the offline desktop app (`shells/desktop/README.md`) |

The game's own iPhone app is a separate recipe ("Another game's iPhone app"
in `apps/hypersweeper/ios/README.md`); Rep-tiles' (`apps/reptiles/ios/`) is the
worked example.

## Removing a game

1. Delete `apps/<key>/`.
2. Remove its two lines from `apps/hypersweeper/Dockerfile.e2e` and
   `.dockerignore`.
3. Run `npm install`, then check that `package-lock.json` has no leftover
   `"apps/<key>"` entry marked `extraneous` (delete it by hand if so).
4. If it had a Pages project of its own, delete it in Cloudflare.
