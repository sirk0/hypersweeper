// Dev-only: render the App Store screenshots from the packaged app.
//
//   npm run store-screenshots -- [out-dir]
//   (default out dir: ../app-store-screenshots; DEVICES=iphone,ipad,mac and
//   SHOTS=01-sphere,… render a subset)
//
// Builds the bundle the native app ships (`VITE_PACKAGED=1`) into a scratch
// directory, serves it with `vite preview`, and shoots each scene at the pixel
// size App Store Connect asks for:
//
//   iphone  6.9" display  1320 x 2868  (440 x 956 pt @3x, portrait)
//   ipad    13" display   2064 x 2752  (1032 x 1376 pt @2x, portrait)
//   mac     16:10         2880 x 1800  (1440 x 900 pt @2x)
//
// Boards are staged the way `make-screenshots.mts` stages the README gallery:
// an explicit, seeded mine layout through the `window.__ms` seam, a central
// patch opened, a few mines flagged. Unlike the gallery this runs on the
// machine's real GPU (set SWIFTSHADER=1 for the CI-identical software path)
// and forces the look-only effects on — these are marketing pictures, not
// regression baselines, so the best-looking frame wins over a deterministic one.
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
const PORT = 4181;
const BASE = `http://localhost:${PORT}/`;

interface Device {
  key: string;
  viewport: { width: number; height: number };
  scale: number;
  touch: boolean;
  /** What `BridgeViewController.swift` tells the page it is running on. */
  native: "phone" | "pad" | "mac";
}

const DEVICES: Device[] = [
  { key: "iphone", viewport: { width: 440, height: 956 }, scale: 3, touch: true, native: "phone" },
  { key: "ipad", viewport: { width: 1032, height: 1376 }, scale: 2, touch: true, native: "pad" },
  { key: "mac", viewport: { width: 1440, height: 900 }, scale: 2, touch: false, native: "mac" },
];

interface Scene {
  name: string;
  theme: string;
  shape?: string;
  scheme: "light" | "dark";
  backgrounds?: boolean;
  mode?: string;
  difficulty?: string;
  seed?: number;
  reveal?: number;
  flags?: number;
  explode?: boolean;
  rotate?: [number, number];
  clicks?: string[];
}

// Ten scenes, the most App Store Connect takes. The first three are the ones a
// search result shows, so they are the three most unlike any other minesweeper.
const SCENES: Scene[] = [
  {
    name: "01-sphere",
    theme: "bright",
    shape: "realistic",
    scheme: "light",
    backgrounds: true,
    mode: "c180",
    seed: 7,
    reveal: 0.34,
    flags: 5,
  },
  {
    name: "02-mobius",
    theme: "bright",
    shape: "realistic",
    scheme: "dark",
    backgrounds: true,
    mode: "mobiushex",
    difficulty: "easy",
    seed: 3,
    reveal: 0.34,
    flags: 4,
    rotate: [70, 40],
  },
  {
    name: "03-trefoil",
    theme: "bright",
    shape: "realistic",
    scheme: "light",
    backgrounds: true,
    mode: "trefoilhex",
    seed: 6,
    reveal: 0.4,
    flags: 5,
  },
  {
    name: "04-hyperbolic",
    theme: "sand",
    shape: "soft",
    scheme: "light",
    mode: "hyperbolic73",
    seed: 4,
    reveal: 0.4,
    flags: 5,
  },
  {
    name: "05-penrose",
    theme: "bright",
    shape: "realistic",
    scheme: "light",
    backgrounds: true,
    mode: "penrose",
    seed: 11,
    reveal: 0.36,
    flags: 5,
  },
  {
    name: "06-volumetric",
    theme: "bright",
    shape: "realistic",
    scheme: "dark",
    backgrounds: true,
    mode: "cube3d",
    difficulty: "easy",
    seed: 6,
    reveal: 0.3,
    flags: 5,
  },
  {
    name: "07-torus-lost",
    theme: "bright",
    shape: "realistic",
    scheme: "dark",
    backgrounds: true,
    mode: "torussnubsquare",
    seed: 5,
    reveal: 0.34,
    flags: 4,
    explode: true,
  },
  {
    name: "08-classic-hex",
    theme: "classic",
    shape: "classic",
    scheme: "light",
    mode: "hexhex",
    seed: 9,
    reveal: 0.36,
    flags: 4,
  },
  { name: "09-menu", theme: "bright", shape: "realistic", scheme: "dark" },
  {
    name: "10-surfaces",
    theme: "bright",
    shape: "realistic",
    scheme: "light",
    clicks: ['.menu-entry[data-group="custom"]', '.menu-entry[data-group="manifolds"]'],
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

async function shoot(browser: Browser, device: Device, scene: Scene, outDir: string): Promise<void> {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch,
    reducedMotion: "reduce",
  });
  const settings = JSON.stringify({
    version: 5,
    theme: scene.theme,
    ...(scene.shape ? { shape: scene.shape } : {}),
    scheme: scene.scheme,
    animations: false,
    sound: "off",
    backgrounds: scene.backgrounds ?? false,
  });
  await context.addInitScript(
    ([key, value, native]) => {
      window.localStorage.setItem(key!, value!);
      (window as { hypersweeperDevice?: string }).hypersweeperDevice = native;
    },
    ["ms:settings", settings, device.native],
  );
  const page = await context.newPage();

  const difficulty = scene.difficulty ?? "medium";
  const query = scene.mode ? `?mode=${scene.mode}&difficulty=${difficulty}&seed=0` : "";
  await page.goto(BASE + query);
  await page.waitForSelector("body[data-ready]");
  await page.evaluate(() => window.__ms!.effects(true));
  await settle(page);

  if (scene.mode) await stageBoard(page, scene, difficulty);
  // The phone menu nests the board groups under "Custom"; the two-pane tablet
  // and desktop menu lists them in its sidebar. A step that is not on screen in
  // this layout is skipped.
  for (const selector of scene.clicks ?? []) {
    const target = page.locator(`${selector} >> visible=true`).first();
    if ((await target.count()) > 0) await target.click();
  }
  await settle(page);
  // A throwaway frame pays for shader compilation, so the real one is settled.
  await page.screenshot();
  await page.waitForTimeout(300);

  const file = path.join(outDir, `${scene.name}.png`);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
  await context.close();
}

