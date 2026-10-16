// Dev-only: render the App Store screenshots from the packaged app.
//
//   npm run store-screenshots -- [out-dir]
//   (default out dir: ../app-store-screenshots; DEVICES=iphone-6.3,mac and
//   SHOTS=01-snub-dodecahedron,… render a subset — DEVICES also takes `header`,
//   `header-penrose`, `search-results` and `app-clip`, the art described
//   further down, and the iMessage app's `imessage-iphone`,
//   `imessage-iphone-duo` and `imessage-ipad`)
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
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { settle, stageBoard, waitForServer } from "./shots-lib";

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
  /** The device's top safe-area inset in portrait, in points: what
   * `env(safe-area-inset-top)` is on the device, and 0 in this headless
   * browser. Stood in through `--safe-top` (styles.css), so the header sits
   * where it does on the device — under the status bar, and on a Touch ID
   * screen in from the rounded corners (`--corner-clear`) — rather than in the
   * corners App Store Connect rounds every screenshot off at. */
  safeTop?: number;
}

interface Device extends View {
  key: string;
}

// The insets: 62pt is the Dynamic Island's (iPhone 16 Pro and Pro Max); 24pt
// is a status bar with no sensor housing in it, which is an iPad's and, as an
// estimate until one can be measured, the iPhone Duo's.
const DEVICES: Device[] = [
  { key: "iphone-6.9", viewport: { width: 440, height: 956 }, scale: 3, touch: true, native: "phone", safeTop: 62 },
  { key: "iphone-6.3", viewport: { width: 402, height: 874 }, scale: 3, touch: true, native: "phone", safeTop: 62 },
  { key: "iphone-duo", viewport: { width: 669, height: 951 }, scale: 3, touch: true, native: "phone", safeTop: 24 },
  { key: "ipad", viewport: { width: 1032, height: 1376 }, scale: 2, touch: true, native: "pad", safeTop: 24 },
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

// The first three are the ones a search result shows, so they are the three
// most unlike any other minesweeper.
const SCENES: Scene[] = [
  {
    name: "01-snub-dodecahedron",
    shape: "realistic",
    mode: "snubdodec",
    seed: 5,
    reveal: 0.3,
    flags: 4,
  },
  {
    name: "02-snub-square-torus",
    shape: "realistic",
    mode: "torussnubsquare",
    seed: 5,
    reveal: 0.34,
    flags: 4,
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
    name: "04-penrose",
    shape: "realistic",
    mode: "penrose",
    seed: 11,
    reveal: 0.36,
    flags: 5,
  },
  {
    name: "05-hyperbolic",
    shape: "soft",
    mode: "hyperbolic73",
    seed: 4,
    reveal: 0.4,
    flags: 5,
  },
  { name: "06-menu", shape: "realistic" },
  {
    name: "07-flat-manifolds",
    shape: "realistic",
    clicks: ['.menu-entry[data-group="custom"]', '.menu-entry[data-group="manifolds"]'],
  },
];

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
    gloss: false,
    theme: "sand",
    shape: scene.shape,
    scheme: "light",
    animations: false,
    sound: "off",
    backgrounds: false,
  });
  await context.addInitScript(
    ([key, value, native, safeTop]) => {
      window.localStorage.setItem(key!, value!);
      (window as { hypersweeperDevice?: string }).hypersweeperDevice = native;
      if (safeTop === "0px") return;
      // The document element may not exist this early; retry once parsing has
      // built it, still before the module script runs.
      const apply = (): boolean => {
        document.documentElement?.style.setProperty("--safe-top", safeTop!);
        return document.documentElement != null;
      };
      if (!apply()) document.addEventListener("readystatechange", apply);
    },
    ["ms:settings", settings, device.native, `${device.safeTop ?? 0}px`],
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

// --- Product page art -------------------------------------------------------
//
// Two more placements on the iOS product page, which take artwork rather than
// a screenshot of one device, and the App Clip's card:
//
//   header          5244 x 2950, 3840 x 1646   the banner at the top of the page
//   header-penrose  the same two sizes          the banner of the Penrose custom
//                                               product page
//   search-results  5244 x 2950, 3840 x 2560, 1920 x 1280   the Search tab card
//   app-clip        1800 x 1200   the image on the App Clip card (App Store
//                                 Connect → App Clip → default experience),
//                                 a JPEG because the card takes no transparency
//
// Apple's guidance (developer.apple.com/app-store/asset-best-practices): one
// clear idea, the focal point in the centre so no device crops it, any text a
// short phrase, and for search "show firsthand experience" — the gameplay.
// So the header is a row of real boards with no words, and the search card is
// three of the iPhone shots under one line. The App Clip card is the clip's own
// board in play, wordless too, since the card prints its title and subtitle
// under it. All three are on the app's own
// page — its Sand field, its font, its colours — with the app's chrome hidden,
// rather than on an imitation of it.

type HeaderKey = "header" | "header-penrose";

interface Art {
  /** Output folder, and the `DEVICES` key that selects it. */
  key: HeaderKey | "search-results" | "app-clip";
  file: string;
  /** CSS pixels; times `scale` is the asset's size. */
  viewport: { width: number; height: number };
  scale: number;
  /** A header's boards: where the row's middle sits and how tall its tallest
   * board stands, as fractions of the banner's height. */
  focus?: { centreY: number; maxH: number };
}

// The App Store does not show a header whole. On an iPhone it fills the
// screen's width from the top edge down, so the sides are cropped, and the
// info card covers it from about 64% of its height down; the back and share
// buttons sit over it at about a quarter of the way down. So the boards stand
// in the band between, at 21–61% of the height, not centred on the banner.
const HEADER_FOCUS = { centreY: 0.41, maxH: 0.4 };
// The wide size is the iPad's and the Mac's, which crop it less.
const WIDE_HEADER_FOCUS = { centreY: 0.44, maxH: 0.52 };

const ART: Art[] = [
  { key: "header", file: "header-5244x2950.png", viewport: { width: 2622, height: 1475 }, scale: 2, focus: HEADER_FOCUS },
  { key: "header", file: "header-3840x1646.png", viewport: { width: 1920, height: 823 }, scale: 2, focus: WIDE_HEADER_FOCUS },
  { key: "header-penrose", file: "header-penrose-5244x2950.png", viewport: { width: 2622, height: 1475 }, scale: 2, focus: HEADER_FOCUS },
  { key: "header-penrose", file: "header-penrose-3840x1646.png", viewport: { width: 1920, height: 823 }, scale: 2, focus: WIDE_HEADER_FOCUS },
  { key: "search-results", file: "search-5244x2950.png", viewport: { width: 2622, height: 1475 }, scale: 2 },
  { key: "search-results", file: "search-3840x2560.png", viewport: { width: 1920, height: 1280 }, scale: 2 },
  { key: "search-results", file: "search-1920x1280.png", viewport: { width: 1920, height: 1280 }, scale: 1 },
  { key: "app-clip", file: "app-clip-1800x1200.jpg", viewport: { width: 900, height: 600 }, scale: 2 },
];

/** Each header's boards, left to right, with their relative heights: the
 * middle one is the focal point. */
const HEADERS: Record<HeaderKey, { scene: Scene; weight: number }[]> = {
  header: [
  { scene: { name: "h-hyperbolic", shape: "soft", mode: "hyperbolic73", seed: 4, reveal: 0.4, flags: 5 }, weight: 0.72 },
  { scene: { name: "h-mobius", shape: "realistic", mode: "mobiushex", difficulty: "easy", seed: 3, reveal: 0.34, flags: 4, rotate: [70, 40] }, weight: 0.86 },
  { scene: { name: "h-trefoil", shape: "realistic", mode: "trefoilhex", seed: 6, reveal: 0.4, flags: 5 }, weight: 1 },
  { scene: { name: "h-sphere", shape: "realistic", mode: "c180", seed: 7, reveal: 0.26, flags: 4 }, weight: 0.86 },
  { scene: { name: "h-torus", shape: "realistic", mode: "torussnubsquare", seed: 5, reveal: 0.34, flags: 4 }, weight: 0.72 },
  ],
  // The Penrose custom product page: the aperiodic tiling alone.
  "header-penrose": [
    { scene: { name: "h-penrose", shape: "realistic", mode: "penrose", seed: 11, reveal: 0.26, flags: 5 }, weight: 1 },
  ],
};

/** The App Clip card's board: the one the clip plays (`HypersweeperClipBoard`
 * in ios/App/AppClip/Info.plist) at the difficulty it opens at, the default,
 * part played as the header's boards are. */
const CLIP_SCENE: Scene = {
  name: "c-chamfered",
  shape: "realistic",
  mode: "c80",
  difficulty: "easy",
  seed: 5,
  reveal: 0.4,
  flags: 4,
};

/** The search card's three iPhone shots, by scene name; the middle one leads. */
const SEARCH_SHOTS = ["02-snub-square-torus", "01-snub-dodecahedron", "03-trefoil"];
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
  const header = art.key === "header" || art.key === "header-penrose" ? HEADERS[art.key] : undefined;
  const images = header
    ? await Promise.all(
        header.map(async ({ scene }) => memo(`cut:${scene.name}`, () => cutout(browser, scene))),
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
    async ([kind, srcs, weights, headline, focus]) => {
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

      if (kind === "header" || kind === "header-penrose") {
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
        const { centreY, maxH } = focus as { centreY: number; maxH: number };
        const gap = 0.025 * W;
        const span = trimmed.reduce((sum, c, i) => sum + (c.width / c.height) * w[i]!, 0);
        const k = Math.min(maxH, (0.92 * W - gap * (trimmed.length - 1)) / (H * span));
        const row = document.createElement("div");
        row.style.cssText =
          `position:absolute;left:50%;top:${centreY * H}px;transform:translate(-50%,-50%);` +
          `display:flex;align-items:center;gap:${gap}px;`;
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
      (header ?? []).map((b) => b.weight),
      SEARCH_HEADLINE,
      art.focus ?? null,
    ] as const,
  );
  await settle(page);
  await page.screenshot({ path: file });
  console.log(`wrote ${file}`);
  await context.close();
}

/** The App Clip card: the clip's board in play at the card's size, with the
 * app's chrome hidden. Shot whole rather than cut out, so the board keeps the
 * shadow it casts on the page. */
async function clipCard(browser: Browser, art: Art, file: string): Promise<void> {
  const { page, context } = await openScene(
    browser,
    { viewport: art.viewport, scale: art.scale, touch: true, native: "phone" },
    CLIP_SCENE,
  );
  await page.addStyleTag({ content: "#ui, .board-name-layer { display: none !important; }" });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await settle(page);
  await page.screenshot({ path: file, type: "jpeg", quality: 92 });
  console.log(`wrote ${file}`);
  await context.close();
}

// --- iMessage app screenshots -----------------------------------------------
//
// The sticker pack has its own App Store screenshots (App Store Connect →
// the version page → iMessage App), one set per slot:
//
//   imessage-iphone      1206 x 2622   the iPhone 6.1"/6.3" slot
//   imessage-iphone-duo  2007 x 2853
//   imessage-ipad        2064 x 2752
//
// They show the pack where it is used: a conversation drawn in the manner of
// Messages — bubbles, the compose bar, the sticker drawer — with the stickers
// peeled onto it. Nothing in it is a screenshot of Messages or carries Apple's
// marks; it is plain HTML, drawn at each slot's point size and scale. The
// stickers are read from the pack itself (ios/App/Stickers, written by
// make-stickers.mts), in the pack's order, so the pictures always show what
// ships: render the stickers first.

const STICKER_CATALOG = path.resolve(WEB, "../ios/App/Stickers/Stickers.xcassets");

interface MessagesSlot {
  /** Output folder, and the `DEVICES` key that selects it. */
  key: string;
  /** The `DEVICES` entry whose viewport, scale and status bar it takes. */
  device: string;
  /** Sticker columns in the drawer: Large stickers stand two to a row on an
   * iPhone, more where the screen is wider. */
  columns: number;
  /** How much larger than an iPhone's the type and bubbles are drawn. */
  ui: number;
}

const MESSAGES_SLOTS: MessagesSlot[] = [
  { key: "imessage-iphone", device: "iphone-6.3", columns: 2, ui: 1 },
  { key: "imessage-iphone-duo", device: "iphone-duo", columns: 3, ui: 1.3 },
  { key: "imessage-ipad", device: "ipad", columns: 4, ui: 1.6 },
];

/** A message: a bubble of text, optionally with a sticker peeled onto it, or
 * a sticker sent on its own. `sticker` is an index into the pack. */
interface Message {
  from: "in" | "out";
  text?: string;
  sticker?: number;
}

interface MessagesScene {
  name: string;
  messages: Message[];
  drawer: "none" | "open" | "expanded";
}

// Stickers by their place in the pack: 0 snub dodecahedron, 1 snub square
// torus, 2 trefoil, 3 Penrose, 4 hyperbolic.
const MESSAGES_SCENES: MessagesScene[] = [
  {
    name: "01-drawer",
    drawer: "open",
    messages: [
      { from: "in", text: "Still stuck on that minesweeper?" },
      { from: "out", text: "It's on a knot now", sticker: 2 },
      { from: "in", text: "Send me a hard one" },
    ],
  },
  {
    name: "02-conversation",
    drawer: "none",
    messages: [
      { from: "in", text: "Minesweeper on a donut??", sticker: 1 },
      { from: "out", text: "Try the snub dodecahedron", sticker: 0 },
      { from: "in", text: "No grid tiles this one", sticker: 3 },
      { from: "out", sticker: 4 },
    ],
  },
  {
    name: "03-expanded",
    drawer: "expanded",
    messages: [],
  },
];

interface PackSticker {
  src: string;
  label: string;
}

function dataUrl(file: string): string {
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

/** The pack's stickers in its own order, and its drawer icon. */
function readPack(): { stickers: PackSticker[]; icon: string } {
  const pack = path.join(STICKER_CATALOG, "Sticker Pack.stickerpack");
  const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
  const stickers = (json(path.join(pack, "Contents.json")).stickers as { filename: string }[]).map(
    ({ filename }) => {
      const dir = path.join(pack, filename);
      const { properties } = json(path.join(dir, "Contents.json"));
      return { src: dataUrl(path.join(dir, properties.filename)), label: properties["accessibility-label"] };
    },
  );
  const icon = dataUrl(path.join(STICKER_CATALOG, "iMessage App Icon.stickersiconset/icon-180x135.png"));
  return { stickers, icon };
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The page for one scene, sized in points for `device`. */
function messagesPage(
  device: Device,
  slot: MessagesSlot,
  scene: MessagesScene,
  pack: { stickers: PackSticker[]; icon: string },
): string {
  const u = slot.ui;
  const W = device.viewport.width;
  const peel = Math.round(Math.min(132 * u, W * 0.34));
  const tilt = [-9, 7, -5, 10];

  const messages = scene.messages
    .map((m, i) => {
      const sticker = m.sticker != null ? pack.stickers[m.sticker] : undefined;
      const img = sticker
        ? `<img class="peel" src="${sticker.src}" alt="${escapeHtml(sticker.label)}" ` +
          `style="transform:rotate(${tilt[i % tilt.length]}deg)">`
        : "";
      if (!m.text) return `<div class="row ${m.from} alone">${img}</div>`;
      const bubble = `<div class="bubble">${escapeHtml(m.text)}</div>`;
      return `<div class="row ${m.from}${sticker ? " stuck" : ""}">${bubble}${img}</div>`;
    })
    .join("");

  const grid = pack.stickers
    .map((s) => `<div class="cell"><img src="${s.src}" alt="${escapeHtml(s.label)}"></div>`)
    .join("");
  const drawer =
    scene.drawer === "none"
      ? ""
      : `<div class="drawer ${scene.drawer}">
          <div class="grabber"></div>
          <div class="pack-title"><img src="${pack.icon}" alt="">Hypersweeper</div>
          <div class="grid">${grid}</div>
          <div class="apps">
            <span class="app on"><img src="${pack.icon}" alt=""></span>
            <span class="app"></span><span class="app"></span><span class="app"></span>
          </div>
        </div>`;

  const conversation =
    scene.drawer === "expanded"
      ? ""
      : `<div class="thread">
          <div class="when">Today 9:41</div>
          ${messages}
        </div>
        <div class="compose">
          <span class="plus">+</span>
          <span class="field">Message</span>
        </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${device.viewport.height}px; overflow: hidden; background: #fff; }
  body {
    display: flex; flex-direction: column;
    font-family: -apple-system, "SF Pro Text", Inter, system-ui, sans-serif;
    color: #000; -webkit-font-smoothing: antialiased;
  }
  .status {
    flex: none; height: ${Math.max(device.safeTop ?? 0, 24)}px; padding: 0 ${26 * u}px;
    display: flex; align-items: center; justify-content: space-between;
    font-weight: 600; font-size: ${((device.safeTop ?? 0) > 40 ? 17 : 14) * Math.min(u, 1.3)}px;
  }
  .status .battery {
    width: ${25 * u}px; height: ${12 * u}px; border-radius: ${3.5 * u}px;
    border: 1.5px solid rgba(0,0,0,0.4); padding: 1.5px;
  }
  .status .battery::after { content: ""; display: block; height: 100%; width: 80%; border-radius: 2px; background: #000; }
  .nav {
    flex: none; display: flex; flex-direction: column; align-items: center; gap: ${4 * u}px;
    padding: ${4 * u}px 0 ${10 * u}px; border-bottom: 0.5px solid rgba(0,0,0,0.12);
    background: rgba(249,249,249,0.94); position: relative;
  }
  .nav .back { position: absolute; left: ${14 * u}px; top: ${12 * u}px; color: #0a7cff; font-size: ${34 * u}px; line-height: 1; font-weight: 300; }
  .avatar {
    width: ${54 * u}px; height: ${54 * u}px; border-radius: 50%;
    background: linear-gradient(#a6abb6, #858a95); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: ${24 * u}px; font-weight: 500;
  }
  .name { font-size: ${12 * u}px; }
  .thread {
    flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;
    justify-content: flex-end; padding: ${8 * u}px ${14 * u}px;
  }
  .when { text-align: center; color: #8a8a8e; font-size: ${12 * u}px; margin-bottom: auto; padding-top: ${8 * u}px; }
  .row { display: flex; position: relative; margin-top: ${10 * u}px; }
  .row.out { justify-content: flex-end; }
  .row.stuck { padding-top: ${peel - 22 * u}px; }
  .row.alone { margin-top: ${6 * u}px; }
  .bubble {
    max-width: 72%; padding: ${8 * u}px ${14 * u}px; border-radius: ${19 * u}px;
    font-size: ${17 * u}px; line-height: 1.3; letter-spacing: -0.01em;
  }
  .in .bubble { background: #e9e9eb; }
  .out .bubble { background: #1b86f9; color: #fff; }
  .peel { width: ${peel}px; height: ${peel}px; }
  .stuck .peel { position: absolute; top: 0; }
  .in.stuck .peel { left: ${8 * u}px; }
  .out.stuck .peel { right: ${4 * u}px; }
  .compose {
    flex: none; display: flex; align-items: center; gap: ${10 * u}px;
    padding: ${8 * u}px ${12 * u}px ${scene.drawer === "none" ? 34 * u : 10 * u}px;
  }
  .plus {
    width: ${34 * u}px; height: ${34 * u}px; border-radius: 50%; background: #e9e9eb; color: #8a8a8e;
    display: flex; align-items: center; justify-content: center; font-size: ${26 * u}px; font-weight: 300;
  }
  .field {
    flex: 1; height: ${36 * u}px; border-radius: ${18 * u}px; border: 1px solid #c8c8cc;
    display: flex; align-items: center; padding: 0 ${14 * u}px; color: #a0a0a5; font-size: ${17 * u}px;
  }
  .drawer {
    flex: none; background: #f2f2f6; border-top: 0.5px solid rgba(0,0,0,0.12);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .drawer.open { height: ${Math.round(device.viewport.height * 0.44)}px; }
  .drawer.expanded { flex: 1; border-radius: ${12 * u}px ${12 * u}px 0 0; margin-top: ${8 * u}px; }
  .grabber { width: ${36 * u}px; height: ${5 * u}px; border-radius: 3px; background: #c7c7cc; margin: ${6 * u}px auto ${4 * u}px; }
  .pack-title {
    display: flex; align-items: center; gap: ${8 * u}px; padding: ${4 * u}px ${16 * u}px ${2 * u}px;
    font-weight: 600; font-size: ${15 * u}px;
  }
  .pack-title img { height: ${22 * u}px; border-radius: ${5 * u}px; }
  .grid {
    flex: 1; min-height: 0; overflow: hidden; display: grid;
    grid-template-columns: repeat(${slot.columns}, 1fr); align-content: start;
    gap: ${6 * u}px; padding: ${8 * u}px ${12 * u}px;
  }
  .cell { aspect-ratio: 1; display: flex; }
  .cell img { width: 100%; height: 100%; object-fit: contain; }
  .apps {
    flex: none; display: flex; gap: ${14 * u}px; justify-content: center; align-items: center;
    padding: ${8 * u}px 0 ${30 * u}px; border-top: 0.5px solid rgba(0,0,0,0.08);
  }
  .app { width: ${40 * u}px; height: ${30 * u}px; border-radius: ${8 * u}px; background: #dcdce1; overflow: hidden; }
  .app img { width: 100%; height: 100%; display: block; }
  .app.on { outline: ${2 * u}px solid #8e8e93; outline-offset: ${2 * u}px; }
  </style></head><body>
    <div class="status"><span>9:41</span><span class="battery"></span></div>
    <div class="nav"><span class="back">‹</span><div class="avatar">S</div><div class="name">Sam ›</div></div>
    ${conversation}
    ${drawer}
  </body></html>`;
}

async function messagesShot(
  browser: Browser,
  slot: MessagesSlot,
  scene: MessagesScene,
  pack: { stickers: PackSticker[]; icon: string },
  file: string,
): Promise<void> {
  const device = DEVICES.find((d) => d.key === slot.device)!;
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    hasTouch: device.touch,
  });
  const page = await context.newPage();
  await page.setContent(messagesPage(device, slot, scene, pack), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
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
      // A full run leaves no shot behind from an older list of scenes.
      if (!onlyShots) {
        const keep = new Set(SCENES.map((s) => `${s.name}.png`));
        for (const entry of readdirSync(outDir)) {
          if (/^\d\d-.*\.png$/.test(entry) && !keep.has(entry)) rmSync(path.join(outDir, entry));
        }
      }
      for (const scene of SCENES) {
        if (onlyShots && !onlyShots.includes(scene.name)) continue;
        await shoot(browser, device, scene, path.join(outDir, `${scene.name}.png`));
      }
    }
    for (const art of ART) {
      if (onlyDevices && !onlyDevices.includes(art.key)) continue;
      const outDir = path.join(outRoot, art.key);
      mkdirSync(outDir, { recursive: true });
      const file = path.join(outDir, art.file);
      await (art.key === "app-clip" ? clipCard(browser, art, file) : composeArt(browser, art, file));
    }
    const wantsMessages = MESSAGES_SLOTS.some((slot) => !onlyDevices || onlyDevices.includes(slot.key));
    const pack = wantsMessages ? readPack() : undefined;
    for (const slot of MESSAGES_SLOTS) {
      if (onlyDevices && !onlyDevices.includes(slot.key)) continue;
      const outDir = path.join(outRoot, slot.key);
      mkdirSync(outDir, { recursive: true });
      for (const scene of MESSAGES_SCENES) {
        if (onlyShots && !onlyShots.includes(scene.name)) continue;
        await messagesShot(browser, slot, scene, pack!, path.join(outDir, `${scene.name}.png`));
      }
    }
    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
