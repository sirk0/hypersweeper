// Dev-only: render the README screenshots from the real app.
//
//   npm run screenshots -- [out-dir]
//   (default out dir: ../docs/screenshots; SHOTS=a.png,b.png renders a subset)
//
// Builds `dist/`, serves it with `vite preview`, then drives each shot through
// the `window.__ms` seam: start the board with an explicit mine layout (so the
// script knows where the mines are and nothing has to be guessed), open a
// central patch, flag a few mines, optionally detonate one, and screenshot.
// Each shot picks a theme and a colour scheme, written into the settings record
// before the app boots. A theme is the page behind the board and how the board's
// cells are cut, and a scheme is the palette that paints the chrome
// (ui/theme.ts), so the combinations are spread over these shots to show both
// axes — the shape colours themselves are not themed and stay the same in every
// one.
//
// Software WebGL (the same SwiftShader flags the e2e suite uses) keeps the
// output identical on a machine with no GPU, e.g. CI or a cloud session.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "@playwright/test";

import type { CellId } from "../src/boards/core";
import type { MsHook } from "../src/testHook";

declare global {
  interface Window {
    __ms?: MsHook;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const PORT = 4180;
const BASE = `http://localhost:${PORT}/`;

interface Shot {
  /** File name written into the output directory. */
  file: string;
  /** A key in `THEME_KEYS` (web/src/ui/theme.ts). */
  theme: string;
  /** `"light"` or `"dark"`. Never `"auto"`: a screenshot must not depend on the
   * machine it is rendered on. */
  scheme: "light" | "dark";
  /** Board shots: the mode to open. Omitted for a chrome shot. */
  mode?: string;
  difficulty?: string;
  /** Mine-layout seed — the shot is reproducible, not random. */
  seed?: number;
  /** Fraction of the board to open. */
  reveal?: number;
  /** How many of the mines to flag. */
  flags?: number;
  /** Detonate a mine at the end (the losing-board shot). */
  explode?: boolean;
  /** Turn a 3D board off its starting tilt, as a drag of (dx, dy) pixels. */
  rotate?: [number, number];
  /** Chrome shots: clicks to walk the menu before shooting. */
  clicks?: string[];
  viewport?: { width: number; height: number };
}

const BOARD_VIEW = { width: 520, height: 600 };

// Spread over the renderer's range — a sphere, a non-orientable surface, an
// aperiodic tiling, a torus mid-explosion, a fractal patch, a flat regular
// board, and the two chrome screens — with the three themes and both schemes
// distributed over them.
const SHOTS: Shot[] = [
  { file: "c180.png", theme: "flat", scheme: "light", mode: "c180", seed: 7, reveal: 0.34, flags: 5 },
  {
    file: "mobiushex.png",
    theme: "flat",
    scheme: "dark",
    mode: "mobiushex",
    seed: 3,
    reveal: 0.34,
    flags: 4,
    // Off the starting tilt: face on, the strip reads as a disc rather than a
    // band that comes back joined to its own other side.
    rotate: [70, 40],
  },
  {
    file: "penrose.png",
    theme: "realistic",
    scheme: "light",
    mode: "penrose",
    seed: 11,
    reveal: 0.36,
    flags: 5,
  },
  {
    file: "torussnubsquare-lost.png",
    theme: "classic",
    scheme: "light",
    mode: "torussnubsquare",
    seed: 5,
    reveal: 0.34,
    flags: 4,
    explode: true,
  },
  {
    file: "gosper.png",
    theme: "realistic",
    scheme: "dark",
    mode: "gosper",
    seed: 2,
    reveal: 0.38,
    flags: 4,
  },
  {
    file: "hexhex.png",
    theme: "classic",
    scheme: "dark",
    mode: "hexhex",
    seed: 9,
    reveal: 0.36,
    flags: 4,
  },
  { file: "menu.png", theme: "realistic", scheme: "dark" },
  {
    file: "themes.png",
    theme: "realistic",
    scheme: "light",
    clicks: [
      '.menu-header-btn[data-action="settings"]',
      '.menu-entry[data-settings-group="theme"]',
    ],
  },
];

/** The seeded RNG the game uses, so a shot's mine layout is reproducible. */
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

/** Two animation frames: the board's world transform is applied when it
 * renders, so `cellScreenXY` answers with stale matrices until it has. */
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

async function shoot(browser: Browser, shot: Shot, outDir: string): Promise<void> {
  const viewport = shot.viewport ?? BOARD_VIEW;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  // The theme is a stored preference, so it has to be there before the app
  // reads it at boot. Sound is off: a screenshot run must not build an audio
  // graph, and the preset is irrelevant to the picture.
  const settings = JSON.stringify({
    version: 4,
    theme: shot.theme,
    scheme: shot.scheme,
    animations: false,
    sound: "off",
  });
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ["ms:settings", settings],
  );
  const page = await context.newPage();

  const difficulty = shot.difficulty ?? "medium";
  const query = shot.mode ? `?mode=${shot.mode}&difficulty=${difficulty}` : "";
  await page.goto(BASE + query);
  await page.waitForSelector("body[data-ready]");
  await settle(page);

  if (shot.mode) {
    await stageBoard(page, shot, difficulty);
  }
  for (const selector of shot.clicks ?? []) {
    await page.locator(selector).click();
  }
  await settle(page);

  const file = path.join(outDir, shot.file);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
  await context.close();
}

/** Open a central patch, flag a few mines, optionally detonate one. */
async function stageBoard(page: Page, shot: Shot, difficulty: string): Promise<void> {
  const cells = await page.evaluate(() => window.__ms!.cells());
  const mineCount = await page.evaluate(() => window.__ms!.state().minesRemaining);
  const mines = pickMines(cells, mineCount, shot.seed ?? 1);

  await page.evaluate(
    ([mode, diff, layout]) =>
      window.__ms!.startBoard(mode as string, diff as string, {
        mines: layout as CellId[],
      }),
    [shot.mode!, difficulty, mines] as const,
  );
  if (shot.rotate) {
    await page.evaluate(([dx, dy]) => window.__ms!.rotate(dx!, dy!), shot.rotate);
  }
  await settle(page);

  // Nearest the middle of the view first; a cell facing away on a 3D board has
  // no screen position and is skipped, so the patch opens where it is seen.
  const placed = await page.evaluate((ids) => {
    const hook = window.__ms!;
    return ids.map((c) => [c, hook.cellScreenXY(c)] as const);
  }, cells);
  const cx = page.viewportSize()!.width / 2;
  const cy = page.viewportSize()!.height / 2;
  const order = placed
    .filter((entry): entry is readonly [CellId, { x: number; y: number }] => !!entry[1])
    .sort(
      (a, b) => Math.hypot(a[1].x - cx, a[1].y - cy) - Math.hypot(b[1].x - cx, b[1].y - cy),
    )
    .map(([cell]) => cell);

  const mineSet = new Set(mines);
  const safe = order.filter((c) => !mineSet.has(c));
  const target = Math.floor((cells.length - mines.length) * (shot.reveal ?? 0.34));
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

  // Flag mines sitting in the opened region, and — for the losing shot — set
  // off the most central one that is left. The app reveals the rest on a loss.
  const central = order.filter((c) => mineSet.has(c));
  const detonator = shot.explode ? central.shift() : undefined;
  await page.evaluate(
    ([toFlag, boom]) => {
      const hook = window.__ms!;
      for (const cell of toFlag as CellId[]) hook.flag(cell);
      if (boom != null) hook.reveal(boom as CellId);
    },
    [central.slice(0, shot.flags ?? 4), detonator ?? null] as const,
  );
}

async function main(): Promise<void> {
  const outDir = path.resolve(
    process.cwd(),
    process.argv[2] ?? path.join(WEB, "../docs/screenshots"),
  );
  mkdirSync(outDir, { recursive: true });

  // `vite preview` serves dist/ from disk, so the shots are only of the
  // current source if the build is current — a stale dist is the classic way
  // to screenshot a change that is not there.
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
    const only = process.env.SHOTS?.split(",").map((s) => s.trim());
    for (const shot of SHOTS) {
      if (only && !only.includes(shot.file) && !only.includes(shot.mode ?? "")) continue;
      await shoot(browser, shot, outDir);
    }
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
