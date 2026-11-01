// Which game the shell runs: the staged one when there is one, else the game
// GAME names (default hypersweeper) straight from apps/<game>/.
//
//   node --test shells/desktop/test/
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { loadGame } from "../config.mjs";

// A shell folder beside the real one with nothing staged in it, so the last test
// reads the real apps/<game>/packaging.json even after a local staging run.
const UNSTAGED = fileURLToPath(new URL("../../unstaged-shell", import.meta.url));

/** A fake repo: shells/desktop plus apps/<game>/packaging.json for each game. */
function repo(games) {
  const root = mkdtempSync(join(tmpdir(), "shell-"));
  const here = join(root, "shells/desktop");
  mkdirSync(here, { recursive: true });
  for (const [game, packaging] of Object.entries(games)) {
    mkdirSync(join(root, "apps", game), { recursive: true });
    writeFileSync(join(root, "apps", game, "packaging.json"), JSON.stringify(packaging));
  }
  return { root, here };
}

test("runs the staged game when there is one", () => {
  const { here } = repo({ hypersweeper: { productName: "Hypersweeper" } });
  writeFileSync(join(here, "app.json"), JSON.stringify({ productName: "Rep-tiles" }));
  mkdirSync(join(here, "app"));
  writeFileSync(join(here, "app/index.html"), "");
  const { dist, packaging } = loadGame(here, {});
  assert.equal(dist, join(here, "app"));
  assert.equal(packaging.productName, "Rep-tiles");
});

test("a staged config with no build serves nothing", () => {
  const { here } = repo({});
  writeFileSync(join(here, "app.json"), JSON.stringify({ productName: "Rep-tiles" }));
  assert.equal(loadGame(here, {}).dist, null);
});

test("falls back to hypersweeper, or the game GAME names, from its own folder", () => {
  const { root, here } = repo({
    hypersweeper: { productName: "Hypersweeper" },
    reptiles: { productName: "Rep-tiles", desktop: { backgroundColor: "#f4f1ea" } },
  });
  assert.equal(loadGame(here, {}).packaging.productName, "Hypersweeper");
  const rt = loadGame(here, { GAME: "reptiles" });
  assert.equal(rt.packaging.desktop.backgroundColor, "#f4f1ea");
  assert.equal(rt.dist, null);
  mkdirSync(join(root, "apps/reptiles/dist"));
  writeFileSync(join(root, "apps/reptiles/dist/index.html"), "");
  assert.equal(loadGame(here, { GAME: "reptiles" }).dist, join(root, "apps/reptiles/dist"));
});

test("fills the desktop defaults, and refuses a config with no name", () => {
  const { here } = repo({ g: { productName: "G" }, bad: {} });
  const { desktop } = loadGame(here, { GAME: "g" }).packaging;
  assert.equal(desktop.backgroundColor, "#ffffff");
  assert.equal(desktop.smokeRoute, "");
  assert.throws(() => loadGame(here, { GAME: "bad" }), /productName/);
  assert.throws(() => loadGame(here, { GAME: "nope" }), /no packaging.json/);
});

test("every real game's packaging.json loads, with what the shell needs", () => {
  for (const game of ["hypersweeper", "reptiles"]) {
    const { packaging } = loadGame(UNSTAGED, { GAME: game });
    assert.ok(packaging.productName);
    assert.match(packaging.desktop.backgroundColor, /^#[0-9a-f]{6}$/i);
    assert.ok(packaging.desktop.appId, `${game}: desktop.appId`);
    assert.ok(packaging.desktop.executableName, `${game}: desktop.executableName`);
    assert.ok(packaging.desktop.icon, `${game}: desktop.icon`);
    assert.ok(packaging.desktop.smokePainted, `${game}: desktop.smokePainted`);
  }
});
