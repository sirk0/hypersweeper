// Dev-only: render the iMessage sticker pack from the packaged app.
//
//   npm run stickers
//   (SHOTS=trefoil,penrose renders a subset; ICON_ONLY=1 redraws just the
//   iMessage app icon; SWIFTSHADER=1 takes the software-WebGL path, the one a
//   machine with no GPU — a cloud session — has to take)
//
// Writes straight into the sticker pack's asset catalog,
// ios/App/Stickers/Stickers.xcassets (see "The sticker pack" in
// ios/README.md):
//
//   Sticker Pack.stickerpack/<name>.sticker/<name>.png   one per STICKERS entry
//   iMessage App Icon.stickersiconset/*.png               the drawer icon
//
// and every Contents.json beside them, so the list below is the only place a
// sticker is named.
//
// A sticker is one of the game's own boards, part played, cut out of the page
// and given the white die-cut edge and soft shadow a sticker peeled off a
// sheet has — it lands on a chat bubble of any colour, light or dark. The board
// is staged the way the App Store art stages it (shots-lib.ts), in the look a
// new player first sees: Sand, light, Realistic, so the solids stand real pins
// and bombs.
//
// Apple's limits: every sticker in a pack the same size — Large, 618 px
// square, two to a row in the drawer — and no file over 500 KB, which the run
// checks.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

import { chromium, type Browser, type Page } from "@playwright/test";

import { settle, stageBoard, waitForServer, type Staging } from "./shots-lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, "..");
const ROOT = path.resolve(WEB, "..");
const CATALOG = path.join(ROOT, "ios/App/Stickers/Stickers.xcassets");
const PACK = path.join(CATALOG, "Sticker Pack.stickerpack");
const ICONSET = path.join(CATALOG, "iMessage App Icon.stickersiconset");
const APP_ICON = path.join(ROOT, "ios/App/App/AppIcon.icon");
const PORT = 4182;
const BASE = `http://localhost:${PORT}/`;

/** Apple's "Large" sticker: 618 px square, shown two to a row. */
const STICKER_PX = 618;
const GRID_SIZE = "large";
/** Apple rejects a sticker file over 500 KB. */
const MAX_BYTES = 500 * 1024;

interface Sticker extends Staging {
  /** The sticker's file and folder name. */
  name: string;
  mode: string;
  difficulty?: string;
  /** A key in `SHAPE_KEYS` (web/src/render/cellStyle.ts). Realistic unless a
   * board has no solid to stand markers on. */
  shape?: string;
  /** What VoiceOver reads. Defaults to the board's own name in the catalog. */
  label?: string;
}

// The boards that say "this is not the minesweeper you know" at a glance: a
// sphere of snub cells, a torus, a knot, a plane no grid can tile and a
// hyperbolic disc. Easy where Medium's cells would be specks at sticker size, and
// few enough opened that the flags stand clear of the rim, where the framing
// would cut their pins off.
const STICKERS: Sticker[] = [
  { name: "snub-dodecahedron", mode: "snubdodec", difficulty: "easy", seed: 5, reveal: 0.25, flags: 3 },
  // Tipped towards the viewer so the hole shows: square on, it reads as a ring.
  { name: "snub-square-torus", mode: "torussnubsquare", difficulty: "easy", seed: 2, reveal: 0.3, flags: 3, rotate: [0, 50], label: "Snub square torus" },
  { name: "trefoil", mode: "trefoilhex", seed: 6, reveal: 0.4, flags: 5 },
  { name: "penrose", mode: "penrose", difficulty: "easy", seed: 11, reveal: 0.4, flags: 4 },
  { name: "hyperbolic", mode: "hyperbolic73", shape: "soft", seed: 4, reveal: 0.4, flags: 5 },
];

/** The board's name, as the menu shows it — `Hexagons · Klein bottle` reads
 * as just the surface, which is what the sticker is of. */
function labelFor(sticker: Sticker): string {
  if (sticker.label) return sticker.label;
  const catalog = JSON.parse(readFileSync(path.join(ROOT, "data/catalog.json"), "utf8"));
  const label: string = catalog.modeInfo[sticker.mode].label;
  return label.split(" · ").pop()!;
}

const CUT_VIEW = { width: 640, height: 640 };
const CUT_SCALE = 2;

/** The board alone on a transparent ground: no header, no name, no page. */
async function cutout(browser: Browser, sticker: Sticker): Promise<{ page: Page; png: Buffer }> {
  const context = await browser.newContext({
    viewport: CUT_VIEW,
    deviceScaleFactor: CUT_SCALE,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const settings = JSON.stringify({
    version: 5,
    gloss: false,
    theme: "sand",
    shape: sticker.shape ?? "realistic",
    scheme: "light",
    animations: false,
    sound: "off",
    backgrounds: false,
  });
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, value!),
    ["ms:settings", settings],
  );
  const page = await context.newPage();
  const difficulty = sticker.difficulty ?? "medium";
  await page.goto(`${BASE}?mode=${sticker.mode}&difficulty=${difficulty}&seed=0`);
  await page.waitForSelector("body[data-ready]");
  await page.evaluate(() => window.__ms!.effects(false));
  await settle(page);
  await stageBoard(page, sticker, difficulty);
  await page.addStyleTag({
    content:
      "#ui, .board-name-layer { display: none !important; }" +
      "html, body { background: transparent !important; }",
  });
  await settle(page);
  // A throwaway frame pays for shader compilation, so the real one is settled.
  await page.screenshot({ omitBackground: true });
  await page.waitForTimeout(300);
  const png = await page.screenshot({ omitBackground: true });
  return { page, png };
}

