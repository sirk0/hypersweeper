// Choose each uniform and Laves tiling's lined and coloured levels
// (src/colouringChoice.ts) and write them to src/colourings.json, which the
// game builds from — searching every painting takes seconds, too long for
// every page load. `npm run colourings` after changing a uniform or Laves window or
// the colourings, then `npm run difficulty`; the unit tests fail while the
// file is out of step.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chooseColourings } from "../src/colouringChoice";
import type { PaintingParams } from "../src/colourings";
import { LAVES, LEVELS, UNIFORM } from "../src/levels";

// one painting to a line, as Prettier leaves it
const json = (value: unknown): string => JSON.stringify(value).replace(/([:,])/g, "$1 ");
const path = fileURLToPath(new URL("../src/colourings.json", import.meta.url));
// `npm run colourings -- <key>…` chooses again for only those tilings,
// keeping the rest as written (the kisrhombille's search takes minutes)
const only = process.argv.slice(2);
const known = JSON.parse(readFileSync(path, "utf8")) as Record<string, PaintingParams[]>;
const rows: string[] = [];
for (const [key, box] of [...UNIFORM, ...LAVES]) {
  const started = performance.now();
  const plain = LEVELS.find((l) => l.key === key)!;
  const redo = only.length === 0 || only.includes(key);
  const chosen = redo ? chooseColourings(plain, box) : (known[key] ?? []);
  const lines = chosen.map((p) => `    { ${json(p).slice(1, -1)} }`);
  rows.push(`  ${JSON.stringify(key)}: [\n${lines.join(",\n")}\n  ]`);
  const ms = (performance.now() - started).toFixed(0);
  if (redo) console.log(`${key}: ${chosen.length} paintings (${ms} ms)`);
}
writeFileSync(path, `{\n${rows.join(",\n")}\n}\n`);
console.log(`wrote ${path}`);
