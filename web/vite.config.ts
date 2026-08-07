import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Connect } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The settings screen reports which build is running. The version comes from
// package.json — the bump-version workflow rewrites it (and pyproject.toml) on
// every push to master, so it names a deployed build exactly; the short commit
// pins it further on CI builds and is empty locally.
const pkg = createRequire(import.meta.url)("./package.json") as { version: string };

// This app is what GitHub Pages serves, at the site root of the project page.
// CI passes that path via VITE_BASE ("/hypersweeper/"); locally and under
// Playwright preview the default "/" keeps deep links simple. (During the
// rewrite the build mounted under "/next/" instead; public/next/index.html
// redirects that path here.)
const base = process.env.VITE_BASE ?? "/";

// VITE_PACKAGED=1 builds the bundle that ships *inside* an app rather than on
// a server: the macOS shell (desktop/, served from `app://`) and the iOS app
// (ios/, a Capacitor WKWebView served from `capacitor://localhost`). Both keep
// the base at "/" — what changes is that there is no service worker: its whole
// job is caching a *deployed* build for offline use, and inside a bundle whose
// files are already on disk it would only add a second, staler copy of them and
// an update check with nothing to check against. `__APP_PACKAGED__` lets the
// app drop that check from its settings.
const packaged = process.env.VITE_PACKAGED === "1";

// VITE_ANALYTICS=1 builds the bundle that carries the anonymous play counter
// (src/analytics.ts). It is *opt-in per build* rather than on by default,
// because the counter posts to a Cloudflare Pages Function and only one of the
// places this app runs has one. Everywhere else the post would 404 — and a
// failed subresource load is logged to the console by the browser itself, which
// no amount of care in our own code can swallow, so a build with nowhere to
// report to must not carry the reporter at all. That means: on for the
// Cloudflare deploy (and for the e2e run, whose webServer sets it), off for the
// GitHub Pages deploy, off for `npm run dev` (your own clicks are not data),
// and off for the packaged apps twice over — `packaged` vetoes it outright, so
// no build script can turn it on there by accident.
const analytics = !packaged && process.env.VITE_ANALYTICS === "1";

// Where this build will be served from, origin *and* base path, with a trailing
// slash — the one thing a bundle cannot work out for itself and a link preview
// cannot do without. Open Graph and Twitter cards are read by crawlers that do
// not run JavaScript and do not reliably resolve relative URLs, so `og:image`
// and `og:url` have to be absolute and have to be right at build time. The
// default is the GitHub Pages project site, so a local build still emits valid
// tags; each deploy workflow overrides it with the host it is publishing to.
const siteUrl = (process.env.VITE_SITE_URL ?? "https://sirk0.github.io/hypersweeper/").replace(
  /\/*$/,
  "/",
);

const SOCIAL_DESCRIPTION =
  "Minesweeper over exotic boards — flat tilings and 3D surfaces.";

/** Inject the link-preview tags into `index.html` at build time.
 *
 * A plugin rather than `%VITE_SITE_URL%` in the HTML, because Vite's HTML env
 * substitution reads the `.env` files rather than whatever the CI job exported,
 * and a placeholder that silently survives into `dist/` is exactly the failure
 * this is meant to prevent.
 *
 * Not applied to packaged builds: inside the macOS and iOS bundles there is no
 * crawler to read them, and an absolute `https://` URL in the HTML is precisely
 * what `scripts/check-offline-assets.mjs` exists to reject. */
const socialMeta = {
  name: "hypersweeper:social-meta",
  transformIndexHtml(html: string): string {
    const image = `${siteUrl}og.png`;
    const tags = [
      `<meta name="description" content="${SOCIAL_DESCRIPTION}" />`,
      `<link rel="canonical" href="${siteUrl}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="Hypersweeper" />`,
      `<meta property="og:title" content="Hypersweeper" />`,
      `<meta property="og:description" content="${SOCIAL_DESCRIPTION}" />`,
      `<meta property="og:url" content="${siteUrl}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="A Hypersweeper board part way through a game." />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="Hypersweeper" />`,
      `<meta name="twitter:description" content="${SOCIAL_DESCRIPTION}" />`,
      `<meta name="twitter:image" content="${image}" />`,
    ];
    return html.replace("</head>", `  ${tags.join("\n    ")}\n  </head>`);
  },
};

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

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify((process.env.GITHUB_SHA ?? "").slice(0, 7)),
    __APP_PACKAGED__: JSON.stringify(packaged),
    __APP_ANALYTICS__: JSON.stringify(analytics),
  },
  // Allow importing the repo-root `data/` directory (shared JSON that both
  // the Python and TypeScript apps read — see docs/plans). `@data` resolves
  // there so imports read `@data/ui/screens.json`.
  resolve: {
    alias: {
      "@data": fileURLToPath(new URL("../data", import.meta.url)),
    },
  },
  server: {
    fs: { allow: [".", fileURLToPath(new URL("../data", import.meta.url))] },
  },
  plugins: packaged ? [] : [
    socialMeta,
    tallyStub,
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Hypersweeper",
        short_name: "Hypersweeper",
        description:
          "Minesweeper over exotic boards — flat tilings and 3D surfaces.",
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
        // The Pages Function under /api/ is the one path that is not part of
        // the app shell. A POST is not a navigation request, so today's config
        // already leaves it alone; this says so, and keeps it true if the
        // navigation fallback is ever widened.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    // Three.js is the bulk of the bundle and changes only when the dependency
    // is bumped, so it gets a chunk of its own: an app-code deploy then leaves
    // its hash alone and returning players (and the service worker's precache)
    // re-download only what actually changed.
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
    // Rollup warns over 500 kB per chunk, which the single pre-split bundle
    // tripped (626 kB) — the warning CI carried for every build. The split
    // above is the actual fix (three lands at ~466 kB, the app at ~160 kB), and
    // the raised limit keeps the warning from coming back as the app grows:
    // this is a WebGL game whose renderer is not optional, there is
    // deliberately no size budget here, and a standing warning nobody intends
    // to act on only trains people to ignore the build log.
    chunkSizeWarningLimit: 900,
  },
});
