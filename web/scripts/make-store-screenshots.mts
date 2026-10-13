// Dev-only: render the App Store screenshots from the packaged app.
//
//   npm run store-screenshots -- [out-dir]
//   (default out dir: ../app-store-screenshots; DEVICES=iphone-6.3,mac and
//   SHOTS=01-sphere,… render a subset — DEVICES also takes `header` and
//   `search-results`, the product page art described further down)
//
// Builds the bundle the native app ships (`VITE_PACKAGED=1`) into a scratch
// directory, serves it with `vite preview`, and shoots each scene at the pixel
// size App Store Connect asks for:
//
//   iphone-6.9  6.9" display    1320 x 2868  (440 x 956 pt @3x, portrait)
//   iphone-6.3  6.1"/6.3"       1206 x 2622  (402 x 874 pt @3x, portrait)
//   iphone-duo  iPhone Duo      2007 x 2853  (669 x 951 pt @3x, portrait)
//   ipad        13" display     2064 x 2752  (1032 x 1376 pt @2x, portrait)
//   mac         16:10           2880 x 1800  (1440 x 900 pt @2x)
//
// Every shot is in the look a new player first sees: the Sand theme, the light
// scheme, no patterned page. Only the cell shape varies from scene to scene.
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

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

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

interface View {
  viewport: { width: number; height: number };
  scale: number;
  touch: boolean;
  /** What `BridgeViewController.swift` tells the page it is running on. */
  native: "phone" | "pad" | "mac";
}

interface Device extends View {
  key: string;
}

const DEVICES: Device[] = [
  { key: "iphone-6.9", viewport: { width: 440, height: 956 }, scale: 3, touch: true, native: "phone" },
  { key: "iphone-6.3", viewport: { width: 402, height: 874 }, scale: 3, touch: true, native: "phone" },
  { key: "iphone-duo", viewport: { width: 669, height: 951 }, scale: 3, touch: true, native: "phone" },
  { key: "ipad", viewport: { width: 1032, height: 1376 }, scale: 2, touch: true, native: "pad" },
  { key: "mac", viewport: { width: 1440, height: 900 }, scale: 2, touch: false, native: "mac" },
];

