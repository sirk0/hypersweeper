# Adding a game

A game in this repo is a folder, `apps/<key>/`, built on the shared packages.
CI, the deploy, the PR previews, the version bump and the desktop shell all
find a game by its `apps/<key>/packaging.json` (`scripts/games.mjs` lists
them). So adding a game means writing that folder. The scaffold writes it, and
only one manual step is left outside the repo: the Cloudflare Pages project.

## 1. Scaffold it

```sh
node scripts/new-game.mjs <key> "<Title>"      # e.g. tile-slide "Tile Slide"
```

The `key` is the game's folder, npm package name, Pages project and
`<key>.pages.dev` subdomain. Use lowercase letters, digits and single hyphens.

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
| `wrangler.toml` | names the Pages project |
| `packaging.json` | `web` (the Pages project and URL), `desktop` (app id, icon, colours, smoke check), `bundledAssets` |
| `playwright.config.ts`, `tests/e2e/smoke.spec.ts` | the smoke test against the production bundle, under the real CSP |
| `scripts/make-icons.mts` | draws `public/` icons and `packaging/icon.png` from one SVG |
| `AGENTS.md`, `CLAUDE.md` | the game's guide — rewrite it once the game is yours |

## 2. Create its Pages project

In the Cloudflare dashboard, go to Workers & Pages → Create → Pages, and choose
**direct upload**. Name the project `<key>`, and set the production branch to
**`master`**. The workflows deploy with `--branch=master`, so a project whose
production branch is `main` gets every deploy as a preview, and the site
stays empty.

Do this before the first pull request: the PR preview deploys every game with
a `web` block, and it fails for a project that does not exist yet. A game that
should not be deployed yet can drop `web` from `packaging.json`.

## 3. Make it the game

- **Rules first:** replace `src/game.ts` and its tests, then the page in
  `src/main.ts`. Any board builder in `packages/geometry/src/index.ts` works
  where `hexBoard` is. Exact coordinates, if the game needs them, are
  Rep-tiles' `apps/reptiles/src/geometry/` — see the next section.
- **The smoke test** should play a move of the real game (Rep-tiles' drags a
  tile in). It runs in CI as `game-e2e (<key>)`.
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
has — Rep-tiles' exact geometry, Hypersweeper's update check, haptics or share
links — the job is to move it into a package, or a new `packages/<name>/`,
with both games importing it.

## 5. What runs, once it is in

| Where | What |
|---|---|
| CI `game-checks (<key>)` | typecheck, Prettier, unit tests, build, the packaged bundle's offline check, the desktop shell's tests |
| CI `game-e2e (<key>)` | the Playwright smoke test |
| CI `template-check` | scaffolds a throwaway game on every change and runs all of the above on it, so the template stays working |
| `deploy-cloudflare.yml` | on every push to `master`, builds and publishes it to `<key>.pages.dev` |
| `pr-preview.yml` | `https://pr-<n>.<key>.pages.dev` per pull request, with its own sticky comment |
| `bump-version.yml` | bumps its patch version on a push that changes its folder, `packages/` or `data/`. Its first push lands at its own version, 0.1.0 |
| `make desktop-run GAME=<key>`, `make mac-app GAME=<key>` | the offline desktop app (`shells/desktop/README.md`) |

The game's own iPhone app is a separate recipe ("A second game's iPhone app"
in `apps/hypersweeper/ios/README.md`).

## Removing a game

1. Delete `apps/<key>/`.
2. Remove its two lines from `apps/hypersweeper/Dockerfile.e2e` and
   `.dockerignore`.
3. Run `npm install`, then check that `package-lock.json` has no leftover
   `"apps/<key>"` entry marked `extraneous` (delete it by hand if so).
4. Delete the Pages project in Cloudflare.
