// Generate every app icon the game ships, from one vector source: the game's
// flat mine on a chamfered cell, on Sand's cream ground. Three cells — a
// pentagon (the default), a hexagon and an octagon — one per entry in
// `APP_ICONS` (src/appIcon.ts), which is also the list the App icon setting
// offers.
//
// The Apple icons are **Icon Composer documents** (`.icon`), which Xcode
// compiles for every platform at once — iPhone, iPad and the Mac Catalyst app
// get the same art, and the system draws the rounded square, the Liquid Glass
// edge, the shadows and the dark, tinted and clear renditions. So there is one
// framing of the cell for all of them, not an iOS one and a Mac one:
//
//   ios/App/App/AppIcon.icon           (the primary icon — the pentagon)
//   ios/App/App/AppIconHexagon.icon    (the alternate icons, by their
//   ios/App/App/AppIconOctagon.icon     `setAlternateIconName` names)
//
// Each document holds two layers this script draws — `Assets/cell.svg` and
// `Assets/mine.svg`, on a 1024 canvas — and an `icon.json` that says how Icon
// Composer composes them. That file is written only when it is missing: open
// the document in Icon Composer (Xcode › Open Developer Tool) to tune the glass,
// the shadows or the dark-mode fill, commit what it saves, and a re-run of this
// script redraws the art without undoing the tuning. Delete `icon.json` to get
// the seed back.
//
// Everything that is not an Apple icon — the web's PNGs, the Electron app's
// icon, the iOS launch image — is **exported from those documents** with
// `ictool` (Icon Composer's command-line half, shipped inside Xcode), so the
// web app on a Home Screen and the native one beside it wear the same
// rendering. Only the browser-tab favicons stay hand-composed SVG: at 16px the
// glass is noise, and a tab wants a vector.
//
//   web/public/favicon.svg                    (the pentagon's, for index.html)
//   web/public/icons/favicon-<key>.svg        (each icon's tab favicon)
//   web/public/icons/apple-touch-<key>.png    (180, full-bleed — iOS masks it;
//                                              also the picker's thumbnail)
//   web/public/apple-touch-icon.png           (the pentagon's, for index.html)
//   web/public/icons/icon-192.png, -512.png   (the rounded icon, transparent
//                                              corners — the PWA manifest)
//   web/public/icons/maskable-512.png         (full-bleed — Android masks it)
//   desktop/resources/icon.png                (macOS grid: the 824 icon on a
//                                              1024 transparent canvas)
//   ios/App/App/Assets.xcassets/Splash…       (the launch image)
//
// Two things here are quotations from the game rather than icon art, and should
// stay that way:
//
//   the cell colours  are the Sand theme's own shape colours: `iconHex` at
//                     Sand's icon tint (ui/theme.ts `SAND_ICONS`), so a
//                     pentagon icon is the olive a Sand menu row paints a
//                     pentagon, a hexagon its green, an octagon its teal. The
//                     ground is the theme's (data/ui/screens.json:
//                     themes.sand.background). The cell is drawn the way Sand
//                     draws one: a chamfered rim whose facets are shaded by
//                     where each faces the light, not a gradient.
//   the mine          is drawFlatMine() from render/glyphAtlas.ts, transcribed
//                     to SVG at the same proportions (everything is a multiple
//                     of the casing radius `r`): a filled disc, eight straight
//                     butt-capped spikes from 0.6r to 1.42r, one square glint
//                     at 0.3r.
//
// macOS only (it needs Xcode's ictool), and headless Chromium for compositing.
// Run from web/:  npm run icons
import { chromium, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ICONS, DEFAULT_APP_ICON, type AppIconSpec } from "../src/appIcon";
import { iconHex } from "../src/render/shapePalette";
import { theme } from "../src/ui/theme";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");
const DESKTOP = resolve(HERE, "../../desktop/resources");
const IOS_APP = resolve(HERE, "../../ios/App/App");
const SPLASH = join(IOS_APP, "Assets.xcassets/Splash.imageset");

const ICTOOL =
  process.env.ICTOOL ??
  "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool";
if (!existsSync(ICTOOL)) {
  throw new Error(
    `ictool not found at ${ICTOOL}. The icons are rendered by Icon Composer, which ships ` +
      "with Xcode 26 or later — run this on a Mac with Xcode, or point ICTOOL at the binary.",
  );
}

