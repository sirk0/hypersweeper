# Hypersweeper.app — the offline desktop build

The TypeScript game (`web/`) packaged as a native macOS app that needs no
internet connection: every asset it draws — the bundle, Three.js, the two
fonts, the icons, the shared `data/*.json` — is compiled into the app, and
the app asks the network for nothing at all.

```sh
make mac-app       # build build/desktop/mac*/Hypersweeper.app
make mac-app-dmg   # …and a drag-to-Applications .dmg
open build/desktop/mac-arm64/Hypersweeper.app
```

`make mac-app` must run **on a Mac** — the `.app` is signed and (for a `.dmg`)
imaged with tools only macOS has. Everything up to packaging works anywhere,
which is what `make desktop-smoke` and CI use.

## How it works

The shell is deliberately small — three files and no runtime dependencies:

| File | What it is |
|------|------------|
| `main.mjs` | The Electron main process: registers the `app://` scheme, opens one window on it, blocks navigation, builds the menu bar. Also implements the `--smoke` self-check. |
| `serve.mjs` | `app://` URL → file in the packaged build. The one security-sensitive piece, so it is separate and unit-tested. |
| `electron-builder.yml` | Packaging: what goes in the bundle, the icon, the macOS metadata. |
| `resources/icon.png` | The app icon, 1024², generated from the same vector source as the web icons by `web/scripts/make-icons.mjs` (`make desktop-icon`). |
| `app/` | The built web app, staged here by the build script. Not committed. |

### Why `app://` and not `file://`

The game is written for an *origin*, and a `file://` URL has none. Loading it
that way would break, quietly and in that order: `localStorage` (every setting,
every best time), `history.replaceState` (the share link a board writes to its
address), and the root-absolute `url("/fonts/…")` in `styles.css`. So the
bundle is served instead — `app://` is registered as a **standard, secure**
scheme, the window loads `app://local/index.html`, and the app runs exactly as
it does in a browser tab. Nothing in `web/` is rewritten or special-cased for
the desktop, apart from the one build flag below.

Assets are read through `fs`, not `net.fetch("file://…")`: in a packaged app
they live inside `app.asar`, which Electron's patched `fs` can read and
Chromium's file loader cannot.

### What the desktop build changes in the web app

One flag, `VITE_DESKTOP=1` (see `web/vite.config.ts`), and it only removes
things:

- **no service worker.** Its job is to cache a *deployed* build for offline
  use. Inside a bundle whose files are already on the disk, it would add a
  second, staler copy of them and nothing else.
- **no "Check for updates" row** in settings (`__APP_DESKTOP__` in
  `web/src/ui/settings.ts`). There is no server to check against; a row that
  can only ever report failure is worse than no row.

The version shown under Settings › About is still `web/package.json`'s, so a
bundle names the build it was cut from.

### Security posture

The renderer runs the same untrusted web app a browser tab does, and is treated
like one: `contextIsolation`, `sandbox`, no `nodeIntegration`, no preload — it
has no way to reach Node. Every navigation off `app://` is cancelled, and the
external links on the settings page are handed to the system browser instead of
being allowed to replace the game with a web page.

## Verifying it

```sh
make desktop-test    # the app:// path resolver (traversal, schemes, encoding)
make desktop-smoke   # build, then run the real app with the network cut
make desktop-run     # build and just open it, to play with
```

`make desktop-smoke` is the interesting one: it launches Electron with
**every off-bundle request cancelled** (`installOfflineGuard` in `main.mjs`),
waits for the app to report `body[data-ready]`, checks something actually
rendered, and screenshots it to `build/desktop-smoke.png`. It fails if the app
asked for a single URL it does not carry — the failure mode that a build
machine with working wifi would otherwise never notice. It runs headless under
Xvfb with SwiftShader (the same software-WebGL switches as the Playwright
suite), so it works on Linux and in CI.

Pass a route to shoot a real board:

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
`--win`) packages the same bundle, and the Linux target exists so the packaging
itself can be exercised off a Mac. Only the macOS path is a supported,
verified build.
