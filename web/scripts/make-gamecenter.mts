// Write the Game Center achievement list and its badge images.
//
//   npm run gamecenter                     (the list and every image)
//   MANIFEST_ONLY=1 npm run gamecenter     (just the list; no browser needed)
//
// Writes ios/GameCenter/achievements.json (see scripts/gamecenter-lib.ts) and
// ios/GameCenter/images/<achievement id>.png, and deletes any image no
// achievement names any more. See "Game Center" in ios/README.md for what to do
// with them.
//
// An image is the achievement's own menu badge (`menuIcon`, the drawing the
// in-game list shows), in the default theme's palette, centred on that theme's
// cream ground — the same ground as the app icon. App Store Connect wants a
// 1024 px square in RGB, so the pixels are read off a canvas and written as a
// PNG with no alpha channel at all. The badge is kept well inside the square's
// inscribed circle, so a round crop loses none of it.
//
// Headless Chromium draws the SVG; PLAYWRIGHT_CHROMIUM_EXECUTABLE points it at
// a browser of your own.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

import { chromium } from "@playwright/test";

import { DEFAULT_THEME, theme } from "../src/ui/theme";
import { menuIcon, setIconPalette } from "../src/ui/icons";
import { GAME_CENTER_DIR, IMAGE_PX, MANIFEST_PATH, buildManifest, imagePath, manifestJson } from "./gamecenter-lib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const screens = JSON.parse(readFileSync(path.resolve(HERE, "../../data/ui/screens.json"), "utf8"));
const GROUND: string = screens.themes[DEFAULT_THEME].background;

/** How wide the badge's 100-unit box is drawn. A tile badge's corners reach
 * about 56 units from the centre (a square's), which this keeps at 437 px —
 * inside the 512 px circle. */
const BADGE_PX = 780;

function encodePng(rgba: Buffer, width: number, height: number): Buffer {
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

/** `menuIcon`'s markup as a standalone SVG document an <img> can load. */
function standalone(svg: string): string {
  return svg.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_PX}" height="${BADGE_PX}" `);
}

const manifest = buildManifest();
mkdirSync(path.join(GAME_CENTER_DIR, "images"), { recursive: true });
writeFileSync(MANIFEST_PATH, manifestJson());
console.log(`${path.relative(process.cwd(), MANIFEST_PATH)}: ${manifest.count} achievements, ${manifest.points} points`);

if (!process.env.MANIFEST_ONLY) {
  setIconPalette(theme(DEFAULT_THEME).icons);
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><meta charset=utf-8><body></body>");
    for (const a of manifest.achievements) {
      const svg = standalone(menuIcon(a.icon));
      const base64 = await page.evaluate(
        async ({ svg, size, badge, ground }) => {
          const img = new Image();
          img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = ground;
          ctx.fillRect(0, 0, size, size);
          const off = (size - badge) / 2;
          ctx.drawImage(img, off, off, badge, badge);
          const pixels = ctx.getImageData(0, 0, size, size).data;
          const url = await new Promise<string>((done) => {
            const reader = new FileReader();
            reader.onload = () => done(reader.result as string);
            reader.readAsDataURL(new Blob([pixels]));
          });
          return url.slice(url.indexOf(",") + 1);
        },
        { svg, size: IMAGE_PX, badge: BADGE_PX, ground: GROUND },
      );
      const png = encodePng(Buffer.from(base64, "base64"), IMAGE_PX, IMAGE_PX);
      writeFileSync(path.join(GAME_CENTER_DIR, imagePath(a.vendorIdentifier)), png);
    }
  } finally {
    await browser.close();
  }

  // An image no achievement names any more would only be confusing.
  const wanted = new Set(manifest.achievements.map((a) => path.basename(imagePath(a.vendorIdentifier))));
  const dir = path.join(GAME_CENTER_DIR, "images");
  for (const file of readdirSync(dir)) {
    if (!wanted.has(file) && existsSync(path.join(dir, file))) rmSync(path.join(dir, file));
  }
  console.log(`${path.relative(process.cwd(), dir)}: ${wanted.size} images`);
}
