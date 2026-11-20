// The shared site's pieces (scripts/lib/site.mjs), as scripts/build-site.mjs
// puts them together.
//
//   node --test scripts/test/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { listGames } from "../lib/games.mjs";
import {
  movedNotFound,
  movedRedirects,
  NOINDEX_HEADERS,
  prefixHeaders,
  prefixRedirects,
  renderLanding,
  standaloneRedirects,
} from "../lib/site.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("a game's _headers move under its folder, and no `/*` is left to reach the rest", () => {
  const text = readFileSync(`${ROOT}/apps/reptiles/public/_headers`, "utf8");
  const moved = prefixHeaders(text, "/rep-tiles");
  const patterns = moved.split("\n").filter((l) => l && !/^\s/.test(l));
  assert.deepEqual(patterns, ["/rep-tiles/*"]);
  assert.match(moved, /^ {2}Content-Security-Policy: default-src 'self';/m);
  assert.doesNotMatch(moved, /^#/m);
  assert.equal(prefixHeaders("/*\n  A: 1\n/x\n  B: 2", "/g"), "/g/*\n  A: 1\n\n/g/x\n  B: 2");
  assert.throws(() => prefixHeaders("https://example.com/*\n  A: 1", "/g"));
});

test("every game's headers, prefixed, leave only the preview's noindex rule at `/*`", () => {
  for (const game of listGames(ROOT)) {
    const text = readFileSync(`${ROOT}/${game.dir}/public/_headers`, "utf8");
    assert.doesNotMatch(prefixHeaders(text, `/${game.web.path}`), /^\/\*$/m);
  }
  const landing = readFileSync(`${ROOT}/site/_headers`, "utf8");
  assert.doesNotMatch(landing, /^\/\*/m, "site/_headers must not match a game's folder");
  assert.equal(NOINDEX_HEADERS.split("\n")[0], "/*");
});

test("a game's _redirects move under its folder; absolute destinations stay", () => {
  assert.equal(
    prefixRedirects("# c\n/old /new 301\n/x https://example.com/ 302\n", "/g"),
    "/g/old /g/new 301\n/g/x https://example.com/ 302",
  );
});

test("a game with a project of its own: its folder 302s there, deep links included", () => {
  const [hs] = listGames(ROOT);
  assert.equal(
    standaloneRedirects(hs),
    "/hypersweeper https://hypersweeper.pages.dev/ 302\n" +
      "/hypersweeper/* https://hypersweeper.pages.dev/:splat 302",
  );
});

test("the landing page: a card per game, relative links, the App Store where there is one", () => {
  const template = readFileSync(`${ROOT}/site/index.html`, "utf8");
  const html = renderLanding(template, listGames(ROOT), new Set(["reptiles"]));
  assert.doesNotMatch(html, /<!-- games -->|<!-- privacy -->/);
  assert.match(html, /<h2><a href="hypersweeper\/">Hypersweeper<\/a><\/h2>/);
  assert.match(html, /<h2><a href="rep-tiles\/">Rep-tiles<\/a><\/h2>/);
  assert.match(html, /href="https:\/\/apps\.apple\.com\/us\/app\/hypersweeper\/id6822071409"/);
  assert.equal(html.match(/apps\.apple\.com/g).length, 1);
  assert.match(html, /<img src="icons\/reptiles\.svg"/);
  assert.doesNotMatch(html, /icons\/hypersweeper\.svg/);
  assert.match(html, /href="rep-tiles\/privacy"/);
  assert.doesNotMatch(html, /href="\/[a-z]/, "links must be relative, for the previews");
  assert.throws(() => renderLanding("<html></html>", []));
});

test("a moved project: explicit 301s (never /sw.js), and a page that redirects too", () => {
  const rules = movedRedirects("https://tiling-games.pages.dev/rep-tiles/").split("\n");
  assert.deepEqual(rules, [
    "/ https://tiling-games.pages.dev/rep-tiles/ 301",
    "/index.html https://tiling-games.pages.dev/rep-tiles/ 301",
    "/privacy https://tiling-games.pages.dev/rep-tiles/privacy 301",
    "/privacy.html https://tiling-games.pages.dev/rep-tiles/privacy 301",
  ]);
  assert.ok(rules.every((r) => !r.includes("*")));
  assert.match(
    movedNotFound("https://x.dev/g", "G"),
    /<meta http-equiv="refresh" content="0; url=https:\/\/x\.dev\/g\/" \/>/,
  );
});