interface Scene {
  name: string;
  /** A key in `SHAPE_KEYS` (web/src/render/cellStyle.ts). Realistic on the
   * solids, since it is the one shape that stands 3D pins and bombs on them. */
  shape: string;
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
    shape: "realistic",
    mode: "c180",
    seed: 7,
    reveal: 0.34,
    flags: 5,
  },
  {
    name: "02-mobius",
    shape: "realistic",
    mode: "mobiushex",
    difficulty: "easy",
    seed: 3,
    reveal: 0.34,
    flags: 4,
    rotate: [70, 40],
  },
  {
    name: "03-trefoil",
    shape: "realistic",
    mode: "trefoilhex",
    seed: 6,
    reveal: 0.4,
    flags: 5,
  },
  {
    name: "04-hyperbolic",
    shape: "soft",
    mode: "hyperbolic73",
    seed: 4,
    reveal: 0.4,
    flags: 5,
  },
  {
    name: "05-penrose",
    shape: "realistic",
    mode: "penrose",
    seed: 11,
    reveal: 0.36,
    flags: 5,
  },
  {
    name: "06-volumetric",
    shape: "realistic",
    mode: "cube3d",
    difficulty: "easy",
    seed: 6,
    reveal: 0.3,
    flags: 5,
  },
  {
    name: "07-torus-lost",
    shape: "realistic",
    mode: "torussnubsquare",
    seed: 5,
    reveal: 0.34,
    flags: 4,
    explode: true,
  },
  {
    name: "08-classic-hex",
    shape: "classic",
    mode: "hexhex",
    seed: 9,
    reveal: 0.36,
    flags: 4,
  },
  { name: "09-menu", shape: "realistic" },
  {
    name: "10-surfaces",
    shape: "realistic",
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

/** Boot the app in the default look and stage a scene, ready to shoot. */
async function openScene(
  browser: Browser,
  device: View,
  scene: Scene,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch,
    reducedMotion: "reduce",
  });
  const settings = JSON.stringify({
    version: 5,
    theme: "sand",
    shape: scene.shape,
    scheme: "light",
    animations: false,
    sound: "off",
    backgrounds: false,
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
  return { page, context };
}

async function shoot(browser: Browser, device: View, scene: Scene, file?: string): Promise<Buffer> {
  const { page, context } = await openScene(browser, device, scene);
  const png = await page.screenshot(file ? { path: file } : {});
  if (file) console.log(`wrote ${file}`);
  await context.close();
  return png;
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

// --- Product page art -------------------------------------------------------
//
// Two more placements on the iOS product page, which take artwork rather than
// a screenshot of one device:
//
//   header          5244 x 2950, 3840 x 1646   the banner at the top of the page
//   search-results  5244 x 2950, 3840 x 2560, 1920 x 1280   the Search tab card
//
// Apple's guidance (developer.apple.com/app-store/asset-best-practices): one
// clear idea, the focal point in the centre so no device crops it, any text a
// short phrase, and for search "show firsthand experience" — the gameplay.
// So the header is a row of real boards with no words, and the search card is
// three of the iPhone shots under one line. Both are composed on the app's own
// page — its Sand field, its font, its colours — with the app's chrome hidden,
// rather than on an imitation of it.

interface Art {
  /** Output folder, and the `DEVICES` key that selects it. */
  key: "header" | "search-results";
  file: string;
  /** CSS pixels; times `scale` is the asset's size. */
  viewport: { width: number; height: number };
  scale: number;
}

const ART: Art[] = [
  { key: "header", file: "header-5244x2950.png", viewport: { width: 2622, height: 1475 }, scale: 2 },
  { key: "header", file: "header-3840x1646.png", viewport: { width: 1920, height: 823 }, scale: 2 },
  { key: "search-results", file: "search-5244x2950.png", viewport: { width: 2622, height: 1475 }, scale: 2 },
  { key: "search-results", file: "search-3840x2560.png", viewport: { width: 1920, height: 1280 }, scale: 2 },
  { key: "search-results", file: "search-1920x1280.png", viewport: { width: 1920, height: 1280 }, scale: 1 },
];

/** The header's boards, left to right, with their relative heights: the
 * middle one is the focal point. */
const HEADER_BOARDS: { scene: Scene; weight: number }[] = [
  { scene: { name: "h-hyperbolic", shape: "soft", mode: "hyperbolic73", seed: 4, reveal: 0.4, flags: 5 }, weight: 0.72 },
  { scene: { name: "h-mobius", shape: "realistic", mode: "mobiushex", difficulty: "easy", seed: 3, reveal: 0.34, flags: 4, rotate: [70, 40] }, weight: 0.86 },
  { scene: { name: "h-trefoil", shape: "realistic", mode: "trefoilhex", seed: 6, reveal: 0.4, flags: 5 }, weight: 1 },
  { scene: { name: "h-sphere", shape: "realistic", mode: "c180", seed: 7, reveal: 0.34, flags: 5 }, weight: 0.86 },
  { scene: { name: "h-torus", shape: "realistic", mode: "torussnubsquare", seed: 5, reveal: 0.34, flags: 4 }, weight: 0.72 },
];

/** The search card's three iPhone shots, by scene name; the middle one leads. */
const SEARCH_SHOTS = ["02-mobius", "01-sphere", "03-trefoil"];
const SEARCH_HEADLINE = "Minesweeper on every shape";

const CUTOUT_VIEW: View = { viewport: { width: 1000, height: 1000 }, scale: 3, touch: true, native: "pad" };

/** A board alone on a transparent ground: no header, no name, no page. */
async function cutout(browser: Browser, scene: Scene): Promise<Buffer> {
  const { page, context } = await openScene(browser, CUTOUT_VIEW, scene);
  await page.addStyleTag({
    content:
      "#ui, .board-name-layer { display: none !important; }" +
      "html, body { background: transparent !important; }",
  });
  await settle(page);
  const png = await page.screenshot({ omitBackground: true });
  await context.close();
  return png;
}

const cache = new Map<string, Buffer>();
async function memo(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
  if (!cache.has(key)) cache.set(key, await make());
  return cache.get(key)!;
}

async function composeArt(browser: Browser, art: Art, file: string): Promise<void> {
  const phone = DEVICES.find((d) => d.key === "iphone-6.9")!;
  const images =
    art.key === "header"
      ? await Promise.all(
          HEADER_BOARDS.map(async ({ scene }) => memo(`cut:${scene.name}`, () => cutout(browser, scene))),
        )
      : await Promise.all(
          SEARCH_SHOTS.map((name) =>
            memo(`phone:${name}`, () => shoot(browser, phone, SCENES.find((s) => s.name === name)!)),
          ),
        );

  // The app's menu in the default look is the canvas: its field and its font.
  const { page, context } = await openScene(
    browser,
    { viewport: art.viewport, scale: art.scale, touch: false, native: "mac" },
    { name: "art", shape: "soft" },
  );
  await page.addStyleTag({ content: "#ui, #board, .board-name-layer { display: none !important; }" });
  await page.evaluate(
    async ([kind, srcs, weights, headline]) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const imgs = await Promise.all((srcs as string[]).map(load));

      const stage = document.createElement("div");
      stage.style.cssText =
        "position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;";
      document.body.appendChild(stage);

      if (kind === "header") {
        // Trim each cutout to what it actually paints, so the boards are sized
        // by their own silhouettes rather than by the square they were shot in.
        const trimmed = imgs.map((img) => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const g = c.getContext("2d")!;
          g.drawImage(img, 0, 0);
          const { data } = g.getImageData(0, 0, c.width, c.height);
          let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              if (data[(y * c.width + x) * 4 + 3]! > 24) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
            }
          }
          const out = document.createElement("canvas");
          out.width = x1 - x0 + 1;
          out.height = y1 - y0 + 1;
          out.getContext("2d")!.drawImage(c, -x0, -y0);
          return out;
        });
        const w = weights as number[];
        const gap = 0.025 * W;
        const span = trimmed.reduce((sum, c, i) => sum + (c.width / c.height) * w[i]!, 0);
        const k = Math.min(0.8, (0.92 * W - gap * (trimmed.length - 1)) / (H * span));
        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;gap:${gap}px;`;
        trimmed.forEach((c, i) => {
          const h = k * w[i]! * H;
          c.style.cssText = `height:${h}px;width:${(c.width / c.height) * h}px;`;
          row.appendChild(c);
        });
        stage.appendChild(row);
      } else {
        const title = document.createElement("div");
        title.textContent = headline as string;
        title.style.cssText =
          `font-family:var(--ui-font);font-weight:700;color:var(--text);` +
          `font-size:${0.07 * H}px;letter-spacing:-0.01em;margin-bottom:${0.045 * H}px;`;
        stage.appendChild(title);
        const aspect = imgs[0]!.naturalWidth / imgs[0]!.naturalHeight;
        const gap = 0.035 * H;
        const h = Math.min(0.74 * H, (0.9 * W - 2 * gap) / (3 * aspect));
        const row = document.createElement("div");
        row.style.cssText = `display:flex;gap:${gap}px;`;
        for (const img of imgs) {
          img.style.cssText =
            `height:${h}px;width:${h * aspect}px;border-radius:${0.11 * h * aspect}px;` +
            `box-shadow:0 ${0.02 * H}px ${0.05 * H}px rgba(70,50,30,0.22),0 0 0 1px rgba(70,50,30,0.08);`;
          row.appendChild(img);
        }
        stage.appendChild(row);
      }
      await document.fonts.ready;
    },
    [
      art.key,
      images.map((b) => `data:image/png;base64,${b.toString("base64")}`),
      HEADER_BOARDS.map((b) => b.weight),
      SEARCH_HEADLINE,
    ] as const,
  );
  await settle(page);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
  await context.close();
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
        await shoot(browser, device, scene, path.join(outDir, `${scene.name}.png`));
      }
    }
    for (const art of ART) {
      if (onlyDevices && !onlyDevices.includes(art.key)) continue;
      const outDir = path.join(outRoot, art.key);
      mkdirSync(outDir, { recursive: true });
      await composeArt(browser, art, path.join(outDir, art.file));
    }
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
