// Rep-tiles' icons: the favicon (SVG) and the PNGs the web manifest and iOS
// ask for, all drawn from one picture — a rep-tile. An equilateral triangle is
// four half-size copies of itself, which is what the game's name means; the
// four pieces take the game's tile colours (src/styles.css), on its page
// colour.
//
//   cd apps/reptiles && npm run icons
//
// Rasterised with Playwright's Chromium (already the repo's e2e browser), so
// the PNGs are the SVG exactly. Re-run after changing the picture, and commit
// what it writes into public/.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "../public");

const PAGE = "#f4f1ea";
const INK = "#2b2a27";
// src/styles.css: --tile-3, --tile-4, --tile-8, --tile-12 (fills).
const PIECES = ["#e07f72", "#e9a85a", "#5fb3aa", "#6e9fca"];

/** The icon as SVG on a 100×100 canvas. `maskable` keeps the triangle inside
 * the central 80% circle a launcher may crop to, and fills the whole square;
 * otherwise the square gets rounded corners and the triangle fills more of it. */
function svg(maskable: boolean): string {
  const side = maskable ? 58 : 76;
  const h = (side * Math.sqrt(3)) / 2;
  // Centred on the triangle's centroid, a third of the way up from its base.
  const cx = 50;
  const cy = 50 + h / 6;
  const top: [number, number] = [cx, cy - (2 * h) / 3];
  const left: [number, number] = [cx - side / 2, cy + h / 3];
  const right: [number, number] = [cx + side / 2, cy + h / 3];
  const mid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  const ab = mid(top, left);
  const bc = mid(left, right);
  const ca = mid(right, top);
  const tri = (pts: [number, number][], fill: string): string =>
    `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ")}" fill="${fill}"/>`;
  const stroke = maskable ? 2.2 : 2.8;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
    maskable
      ? `<rect width="100" height="100" fill="${PAGE}"/>`
      : `<rect width="100" height="100" rx="22" fill="${PAGE}"/>`,
    `<g stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round">`,
    tri([top, ab, ca], PIECES[0]!),
    tri([ab, left, bc], PIECES[1]!),
    tri([ca, bc, right], PIECES[2]!),
    tri([ab, bc, ca], PIECES[3]!),
    `</g>`,
    `</svg>`,
  ].join("");
}

writeFileSync(join(PUBLIC, "favicon.svg"), svg(false) + "\n");

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(file: string, size: number, maskable: boolean): Promise<void> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(maskable).replace(
      "<svg ",
      `<svg width="${size}" height="${size}" `,
    )}</body></html>`,
  );
  await page.screenshot({ path: join(PUBLIC, file), omitBackground: !maskable });
}
// iOS draws its own rounded mask over the touch icon, so it gets the
// full-bleed square, like the maskable one.
await png("apple-touch-icon.png", 180, true);
await png("icons/icon-192.png", 192, false);
await png("icons/icon-512.png", 512, false);
await png("icons/maskable-512.png", 512, true);
await browser.close();
console.log(`wrote favicon.svg and four PNGs to ${PUBLIC}`);
