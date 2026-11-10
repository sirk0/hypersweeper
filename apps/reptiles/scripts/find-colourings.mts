// List each regular tiling's lined and coloured levels, and choose each
// uniform and Laves tiling's (src/colouringChoice.ts), and write them to
// src/colourings.json, which the game builds from — searching every painting
// takes from a second to minutes, far too long for a page load.
// `npm run colourings` after changing a painted tiling's window or the
// colourings, then `npm run levels` and `npm run difficulty`; the unit tests
// fail while the file is out of step.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chooseColourings, regularColourings } from "../src/colouringChoice";
import type { PaintingParams } from "../src/colourings";
import { COLOURED, LAVES, UNIFORM, makeFirstBoard, type Level } from "../src/levels";

// one painting to a line, as Prettier leaves it
const json = (value: unknown): string => JSON.stringify(value).replace(/([:,])/g, "$1 ");
const path = fileURLToPath(new URL("../src/colourings.json", import.meta.url));
// `npm run colourings -- <key>…` chooses again for only those tilings,
// keeping the rest as written (the kisrhombille's search takes minutes)
const only = process.argv.slice(2);
const known = JSON.parse(readFileSync(path, "utf8")) as Record<string, PaintingParams[]>;
const rows: string[] = [];
const tilings: [string, (plain: Level) => PaintingParams[]][] = [
  ...COLOURED.map(([key, lattice]): [string, (plain: Level) => PaintingParams[]] => [
    key,
    (plain) => regularColourings(plain, lattice),
  ]),
  ...[...UNIFORM, ...LAVES].map(([key, box]): [string, (plain: Level) => PaintingParams[]] => [
    key,
    (plain) => chooseColourings(plain, box),
  ]),
];
for (const [key, choose] of tilings) {
  const started = performance.now();
  const plain = makeFirstBoard(key);
  const redo = only.length === 0 || only.includes(key);
  const chosen = redo ? choose(plain) : (known[key] ?? []);
  const lines = chosen.map((p) => `    { ${json(p).slice(1, -1)} }`);
  rows.push(`  ${JSON.stringify(key)}: [\n${lines.join(",\n")}\n  ]`);
  const ms = (performance.now() - started).toFixed(0);
  if (redo) console.log(`${key}: ${chosen.length} paintings (${ms} ms)`);
}
writeFileSync(path, `{\n${rows.join(",\n")}\n}\n`);
console.log(`wrote ${path}`);
