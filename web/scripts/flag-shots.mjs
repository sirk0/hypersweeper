// Prototype review shots for the 3D flag markers (render/flagModel.ts).
// Not a test: it just plants flags on a solid in each Realistic variant and
// photographs it side-on and from overhead, which is the angle the three shapes
// exist to answer. Run with the preview server up:
//
//   npx vite preview --port 4173 --strictPort &
//   node scripts/flag-shots.mjs <outdir>
//
// Lives in web/ so Node resolves @playwright/test from here.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "/tmp/flag-shots";
const BASE = "http://localhost:4173";
const THEMES = ["realistic", "realistic1", "realistic2", "realistic3"];
const BOARDS = [
  { mode: "sphere", difficulty: "easy", flags: 9 },
  { mode: "cube", difficulty: "easy", flags: 7 },
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

for (const theme of THEMES) {
  for (const board of BOARDS) {
    const ctx = await browser.newContext({
      viewport: { width: 900, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    // A cell style is baked into the mesh when the board is built, so the theme
    // has to be stored before the page boots — picking it afterwards would only
    // land on the *next* board.
    await ctx.addInitScript((t) => {
      localStorage.setItem("ms:settings", JSON.stringify({ version: 3, theme: t }));
    }, theme);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?mode=${board.mode}&difficulty=${board.difficulty}&seed=7`);
    await page.waitForSelector("body[data-ready]");
    await settle(page);

    // Flag cells that are actually facing us, so the first shot shows them.
    const visible = await page.evaluate(() => {
      const ms = window.__ms;
      return ms.cells().filter((c) => ms.cellScreenXY(c) !== null);
    });
    await page.evaluate(
      ([cells, n]) => {
        const ms = window.__ms;
        // Spread them over the visible face rather than taking the first n,
        // which on a sphere are all neighbours in one patch.
        const step = Math.max(1, Math.floor(cells.length / n));
        for (let i = 0; i < n; i++) ms.flag(cells[i * step]);
      },
      [visible, board.flags],
    );
    await settle(page);
    await page.screenshot({ path: join(OUT, `${board.mode}-${theme}-front.png`) });

    // Now look down on them: a quarter turn about the horizontal axis puts the
    // flagged patch at the top of the solid, seen along its own poles.
    await page.evaluate(() => window.__ms.rotate(0, 210));
    await settle(page);
    await page.screenshot({ path: join(OUT, `${board.mode}-${theme}-top.png`) });

    // ...and a three-quarter view, the angle the board is usually played at.
    await page.evaluate(() => window.__ms.rotate(150, -120));
    await settle(page);
    await page.screenshot({ path: join(OUT, `${board.mode}-${theme}-angle.png`) });
    await ctx.close();
    console.log(`${board.mode} / ${theme}`);
  }
}

// Controls: a two-sided surface and a flat board must be untouched by all this.
for (const [mode, difficulty] of [["klein", "easy"], ["hex", "easy"]]) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("ms:settings", JSON.stringify({ version: 3, theme: "realistic2" }));
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?mode=${mode}&difficulty=${difficulty}&seed=7`);
  await page.waitForSelector("body[data-ready]");
  await settle(page);
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
  await page.screenshot({ path: join(OUT, `control-${mode}.png`) });
  await ctx.close();
  console.log(`control ${mode}`);
}

await browser.close();
