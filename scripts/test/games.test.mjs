// The games list every workflow reads (scripts/lib/games.mjs).
//
//   node --test scripts/test/
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  deployMatrix,
  listGames,
  movedMatrix,
  needsFlagship,
  otherGames,
  ownVersionGames,
  previewProjects,
  readSite,
} from "../lib/games.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function fakeRepo(games) {
  const root = mkdtempSync(join(tmpdir(), "games-"));
  mkdirSync(join(root, "apps/not-a-game"), { recursive: true });
  for (const [key, packaging] of Object.entries(games)) {
    mkdirSync(join(root, "apps", key), { recursive: true });
    writeFileSync(join(root, "apps", key, "package.json"), JSON.stringify({ name: `${key}-pkg` }));
    writeFileSync(join(root, "apps", key, "packaging.json"), JSON.stringify(packaging));
  }
  return root;
}

test("the real repo's games: Hypersweeper on its own project, Rep-tiles on the shared site", () => {
  const games = listGames(ROOT);
  assert.deepEqual(
    games.map((g) => [g.key, g.web.path]),
    [
      ["hypersweeper", "hypersweeper"],
      ["reptiles", "rep-tiles"],
    ],
  );
  assert.deepEqual(otherGames(games), ["reptiles"]);
  assert.deepEqual(
    deployMatrix(games).map((d) => [d.app, d.project]),
    [["hypersweeper", "hypersweeper"]],
  );
  assert.deepEqual(movedMatrix(games), [
    { app: "reptiles", project: "rep-tiles", url: "https://tiling-games.pages.dev/rep-tiles/" },
  ]);
  assert.deepEqual(previewProjects(games, readSite(ROOT)), [
    "tiling-games",
    "hypersweeper",
    "rep-tiles",
  ]);
});

test("the flagship keeps its analytics, site variable and App Store link", () => {
  const games = listGames(ROOT);
  const [hs] = deployMatrix(games);
  assert.equal(hs.analytics, "1");
  assert.equal(hs.siteUrlVariable, "SITE_URL");
  assert.equal(games[0].appStore, "https://apps.apple.com/us/app/hypersweeper/id6822071409");
  assert.equal(games[1].appStore, null);
  assert.ok(games.every((g) => g.description));
});

test("the shared site: site/site.json agrees with site/wrangler.toml", () => {
  const site = readSite(ROOT);
  assert.equal(site.url, `https://${site.project}.pages.dev/`);
  const toml = readFileSync(join(ROOT, "site/wrangler.toml"), "utf8");
  assert.match(toml, new RegExp(`^name = "${site.project}"`, "m"));
  assert.match(toml, /^pages_build_output_dir = "dist"/m);
});

test("a game's folder defaults to its key; the scaffold's games go on the shared site", () => {
  const root = fakeRepo({
    plain: { productName: "Plain", web: { url: "https://tiling-games.pages.dev/plain/" } },
  });
  const games = listGames(root);
  assert.equal(games[0].web.path, "plain");
  assert.deepEqual(deployMatrix(games), []);
  assert.deepEqual(movedMatrix(games), []);
  assert.deepEqual(previewProjects(games, { project: "shared" }), ["shared"]);
});

test("Rep-tiles shares the flagship's version; a game without the flag has its own", () => {
  assert.deepEqual(ownVersionGames(listGames(ROOT)), []);
  const root = fakeRepo({
    hypersweeper: { productName: "Hypersweeper" },
    follows: { productName: "Follows", sharedVersion: true },
    own: { productName: "Own" },
  });
  const games = listGames(root);
  assert.deepEqual(
    games.map((g) => [g.key, g.sharedVersion]),
    [
      ["follows", true],
      ["hypersweeper", false],
      ["own", false],
    ],
  );
  assert.deepEqual(ownVersionGames(games), ["own"]);
});

test("a folder without packaging.json is not a game; a game without web is not deployed", () => {
  const root = fakeRepo({
    hypersweeper: {
      productName: "Hypersweeper",
      web: { path: "hypersweeper", project: "hypersweeper", url: "u" },
    },
    "local-only": { productName: "Local" },
  });
  const games = listGames(root);
  assert.deepEqual(
    games.map((g) => g.key),
    ["hypersweeper", "local-only"],
  );
  assert.equal(games[1].name, "local-only-pkg");
  assert.deepEqual(
    deployMatrix(games).map((d) => d.app),
    ["hypersweeper"],
  );
});

test("the flagship's long jobs run unless every change is inside another game", () => {
  const games = listGames(ROOT);
  assert.equal(needsFlagship(["apps/reptiles/src/a.ts", "apps/reptiles/b.md"], games), false);
  assert.equal(needsFlagship(["apps/reptiles/a.ts", "packages/geometry/x.ts"], games), true);
  assert.equal(needsFlagship(["apps/hypersweeper/src/a.ts"], games), true);
  assert.equal(needsFlagship(["README.md"], games), true);
  // An empty diff is not a reason to skip anything.
  assert.equal(needsFlagship([], games), false);
});
