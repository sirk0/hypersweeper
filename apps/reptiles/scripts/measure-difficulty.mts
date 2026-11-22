// Measure every level's difficulty (src/difficulty.ts) and write it to
// src/difficulty.json, which the game reads — measuring a board's traps takes
// up to seconds (the hat's), far too long for a page load. `npm run
// difficulty` after changing a level or the measure; the unit tests fail
// while the file is out of step. The boards are shared out between one
// process per core (SHARD=i/n runs one share and prints it): half an hour
// on four. `ONLY=missing` measures only the boards src/difficulty.json does
// not list yet — new levels — and keeps the rest as they are.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { measure, type Stored } from "../src/difficulty";
import { BOARDS, levelByKey } from "../src/levels";

const shard = process.env.SHARD;
const path = fileURLToPath(new URL("../src/difficulty.json", import.meta.url));
const kept: Record<string, Stored> =
  process.env.ONLY === "missing" && existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, Stored>)
    : {};
const todo = BOARDS.filter(({ key }) => !(key in kept));
if (shard) {
  // one share: every n-th board from the i-th, one JSON line each
  const [i, n] = shard.split("/").map(Number) as [number, number];
  for (const [at, { key }] of todo.entries()) {
    if (at % n !== i) continue;
    const m = measure(levelByKey(key)!);
    const stored: Stored = {
      score: Number(m.score.toFixed(3)),
      presses: m.presses,
      flips: m.flips,
      fits: m.fits,
      seen: m.seen,
      hidden: m.hidden,
    };
    process.stdout.write(`${JSON.stringify([key, stored])}\n`);
  }
} else {
  const started = performance.now();
  const n = availableParallelism();
  const script = fileURLToPath(import.meta.url);
  const got = new Map<string, Stored>();
  await Promise.all(
    Array.from(
      { length: n },
      (_, i) =>
        new Promise<void>((done, fail) => {
          const child = spawn("npx", ["vite-node", script], {
            env: { ...process.env, SHARD: `${i}/${n}` },
            stdio: ["ignore", "pipe", "inherit"],
          });
          let buffer = "";
          child.stdout.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            for (const line of lines) {
              if (!line.startsWith("[")) continue;
              const [key, stored] = JSON.parse(line) as [string, Stored];
              got.set(key, stored);
              if (got.size % 100 === 0) console.log(`${got.size} of ${todo.length}`);
            }
          });
          child.on("exit", (code) =>
            code === 0 ? done() : fail(new Error(`shard ${i}: ${code}`)),
          );
        }),
    ),
  );
  // every board of every tiling, in order: each a level of its own, with its own band
  const out: Record<string, Stored> = {};
  for (const { key } of BOARDS) {
    const stored = got.get(key) ?? kept[key];
    if (!stored) throw new Error(`${key} was not measured`);
    out[key] = stored;
  }
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  const s = ((performance.now() - started) / 1000).toFixed(0);
  console.log(`wrote ${Object.keys(out).length} boards to ${path} (${s} s)`);
}
