// The games list every workflow reads (scripts/lib/games.mjs).
//
//   node --test scripts/test/
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { deployMatrix, listGames, needsFlagship, otherGames } from "../lib/games.mjs";

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

test("the real repo's games: Hypersweeper and Rep-tiles, both deployed", () => {
  const games = listGames(ROOT);
  assert.deepEqual(
    games.map((g) => g.key),
    ["hypersweeper", "reptiles"],
  );
  assert.deepEqual(otherGames(games), ["reptiles"]);
  const deploy = deployMatrix(games);
  assert.deepEqual(
    deploy.map((d) => [d.app, d.project]),
    [
      ["hypersweeper", "hypersweeper"],
      ["reptiles", "rep-tiles"],
    ],
  );
});

test("the flagship keeps its comment marker, analytics and site variable", () => {
  const [hs, rt] = deployMatrix(listGames(ROOT));
  assert.equal(hs.marker, "<!-- pr-preview -->");
  assert.equal(hs.title, "Play this PR");
  assert.equal(hs.analytics, "1");
  assert.equal(hs.siteUrlVariable, "SITE_URL");
  assert.equal(rt.marker, "<!-- pr-preview:rep-tiles -->");
  assert.equal(rt.title, "Play this PR in Rep-tiles");
  assert.equal(rt.analytics, "");
});

test("a folder without packaging.json is not a game; a game without web is not deployed", () => {
  const root = fakeRepo({
    hypersweeper: { productName: "Hypersweeper", web: { project: "hypersweeper", url: "u" } },
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
