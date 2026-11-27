// Dev-only: render Rep-tiles' App Store screenshots.
//
//   npm run store-screenshots -- [out-dir]
//   (default out dir: ../../app-store-screenshots/reptiles, gitignored;
//   DEVICES=iphone-6.3,ipad and SHOTS=01-penrose,… render a subset)
//
// Serves the game as the iPhone app packages it (`VITE_PACKAGED=1`: no update
// row, no More games, the bundled privacy policy) from a Vite dev server — the dev build
// is what has the `window.__reptiles` seam, which lays part of a board
// (`lay(n)`, the board's own tiles from its bottom-left) or the whole of one
// (`fill()`) — and shoots each scene at the pixel size App Store Connect asks
// for:
//
//   iphone-6.9  6.9" display    1320 x 2868  (440 x 956 pt @3x, portrait)
//   iphone-6.3  6.1"/6.3"       1206 x 2622  (402 x 874 pt @3x, portrait)
//   ipad        13" display     2064 x 2752  (1032 x 1376 pt @2x, portrait)
//
// The 6.3" slot rejects the 6.9" size, so each slot gets its own. There is no
// Mac slot: the App Store app is iPhone and iPad only.
//
// Every shot is in the look a new player first sees: the light scheme (the
// default follows the device, so it is pinned here), sound off.

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const PORT = 4183;
const BASE = `http://localhost:${PORT}/`;

interface Device {
  key: string;
  viewport: { width: number; height: number };
  scale: number;
  /** What BridgeViewController.swift tells the page it runs on. */
  native: "phone" | "pad";
  /** The device's safe-area insets in portrait, in points: what
   * `env(safe-area-inset-*)` is on it, and 0 in a headless browser unless
   * emulated — so the header clears the Dynamic Island as it does on the
   * phone, rather than sitting under it. */
  safe: { top: number; bottom: number };
}

// The insets: 62pt top and 34pt bottom are an iPhone 16 Pro's and Pro Max's
// (the Dynamic Island, the home indicator); 24pt and 20pt an iPad's.
// prettier-ignore
const DEVICES: Device[] = [
  { key: "iphone-6.9", viewport: { width: 440, height: 956 }, scale: 3, native: "phone", safe: { top: 62, bottom: 34 } },
  { key: "iphone-6.3", viewport: { width: 402, height: 874 }, scale: 3, native: "phone", safe: { top: 62, bottom: 34 } },
  { key: "ipad", viewport: { width: 1032, height: 1376 }, scale: 2, native: "pad", safe: { top: 24, bottom: 20 } },
];

interface Scene {
  name: string;
  /** The page's query: `level=penrose`, `tilings`, `tiling=trihex`, or none
   * for home. */
  query: string;
  /** A level: the share of its own tiles to lay first, 1 to finish it. */
  laid?: number;
}

// The first three are the ones a search result shows: the boards least like
// any other puzzle's. Then two of the markings — a jigsaw and a matching rule —
// then the screens a level is picked from, widest first, and home.
const SCENES: Scene[] = [
  { name: "01-penrose", query: "level=penrose", laid: 0.55 },
  { name: "02-hat", query: "level=hat", laid: 0.5 },
  { name: "03-ammann-beenker-colours", query: "level=ammannbeenker.3apart", laid: 0.45 },
  { name: "04-jigsaw", query: "level=rhombitrihex.3byshape.jigsaw", laid: 0.5 },
  { name: "05-cairo-lines", query: "level=cairo.lines", laid: 0.5 },
  { name: "06-tilings", query: "tilings" },
  { name: "07-irregular", query: "group=irregular" },
  { name: "08-tiling-page", query: "tiling=trihex" },
  { name: "09-home", query: "" },
];

function pick<T extends { key?: string; name?: string }>(all: T[], env: string | undefined): T[] {
  if (!env) return all;
  const wanted = new Set(env.split(",").map((s) => s.trim()));
  return all.filter((x) => wanted.has(x.key ?? x.name ?? ""));
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never answered at ${url}`);
}

/** Let the pictures a screen draws one a frame (a tiling's page, the
 * catalog's cards) and any fade finish. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );
  await page.waitForTimeout(1500);
}

async function shoot(browser: Browser, device: Device, scene: Scene, out: string): Promise<void> {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    hasTouch: true,
    isMobile: device.native === "phone",
    reducedMotion: "reduce",
  });
  await context.addInitScript((native) => {
    window.localStorage.setItem(
      "rep-tiles.settings",
      JSON.stringify({ scheme: "light", sound: "off" }),
    );
    // home, not the first-run tutorial that opens in its place for a newcomer
    window.localStorage.setItem("rep-tiles.tutorial", JSON.stringify({ seen: true }));
    (window as { reptilesDevice?: string }).reptilesDevice = native;
  }, device.native);
  const page = await context.newPage();
  // Chromium's own safe-area emulation (the page is viewport-fit=cover), so
  // env(safe-area-inset-*) is the device's.
  const cdp = await context.newCDPSession(page);
  await cdp.send(
    "Emulation.setSafeAreaInsetsOverride" as never,
    {
      insets: { top: device.safe.top, bottom: device.safe.bottom, left: 0, right: 0 },
    } as never,
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + (scene.query ? `?${scene.query}` : ""));
  await page.waitForSelector("body[data-ready]");
  if (scene.laid !== undefined) {
    await page.waitForSelector("svg.board path.region");
    if (scene.laid >= 1) {
      await page.evaluate(() => (window as any).__reptiles.fill());
      // The win panel, in the tray card, says how long it took, which here
      // is no time at all: leave that line out.
      await page.addStyleTag({ content: "#won-time { visibility: hidden; }" });
    } else {
      const total = await page.evaluate(
        () => (window as any).__reptiles.puzzle.level.cells.length as number,
      );
      await page.evaluate((n) => (window as any).__reptiles.lay(n), Math.round(total * scene.laid));
    }
  }
  await settle(page);
  if (errors.length > 0) throw new Error(`${scene.name} on ${device.key}: ${errors.join("; ")}`);
  const file = path.join(out, device.key, `${scene.name}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  console.log(`  ${path.relative(process.cwd(), file)}`);
  await context.close();
}

const out = path.resolve(process.argv[2] ?? path.join(APP, "../../app-store-screenshots/reptiles"));
const devices = pick(DEVICES, process.env.DEVICES);
const scenes = pick(SCENES, process.env.SHOTS);

const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: APP,
  stdio: "ignore",
  env: { ...process.env, VITE_PACKAGED: "1" },
});
try {
  await waitForServer(BASE);
  const browser = await chromium.launch();
  try {
    for (const device of devices) {
      console.log(device.key);
      for (const scene of scenes) await shoot(browser, device, scene, out);
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
}
console.log(`wrote ${devices.length * scenes.length} screenshots to ${out}`);