const n = (v: number): string => Number(v.toFixed(2)).toString();

// -- the palette -------------------------------------------------------------
const screens = JSON.parse(readFileSync(resolve(HERE, "../../data/ui/screens.json"), "utf8"));
const GROUND: string = screens.themes.sand.background; // #f5ead8
// The flat mine's two inks (render/glyphAtlas.ts → MINE_COLORS.flatCasing /
// .glint).
const INK = "#1f232b";
const GLINT = "#f4f1e8";
const SAND_TINT = theme("sand").icons?.tint;

const hex = (s: string): number[] => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return (
    "#" +
    x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")
  );
};

/** What a cell of `sides` is painted in under Sand: the menu's colour for that
 * shape, which is the board's hue at a weight that carries at icon size. */
function accent(sides: number): string {
  return iconHex({ sides, regularity: 1 }, "base", SAND_TINT);
}

// -- the cell ----------------------------------------------------------------
// On the 1024 canvas Icon Composer works in, whose full square the system masks.
// Every cell sits on a flat edge — a pentagon point up, a hexagon and an octagon
// flat-topped — with its bounding box centred, and every cell has the same
// *area*: the pentagon spans about 80% of the icon's width (its circumradius
// is 0.43 of the side), and the others are sized to cover as much of the icon
// as it does, so no choice reads as a smaller icon than another. That is as big
// as the cell gets with its corners still clear of the rounded-square mask; the
// Android maskable PNG, whose safe zone is a smaller circle, is shrunk to fit
// it at export (`MASKABLE`) rather than holding every other icon to it.
const SIZE = 1024;
const C = SIZE / 2;
const R5 = 440;
const AREA = (5 / 2) * R5 * R5 * Math.sin((2 * Math.PI) / 5);
const MINE_R = Math.round(R5 * 0.307); // the same mine on every cell
const LIGHT = [-0.64, -0.77]; // up and to the left

type Pt = [number, number];

interface Cell {
  outer: Pt[];
  inner: Pt[];
  /** The circumcentre, which the facets are shaded about. */
  origin: Pt;
  /** The top face's centre — where the mine sits. */
  centre: Pt;
  radius: number;
}

function cell(sides: number): Cell {
  const radius = Math.sqrt(AREA / ((sides / 2) * Math.sin((2 * Math.PI) / sides)));
  // Odd: a vertex straight up. Even: rotated half a step, so an edge is on top
  // and on the bottom.
  const start = -Math.PI / 2 + (sides % 2 === 0 ? Math.PI / sides : 0);
  const ring = (scale: number): Pt[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = start + (i * 2 * Math.PI) / sides;
      return [Math.cos(a) * radius * scale, Math.sin(a) * radius * scale];
    });
  const unit = ring(1);
  const ys = unit.map(([, y]) => y);
  const dy = C - (Math.min(...ys) + Math.max(...ys)) / 2;
  const place = (pts: Pt[], lift = 0): Pt[] => pts.map(([x, y]) => [C + x, dy + y - lift]);
  return {
    outer: place(unit),
    // The top face: inset, and lifted a hair so the lower facets read deeper.
    inner: place(ring(0.859), radius * 0.0136),
    origin: [C, dy],
    centre: [C, dy - radius * 0.0136],
    radius,
  };
}

/** How much the maskable PNG is shrunk so the default cell's farthest corner
 * lands on Android's safe circle (0.4 of the side) — never enlarged. */
const DEFAULT_SIDES = APP_ICONS.find((i) => i.key === DEFAULT_APP_ICON)!.sides;
const MASKABLE = Math.min(
  1,
  (0.4 * SIZE) / Math.max(...cell(DEFAULT_SIDES).outer.map(([x, y]) => Math.hypot(x - C, y - C))),
);

const points = (pts: Pt[]): string => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

/** The chamfered cell: an outer polygon, the top face inset from it, and the
 * quads between them shaded by how squarely each faces the light. Flat fills
 * throughout — no gradient, which is what keeps the relief legible at 32px. */
