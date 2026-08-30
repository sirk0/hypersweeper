// Dev-only: render the link-preview image from the real app.
//
//   npm run og -- [out-file]
//   (default: web/public/og.png)
//
// This is the picture a Reddit, Discord, Mastodon or Slack post shows when
// someone shares the game, so it is the first thing most people will ever see
// of it. It is rendered from the app itself rather than drawn by hand — the
// same reason `make-screenshots.mts` exists — so it cannot drift away from what
// the game actually looks like.
//
// 1200x630 is the Open Graph card size every one of those sites crops to.
//
// The board is a truncated icosahedron mid-game: a *solid*, because "minesweeper
// but on shapes" is the whole pitch and a flat grid does not say it, and mid-game
// because an unopened board is a field of identical tiles with nothing to read.
// The mine layout comes from an explicit seed, so re-running this writes the
// same picture rather than a new one every time.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "@playwright/test";

import type { CellId } from "../src/boards/core";
import type { MsHook } from "../src/testHook";

declare global {
  interface Window {
    __ms?: MsHook;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const PORT = 4181;
const BASE = `http://localhost:${PORT}/`;

const CARD = { width: 1200, height: 630 };
const MODE = "c180";
const DIFFICULTY = "medium";
const SEED = 7;
const REVEAL = 0.3;
const FLAGS = 4;

/** The seeded RNG the game uses, so the layout is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickMines(cells: CellId[], count: number, seed: number): CellId[] {
  const rng = mulberry32(seed);
  const pool = [...cells];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server never answered at ${url}`);
}

/** The wordmark and the tagline, over the board. Injected into the page rather
 * than composited afterwards so there is no image library in the toolchain —
 * the browser is already here, and it has better type-setting than one. */
async function addWordmark(page: Page): Promise<void> {
  await page.evaluate(() => {
    const card = document.createElement("div");
    card.style.cssText = [
      "position:fixed",
      "inset:auto auto 50% 0",
      "transform:translateY(50%)",
      "width:48%",
      "padding:0 0 0 64px",
      "box-sizing:border-box",
      "pointer-events:none",
      "font-family:inherit",
    ].join(";");
    const title = document.createElement("div");
    title.textContent = "Hypersweeper";
    title.style.cssText =
      "font-size:76px;font-weight:800;letter-spacing:-0.02em;color:var(--text);line-height:1";
    const sub = document.createElement("div");
    sub.textContent = "Minesweeper on tilings, spheres and Klein bottles";
    sub.style.cssText =
      "margin-top:14px;font-size:30px;font-weight:600;color:var(--text-dim, #7b7b85)";
    card.append(title, sub);
    document.body.append(card);
  });
}

async function main(): Promise<void> {
  const outFile = path.resolve(
    process.cwd(),
    process.argv[2] ?? path.join(WEB, "public/og.png"),
  );
  mkdirSync(path.dirname(outFile), { recursive: true });

  // `vite preview` serves dist/ from disk, so a stale build is a stale picture.
  const build = spawnSync("npx", ["vite", "build"], { cwd: WEB, stdio: "inherit" });
  if (build.status !== 0) throw new Error("vite build failed");

  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { cwd: WEB, stdio: "ignore" },
  );
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    });
    const context = await browser.newContext({
      viewport: CARD,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    // The app's default look, on the light scheme, with no sound: a screenshot
    // must not build an audio graph. Realistic is not just the default — the
    // card is a sphere, and Realistic is the style that stands a pin on a
    // flagged cell instead of lying a picture of one in the face
    // (`CellStyle.solidMarkers`), which is the whole reason to photograph a
    // board you can turn. `backgrounds` patterns the page behind it with the
    // board's own tiling, as the README gallery's shots do.
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key!, value!),
      [
        "ms:settings",
        JSON.stringify({
          version: 4,
          theme: "realistic",
          scheme: "light",
          animations: false,
          sound: "off",
          backgrounds: true,
        }),
      ],
    );
    const page = await context.newPage();
    await page.goto(`${BASE}?mode=${MODE}&difficulty=${DIFFICULTY}`);
    await page.waitForSelector("body[data-ready]");
    await settle(page);

    const cells = await page.evaluate(() => window.__ms!.cells());
    const mineCount = await page.evaluate(() => window.__ms!.state().minesRemaining);
    const mines = pickMines(cells, mineCount, SEED);
    await page.evaluate(
      ([mode, diff, layout]) =>
        window.__ms!.startBoard(mode as string, diff as string, {
          mines: layout as CellId[],
        }),
      [MODE, DIFFICULTY, mines] as const,
    );
    // Off the starting tilt, so the solid reads as a ball rather than a disc.
    await page.evaluate(() => window.__ms!.rotate(40, 24));
    await settle(page);

    // Open the patch facing the camera: a cell turned away has no screen
    // position, so this also keeps the reveal on the visible hemisphere.
    const placed = await page.evaluate(
      (ids) => ids.map((c) => [c, window.__ms!.cellScreenXY(c)] as const),
      cells,
    );
    const cx = CARD.width / 2;
    const cy = CARD.height / 2;
    const order = placed
      .filter((e): e is readonly [CellId, { x: number; y: number }] => !!e[1])
      .sort((a, b) => Math.hypot(a[1].x - cx, a[1].y - cy) - Math.hypot(b[1].x - cx, b[1].y - cy))
      .map(([cell]) => cell);
    const mineSet = new Set(mines);
    const safe = order.filter((c) => !mineSet.has(c));
    const target = Math.floor((cells.length - mines.length) * REVEAL);
    await page.evaluate(
      ([toOpen, want]) => {
        const hook = window.__ms!;
        for (const cell of toOpen as CellId[]) {
          if (hook.state().revealed >= (want as number)) break;
          if (hook.cellState(cell) === "hidden") hook.reveal(cell);
        }
      },
      [safe, target] as const,
    );
    await page.evaluate(
      (toFlag) => {
        for (const cell of toFlag as CellId[]) window.__ms!.flag(cell);
      },
      order.filter((c) => mineSet.has(c)).slice(0, FLAGS),
    );
    await settle(page);

    // The header is chrome, not the game — it would read as clutter at card size.
    // The board is centred in the viewport, which is where the wordmark has to
    // go; shifting the rendered canvas rather than the camera keeps the board's
    // own framing (and its picking, which nothing here uses) untouched.
    await page.evaluate(() => {
      const hud = document.querySelector(".hud") as HTMLElement | null;
      if (hud) hud.style.display = "none";
      const canvas = document.getElementById("board") as HTMLElement | null;
      // Scale first, then translate (CSS applies these right to left): the
      // board shrinks about the viewport centre and then slides clear of the
      // text column on the left.
      if (canvas) canvas.style.transform = "translate(276px, -20px) scale(0.86)";
    });
    await addWordmark(page);
    await settle(page);

    await page.screenshot({ path: outFile });
    console.log(`wrote ${outFile}`);
    await context.close();
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
