// The decisions scripts/new-game.mjs makes (scripts/lib/scaffold.mjs). The
// scaffold itself is exercised end to end by CI's template-check job.
//
//   node --test scripts/test/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  appIdFor,
  checkKey,
  devDependencies,
  nextPreviewPort,
  registerDocker,
  render,
} from "../lib/scaffold.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("a key must work as a folder, npm name, Pages project and subdomain", () => {
  assert.equal(checkKey("tile-slide", ROOT), null);
  assert.equal(checkKey("abc", ROOT), null);
  for (const bad of [
    "Tile",
    "tile_slide",
    "-tile",
    "tile-",
    "ti--le",
    "ab",
    "9tiles",
    "a".repeat(33),
  ]) {
    assert.match(checkKey(bad, ROOT), /is not a key/, bad);
  }
  assert.match(checkKey("reptiles", ROOT), /already exists/);
  assert.match(checkKey("packages", ROOT), /reserved/);
});

test("the desktop app id drops the hyphens", () => {
  assert.equal(appIdFor("tile-slide"), "com.sirk0.tileslide");
});

test("a new game's preview port is past every port a game already claims", () => {
  // Rep-tiles previews on 4174 (Hypersweeper on Vite's default 4173).
  assert.ok(nextPreviewPort(ROOT) > 4174);
});

test("render fills known tokens and leaves anything else alone", () => {
  assert.equal(
    render('name "__KEY__", port __PORT__, __UNKNOWN__', { KEY: "k", PORT: 4175 }),
    'name "k", port 4175, __UNKNOWN__',
  );
});

test("dev tools come at the flagship's versions, the Playwright pin exact", () => {
  const flagship = JSON.parse(readFileSync(`${ROOT}/apps/hypersweeper/package.json`, "utf8"));
  const deps = devDependencies(ROOT);
  assert.equal(deps["@playwright/test"], flagship.devDependencies["@playwright/test"]);
  assert.match(deps["@playwright/test"], /^\d+\.\d+\.\d+$/);
  assert.equal(deps["@tiling/vite-preset"], "*");
  assert.deepEqual(Object.keys(deps), [...Object.keys(deps)].sort());
});

test("a game joins the Docker runner's two lists, beside the other games, once", () => {
  const dockerfile = readFileSync(`${ROOT}/apps/hypersweeper/Dockerfile.e2e`, "utf8");
  const ignore = readFileSync(`${ROOT}/.dockerignore`, "utf8");
  const once = registerDocker(dockerfile, ignore, "tile-slide");
  const lines = once.dockerfile.split("\n");
  const at = lines.indexOf("COPY apps/tile-slide/package.json apps/tile-slide/");
  assert.ok(at > 0);
  assert.match(lines[at - 1], /^COPY apps\//);
  assert.ok(once.dockerignore.split("\n").includes("!apps/tile-slide/package.json"));
  const twice = registerDocker(once.dockerfile, once.dockerignore, "tile-slide");
  assert.deepEqual(twice, once);
});

test("the template's tokens are all ones the scaffold fills", () => {
  const known = new Set(["KEY", "TITLE", "APP_ID", "PORT"]);
  // The preset's build constants share the __NAME__ shape; render leaves them.
  const constants = new Set(["APP_VERSION", "APP_COMMIT", "APP_PACKAGED", "APP_SITE_URL"]);
  const files = [
    "package.json",
    "vite.config.ts",
    "playwright.config.ts",
    "index.html",
    "packaging.json",
    "wrangler.toml",
    "AGENTS.md",
    "src/main.ts",
    "scripts/make-icons.mts",
    "public/_headers",
  ];
  for (const file of files) {
    const text = readFileSync(`${ROOT}/templates/game/${file}`, "utf8");
    for (const [, name] of text.matchAll(/__([A-Z_]+)__/g)) {
      assert.ok(known.has(name) || constants.has(name), `${file}: unknown token __${name}__`);
    }
  }
});