/** Trim the cutout to what it paints, give it a die-cut white edge and a soft
 * shadow, and fit it to the sticker square. Done on a canvas in the page the
 * board was shot in, so nothing beyond the browser is needed. */
async function dieCut(page: Page, png: Buffer): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ([src, size]) => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src as string;
      });
      const S = size as number;
      const src2d = document.createElement("canvas");
      src2d.width = img.naturalWidth;
      src2d.height = img.naturalHeight;
      const g = src2d.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, src2d.width, src2d.height);
      let x0 = src2d.width, y0 = src2d.height, x1 = 0, y1 = 0;
      for (let y = 0; y < src2d.height; y++) {
        for (let x = 0; x < src2d.width; x++) {
          if (data[(y * src2d.width + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;

      // The edge and the shadow need room inside the square.
      const edge = Math.round(S * 0.016);
      const blur = Math.round(S * 0.02);
      const pad = edge + blur * 2;
      const k = (S - 2 * pad) / Math.max(w, h);
      const dw = w * k;
      const dh = h * k;
      const dx = (S - dw) / 2;
      const dy = (S - dh) / 2 - blur * 0.25;

      const board = document.createElement("canvas");
      board.width = S;
      board.height = S;
      const b = board.getContext("2d")!;
      b.imageSmoothingQuality = "high";
      b.drawImage(src2d, x0, y0, w, h, dx, dy, dw, dh);

      // The white backing: the board's silhouette, stamped round a circle of
      // radius `edge`, which grows it by that much in every direction.
      const silhouette = document.createElement("canvas");
      silhouette.width = S;
      silhouette.height = S;
      const s = silhouette.getContext("2d")!;
      s.drawImage(board, 0, 0);
      s.globalCompositeOperation = "source-in";
      s.fillStyle = "#ffffff";
      s.fillRect(0, 0, S, S);
      const backing = document.createElement("canvas");
      backing.width = S;
      backing.height = S;
      const bk = backing.getContext("2d")!;
      const steps = 48;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        bk.drawImage(silhouette, Math.cos(a) * edge, Math.sin(a) * edge);
      }
      bk.drawImage(silhouette, 0, 0);

      const out = document.createElement("canvas");
      out.width = S;
      out.height = S;
      const o = out.getContext("2d")!;
      o.shadowColor = "rgba(40, 28, 16, 0.32)";
      o.shadowBlur = blur;
      o.shadowOffsetY = blur * 0.35;
      o.drawImage(backing, 0, 0);
      o.shadowColor = "transparent";
      o.drawImage(board, 0, 0);
      return out.toDataURL("image/png");
    },
    [`data:image/png;base64,${png.toString("base64")}`, STICKER_PX] as const,
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

const CATALOG_INFO = { author: "xcode", version: 1 };

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function renderSticker(browser: Browser, sticker: Sticker): Promise<void> {
  const { page, png } = await cutout(browser, sticker);
  const out = await dieCut(page, png);
  await page.context().close();
  if (out.length > MAX_BYTES) {
    throw new Error(
      `${sticker.name}: ${Math.round(out.length / 1024)} KB is over Apple's 500 KB sticker limit`,
    );
  }
  const dir = path.join(PACK, `${sticker.name}.sticker`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${sticker.name}.png`), out);
  writeJson(path.join(dir, "Contents.json"), {
    info: CATALOG_INFO,
    properties: { filename: `${sticker.name}.png`, "accessibility-label": labelFor(sticker) },
  });
  console.log(`wrote ${sticker.name}.sticker (${Math.round(out.length / 1024)} KB)`);
}

/** The pack's own Contents.json, and no sticker folder it does not list. */
function writePack(): void {
  writeJson(path.join(CATALOG, "Contents.json"), { info: CATALOG_INFO });
  writeJson(path.join(PACK, "Contents.json"), {
    info: CATALOG_INFO,
    properties: { "grid-size": GRID_SIZE },
    stickers: STICKERS.map((s) => ({ filename: `${s.name}.sticker` })),
  });
  const keep = new Set(STICKERS.map((s) => `${s.name}.sticker`));
  for (const entry of readdirSync(PACK)) {
    if (entry.endsWith(".sticker") && !keep.has(entry)) {
      rmSync(path.join(PACK, entry), { recursive: true });
      console.log(`removed ${entry}`);
    }
  }
}

// --- The iMessage app icon --------------------------------------------------
//
// The drawer shows the pack under an icon of its own, in Messages' 4:3 shapes
// plus a square one for settings. It is the app icon's art — the pentagon cell
// and the mine, on Sand's ground — read from the primary Icon Composer
// document (written by make-icons.mts), so the two cannot drift apart. The
// system rounds the corners itself; the App Store refuses a marketing icon
// with an alpha channel, so every one is written as opaque RGB.

interface IconSlot {
  size: string;
  idiom: string;
  scale: number;
  platform?: string;
}

const ICON_SLOTS: IconSlot[] = [
  { size: "29x29", idiom: "iphone", scale: 2 },
  { size: "29x29", idiom: "iphone", scale: 3 },
  { size: "60x45", idiom: "iphone", scale: 2 },
  { size: "60x45", idiom: "iphone", scale: 3 },
  { size: "29x29", idiom: "ipad", scale: 2 },
  { size: "67x50", idiom: "ipad", scale: 2 },
  { size: "74x55", idiom: "ipad", scale: 2 },
  { size: "1024x1024", idiom: "ios-marketing", scale: 1 },
  { size: "27x20", idiom: "universal", scale: 2, platform: "ios" },
  { size: "27x20", idiom: "universal", scale: 3, platform: "ios" },
  { size: "32x24", idiom: "universal", scale: 2, platform: "ios" },
  { size: "32x24", idiom: "universal", scale: 3, platform: "ios" },
  { size: "1024x768", idiom: "ios-marketing", scale: 1, platform: "ios" },
];

function pixelSize(slot: IconSlot): [number, number] {
  const [w, h] = slot.size.split("x").map(Number) as [number, number];
  return [w * slot.scale, h * slot.scale];
}

/** Icon Composer's ground, `srgb:r,g,b,a` in icon.json, as a CSS colour. */
function iconGround(): string {
  const doc = JSON.parse(readFileSync(path.join(APP_ICON, "icon.json"), "utf8"));
  const [r, g, b] = (doc.fill.solid as string)
    .replace("srgb:", "")
    .split(",")
    .map((v) => Math.round(Number(v) * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/** An opaque RGB PNG from RGBA pixels: the alpha is dropped, not composited,
 * because every pixel drawn over the ground is already opaque. */
function encodeRgbPng(width: number, height: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = row + 1 + x * 3;
      raw[o] = rgba[i]!;
      raw[o + 1] = rgba[i + 1]!;
      raw[o + 2] = rgba[i + 2]!;
    }
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function renderIcons(browser: Browser): Promise<void> {
  const ground = iconGround();
  const layers = ["cell.svg", "mine.svg"].map(
    (f) =>
      `data:image/svg+xml;base64,${readFileSync(path.join(APP_ICON, "Assets", f)).toString("base64")}`,
  );
  const page = await browser.newPage();
  rmSync(ICONSET, { recursive: true, force: true });
  mkdirSync(ICONSET, { recursive: true });
  const images: Record<string, unknown>[] = [];
  for (const slot of ICON_SLOTS) {
    const [w, h] = pixelSize(slot);
    const rgba = await page.evaluate(
      async ([width, height, fill, srcs]) => {
        const W = width as number;
        const H = height as number;
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d")!;
        g.fillStyle = fill as string;
        g.fillRect(0, 0, W, H);
        g.imageSmoothingQuality = "high";
        // The art is drawn on a 1024 square; centred, as tall as the icon.
        const side = Math.min(W, H);
        for (const src of srcs as string[]) {
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = src;
          });
          g.drawImage(img, (W - side) / 2, (H - side) / 2, side, side);
        }
        return Array.from(g.getImageData(0, 0, W, H).data);
      },
      [w, h, ground, layers] as const,
    );
    const file = `icon-${w}x${h}.png`;
    if (!existsSync(path.join(ICONSET, file))) {
      writeFileSync(path.join(ICONSET, file), encodeRgbPng(w, h, Uint8Array.from(rgba)));
    }
    images.push({
      filename: file,
      idiom: slot.idiom,
      ...(slot.platform ? { platform: slot.platform } : {}),
      scale: `${slot.scale}x`,
      size: slot.size,
    });
  }
  await page.close();
  writeJson(path.join(ICONSET, "Contents.json"), { images, info: CATALOG_INFO });
  console.log(`wrote iMessage App Icon.stickersiconset (${images.length} slots)`);
}

async function main(): Promise<void> {
  const only = process.env.SHOTS?.split(",").map((s) => s.trim());
  const iconOnly = !!process.env.ICON_ONLY;
  const distDir = path.join(WEB, "node_modules/.stickers-dist");

  const launch = (): Promise<Browser> =>
    chromium.launch({
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: process.env.SWIFTSHADER
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        : ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
    });

  if (iconOnly) {
    const browser = await launch();
    await renderIcons(browser);
    await browser.close();
    return;
  }

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
    const browser = await launch();
    mkdirSync(PACK, { recursive: true });
    for (const sticker of STICKERS) {
      if (only && !only.includes(sticker.name)) continue;
      await renderSticker(browser, sticker);
    }
    if (!only) writePack();
    await renderIcons(browser);
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
