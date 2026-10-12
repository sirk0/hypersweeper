// Review shots for the tile textures (render/tileTexture.ts): one board per
// texture, staged half-open so closed tiles, opened floors, digits and flags
// are all in frame. Not a test.
//
//   npx vite preview --port 4173 --strictPort &
//   node scripts/texture-shots.mjs <outdir> [texture,...] [mode,...] [theme] [shape]
//
// Lives in web/ so Node resolves @playwright/test from here.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "/tmp/texture-shots";
const TEXTURES = (process.argv[3] ?? "none").split(",");
const MODES = (process.argv[4] ?? "square,hexhex,sphere").split(",");
const THEME = process.argv[5] ?? "sand";
const SHAPE = process.argv[6] ?? "soft";
const SCHEME = process.argv[7] ?? "light";
const BASE = "http://localhost:4173";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

for (const texture of TEXTURES) {
  for (const mode of MODES) {
    const ctx = await browser.newContext({
      viewport: { width: 760, height: 760 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(
      ([t, theme, shape, scheme]) => {
        localStorage.setItem(
          "ms:settings",
          JSON.stringify({ version: 5, theme, shape, scheme, texture: t, sound: "off", seenHint: true }),
        );
      },
      [texture, THEME, SHAPE, SCHEME],
    );
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?mode=${mode}&difficulty=easy&seed=3`);
    await page.waitForSelector("body[data-ready]");
    // Open a corner flood and flag a couple of mines next to it.
    await page.evaluate(() => {
      const ms = window.__ms;
      const cells = ms.cells();
      const visible = cells.filter((c) => ms.cellScreenXY(c) !== null);
      const pool = visible.length ? visible : cells;
      ms.reveal(pool[Math.floor(pool.length * 0.3)]);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // Flag a few still-hidden visible cells so pins/flags are in shot too.
    await page.evaluate(() => {
      const ms = window.__ms;
      const hidden = ms.cells().filter((c) => ms.cellState(c) === "hidden" && ms.cellScreenXY(c) !== null);
      for (const c of hidden.filter((_, i) => i % 7 === 3).slice(0, 4)) ms.flag(c);
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: join(OUT, `${mode}-${texture}.png`) });
    await ctx.close();
  }
}
await browser.close();
