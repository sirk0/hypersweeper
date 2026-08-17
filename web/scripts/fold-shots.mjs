// Review shots for the wrapped-window fold guards (scripts/difficulty/resize.py,
// MAX_TILE_TURN and MAX_FACET_STEP). Not a test — a fold photographs far worse
// than it measures, so this photographs the donuts and bottles whose windows
// the facet-step bar moved, from the angle the game opens them at.
//
// Run with the preview server up:
//
//   npx vite preview --port 4173 --strictPort &
//   node scripts/fold-shots.mjs <outdir>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "/tmp/fold-shots";
const BASE = "http://localhost:4173";
const BOARDS = process.argv[3]
  ? process.argv[3].split(",")
  : [
      "kleinbasketweave3:medium", "kleinbasketweave3:easy",
      "kleinbasketweave:easy", "kleintrihex:easy", "torustrihex:easy",
      "kleintetrakis:medium", "torustetrakis:medium",
      "kleintrunctrihex:medium", "torustrunctrihex:medium",
    ];

const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

for (const board of BOARDS) {
  const [mode, difficulty = "easy"] = board.split(":");
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?mode=${mode}&difficulty=${difficulty}&seed=7`);
  await page.waitForSelector("body[data-ready]");
  await settle(page);
  await page.screenshot({ path: join(OUT, `${mode}-${difficulty}.png`) });
  await ctx.close();
}

await browser.close();
console.log(`wrote ${BOARDS.length} shots to ${OUT}`);
