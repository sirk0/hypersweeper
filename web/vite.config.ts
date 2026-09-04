import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The settings screen reports which build is running. The version comes from
// package.json — the bump-version workflow rewrites it (and pyproject.toml) on
// every push to master, so it names a deployed build exactly; the short commit
// pins it further on CI builds and is empty locally.
const pkg = createRequire(import.meta.url)("./package.json") as { version: string };

// Where the app is mounted. The deploy serves it from a domain root, so
// nothing sets VITE_BASE any more and the default is what every build uses;
// the override stays because the bundle derives asset URLs, the PWA manifest
// and the service worker scope from it, and a subdirectory host would need it
// again. (During the rewrite the build mounted under "/next/";
// public/next/index.html redirects that path here.)
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
// Cloudflare deploy (and for the e2e run, whose webServer sets it), off for
// `npm run dev` (your own clicks are not data), and off for the packaged apps
// twice over — `packaged` vetoes it outright, so no build script can turn it on
// there by accident.
const analytics = !packaged && process.env.VITE_ANALYTICS === "1";

// VITE_NO_SW=1 keeps the service worker out of an otherwise ordinary web build.
// The PR-preview deploy (.github/workflows/pr-preview.yml) sets it: every push
// to a pull request lands on that PR's one fixed URL, and a root-scoped
// precache there is a phone showing the push before last — the one failure mode
// a preview must not have, since checking the change on the phone is the whole
// point of it. `packaged` already implies this by dropping every plugin; this
// is the narrower knob, and it deliberately leaves `socialMeta`, `tallyStub`
// and `__APP_PACKAGED__` alone, so a preview is the deployed build minus the
// worker rather than the offline-app build. With nothing registered, the
// settings page's update row reports "running from source" — the branch
// `checkForUpdates` was written for.
const noServiceWorker = process.env.VITE_NO_SW === "1";

// Where this build will be served from, origin *and* base path, with a trailing
// slash — the one thing a bundle cannot work out for itself and a link preview
// cannot do without. Open Graph and Twitter cards are read by crawlers that do
// not run JavaScript and do not reliably resolve relative URLs, so `og:image`
// and `og:url` have to be absolute and have to be right at build time. The
// default is the deployed host, so a local build emits the same tags it will;
// the deploy workflow passes the repository variable SITE_URL over it, which is
// how a custom domain gets in without a code change.
const siteUrl = (process.env.VITE_SITE_URL ?? "https://hypersweeper.pages.dev/").replace(
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

// The build's own name — the same version and commit `define` puts in the
// bundle below — written where the *server* can be asked for it.
// `src/update.ts` fetches this file to find out which build is deployed, which
// is the only way to answer that question truthfully: the service worker
// updates itself quietly on launch, so its own state says nothing about whether
// the page you are looking at is the newest build. Version *and* commit,
// because a PR preview publishes many builds under one version number.
//
// Emitted rather than kept in `public/`, since it has to carry the version this
// build was made with; served by middleware as well, so a dev server and
// `vite preview` answer the check the way the deployed host does. Not part of
// any packaged bundle — those drop the update row entirely, and
// scripts/check-offline-assets.mjs asserts the fetch is compiled out with it.
const STAMP_FILE = "version.json";

const stamp = JSON.stringify({
  version: pkg.version,
  commit: (process.env.GITHUB_SHA ?? "").slice(0, 7),
});

const versionStamp: Plugin = {
  name: "hypersweeper:version-stamp",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: stamp });
  },
  configureServer: (server) => void server.middlewares.use(serveStamp),
  configurePreviewServer: (server) => void server.middlewares.use(serveStamp),
};

function serveStamp(
  req: { url?: string | undefined },
  res: { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void },
  next: () => void,
): void {
  if (!(req.url ?? "").split("?")[0]?.endsWith(`/${STAMP_FILE}`)) {
    next();
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(stamp);
}

// The response headers the deployed game is served with, applied to the dev
// server and to `vite preview` as well.
//
// public/_headers is a Cloudflare Pages file: it is read at the edge and by
// nothing else, so without this plugin the Content-Security-Policy in it would
// be live on production and absent from every place it could be tested — the
// one arrangement in which a policy is discovered to be wrong by players. The
// e2e suite runs against `vite preview`, so applying it there is what lets a
// spec assert the app loads with no violation.
//
// It parses the shipped file rather than restating the policy in TypeScript.
// A second copy would be a second thing to keep in step, and the copy under
// test would be the one that is not deployed.
//
// Read once, at config load, like the version stamp above: editing _headers
// takes a server restart, which is the same deal as editing this file.
interface HeaderRule {
  readonly matches: (path: string) => boolean;
  readonly headers: readonly (readonly [string, string])[];
}

/** Cloudflare's format: an unindented URL pattern, then its headers indented
 * under it, `#` comments and blank lines ignored. Every rule that matches is
 * applied in order, so a later one overrides an earlier one header by header —
 * which is how /next/ keeps the site-wide HSTS while replacing only the CSP. */
function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: { matches: (path: string) => boolean; headers: [string, string][] } | null = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { matches: patternMatcher(line.trim()), headers: [] };
      rules.push(current);
      continue;
    }
    // The first colon separates name from value; the value holds plenty more
    // of them (`https://`, and every scheme in the CSP).
    const colon = line.indexOf(":");
    if (colon < 0 || !current) continue;
    current.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules;
}

function patternMatcher(pattern: string): (path: string) => boolean {
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const re = new RegExp(`^${source}$`);
  return (path) => re.test(path);
}

const headerRules = parseHeadersFile(
  readFileSync(fileURLToPath(new URL("./public/_headers", import.meta.url)), "utf8"),
);

const securityHeaders: Plugin = {
  name: "hypersweeper:security-headers",
  configureServer: (server) => void server.middlewares.use(applyHeaders),
  configurePreviewServer: (server) => void server.middlewares.use(applyHeaders),
};

function applyHeaders(
  req: { url?: string | undefined },
  res: { setHeader(name: string, value: string): void },
  next: () => void,
): void {
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  for (const rule of headerRules) {
    if (!rule.matches(path)) continue;
    for (const [name, value] of rule.headers) res.setHeader(name, value);
  }
  next();
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
  // the Python and TypeScript apps read — see docs/agents/shared-data.md).
  // `@data` resolves
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
    versionStamp,
    securityHeaders,
    // Dropped, and the web manifest with it, when VITE_NO_SW=1 — see the flag
    // above. The other two plugins stay: a preview build is the deployed build
    // minus the worker, not the packaged one.
    ...(noServiceWorker ? [] : [VitePWA({
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
        globIgnores: ["**/node_modules/**/*", "version.json", "og.png", "404.html"],
        // The Pages Function under /api/ is the one path that is not part of
        // the app shell. A POST is not a navigation request, so today's config
        // already leaves it alone; this says so, and keeps it true if the
        // navigation fallback is ever widened.
        navigateFallbackDenylist: [/^\/api\//],
      },
    })]),
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
