// Build every tiling's first board and write what the game needs to list
// them before building any — key, label, name, section, marks and, for a
// painted one, which painting — to src/levelIndex.json, in catalog order
// (the 2-uniform and 2-isohedral sections easiest first, which only the
// built levels tell). The game builds each level only when it is first
// looked into (`LEVELS` in src/levels.ts), so the page starts at once.
// `npm run levels` after changing a level's window, name or tiles, or after
// `npm run colourings`; the unit tests fail while the file is out of step.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { buildFirstBoards, indexOf } from "../src/levels";

const started = performance.now();
const index = indexOf(buildFirstBoards());
const path = fileURLToPath(new URL("../src/levelIndex.json", import.meta.url));
// one level to a line where it fits, as Prettier leaves it
const rows = index.map((entry) => `  ${JSON.stringify(entry)}`);
const options = { ...(await resolveConfig(path)), parser: "json" };
writeFileSync(path, await format(`[\n${rows.join(",\n")}\n]\n`, options));
const ms = (performance.now() - started).toFixed(0);
console.log(`wrote ${index.length} levels to ${path} (${ms} ms)`);
