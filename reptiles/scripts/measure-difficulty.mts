// Measure every level's difficulty (src/difficulty.ts) and write it to
// src/difficulty.json, which the game reads — measuring takes a second or so,
// too long for every page load. `npm run difficulty` after changing a level or
// the measure; the unit tests fail while the file is out of step.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { measure } from "../src/difficulty";
import { LEVELS } from "../src/levels";

const out: Record<string, { score: number; presses: number; flips: number }> = {};
for (const level of LEVELS) {
  const m = measure(level);
  out[level.key] = { score: Number(m.score.toFixed(3)), presses: m.presses, flips: m.flips };
}
const path = fileURLToPath(new URL("../src/difficulty.json", import.meta.url));
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} levels to ${path}`);
