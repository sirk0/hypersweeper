// Review shots for the Realistic marker glow (render/markerGlow.ts) — the light
// the pins carry as a move's cells open, and the blast when a mine goes off.
// Not a test: it plants pins on a board, opens a wide flood beside them and
// photographs the wave crossing them, then loses a game and photographs the
// detonation, its shockwave and the embers it leaves.
//
// Run with the preview server up:
//
//   npx vite preview --port 4173 --strictPort &
//   node scripts/glow-shots.mjs <outdir>
//
// Lives in web/ so Node resolves @playwright/test from here.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "/tmp/glow-shots";
const BASE = "http://localhost:4173";

mkdirSync(OUT, { recursive: true });

// Reduced motion is *not* set here, unlike marker-shots.mjs: the wave is the
// thing being looked at, and the e2e suite's settled frame is exactly what
// would hide it.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

async function open(mode) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 1,
  });
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "ms:settings",
      JSON.stringify({ version: 3, theme: "realistic", sound: "off", seenHint: true }),
    );
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?mode=${mode}&difficulty=easy&seed=7`);
  await page.waitForSelector("body[data-ready]");
  await page.evaluate(() => window.__ms.animations(true));
  await settle(page);
  return { ctx, page };
}

for (const mode of ["sphere", "cube", "mobius"]) {
  const { ctx, page } = await open(mode);

  // Mines spread across the face we are looking at, all flagged, and the flood
  // opened from one edge of it — so the wave has ground to cross and the pins
  // it crosses are the ones in shot. `cellScreenXY` answers null for a cell on
  // the far side, which is what picks the visible face.
  const plan = await page.evaluate((m) => {
    const ms = window.__ms;
    ms.startBoard(m, "easy");
    const cells = ms.cells();
    // `cellScreenXY` answers null for a cell on the far side, which is what
    // splits the board into the face in shot and the face behind it.
    const visible = cells.filter((c) => ms.cellScreenXY(c) !== null);
    const hidden = cells.filter((c) => ms.cellScreenXY(c) === null);
    // Both mines out of sight, so the near face is one wide flood rather than
    // the single numbered cell an ordinary easy board opens. A flood is the
    // event this effect exists to show.
    // (A two-sided surface can have its whole board in shot, so fall back to
    // the far end of the cell list.)
    const mines = (hidden.length >= 2 ? hidden : cells).slice(0, 2);
    ms.startBoard(m, "easy", { mines });
    // Pins spread over the face in shot. They need not be on mines — during
    // play a flag is a pin wherever it stands — and putting them here is what
    // makes the wave crossing them visible at all.
    const step = Math.max(1, Math.floor(visible.length / 8));
    for (let i = 0; i < 7; i++) {
      const c = visible[i * step];
      if (c) ms.flag(c);
    }
    // Open from one edge of the visible face, so the front sweeps across the
    // pins rather than starting among them.
    return { opener: visible[visible.length - 1] };
  }, mode);
  await settle(page);
  // Pay SwiftShader's one-off shader compile on a throwaway shot before the
  // move, or the first real frame costs a second and the wave is long gone.
  await page.screenshot({ path: join(OUT, `${mode}-warmup.png`) });
  await page.screenshot({ path: join(OUT, `${mode}-rest.png`) });

  await page.evaluate((cell) => window.__ms.reveal(cell), plan.opener);
  await page.screenshot({ path: join(OUT, `${mode}-wave-1.png`) });
  await page.screenshot({ path: join(OUT, `${mode}-wave-2.png`) });
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUT, `${mode}-wave-3.png`) });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, `${mode}-wave-4.png`) });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${mode}-settled.png`) });
  void plan;
  await ctx.close();
}

// The loss, on its own page so the board is fresh: mines known, none of them
// flagged, and the one that goes off is the first.
for (const mode of ["sphere", "mobius"]) {
  const { ctx, page } = await open(mode);
  const victim = await page.evaluate((m) => {
    const ms = window.__ms;
    ms.startBoard(m, "easy");
    // Mines on the face in shot, so the bombs the loss uncovers are the ones
    // photographed. All but one flagged, and the one left is stepped on.
    const visible = ms.cells().filter((c) => ms.cellScreenXY(c) !== null);
    const step = Math.max(1, Math.floor(visible.length / 7));
    const mines = Array.from({ length: 6 }, (_, i) => visible[i * step]).filter(
      (c) => c !== undefined,
    );
    ms.startBoard(m, "easy", { mines });
    for (const c of mines.slice(1)) ms.flag(c);
    return mines[0];
  }, mode);
  await settle(page);
  await page.screenshot({ path: join(OUT, `${mode}-loss-warmup.png`) });

  await page.evaluate((cell) => window.__ms.reveal(cell), victim);
  await page.screenshot({ path: join(OUT, `${mode}-blast-1.png`) });
  await page.screenshot({ path: join(OUT, `${mode}-blast-2.png`) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `${mode}-blast-3.png`) });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `${mode}-embers.png`) });
  await ctx.close();
}

await browser.close();
console.log(`shots in ${OUT}`);
