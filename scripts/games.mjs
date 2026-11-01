#!/usr/bin/env node
// The games in this repo, for the workflows (see scripts/lib/games.mjs):
//
//   node scripts/games.mjs github     # name=JSON lines for $GITHUB_OUTPUT:
//                                     #   others  — the generic jobs' matrix
//                                     #   deploy  — the deploy / preview matrix
//   node scripts/games.mjs others     # the non-flagship keys, one per line
//   node scripts/games.mjs flagship-needed < changed-paths
//                                     # "true" or "false"
//   node scripts/games.mjs list       # every game, as JSON
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deployMatrix, listGames, needsFlagship, otherGames } from "./lib/games.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const games = listGames(root);
const command = process.argv[2];

if (command === "github") {
  console.log(`others=${JSON.stringify(otherGames(games))}`);
  console.log(`deploy=${JSON.stringify(deployMatrix(games))}`);
} else if (command === "others") {
  for (const key of otherGames(games)) console.log(key);
} else if (command === "flagship-needed") {
  const changed = readFileSync(0, "utf8").split("\n").filter(Boolean);
  console.log(String(needsFlagship(changed, games)));
} else if (command === "list") {
  console.log(JSON.stringify(games, null, 2));
} else {
  console.error("usage: node scripts/games.mjs github|others|flagship-needed|list");
  process.exit(2);
}
