// The Vite build every game in this repo shares. A game's vite.config.ts is a
// call to `gameConfig`: the game says what it is (its name, where it is
// deployed, its PWA manifest, any plugin of its own), and this file supplies the
// rest — the same in every game:
//
//   - the build flags: VITE_BASE, VITE_PACKAGED, VITE_NO_SW (`buildFlags`);
//   - the build constants `__APP_VERSION__`, `__APP_COMMIT__`,
//     `__APP_PACKAGED__` and, for a deployed game, `__APP_SITE_URL__`;
//   - the version stamp (`version.json`), emitted and served;
//   - the link-preview tags in index.html;
//   - the deployed response headers (public/_headers) on the dev and preview
//     servers;
//   - the PWA (service worker and web manifest).
//
// **`VITE_PACKAGED=1` only ever removes.** A packaged build — the bundle that
// ships inside the macOS or iPhone app, served from disk — gets no plugin at
// all: no service worker, no version stamp, no link-preview tags (an absolute
// https:// URL in the HTML is exactly what scripts/check-offline-assets.mjs
// rejects). A game must not add a second packaged-only branch; a shell that
// needs different behaviour provides it itself.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig, type Plugin, type PluginOption, type UserConfig } from "vite";
import { VitePWA, type VitePWAOptions } from "vite-plugin-pwa";

/** The three switches every game's build reads from the environment. */
export interface BuildFlags {
  /** Where the app is mounted, with a trailing slash. Every deploy serves from a
   * domain root, so nothing sets VITE_BASE today; the override stays because
   * asset URLs, the PWA manifest and the service worker scope all derive from
   * it, and a subdirectory host would need it again. */
  readonly base: string;
  /** VITE_PACKAGED=1: the bundle that ships *inside* an app rather than on a
   * server — the macOS shell (shells/desktop/, served from `app://`) and the iOS
   * app (ios/, a Capacitor WKWebView served from `capacitor://localhost`). Both
   * keep the base at "/"; what changes is that there is no service worker (its
   * whole job is caching a *deployed* build for offline use, and inside a
   * bundle whose files are already on disk it would only add a second, staler
   * copy of them) and no update check with nothing to check against. */
  readonly packaged: boolean;
  /** VITE_NO_SW=1 keeps the service worker out of an otherwise ordinary web
   * build. The PR-preview deploy sets it: every push to a pull request lands on
   * that PR's one fixed URL, and a root-scoped precache there is a phone
   * showing the push before last. `packaged` already implies it by dropping
   * every plugin; this is the narrower knob, so a preview is the deployed build
   * minus the worker rather than the offline-app build. */
  readonly noServiceWorker: boolean;
}

export function buildFlags(env: NodeJS.ProcessEnv = process.env): BuildFlags {
  return {
    base: env["VITE_BASE"] ?? "/",
    packaged: env["VITE_PACKAGED"] === "1",
    noServiceWorker: env["VITE_NO_SW"] === "1",
  };
}

/** Where a deployed game is served from, and how its link preview reads. */
export interface SiteOptions {
  /** The deployed origin and base path. VITE_SITE_URL overrides it (the deploy
   * workflow passes a repository variable over it, which is how a custom domain
   * gets in without a code change). */
  readonly url: string;
  /** The game's one-sentence pitch: the meta description and the card text. */
  readonly description: string;
  /** Alt text for `og.png` — set it when public/og.png exists, and the card
   * carries that 1200×630 image; leave it out for a text-only card. */
  readonly imageAlt?: string;
}

export interface GameOptions {
  /** `import.meta.url` of the game's vite.config.ts: where its package.json
   * (the version) and public/_headers are found. */
  readonly configUrl: string;
  /** The game's display name: the link-preview title and site name. */
  readonly name: string;
  /** Set for a game that is deployed: adds `__APP_SITE_URL__` and the
   * link-preview tags. */
  readonly site?: SiteOptions;
  /** The game's PWA (manifest, icons, workbox). Left out, the game has no
   * service worker. Never applied to a packaged build or under VITE_NO_SW. */
  readonly pwa?: Partial<VitePWAOptions>;
  /** The game's own web-build plugins, placed after the link-preview tags.
   * Like everything here, dropped from a packaged build. */
  readonly plugins?: readonly PluginOption[];
  /** More build constants, each JSON-encoded here (`{ __APP_ANALYTICS__: true }`). */
  readonly define?: Readonly<Record<string, unknown>>;
  /** Anything else, merged over the result with Vite's `mergeConfig`
   * (`build`, `server`, `preview`…). */
  readonly overrides?: UserConfig;
}

