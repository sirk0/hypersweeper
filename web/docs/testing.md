# Commands, and driving the app headless

Everything needed to build, test and *look at* a change. Screenshots are the
primary review artifact in this repo: verify UI changes by looking at real
ones, not just by the test suite passing.

## Commands

```sh
cd web
npm install         # first time, and after a dependency change
npm run dev         # dev server at http://localhost:5173, HMR
npm run typecheck   # tsc --noEmit (strict), twice: the app, then functions/
npm run test        # vitest unit tests
npm run test:watch  # …the same, re-running on change
npm run build       # typecheck + vite build (production bundle + PWA) into dist/
npm run preview     # serve dist/ at http://localhost:4173
npm run e2e         # Playwright e2e + visual regression
npm run e2e:update  # refresh visual baselines
npm run screenshots # regenerate the README gallery (SHOTS=menu.png for one)
npm run icons       # regenerate the app icons from the vector source
npm run og          # regenerate the social card, public/og.png
```

**Two ways to run it, and they are not interchangeable.** `npm run dev` is the
one to iterate in — Vite serves the sources with HMR. `npm run build && npm run
preview` serves the *real* bundle from `dist/`, which is what the screenshot
recipe and Playwright drive, and the only way to exercise anything the
production build changes (the PWA, the service worker, `__APP_VERSION__`,
`VITE_PACKAGED`). `vite preview` reads `dist/` from disk and does not rebuild,
so re-run `npm run build` after every edit or you are looking at the last one.

`typecheck` runs `tsc` twice because the Pages Function in `functions/` is a
Worker, not a page: no DOM, and the Cloudflare globals instead. It gets its own
`tsconfig.functions.json`, which also compiles the shared `src/analyticsEvent.ts`
under a DOM-less lib — which is what proves that file stayed pure.

From the repo root, `make metrics` prints play counts and win rates from the
deployed app (see "Analytics" in [`deploy.md`](deploy.md)); it needs `CF_ACCOUNT_ID` and a read-only
`CF_API_TOKEN`.

Cloud sessions: `@playwright/test` is **pinned** (not caret-ranged) to the
version whose bundled Chromium build matches the one preinstalled in the cloud
session image (`/opt/pw-browsers/chromium-<build>`), so `npm run e2e` resolves the
preinstalled browser and runs directly — no download, no env var. Keep the pin
in step with the image when bumping Playwright: a caret range silently floats to
a newer build than the image ships, and e2e then fails with "Executable doesn't
exist". As a fallback for a mismatched image, point Playwright at whatever build
is present with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-<build>/chrome-linux/chrome npm run e2e`
(the config honours it). CI installs the pinned build itself, so it is
self-consistent regardless of the image.

## Agent notes: driving the app headless

Practical knowledge for verifying changes by actually running the app
(screenshots are the primary review artifact in this repo):

- **Ad-hoc screenshots**: `npm run build`, `npm run preview`
  in the background, then a small Playwright script against
  `http://localhost:4173/?mode=X&difficulty=Y&seed=N`. Launch Chromium with
  `executablePath` set to the preinstalled browser and the SwiftShader args
  from `playwright.config.ts` so output matches CI. Wait for
  `body[data-ready]` before shooting. **Put the script inside `web/`** —
  Node resolves `@playwright/test` from the script's location, not the cwd.
- **Menu icons**: `npx vite-node scripts/icon-gallery.mts out.html [group]`
  writes every menu icon (optionally only the groups whose heading matches
  `group`) onto one contact sheet, labelled with its key — the fastest way to
  review a change to `src/ui/icons.ts` without walking the menu. Most icons
  are generated from the real board geometry, so a change to a tiling,
  a solid or a surface immersion shows up here too.
- **App icon**: `node scripts/make-icons.mjs` (or `make desktop-icon` from the
  repo root) writes every icon the app ships — `public/favicon.svg`, the two
  PWA PNGs, the maskable and apple-touch ones, and `desktop/resources/icon.png`
  for the macOS build — from one vector source in that script. Two parts of it
  are quotations from the game and should stay in step with it: the pentagon is
  painted in the colour `shapePalette.ts` gives a five-sided cell, and the mine
  is `drawMine()` from `render/glyphAtlas.ts` transcribed to SVG at the same
  proportions. Rasterising is Chromium, so pass
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` where the browser is not on the default
  path. Review the result at *icon* sizes (16 px through the dock's 128), not
  at 512 — that is where a design either survives or turns to mud.
- **The `window.__ms` seam** is the way in: `cells()`, `startBoard(mode,
  difficulty, {mines|seed})`, `reveal/flag/chord(cell)`, `rotate(dx, dy)`
  (drag-pixels), `state()`. On 3D boards `cellScreenXY(cell)` returns
  `null` for cells facing away — filter for a visible cell instead of
  indexing blindly. `cellAtScreenXY(x, y)` is its inverse (the same raycast
  a tap runs), so a test can assert *which* cell a gesture landed on.
- **Screen positions need a rendered frame**: the board's world transform is
  applied when it renders, so `cellScreenXY` / `cellAtScreenXY` called in the
  same `page.evaluate` as `startBoard` read stale matrices and answer with
  cells from all over the board. Split the setup and the measurement across
  two round-trips, with an `await page.evaluate(() => new Promise((r) =>
  requestAnimationFrame(() => requestAnimationFrame(r))))` between them. A
  two-sided surface never culls, so `cellScreenXY` also reports positions for
  cells hidden behind the immersion — round-trip through `cellAtScreenXY` when
  the test needs a cell that is genuinely on top.
- **Flood-fill eats sparse fixtures**: on a closed surface a reveal floods
  around the whole solid past a thin mine wall, instantly winning the game
  (auto-flagging every mine). To stage a mixed hidden/revealed screenshot,
  reveal only cells adjacent to mines (each shows a number, so nothing
  cascades), or use a mine-dense fixture.
- **`--update-snapshots` does not touch a baseline that passes within
  `maxDiffPixelRatio` tolerance** (5% here). After an intentional small
  visual change (e.g. header tweaks), delete the affected
  `tests/e2e/gallery.spec.ts-snapshots/*.png` and regenerate, or the
  committed baselines silently keep the old pixels. Baselines are only
  authoritative under the pinned software-WebGL environment (CI, or a
  cloud session with the same launch args); regenerate them there, then
  re-run the spec to confirm determinism.
- **Playwright's `webServer` reuses a running port-4173 server** outside
  CI. `vite preview` serves `dist/` from disk, so an `npm run build` is
  enough to refresh it — but stale servers are a classic source of
  "my change has no effect".
- **Animations are off in the e2e suite** (`contextOptions.reducedMotion:
  "reduce"` in `playwright.config.ts`), so screenshots catch the settled
  frame. To eyeball an animation in an ad-hoc capture, launch Chromium
  *without* reduced-motion, call `window.__ms.animations(true)`, drive a
  move, then screenshot on a short `waitForTimeout` mid-flight — the reveal
  ripple/flag drop/flag pop/lose shake all settle back to the static baseline
  within ~0.5 s, the win wave within ~1 s on the biggest boards. Note that the
  *first* `page.screenshot` after a move costs ~1 s under SwiftShader
  (shader compilation), so take shots back to back rather than sleeping
  between them, or the whole animation is over before frame two. That cost is
  most of a short animation's life: pay it on a throwaway shot *before* the
  move, or the first real frame lands after the thing you meant to catch.
- The Python game is the behavior reference; run it headless per
  "Screenshots (headless)" in
  [`../../docs/agents/pygame.md`](../../docs/agents/pygame.md) when unsure how
  something is supposed to look or feel.
