import { buildFlags, gameConfig, STAMP_FILE } from "@tiling/vite-preset";
import { defineConfig, type Connect } from "vite";

// The build every game shares — the VITE_BASE / VITE_PACKAGED / VITE_NO_SW
// flags, `__APP_VERSION__` and the rest, the version stamp, the link-preview
// tags, public/_headers on the dev and preview servers, the PWA plugin — is
// `@tiling/vite-preset` (packages/vite-preset). What follows is Hypersweeper's
// own: the analytics switch and its stub, the PWA manifest, the chunking.
//
// The repo-root `data/` (the shared JSON both the Python and TypeScript apps
// read — see docs/agents/shared-data.md) and the geometry are workspace
// packages, `@tiling/data` and `@tiling/geometry`, so there is no alias to set.
// The dev server may serve their files with no `server.fs.allow`: Vite's
// default allow-list is the npm workspace root — the repo root.

const { packaged } = buildFlags();

// VITE_ANALYTICS=1 builds the bundle that carries the anonymous play counter
// (src/analytics.ts). It is *opt-in per build* rather than on by default,
// because the counter posts to a Cloudflare Pages Function and only one of the
// places this app runs has one. Everywhere else the post would 404 — and a
// failed subresource load is logged to the console by the browser itself, which
// no amount of care in our own code can swallow, so a build with nowhere to
// report to must not carry the reporter at all. That means: on for the
// Cloudflare deploy (and for the e2e run, whose webServer sets it), off for
// `npm run dev` (your own clicks are not data), and off for the packaged apps
// twice over — `packaged` vetoes it outright, so no build script can turn it on
// there by accident.
const analytics = !packaged && process.env.VITE_ANALYTICS === "1";

// Answer the analytics endpoint the way the deployed host does, so a dev server
// and `vite preview` are faithful to it. In production `/api/tally` is a
// Cloudflare Pages Function (functions/api/tally.ts) that always replies 204;
// without this, the same post here is a 404, and a failed subresource load is
// logged to the console by the *browser* — noise no application code can
// swallow, and noise the e2e suite would then have to learn to ignore. Nothing
// is recorded: to exercise the real Function, run `wrangler pages dev`.
const tallyStub = {
  name: "hypersweeper:tally-stub",
  configureServer: (server: { middlewares: Connect.Server }) =>
    void server.middlewares.use(stubTally),
  configurePreviewServer: (server: { middlewares: Connect.Server }) =>
    void server.middlewares.use(stubTally),
};

function stubTally(
  req: { url?: string | undefined; method?: string | undefined },
  res: { statusCode: number; end(): void },
  next: () => void,
): void {
  if (req.method !== "POST" || !(req.url ?? "").endsWith("/api/tally")) {
    next();
    return;
  }
  res.statusCode = 204;
  res.end();
}

const DESCRIPTION = "Minesweeper over exotic boards — flat tilings and 3D surfaces.";

export default defineConfig(
  gameConfig({
    configUrl: import.meta.url,
    name: "Hypersweeper",
    site: {
      url: "https://hypersweeper.pages.dev/",
      description: DESCRIPTION,
      imageAlt: "A Hypersweeper board part way through a game.",
    },
    define: { __APP_ANALYTICS__: analytics },
    plugins: [tallyStub],
    pwa: {
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Hypersweeper",
        short_name: "Hypersweeper",
        description: DESCRIPTION,
        theme_color: "#f2f2f7",
        background_color: "#f2f2f7",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,json}"],
        // The one file the worker must not hold a copy of: it names the build
        // the *server* is on, and a stamp served out of the precache could only
        // ever name the build that installed the worker — the update check
        // would then confirm this build to itself for ever. (The check's
        // cache-busting query misses the precache route anyway; this makes it a
        // property of the worker rather than of the URL the caller happens to
        // build.) Keeping workbox's own default beside it, which naming this
        // option would otherwise drop.
        //
        // And the link-preview card, which is not part of the app shell at all:
        // `og.png` is named only in the `og:image` meta tag, so the one thing
        // that ever fetches it is a crawler on the open network. A copy in the
        // precache is bytes every visitor downloads and no visitor uses — and
        // since the card is rendered from the Realistic theme, whose page is
        // full-frame turbulence, it is very nearly a megabyte of them.
        //
        // And the 404 page, for a subtler reason: the worker's navigation
        // fallback answers every navigation from the precache with index.html,
        // so an installed visitor never reaches Cloudflare's 404 handling at
        // all. The page is there for the callers that have no worker — crawlers,
        // scanners, first visits — which are exactly the ones that never read
        // the precache. Caching it would serve nobody.
        globIgnores: ["**/node_modules/**/*", STAMP_FILE, "og.png", "404.html"],
        // The Pages Function under /api/ is the one path that is not part of
        // the app shell. A POST is not a navigation request, so today's config
        // already leaves it alone; this says so, and keeps it true if the
        // navigation fallback is ever widened.
        //
        // And the privacy policy (public/privacy.html), which App Store Connect
        // links to and which must be the policy, never the game, for a visitor
        // with the worker installed. The precache answers /privacy already
        // (Workbox's `cleanURLs` tries /privacy.html), so this only matters if
        // that ever stops matching: the request then goes to the network, which
        // serves the page, rather than to the app shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/privacy(\.html)?$/],
      },
    },
    overrides: {
      build: {
        target: "es2022",
        sourcemap: false,
        // Three.js is the bulk of the bundle and changes only when the
        // dependency is bumped, so it gets a chunk of its own: an app-code
        // deploy then leaves its hash alone and returning players (and the
        // service worker's precache) re-download only what actually changed.
        rollupOptions: {
          output: {
            manualChunks: { three: ["three"] },
          },
        },
        // Rollup warns over 500 kB per chunk, which the single pre-split bundle
        // tripped (626 kB) — the warning CI carried for every build. The split
        // above is the actual fix (three lands at ~466 kB, the app at ~160 kB),
        // and the raised limit keeps the warning from coming back as the app
        // grows: this is a WebGL game whose renderer is not optional, there is
        // deliberately no size budget here, and a standing warning nobody
        // intends to act on only trains people to ignore the build log.
        chunkSizeWarningLimit: 900,
      },
    },
  }),
);