/** The trailing-slash form a URL base is compared and joined in. */
export function siteUrlFor(url: string, env: NodeJS.ProcessEnv = process.env): string {
  return (env["VITE_SITE_URL"] ?? url).replace(/\/*$/, "/");
}

export function gameConfig(options: GameOptions): UserConfig {
  const flags = buildFlags();
  const root = dirname(fileURLToPath(options.configUrl));
  const version = (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }
  ).version;
  const commit = (process.env["GITHUB_SHA"] ?? "").slice(0, 7);
  const siteUrl = options.site ? siteUrlFor(options.site.url) : null;
  const headersFile = join(root, "public/_headers");

  const define: Record<string, string> = {
    // The settings screen reports which build is running. The version comes
    // from the game's package.json — bump-version.yml rewrites it on every push
    // to master — and the short commit pins it further on CI builds (empty
    // locally).
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_PACKAGED__: JSON.stringify(flags.packaged),
  };
  for (const [name, value] of Object.entries(options.define ?? {})) {
    define[name] = JSON.stringify(value);
  }
  if (siteUrl) define["__APP_SITE_URL__"] = JSON.stringify(siteUrl);

  const plugins: PluginOption[] = flags.packaged
    ? []
    : [
        ...(options.site && siteUrl ? [socialMeta(options.name, options.site, siteUrl)] : []),
        ...(options.plugins ?? []),
        versionStamp(JSON.stringify({ version, commit })),
        ...(existsSync(headersFile)
          ? [securityHeaders(parseHeadersFile(readFileSync(headersFile, "utf8")))]
          : []),
        ...(options.pwa && !flags.noServiceWorker ? [VitePWA(options.pwa)] : []),
      ];

  return mergeConfig({ base: flags.base, define, plugins }, options.overrides ?? {});
}

/** The link-preview tags, injected into index.html at build time.
 *
 * A plugin rather than `%VITE_SITE_URL%` in the HTML, because Vite's HTML env
 * substitution reads the `.env` files rather than whatever the CI job
 * exported, and a placeholder that silently survives into `dist/` is exactly
 * the failure this is meant to prevent. Open Graph and Twitter cards are read
 * by crawlers that run no JavaScript and do not reliably resolve relative URLs,
 * so `og:url` and `og:image` are absolute, fixed at build time. */
export function socialMeta(name: string, site: SiteOptions, siteUrl: string): Plugin {
  const { description, imageAlt } = site;
  const image = `${siteUrl}og.png`;
  const tags = [
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${siteUrl}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${name}" />`,
    `<meta property="og:title" content="${name}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${siteUrl}" />`,
    ...(imageAlt === undefined
      ? []
      : [
          `<meta property="og:image" content="${image}" />`,
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
          `<meta property="og:image:alt" content="${imageAlt}" />`,
        ]),
    `<meta name="twitter:card" content="${imageAlt === undefined ? "summary" : "summary_large_image"}" />`,
    `<meta name="twitter:title" content="${name}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    ...(imageAlt === undefined ? [] : [`<meta name="twitter:image" content="${image}" />`]),
  ];
  return {
    name: "tiling:social-meta",
    transformIndexHtml: (html) => html.replace("</head>", `  ${tags.join("\n    ")}\n  </head>`),
  };
}

/** The file the update check asks the *server* for. */
export const STAMP_FILE = "version.json";

/** The build's own name — the same version and commit `define` puts in the
 * bundle — written where the server can be asked for it. A game's update check
 * fetches it to learn which build is deployed, the only truthful answer: a
 * service worker updates itself quietly on launch, so its own state says
 * nothing about whether the page on screen is the newest build. Version *and*
 * commit, because a PR preview publishes many builds under one version.
 *
 * Emitted rather than kept in public/, since it carries the version this build
 * was made with; served by middleware as well, so the dev and preview servers
 * answer the check the way the deployed host does. (A PWA's workbox config
 * should list it in `globIgnores`: a stamp served from the precache could only
 * name the build that installed the worker.) */
export function versionStamp(stamp: string): Plugin {
  const serve = (
    req: { url?: string | undefined },
    res: {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(body?: string): void;
    },
    next: () => void,
  ): void => {
    if (!(req.url ?? "").split("?")[0]?.endsWith(`/${STAMP_FILE}`)) {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(stamp);
  };
  return {
    name: "tiling:version-stamp",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: STAMP_FILE, source: stamp });
    },
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}

export interface HeaderRule {
  readonly matches: (path: string) => boolean;
  readonly headers: readonly (readonly [string, string])[];
}

/** Parse a Cloudflare Pages `_headers` file: an unindented URL pattern, then
 * its headers indented under it, `#` comments and blank lines ignored.
 *
 * Cloudflare merges every rule whose pattern matches, sending a header named by
 * two of them twice; `securityHeaders` applies them in order and lets the last
 * win instead. The difference is unobservable while a game's _headers holds a
 * single `/*` rule, which is the arrangement Hypersweeper's documents and
 * deliberately keeps. If a second matching rule is ever added, this is the
 * line to revisit before trusting a test that passes. */
export function parseHeadersFile(text: string): HeaderRule[] {
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
    // of them (`https://`, and every scheme in a CSP).
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

/** The deployed response headers (public/_headers, read at the edge and by
 * nothing else), applied to the dev server and `vite preview` too — otherwise a
 * Content-Security-Policy in it would be live in production and absent from
 * every place it could be tested. It parses the shipped file rather than
 * restating the policy, so the copy under test is the one deployed. Read once,
 * at config load: editing _headers takes a server restart. */
export function securityHeaders(rules: readonly HeaderRule[]): Plugin {
  const apply = (
    req: { url?: string | undefined },
    res: { setHeader(name: string, value: string): void },
    next: () => void,
  ): void => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    for (const rule of rules) {
      if (!rule.matches(path)) continue;
      for (const [name, value] of rule.headers) res.setHeader(name, value);
    }
    next();
  };
  return {
    name: "tiling:security-headers",
    configureServer: (server) => void server.middlewares.use(apply),
    configurePreviewServer: (server) => void server.middlewares.use(apply),
  };
}