function cellArt(sides: number): string {
  const { outer, inner, origin } = cell(sides);
  const base = accent(sides);
  const lite = (t: number): string => mix(base, "#fff6e8", t);
  const dark = (t: number): string => mix(base, "#1d1a14", t);
  const [cx, cy] = origin;
  const facets = outer.map((p, k) => {
    const q = outer[(k + 1) % sides]!;
    const [mx, my] = [(p[0] + q[0]) / 2 - cx, (p[1] + q[1]) / 2 - cy];
    const len = Math.hypot(mx, my);
    const d = (mx / len) * LIGHT[0]! + (my / len) * LIGHT[1]!;
    const fill = d > 0 ? lite(0.16 + d * 0.62) : dark(0.1 - d * 0.46);
    return `<polygon points="${points([p, q, inner[(k + 1) % sides]!, inner[k]!])}" fill="${fill}"/>`;
  });
  return `
  <polygon points="${points(outer)}" fill="${base}"/>
  ${facets.join("\n  ")}
  <polygon points="${points(inner)}" fill="${lite(0.1)}"/>`;
}

/** drawFlatMine() in render/glyphAtlas.ts, in SVG: one ink, two primitives.
 * The spikes start inside the casing and are butt-capped, so disc and spikes
 * fuse into one silhouette with nothing to alias at 32px. */
function mineArt(sides: number): string {
  const [bx, by] = cell(sides).centre;
  const r = MINE_R;
  const spikes: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    spikes.push(
      `M${n(bx + ca * r * 0.6)} ${n(by + sa * r * 0.6)}` +
        `L${n(bx + ca * r * 1.42)} ${n(by + sa * r * 1.42)}`,
    );
  }
  return `
  <path d="${spikes.join(" ")}" fill="none" stroke="${INK}"
        stroke-width="${n(r * 0.2)}" stroke-linecap="butt"/>
  <circle cx="${n(bx)}" cy="${n(by)}" r="${n(r)}" fill="${INK}"/>
  <rect x="${n(bx - r * 0.52)}" y="${n(by - r * 0.52)}"
        width="${n(r * 0.3)}" height="${n(r * 0.3)}" fill="${GLINT}"/>`;
}

const svg = (body: string, extra = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${extra}${body}\n</svg>\n`;

// -- the Icon Composer documents ---------------------------------------------

/** `#rrggbb` as Icon Composer writes a colour. */
const srgb = (s: string): string =>
  "srgb:" + hex(s).map((v) => (v / 255).toFixed(5)).join(",") + ",1.00000";

/** The seed `icon.json`: the cream ground as the background fill, the mine in
 * front of the cell as two groups, so each casts its own shadow and the mine
 * stands off the cell rather than being printed on it. Glass and translucency
 * are left at the system's defaults — tune them in Icon Composer. */
function iconJson(): string {
  const group = (layer: string, shadow: string) => ({
    layers: [{ "image-name": `${layer}.svg`, name: layer }],
    shadow: { kind: shadow, opacity: 0.5 },
    translucency: { enabled: false, value: 0.5 },
  });
  return (
    JSON.stringify(
      {
        fill: { solid: srgb(GROUND) },
        groups: [group("mine", "neutral"), group("cell", "layer-color")],
        "supported-platforms": { circles: ["watchOS"], squares: "shared" },
      },
      null,
      2,
    ) + "\n"
  );
}

function writeDocument(spec: AppIconSpec): string {
  const doc = join(IOS_APP, `${spec.bundle}.icon`);
  mkdirSync(join(doc, "Assets"), { recursive: true });
  writeFileSync(join(doc, "Assets/cell.svg"), svg(cellArt(spec.sides)));
  writeFileSync(join(doc, "Assets/mine.svg"), svg(mineArt(spec.sides)));
  if (!existsSync(join(doc, "icon.json"))) writeFileSync(join(doc, "icon.json"), iconJson());
  return doc;
}

/** The document as iOS draws it, 1024², rounded corners transparent. */
function exportIcon(doc: string, out: string): void {
  execFileSync(ICTOOL, [
    doc,
    "--export-image",
    "--output-file",
    out,
    "--platform",
    "iOS",
    "--rendition",
    "Default",
    "--width",
    String(SIZE),
    "--height",
    String(SIZE),
    "--scale",
    "1",
  ]);
  if (!existsSync(out)) throw new Error(`ictool wrote nothing for ${doc}`);
}

// -- the favicon -------------------------------------------------------------
// Hand-composed rather than exported: a rounded plate with transparent corners
// and the hairline the theme draws its cards with, then the two layers. No
// glass and no shadow — at tab size both are mush.
const plate = (x: number, w: number, rx: number): string => `
  <rect x="${n(x)}" y="${n(x)}" width="${n(w)}" height="${n(w)}" rx="${n(rx)}" fill="${GROUND}"/>
  <rect x="${n(x + 4)}" y="${n(x + 4)}" width="${n(w - 8)}" height="${n(w - 8)}"
        rx="${n(rx - 4)}" fill="none" stroke="#2e2b25" stroke-opacity="0.12" stroke-width="6"/>`;

const faviconSvg = (sides: number): string =>
  svg(`${plate(52, 920, 224)}${cellArt(sides)}${mineArt(sides)}`);

// -- compositing -------------------------------------------------------------

/** Draw `png` (an exported icon) `inner` px wide, centred on a `size` canvas —
 * over `ground`, or over nothing. */
async function place(
  browser: Browser,
  png: string,
  size: number,
  inner: number,
  out: string,
  ground: string | null,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const data = readFileSync(png).toString("base64");
  const off = (size - inner) / 2;
  await page.setContent(
    `<!doctype html><meta charset="utf-8">
    <style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;
    background:${ground ?? "transparent"}}
    img{position:absolute;left:${off}px;top:${off}px;width:${inner}px;height:${inner}px}</style>
    <img src="data:image/png;base64,${data}">`,
    { waitUntil: "load" },
  );
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: ground === null });
  await page.close();
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const scratch = mkdtempSync(join(tmpdir(), "hypersweeper-icons-"));

