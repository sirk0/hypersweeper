# The desktop shell — each game as an offline desktop app

One Electron shell for every TypeScript game in `apps/`: a game is staged into
it and packaged as a native macOS app that needs no internet connection. Every
asset the game draws is compiled into the app — its bundle, its fonts, its
icons, the shared `data/*.json`, Three.js for Hypersweeper — and the app asks
the network for nothing at all.

`GAME` picks the game; it defaults to `hypersweeper`, so the commands without it
mean what they always did.

```sh
make desktop-install               # install the shell's build tools (first time)
make desktop-run                   # stage Hypersweeper, run the shell — any OS
make desktop-run GAME=reptiles     # …the same for Rep-tiles
make mac-app                       # build build/desktop/hypersweeper/mac*/Hypersweeper.app
make mac-app GAME=reptiles         # build build/desktop/reptiles/mac*/Rep-tiles.app
make mac-app-dmg GAME=reptiles     # …and a drag-to-Applications .dmg
open build/desktop/hypersweeper/mac-arm64/Hypersweeper.app
```

`make desktop-run` is the one to develop against. It runs `make desktop-build`,
which is `scripts/stage-desktop.sh <game>`:

1. build `apps/<game>/` with `VITE_PACKAGED=1`;
2. check the bundle is self-contained (`scripts/check-offline-assets.mjs`);
3. copy it to `shells/desktop/app/`, with the game's `packaging.json` as
   `app.json` and its desktop icon as `resources/icon.png`.

Then it runs `npm start` in the shell. It needs no Mac.

`make mac-app` must run **on a Mac** — the `.app` is signed and (for a `.dmg`)
imaged with tools only macOS has. Everything up to packaging works anywhere,
which is what `make desktop-smoke` and CI use.

`scripts/build-mac-app.sh --game <game>` drives the whole thing:

1. stage the game (as above);
2. package it with electron-builder, naming and identifying the app from the
   game's `packaging.json`;
3. ad-hoc sign it;
4. launch the built `.app` to check it.

The shell is unit-tested in `shells/desktop/test/`.

## A game's desktop app: `apps/<game>/packaging.json`

The shell knows nothing about any game; each game describes its own app:

```json
{
  "productName": "Rep-tiles",
  "bundledAssets": [],
  "desktop": {
    "appId": "com.sirk0.reptiles",
    "executableName": "rep-tiles",
    "icon": "packaging/icon.png",
    "userDataName": "Rep-tiles",
    "backgroundColor": "#f4f1ea",
    "smokeRoute": "?level=squares",
    "smokePainted": "document.querySelectorAll('#home-picks > *, svg.board path.region').length"
  }
}
```

