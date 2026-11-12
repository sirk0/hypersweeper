// Lay every marked level — each matching rule and colouring, listed on its
// tiling's first board — on every other board of its tiling (`markedOn`),
// and write the boards it is kept on to src/markedBoards.json: those where
// its marks make the very same tray as on the first board (`sameTray` — a
// window can show a colouring's tiles in more or fewer ways). A level is a board
// by a marking, so a tiling of six boards and five markings is thirty-six
// levels. `npm run marked-boards` after `npm run boards`, `npm run
// colourings` or `npm run levels`, then `npm run difficulty`; the unit
// tests fail while the file is out of step. A minute.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";
import { LEVELS, levelByKey, markedOn, sameTray } from "../src/levels";

const started = performance.now();
const boards: Record<string, number[]> = {};
let kept = 0;
let dropped = 0;
for (const marked of LEVELS.filter((l) => l.decor)) {
  const first = levelByKey(marked.key)!;
  const on: number[] = [];
  for (let n = 2; n <= marked.boards; n++) {
    const why = keep(first, n);
    if (why === null) on.push(n);
    else console.log(`${marked.key}-${n}: ${why}`);
  }
  kept += on.length;
  dropped += marked.boards - 1 - on.length;
  if (on.length) boards[marked.key] = on;
}

/** Null where `first` is kept on board `n`, else why not. */
function keep(first: ReturnType<typeof levelByKey> & object, n: number): string | null {
  let level;
  try {
    level = markedOn(first.key, n);
  } catch (e) {
    return (e as Error).message;
  }
  return sameTray(first, level) ? null : "another tray";
}

const path = fileURLToPath(new URL("../src/markedBoards.json", import.meta.url));
const text = JSON.stringify({
  _comment:
    "Written by npm run marked-boards (scripts/find-marked-boards.mts): the boards past the first each marked level is laid on too, by its tiling's board numbers.",
  boards,
});
writeFileSync(path, await format(text, { ...(await resolveConfig(path)), filepath: path }));
const s = ((performance.now() - started) / 1000).toFixed(0);
console.log(`kept ${kept} marked boards past the first, dropped ${dropped} (${s} s): ${path}`);
