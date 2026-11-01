// __TITLE__'s icons: the favicon (SVG), the PNGs the web manifest and iOS ask
// for, and the desktop app's (packaging/icon.png), all from one picture. The
// template draws a placeholder — seven hexagons, the middle one lit — in the
// game's colours (src/styles.css); replace `svg()` with your own picture.
//
//   npm run icons
//
// Rasterised with Playwright's Chromium (the repo's e2e browser), so the PNGs
// are the SVG exactly. Re-run after changing the picture, and commit what it
// writes into public/ and packaging/.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "../public");
const PACKAGING = join(HERE, "../packaging");

const PAGE = "#f4f2ee";
const CELL = "#e2ded5";
const LIT = "#e9b44c";
const INK = "#2a2926";

/** The icon on a 100×100 canvas. `maskable` keeps the picture inside the
 * central 80% circle a launcher may crop to and fills the square edge to
 * edge; otherwise the square gets rounded corners. */
function svg(maskable: boolean): string {
  const r = maskable ? 11 : 14; // a hexagon's circumradius
  const w = Math.sqrt(3) * r;
  const hex = (cx: number, cy: number, fill: string): string => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    });
    return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
  };
  const centres: [number, number][] = [
    [50, 50],
    [50 - w, 50],
    [50 + w, 50],
    [50 - w / 2, 50 - 1.5 * r],
    [50 + w / 2, 50 - 1.5 * r],
    [50 - w / 2, 50 + 1.5 * r],
    [50 + w / 2, 50 + 1.5 * r],
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
    maskable
      ? `<rect width="100" height="100" fill="${PAGE}"/>`
      : `<rect width="100" height="100" rx="22" fill="${PAGE}"/>`,
    `<g stroke="${INK}" stroke-width="${maskable ? 1.8 : 2.2}" stroke-linejoin="round">`,
    ...centres.map(([x, y], i) => hex(x, y, i === 0 ? LIT : CELL)),
    `</g>`,
    `</svg>`,
  ].join("");
}

mkdirSync(join(PUBLIC, "icons"), { recursive: true });
mkdirSync(PACKAGING, { recursive: true });
writeFileSync(join(PUBLIC, "favicon.svg"), svg(false) + "\n");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(file: string, size: number, maskable: boolean, inset = size): Promise<void> {
  await page.setViewportSize({ width: size, height: size });
  const picture = svg(maskable).replace("<svg ", `<svg width="${inset}" height="${inset}" `);
  await page.setContent(
    `<html><body style="margin:0;background:transparent;display:grid;place-items:center;height:${size}px">${picture}</body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: true });
}
// iOS draws its own rounded mask over the touch icon: the full-bleed square.
await png(join(PUBLIC, "apple-touch-icon.png"), 180, true);
await png(join(PUBLIC, "icons/icon-192.png"), 192, false);
await png(join(PUBLIC, "icons/icon-512.png"), 512, false);
await png(join(PUBLIC, "icons/maskable-512.png"), 512, true);
// The desktop app: macOS's grid, the rounded square at 824 px on a 1024 canvas.
await png(join(PACKAGING, "icon.png"), 1024, false, 824);
await browser.close();
console.log(`wrote the icons to ${PUBLIC} and ${PACKAGING}`);