| Field | Used by | What it is |
|---|---|---|
| `productName` | electron-builder, `main.mjs` | the app's name (`Rep-tiles.app`), the window title, the `.dmg` title |
| `bundledAssets` | `check-offline-assets.mjs` | files the packaged bundle must contain — Hypersweeper lists its two fonts. The iPhone build's check reads it too |
| `web` | `scripts/games.mjs` → the deploy, PR-preview, CI and version-bump workflows | the game's Cloudflare Pages `project` and `url` (Hypersweeper's also `analytics` and `siteUrlVariable`) — not used by the desktop shell, listed here as part of the same file; see `docs/agents/new-game.md` |
| `desktop.appId` | electron-builder | the bundle identifier |
| `desktop.executableName` | electron-builder | the Linux binary's name |
| `desktop.icon` | `stage-desktop.sh` | the 1024² icon on the macOS grid (the 824 rounded square on a transparent canvas), relative to the game's folder. Each game's `npm run icons` draws it |
| `desktop.userDataName` | `main.mjs` | the folder the game's saved data (`localStorage`) lives in. Every game is served from the same `app://local` origin, so a second game **must** name one, or its records would share the first one's store. Hypersweeper names none: its data stays in `hypersweeper-desktop`, where it has always been (which is also why the shell's `package.json` keeps that name) |
| `desktop.backgroundColor` | `main.mjs` | the window's colour before the first frame — the game's boot page colour |
| `desktop.smokeRoute` | `main.mjs`, `build-mac-app.sh` | what a smoke run opens, so it shoots a real board |
| `desktop.smokePainted` | `main.mjs` | an expression the smoke run evaluates in the page; 0 means a blank screen |

Hypersweeper's icon (`apps/hypersweeper/packaging/icon.png`) is exported from
the same Icon Composer document as the iPhone and Mac Catalyst icon
(`apps/hypersweeper/ios/App/App/AppIcon.icon`) by
`apps/hypersweeper/scripts/make-icons.mts` (`make desktop-icon`). It is always
the default pentagon: the App icon setting has no row in the desktop app, since
Finder would go on showing the pentagon whatever the dock did. Rep-tiles' is
drawn by `apps/reptiles/scripts/make-icons.mts` with its other icons.

A new game gets all of this from the scaffold (`node scripts/new-game.mjs`, see
`docs/agents/new-game.md`). By hand, a game's desktop app is:

1. a `packaging.json`;
2. an icon;
3. `body[data-ready]` set once the first screen is drawn — the signal the smoke
   run waits for;
4. `make desktop-smoke GAME=<game>` to prove it.

## How it works

The shell is deliberately small — four files and no runtime dependencies:

| File | What it is |
|------|------------|
| `main.mjs` | The Electron main process: registers the `app://` scheme, opens one window on it, blocks navigation, builds the menu bar. Also implements the `--smoke` self-check. |
| `serve.mjs` | `app://` URL → file in the packaged build. The one security-sensitive piece, so it is separate and unit-tested. |
| `config.mjs` | Which game the shell runs: the staged `app/` + `app.json`, or — for `npm start` with nothing staged — `apps/$GAME/dist` and its `packaging.json`. Unit-tested. |
| `electron-builder.yml` | Packaging: what every game's bundle shares (the file list, the macOS metadata). The per-game half comes from `packaging.json`, passed by `build-mac-app.sh`. |
| `app/`, `app.json`, `resources/icon.png` | The staged game. Not committed. |

### Why `app://` and not `file://`

The game is written for an *origin*, and a `file://` URL has none. Loading it
that way would break, quietly and in that order: `localStorage` (every setting,
every best time), `history.replaceState` (the share link a board writes to its
address), and the root-absolute `url("/fonts/…")` in `styles.css`. So the
bundle is served instead — `app://` is registered as a **standard, secure**
scheme, the window loads `app://local/index.html`, and the app runs exactly as
it does in a browser tab. Nothing in `apps/hypersweeper/` is rewritten or special-cased for
the desktop, apart from the one build flag below.

Assets are read through `fs`, not `net.fetch("file://…")`: in a packaged app
they live inside `app.asar`, which Electron's patched `fs` can read and
Chromium's file loader cannot.

### What the desktop build changes in the web app

One flag, `VITE_PACKAGED=1` (the shared build preset, `packages/vite-preset`) — shared with the iPhone
app, which is packaged the same way (`apps/hypersweeper/ios/README.md`) — and it only removes
things:

- **no service worker.** Its job is to cache a *deployed* build for offline
  use. Inside a bundle whose files are already on the disk, it would add a
  second, staler copy of them and nothing else.
- **no "Check for updates" row** in settings (`__APP_PACKAGED__` in
  `apps/hypersweeper/src/ui/settings.ts`). There is no server to check against; a row that
  can only ever report failure is worse than no row.

The version shown under Settings › About is still `apps/hypersweeper/package.json`'s, so a
bundle names the build it was cut from.

### Security posture

The renderer runs the same untrusted web app a browser tab does, and is treated
like one: `contextIsolation`, `sandbox`, no `nodeIntegration`, no preload — it
has no way to reach Node. Every navigation off `app://` is cancelled, and the
external links on the settings page are handed to the system browser instead of
being allowed to replace the game with a web page.

## Verifying it

```sh
make desktop-test                  # the app:// path resolver, and which game the shell runs
make desktop-smoke                 # stage Hypersweeper, then run the real app with the network cut
make desktop-smoke GAME=reptiles   # …the same for Rep-tiles
make desktop-run                   # stage and just open it, to play with
```

`make desktop-smoke` is the interesting one: it launches Electron with
**every off-bundle request cancelled** (`installOfflineGuard` in `main.mjs`),
waits for the app to report `body[data-ready]`, checks something actually
rendered (the game's `desktop.smokePainted`), and screenshots it to
`build/desktop-smoke-<game>.png`. It fails if the app
asked for a single URL it does not carry — the failure mode that a build
machine with working wifi would otherwise never notice. It runs headless under
Xvfb with SwiftShader (the same software-WebGL switches as the Playwright
suite), so it works on Linux and in CI.

It opens the game's `desktop.smokeRoute`; pass a route to shoot another board:

```sh
scripts/desktop-smoke.sh build/board.png '?mode=hexhex&difficulty=easy&seed=7'
```

`make mac-app` runs the same check against the packaged `.app` at the end of
the build (`--no-verify` skips it).

## Signing and distribution

A local build is **ad-hoc signed** (`codesign --sign -`): that is what Apple
Silicon needs to launch a binary at all, and it costs nothing. Apps you build
yourself carry no quarantine attribute, so Gatekeeper does not prompt.

Copying the `.app` to *another* Mac is a different matter — that needs a
Developer ID certificate and notarisation. To do that, set `identity` in
`electron-builder.yml` (and `CSC_IDENTITY_AUTO_DISCOVERY=true`) and add a
notarisation step; nothing else about the build changes.

## Other platforms

The shell is not macOS-specific — `npx electron-builder --linux dir` (or
`--win`) packages the same bundle, given the per-game `-c.` overrides
`build-mac-app.sh` passes, and the Linux target exists so the packaging itself
can be exercised off a Mac. Only the macOS path is a supported,
verified build.