try {
  for (const spec of APP_ICONS) {
    const doc = writeDocument(spec);
    const png = join(scratch, `${spec.key}.png`);
    exportIcon(doc, png);

    writeFileSync(join(PUBLIC, `icons/favicon-${spec.key}.svg`), faviconSvg(spec.sides));
    // Full-bleed: iOS masks a touch icon itself, so the rounded corners the
    // export left transparent are filled with the ground rather than black.
    await place(browser, png, 180, 180, join(PUBLIC, `icons/apple-touch-${spec.key}.png`), GROUND);

    if (spec.key !== DEFAULT_APP_ICON) continue;
    // What index.html and the manifest name — the default icon, which is what
    // a page shows before its script has read the setting.
    writeFileSync(join(PUBLIC, "favicon.svg"), faviconSvg(spec.sides));
    await place(browser, png, 180, 180, join(PUBLIC, "apple-touch-icon.png"), GROUND);
    await place(browser, png, 192, 192, join(PUBLIC, "icons/icon-192.png"), null);
    await place(browser, png, 512, 512, join(PUBLIC, "icons/icon-512.png"), null);
    // Android masks it anywhere down to the safe circle, so the cell's
    // corners are drawn inside that; the export's rounded corners, and the
    // margin around it, are the ground.
    await place(
      browser,
      png,
      512,
      Math.round(512 * MASKABLE),
      join(PUBLIC, "icons/maskable-512.png"),
      GROUND,
    );
    // The macOS grid: an app icon's rounded square is 824 of a 1024 canvas.
    // electron-builder renders the .icns from this, so it wants the full 1024.
    await place(browser, png, 1024, 824, join(DESKTOP, "icon.png"), null);
    // The iOS launch image. Deliberately *transparent*: LaunchScreen.storyboard
    // draws it over `systemBackgroundColor`, so an icon on nothing is right on
    // a light phone and a dark one, where a baked-in background would flash the
    // wrong colour half the time. It is shown scaleAspectFill in a square far
    // larger than any phone, so the icon is small enough to survive the crop.
    for (const name of [
      "splash-2732x2732.png",
      "splash-2732x2732-1.png",
      "splash-2732x2732-2.png",
    ]) {
      await place(browser, png, 2732, 688, join(SPLASH, name), null);
    }
  }
} finally {
  await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log("icons written to", PUBLIC + ",", DESKTOP, "and", IOS_APP);
