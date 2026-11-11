// List each regular tiling's lined and coloured levels, and choose each
// uniform, 2-uniform, Laves and 2-isohedral tiling's and bond's (src/colouringChoice.ts), and write them to
// src/colourings.json, which the game builds from — searching every painting
// takes from a second to minutes, far too long for a page load. Then choose
// each aperiodic level's, spiral's and rep-tile's proper colouring (`chooseColouring` in
// src/patchMarks.ts) and write it to src/aperiodicColourings.json.
// `npm run colourings` after changing a painted tiling's window or the
// colourings, then `npm run levels` and `npm run difficulty`; the unit tests
// fail while the file is out of step.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { chooseColourings, regularColourings } from "../src/colouringChoice";
import type { PaintingParams } from "../src/colourings";
import {
  COLOURED,
  LAVES,
  PATCH_MARKED,
  TWO_ISOHEDRAL_KEYED,
  RECTANGLES,
  TWO_UNIFORM,
  UNIFORM,
  makeFirstBoard,
  patchWindow,
  type Level,
} from "../src/levels";
import { chooseColouring, type ChosenColouring } from "../src/patchMarks";

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
  ...[...UNIFORM, ...TWO_UNIFORM, ...LAVES, ...TWO_ISOHEDRAL_KEYED, ...RECTANGLES].map(
    ([key, box]): [string, (plain: Level) => PaintingParams[]] => [
      key,
      (plain) => chooseColourings(plain, box),
    ],
  ),
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

// the aperiodic levels' colourings: one each, the fewest tray tiles found
const aperiodicPath = fileURLToPath(new URL("../src/aperiodicColourings.json", import.meta.url));
const aperiodicKnown = JSON.parse(readFileSync(aperiodicPath, "utf8")) as Record<
  string,
  ChosenColouring
>;
const aperiodicRows: string[] = [];
for (const key of PATCH_MARKED) {
  const started = performance.now();
  const redo = only.length === 0 || only.includes(key) || !aperiodicKnown[key];
  let chosen = aperiodicKnown[key]!;
  if (redo) {
    const { ring, cells, around, window, edges } = patchWindow(makeFirstBoard(key));
    chosen = chooseColouring(ring, cells, around, window, edges);
  }
  const { colours, tiles, cells, around } = chosen;
  aperiodicRows.push(
    `  ${JSON.stringify(key)}: {\n    "colours": ${colours},\n    "tiles": ${tiles},\n    "cells": ${json(cells)},\n    "around": ${json(around)}\n  }`,
  );
  const ms = (performance.now() - started).toFixed(0);
  if (redo) console.log(`${key}: ${colours} colours, ${tiles} tray tiles (${ms} ms)`);
}
// as Prettier leaves it: its long rows wrapped
writeFileSync(
  aperiodicPath,
  await format(`{\n${aperiodicRows.join(",\n")}\n}\n`, {
    ...(await resolveConfig(aperiodicPath)),
    filepath: aperiodicPath,
  }),
);
console.log(`wrote ${aperiodicPath}`);
