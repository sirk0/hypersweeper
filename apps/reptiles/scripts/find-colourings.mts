// Choose each uniform and Laves tiling's lined and coloured levels
// (src/colouringChoice.ts) and write them to src/colourings.json, which the
// game builds from — searching every painting takes seconds, too long for
// every page load. `npm run colourings` after changing a uniform or Laves window or
// the colourings, then `npm run difficulty`; the unit tests fail while the
// file is out of step.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chooseColourings } from "../src/colouringChoice";
import { LAVES, LEVELS, UNIFORM } from "../src/levels";

// one painting to a line, as Prettier leaves it
const json = (value: unknown): string => JSON.stringify(value).replace(/([:,])/g, "$1 ");
const rows: string[] = [];
for (const [key, box] of [...UNIFORM, ...LAVES]) {
  const started = performance.now();
  const plain = LEVELS.find((l) => l.key === key)!;
  const chosen = chooseColourings(plain, box);
  const lines = chosen.map((p) => `    { ${json(p).slice(1, -1)} }`);
  rows.push(`  ${JSON.stringify(key)}: [\n${lines.join(",\n")}\n  ]`);
  const ms = (performance.now() - started).toFixed(0);
  console.log(`${key}: ${chosen.length} paintings (${ms} ms)`);
}
const path = fileURLToPath(new URL("../src/colourings.json", import.meta.url));
writeFileSync(path, `{\n${rows.join(",\n")}\n}\n`);
console.log(`wrote ${path}`);