async function stageBoard(page: Page, scene: Scene, difficulty: string): Promise<void> {
  const cells = await page.evaluate(() => window.__ms!.cells());
  const mineCount = await page.evaluate(() => window.__ms!.state().minesRemaining);
  const mines = pickMines(cells, mineCount, scene.seed ?? 1);

  await page.evaluate(
    ([mode, diff, layout]) =>
      window.__ms!.startBoard(mode as string, diff as string, { mines: layout as CellId[] }),
    [scene.mode!, difficulty, mines] as const,
  );
  if (scene.rotate) {
    await page.evaluate(([dx, dy]) => window.__ms!.rotate(dx!, dy!), scene.rotate);
  }
  await settle(page);

  const placed = await page.evaluate((ids) => {
    const hook = window.__ms!;
    return ids.map((c) => [c, hook.cellScreenXY(c)] as const);
  }, cells);
  const cx = page.viewportSize()!.width / 2;
  const cy = page.viewportSize()!.height / 2;
  const order = placed
    .filter((entry): entry is readonly [CellId, { x: number; y: number }] => !!entry[1])
    .sort((a, b) => Math.hypot(a[1].x - cx, a[1].y - cy) - Math.hypot(b[1].x - cx, b[1].y - cy))
    .map(([cell]) => cell);

  const mineSet = new Set(mines);
  const safe = order.filter((c) => !mineSet.has(c));
  const target = Math.floor((cells.length - mines.length) * (scene.reveal ?? 0.34));
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

  const central = order.filter((c) => mineSet.has(c));
  const detonator = scene.explode ? central.shift() : undefined;
  await page.evaluate(
    ([toFlag, boom]) => {
      const hook = window.__ms!;
      for (const cell of toFlag as CellId[]) hook.flag(cell);
      if (boom != null) hook.reveal(boom as CellId);
    },
    [central.slice(0, scene.flags ?? 4), detonator ?? null] as const,
  );
}

async function main(): Promise<void> {
  const outRoot = path.resolve(process.cwd(), process.argv[2] ?? path.join(WEB, "../app-store-screenshots"));
  const distDir = process.env.STORE_DIST ?? path.join(WEB, "node_modules/.store-shots-dist");

  if (!process.env.SKIP_BUILD) {
    const build = spawnSync("npx", ["vite", "build", "--outDir", distDir, "--emptyOutDir"], {
      cwd: WEB,
      stdio: "inherit",
      env: { ...process.env, VITE_PACKAGED: "1" },
    });
    if (build.status !== 0) throw new Error("vite build failed");
  }

  const preview = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort", "--outDir", distDir],
    { cwd: WEB, stdio: "ignore", env: { ...process.env, VITE_PACKAGED: "1" } },
  );
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: process.env.SWIFTSHADER
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        : ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
    });
    const onlyDevices = process.env.DEVICES?.split(",").map((s) => s.trim());
    const onlyShots = process.env.SHOTS?.split(",").map((s) => s.trim());
    for (const device of DEVICES) {
      if (onlyDevices && !onlyDevices.includes(device.key)) continue;
      const outDir = path.join(outRoot, device.key);
      mkdirSync(outDir, { recursive: true });
      for (const scene of SCENES) {
        if (onlyShots && !onlyShots.includes(scene.name)) continue;
        await shoot(browser, device, scene, outDir);
      }
    }
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
