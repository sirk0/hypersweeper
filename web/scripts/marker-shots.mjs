// Review shots for the 3D markers (render/markers3d.ts) — the pin that stands
// on a flagged cell and the bomb that sits on a mined one, under the Realistic
// theme. Not a test: it plants flags on every kind of rotatable board and
// photographs them from the angles the models exist to survive, then loses a
// game so the bombs come out.
//
// Run with the preview server up:
//
//   npx vite preview --port 4173 --strictPort &
//   node scripts/marker-shots.mjs <outdir>
//
// Lives in web/ so Node resolves @playwright/test from here.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "/tmp/marker-shots";
const BASE = "http://localhost:4173";
// Closed solids first, then the flat manifolds — the torus is closed and was
// already getting markers, the other three are the two-sided ones this round
// switched on, and they are the interesting case (one marker per face).
const BOARDS = ["sphere", "cube", "torus", "cylinder", "mobius", "klein"];

const settle = (page) =>
  page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

/** A page with `theme` already stored, on `mode`. A cell style is baked into the
 * mesh when the board is built, so the theme has to be there before the page
 * boots — picking it afterwards would only land on the *next* board. */
async function open(mode, theme = "realistic") {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem("ms:settings", JSON.stringify({ version: 3, theme: t }));
  }, theme);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?mode=${mode}&difficulty=easy&seed=7`);
  await page.waitForSelector("body[data-ready]");
  await settle(page);
  return { ctx, page };
}

for (const mode of BOARDS) {
  const { ctx, page } = await open(mode);
  // Flag cells that are actually facing us, so the first shot shows them.
  const visible = await page.evaluate(() => {
    const ms = window.__ms;
    return ms.cells().filter((c) => ms.cellScreenXY(c) !== null);
  });
  await page.evaluate((cells) => {
    const ms = window.__ms;
    // Spread them over the visible face rather than taking the first n, which
    // on a sphere are all neighbours in one patch.
    const step = Math.max(1, Math.floor(cells.length / 9));
    for (let i = 0; i < 9; i++) ms.flag(cells[i * step]);
  }, visible);
  await settle(page);
  await page.screenshot({ path: join(OUT, `${mode}-front.png`) });

  // Look down on them — the angle a pennant died at and a pin is for.
  await page.evaluate(() => window.__ms.rotate(0, 210));
  await settle(page);
  await page.screenshot({ path: join(OUT, `${mode}-top.png`) });

  // ...and the three-quarter view a board is usually played at.
  await page.evaluate(() => window.__ms.rotate(150, -120));
  await settle(page);
  await page.screenshot({ path: join(OUT, `${mode}-angle.png`) });
  await ctx.close();
  console.log(mode);
}

// A loss, so the bombs come out: plant a known mine layout, flag one cell that
// is *not* a mine (that is the wrong flag, gray pin + X), then step on one that
// is.
{
  const { ctx, page } = await open("sphere");
  await page.evaluate(() => {
    const ms = window.__ms;
    // Every other cell a mine, so a good share of the visible face carries one
    // whichever way the board happens to be turned.
    const mines = ms.cells().filter((_, i) => i % 2 === 0);
    ms.startBoard("sphere", "easy", { mines });
    window.__mines = mines;
  });
  // A second round-trip before measuring: the board's world transform is
  // applied when it renders, so `cellScreenXY` in the same evaluate as
  // `startBoard` reads stale matrices and answers with cells from all over.
  await settle(page);
  await page.evaluate(() => {
    const ms = window.__ms;
    const mines = new Set(window.__mines);
    // Two things have to be in shot besides the plain bombs: the cell that
    // ended the game (hot casing) and a flag that turned out to be wrong (gray
    // pin under the X). Take the ones nearest the middle of the canvas — a cell
    // out at the silhouette is facing away far enough that its billboard is
    // culled, which would hide the X and read as a bug that is not there.
    const mid = [window.innerWidth / 2, window.innerHeight / 2];
    const central = (pool) =>
      pool
        .map((c) => ({ c, at: ms.cellScreenXY(c) }))
        .filter((e) => e.at !== null)
        .sort(
          (a, b) =>
            Math.hypot(a.at.x - mid[0], a.at.y - mid[1]) -
            Math.hypot(b.at.x - mid[0], b.at.y - mid[1]),
        )[0]?.c;
    const cells = ms.cells();
    ms.flag(central(cells.filter((c) => !mines.has(c))));
    ms.reveal(central(cells.filter((c) => mines.has(c))));
  });
  await settle(page);
  await page.screenshot({ path: join(OUT, "sphere-lost.png") });
  await page.evaluate(() => window.__ms.rotate(0, 210));
  await settle(page);
  await page.screenshot({ path: join(OUT, "sphere-lost-top.png") });
  await ctx.close();
  console.log("sphere loss");
}

// Controls: a flat board keeps the billboards, whatever the theme says.
{
  const { ctx, page } = await open("hex");
  const visible = await page.evaluate(() => {
    const ms = window.__ms;
    return ms.cells().filter((c) => ms.cellScreenXY(c) !== null);
  });
  await page.evaluate((cells) => {
    const ms = window.__ms;
    const step = Math.max(1, Math.floor(cells.length / 8));
    for (let i = 0; i < 8; i++) ms.flag(cells[i * step]);
  }, visible);
  await settle(page);
  await page.screenshot({ path: join(OUT, "control-flat-hex.png") });
  await ctx.close();
  console.log("control hex");
}

await browser.close();
