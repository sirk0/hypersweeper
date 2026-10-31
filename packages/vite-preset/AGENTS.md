# `@tiling/vite-preset` (`packages/vite-preset/`)

The Vite build every game in this repo shares. A game's `vite.config.ts` is one
call:

```ts
export default defineConfig(
  gameConfig({
    configUrl: import.meta.url,         // where package.json (the version) and public/_headers are
    name: "Hypersweeper",                // the link-preview title
    site: { url, description, imageAlt }, // deployed: __APP_SITE_URL__ + link-preview tags
    pwa: { manifest, workbox, … },       // the service worker; leave out for none
    define: { __APP_ANALYTICS__: analytics }, // extra build constants
    plugins: [tallyStub],                // the game's own web-build plugins
    overrides: { build: { … }, server: { … } }, // merged with Vite's mergeConfig
  }),
);
```

What every game then gets, from `src/index.ts`:

- **The flags** (`buildFlags()`):
  - `VITE_BASE`: the mount path, default `/`.
  - `VITE_PACKAGED=1`: the bundle inside the macOS or iPhone app.
  - `VITE_NO_SW=1`: the PR-preview build, with no service worker.
- **`__APP_VERSION__`, `__APP_COMMIT__`, `__APP_PACKAGED__`**, plus
  `__APP_SITE_URL__` when `site` is set. The version comes from the game's
  `package.json`, the commit from `GITHUB_SHA`.
- **The version stamp**: `version.json`, emitted and served by the dev and
  preview servers. An update check asks the server which build it is on, so a
  PWA's workbox should `globIgnores` it (use `STAMP_FILE`).
- **The link-preview tags**: absolute `og:`/`twitter:` URLs, fixed at build
  time. The image card is used only when `site.imageAlt` says `public/og.png`
  exists.
- **The deployed response headers**: `public/_headers` (Cloudflare's format),
  parsed and applied to `vite dev` and `vite preview`. The CSP under test is
  then the one deployed.
- **The PWA**, when `pwa` is set.

**`VITE_PACKAGED=1` only ever removes**: a packaged build gets no plugin at
all. Never add a packaged-only branch to a game; a shell that needs something
different provides it.

The plugin order on a web build is: tags, the game's own plugins, stamp,
headers, PWA. `tests/preset.test.ts` pins it. When this package changed,
Hypersweeper's three builds (deployed, `VITE_NO_SW`, `VITE_PACKAGED`) were
byte-identical before and after. Diffing `dist/` is the quick proof that a
change here moved nothing.

```sh
cd packages/vite-preset && npm run typecheck && npm run test
```
