import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, PluginOption } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFlags,
  gameConfig,
  parseHeadersFile,
  siteUrlFor,
  socialMeta,
  type GameOptions,
} from "../src/index";

/** A throwaway game folder: a package.json, optionally public/_headers. */
function gameDir(opts: { headers?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "vite-preset-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "1.2.3" }));
  if (opts.headers !== undefined) {
    mkdirSync(join(dir, "public"));
    writeFileSync(join(dir, "public/_headers"), opts.headers);
  }
  return dir;
}

const configUrl = (dir: string): string => pathToFileURL(join(dir, "vite.config.ts")).href;

/** The names of the plugins a config carries, flattened. */
function pluginNames(plugins: PluginOption[] | undefined): string[] {
  return (plugins ?? []).flat(Infinity as 1).flatMap((p) => {
    const plugin = p as Plugin | null | false;
    return plugin && typeof plugin === "object" && "name" in plugin ? [plugin.name] : [];
  });
}

function config(env: Record<string, string>, options: Partial<GameOptions> = {}, dir = gameDir()) {
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return gameConfig({ configUrl: configUrl(dir), name: "Game", ...options });
}

afterEach(() => vi.unstubAllEnvs());

describe("buildFlags", () => {
  it("defaults to a root-mounted web build with a service worker", () => {
    expect(buildFlags({})).toEqual({ base: "/", packaged: false, noServiceWorker: false });
  });

  it("reads VITE_BASE, VITE_PACKAGED and VITE_NO_SW", () => {
    expect(buildFlags({ VITE_BASE: "/sub/", VITE_PACKAGED: "1", VITE_NO_SW: "1" })).toEqual({
      base: "/sub/",
      packaged: true,
      noServiceWorker: true,
    });
  });

  it("treats anything but 1 as off", () => {
    expect(buildFlags({ VITE_PACKAGED: "true", VITE_NO_SW: "0" })).toMatchObject({
      packaged: false,
      noServiceWorker: false,
    });
  });
});

describe("siteUrlFor", () => {
  it("normalises to exactly one trailing slash", () => {
    expect(siteUrlFor("https://a.dev", {})).toBe("https://a.dev/");
    expect(siteUrlFor("https://a.dev///", {})).toBe("https://a.dev/");
  });

  it("lets VITE_SITE_URL override the default", () => {
    expect(siteUrlFor("https://a.dev/", { VITE_SITE_URL: "https://b.dev/x" })).toBe(
      "https://b.dev/x/",
    );
  });
});

describe("gameConfig", () => {
  const site = { url: "https://game.dev", description: "A game." };
  const pwa = { manifest: { name: "Game" } };

  it("defines the build constants every game reads", () => {
    vi.stubEnv("GITHUB_SHA", "0123456789abcdef");
    const c = config({}, { define: { __APP_EXTRA__: true } });
    expect(c.define).toEqual({
      __APP_VERSION__: '"1.2.3"',
      __APP_COMMIT__: '"0123456"',
      __APP_PACKAGED__: "false",
      __APP_EXTRA__: "true",
    });
  });

  it("adds __APP_SITE_URL__ and the link-preview tags for a deployed game", () => {
    const c = config({}, { site });
    expect(c.define?.["__APP_SITE_URL__"]).toBe('"https://game.dev/"');
    expect(pluginNames(c.plugins)).toContain("tiling:social-meta");
  });

  it("orders a web build's plugins: tags, the game's own, stamp, headers, PWA", () => {
    const own: Plugin = { name: "game:own" };
    const c = config({}, { site, pwa, plugins: [own] }, gameDir({ headers: "/*\n  X: y\n" }));
    const names = pluginNames(c.plugins);
    expect(names.slice(0, 4)).toEqual([
      "tiling:social-meta",
      "game:own",
      "tiling:version-stamp",
      "tiling:security-headers",
    ]);
    expect(names.slice(4).some((n) => n.startsWith("vite-plugin-pwa"))).toBe(true);
  });

  it("leaves out the headers plugin when the game has no public/_headers", () => {
    expect(pluginNames(config({}).plugins)).toEqual(["tiling:version-stamp"]);
  });

  it("drops only the PWA under VITE_NO_SW", () => {
    const names = pluginNames(config({ VITE_NO_SW: "1" }, { site, pwa }).plugins);
    expect(names).toEqual(["tiling:social-meta", "tiling:version-stamp"]);
  });

  it("drops every plugin from a packaged build, and says so in __APP_PACKAGED__", () => {
    const c = config({ VITE_PACKAGED: "1" }, { site, pwa, plugins: [{ name: "game:own" }] });
    expect(pluginNames(c.plugins)).toEqual([]);
    expect(c.define?.["__APP_PACKAGED__"]).toBe("true");
  });

  it("merges the game's overrides over the result", () => {
    const c = config({ VITE_BASE: "/b/" }, { overrides: { server: { port: 1234 } } });
    expect(c.base).toBe("/b/");
    expect(c.server?.port).toBe(1234);
  });
});

describe("socialMeta", () => {
  const html = "<html><head><title>T</title></head><body></body></html>";
  const transform = (plugin: Plugin): string =>
    (plugin.transformIndexHtml as (html: string) => string)(html);

  it("writes an image card when the game has og.png", () => {
    const out = transform(
      socialMeta("Game", { url: "", description: "D.", imageAlt: "A board." }, "https://g.dev/"),
    );
    expect(out).toContain('<link rel="canonical" href="https://g.dev/" />');
    expect(out).toContain('<meta property="og:image" content="https://g.dev/og.png" />');
    expect(out).toContain('<meta property="og:image:alt" content="A board." />');
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(out.indexOf("og:title")).toBeLessThan(out.indexOf("</head>"));
  });

  it("writes a text card without one", () => {
    const out = transform(socialMeta("Game", { url: "", description: "D." }, "https://g.dev/"));
    expect(out).not.toContain("og:image");
    expect(out).not.toContain("twitter:image");
    expect(out).toContain('<meta name="twitter:card" content="summary" />');
  });
});

describe("parseHeadersFile", () => {
  it("reads patterns, their indented headers, and skips comments and blanks", () => {
    const rules = parseHeadersFile(
      "# comment\n/*\n  A: 1\n  CSP: default-src 'self'; img-src https://x\n\n/api/*\n  B: 2\n",
    );
    expect(rules.map((r) => r.headers)).toEqual([
      [
        ["A", "1"],
        ["CSP", "default-src 'self'; img-src https://x"],
      ],
      [["B", "2"]],
    ]);
    expect(rules[0]!.matches("/anything")).toBe(true);
    expect(rules[1]!.matches("/api/tally")).toBe(true);
    expect(rules[1]!.matches("/apix")).toBe(false);
  });

  it("matches a literal pattern exactly, dots and all", () => {
    const [rule] = parseHeadersFile("/a.json\n  X: y\n");
    expect(rule!.matches("/a.json")).toBe(true);
    expect(rule!.matches("/aXjson")).toBe(false);
  });
});
