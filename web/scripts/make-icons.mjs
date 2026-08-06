// Generate the app icons for the TypeScript web app from a single vector
// source: the game's own moored sea mine sitting on a pentagon cell, on a deep
// indigo plate. The favicon ships as crisp SVG; the PWA/apple/desktop PNGs are
// rasterised from the same vector via headless Chromium (so edges stay clean).
//
//   web/public/favicon.svg            (vector, rounded plate)
//   web/public/icons/icon-192.png
//   web/public/icons/icon-512.png
//   web/public/icons/maskable-512.png (full-bleed, safe-zone motif)
//   web/public/apple-touch-icon.png   (full-bleed, iOS masks it)
//   desktop/resources/icon.png        (macOS app icon, 1024, inset by its own
//                                      margin — macOS does not mask)
//   ios/App/App/Assets.xcassets/…     (the iPhone app icon, 1024 full-bleed —
//                                      iOS masks it — and the launch image)
//
// Two things here are quotations from the game rather than icon art, and should
// stay that way:
//
//   the pentagon's colour  is the one a five-sided cell is painted in
//                          (render/shapePalette.ts: hue follows side count, so
//                          a pentagon is that olive yellow on every board).
//                          The face's gradient is a narrow band either side of
//                          that colour — enough to read as lit from above,
//                          little enough that the tile is still plainly it —
//                          and the bevel wall is its dark variant.
//   the mine               is drawMine() from render/glyphAtlas.ts, transcribed
//                          to SVG at the same proportions (everything is a
//                          multiple of the casing radius `r`): eight Hertz
//                          horns, the lit iron casing, the bolt seam, the
//                          reflected light along the lower rim, the mooring
//                          ring, the specular.
//
// Run from web/:  node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../public");
const DESKTOP = resolve(HERE, "../../desktop/resources");
const IOS = resolve(HERE, "../../ios/App/App/Assets.xcassets");

const n = (v) => Number(v.toFixed(2)).toString();

// -- the pentagon ------------------------------------------------------------
// Point-up, and near enough edge to edge: the circumradius is set so the two
// side vertices leave the plate's straight edge ~21 units of margin at 512, and
// the whole figure is shifted down by (R - R·cos36°)/2 so its bounding box —
// not its circumcircle — is what sits centred on the canvas.
const R = 220;
const CX = 256;
const CY = 256 + R * (1 - Math.cos(Math.PI / 5)) / 2;

/** The five corners of a point-up regular pentagon, scaled about its centre. */
function pentagon(scale = 1) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [CX + Math.cos(a) * R * scale, CY + Math.sin(a) * R * scale];
  });
}

const points = (pts) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");

// -- the mine ----------------------------------------------------------------
// drawMine() in render/glyphAtlas.ts, in SVG. Its canvas arcs become path `A`
// commands; its focal radial gradient becomes an fr= radialGradient.

/** Point on a circle/ellipse at canvas parameter `t` (y grows downward). */
const on = (cx, cy, rx, ry, t) => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];

function mine(bx, by, r) {
  const horns = [];
  for (let k = 0; k < 8; k++) {
    // offset half a step, so none of them points straight down into the ring
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    horns.push(
      `M${n(bx + ca * r * 0.9)} ${n(by + sa * r * 0.9)}` +
        `L${n(bx + ca * r * 1.34)} ${n(by + sa * r * 1.34)}`,
    );
  }
  // the seam where the two halves of the casing bolt together: the lower half
  // of a flat ellipse, right corner round to left
  const seamA = on(bx, by + r * 0.12, r * 0.99, r * 0.3, Math.PI * 0.02);
  const seamB = on(bx, by + r * 0.12, r * 0.99, r * 0.3, Math.PI * 0.98);
  // reflected light along the lower rim
  const rimA = on(bx, by, r * 0.95, r * 0.95, Math.PI * 0.2);
  const rimB = on(bx, by, r * 0.95, r * 0.95, Math.PI * 0.7);
  return `
  <g>
    <path d="${horns.join(" ")}" fill="none" stroke="#4b5261"
          stroke-width="${n(r * 0.28)}" stroke-linecap="round"/>
    <path d="M${n(bx)} ${n(by + r * 0.9)}L${n(bx)} ${n(by + r * 1.2)}"
          fill="none" stroke="#3a3f4b" stroke-width="${n(r * 0.16)}"/>
    <circle cx="${n(bx)}" cy="${n(by + r * 1.42)}" r="${n(r * 0.24)}"
            fill="none" stroke="#3a3f4b" stroke-width="${n(r * 0.13)}"/>
    <circle cx="${n(bx)}" cy="${n(by)}" r="${n(r)}" fill="url(#shell)"/>
    <path d="M${n(seamA[0])} ${n(seamA[1])}A${n(r * 0.99)} ${n(r * 0.3)} 0 0 1 ${n(
      seamB[0],
    )} ${n(seamB[1])}" fill="none" stroke="#0c0e14" stroke-opacity="0.55"
          stroke-width="${n(r * 0.08)}"/>
    <path d="M${n(rimA[0])} ${n(rimA[1])}A${n(r * 0.95)} ${n(r * 0.95)} 0 0 1 ${n(
      rimB[0],
    )} ${n(rimB[1])}" fill="none" stroke="#96a0b4" stroke-opacity="0.3"
          stroke-width="${n(r * 0.05)}"/>
    <ellipse cx="${n(bx - r * 0.38)}" cy="${n(by - r * 0.36)}"
             rx="${n(r * 0.22)}" ry="${n(r * 0.15)}" fill="#ffffff"
             fill-opacity="0.85"
             transform="rotate(-40.1 ${n(bx - r * 0.38)} ${n(by - r * 0.36)})"/>
  </g>`;
}

// The casing radius, and where it sits. The mine hangs its mooring ring below
// the casing, so the assembly is centred on the pentagon by lifting the casing:
// what ends up centred is the span from the top horn to the bottom of the ring.
const MINE_R = 100;
const MINE_Y = CY - 15;

// -- the motif ---------------------------------------------------------------
// A pentagon cell, beveled the way a board tile is (an outer wall in the
// shape's dark tone, the face inset from it), carrying the mine.
const motif = `
  <g filter="url(#drop)">
    <polygon points="${points(pentagon())}" fill="#6f691c"
             stroke="#6f691c" stroke-width="6" stroke-linejoin="round"/>
    <polygon points="${points(pentagon(0.945))}" fill="url(#pent)"
             stroke-linejoin="round"/>
  </g>
  ${mine(CX, MINE_Y, MINE_R)}`;

const defs = `
  <defs>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#39406b"/><stop offset="1" stop-color="#151a2e"/>
    </linearGradient>
    <linearGradient id="pent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9d15c"/>
      <stop offset="0.5" stop-color="#c4bb41"/>
      <stop offset="1" stop-color="#a49b31"/>
    </linearGradient>
    <radialGradient id="shell" gradientUnits="userSpaceOnUse"
                    cx="${n(CX)}" cy="${n(MINE_Y)}" r="${n(MINE_R * 1.15)}"
                    fx="${n(CX - MINE_R * 0.35)}" fy="${n(MINE_Y - MINE_R * 0.4)}"
                    fr="${n(MINE_R * 0.1)}">
      <stop offset="0" stop-color="#5a616f"/>
      <stop offset="0.5" stop-color="#2c303a"/>
      <stop offset="1" stop-color="#141720"/>
    </radialGradient>
    <filter id="drop" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="7" stdDeviation="9"
                    flood-color="#05060d" flood-opacity="0.5"/>
    </filter>
  </defs>`;

// The plate: a deep indigo squircle, lit from the top, with a hairline of its
// own light along the upper edge. Dark on purpose — the pentagon's olive yellow
// is a light colour, and it needs a dark ground to read as a tile sitting on
// something rather than as a yellow blob.
const plate = (x, y, w, rx) => `
  <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(w)}" rx="${n(rx)}"
        fill="url(#plate)"/>
  <rect x="${n(x + 2)}" y="${n(y + 2)}" width="${n(w - 4)}" height="${n(w - 4)}"
        rx="${n(rx - 2)}" fill="none" stroke="#ffffff" stroke-opacity="0.13"
        stroke-width="3"/>`;

// Rounded plate with transparent corners — the browser-tab favicon and the
// standard (non-maskable) install icons.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}
  ${plate(26, 26, 460, 112)}
  ${motif}
</svg>`;

// Full-bleed plate with the motif shrunk into the central safe zone — maskable
// and apple-touch, where the platform applies its own rounded mask.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}
  <rect width="512" height="512" fill="url(#plate)"/>
  <g transform="translate(256 256) scale(0.8) translate(-256 -256)">${motif}</g>
</svg>`;

// The macOS app icon. macOS applies no mask of its own — an icon draws its own
// rounded square, inside the margin the platform grid leaves it: the large
// squircle fills 824 of a 1024 canvas, i.e. 80% of the side. The favicon's
// plate is 460 of 512 (90%), so it is scaled by 0.89 about the centre to land
// there; corners stay transparent, as the dock and Finder expect.
const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}
  <g transform="translate(256 256) scale(0.89) translate(-256 -256)">
    ${plate(26, 26, 460, 112)}
    ${motif}
  </g>
</svg>`;

// The iOS launch image. Deliberately *transparent*: LaunchScreen.storyboard
// draws it over `systemBackgroundColor`, so a motif on nothing is white on a
// light phone and black on a dark one, while a baked-in background would flash
// the wrong colour half the time. It is shown scaleAspectFill in a square far
// larger than any phone, so the plate is small enough to survive the crop.
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}
  <g transform="translate(256 256) scale(0.28) translate(-256 -256)">
    ${plate(26, 26, 460, 112)}
    ${motif}
  </g>
</svg>`;

async function render(browser, svg, size, out, transparent) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const html = `<!doctype html><meta charset="utf-8">
    <style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}
    svg{width:${size}px;height:${size}px;display:block}</style>${svg}`;
  await page.setContent(html, { waitUntil: "load" });
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
}

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
const browser = await chromium.launch(
  executablePath ? { executablePath } : {},
);

writeFileSync(`${PUBLIC}/favicon.svg`, faviconSvg.trim() + "\n");
await render(browser, faviconSvg, 192, `${PUBLIC}/icons/icon-192.png`, true);
await render(browser, faviconSvg, 512, `${PUBLIC}/icons/icon-512.png`, true);
await render(browser, maskableSvg, 512, `${PUBLIC}/icons/maskable-512.png`, false);
await render(browser, maskableSvg, 180, `${PUBLIC}/apple-touch-icon.png`, false);
// electron-builder renders the .icns from this, so it wants the full 1024.
await render(browser, macSvg, 1024, `${DESKTOP}/icon.png`, true);
// iOS: one 1024 icon for the whole size ladder (Xcode derives the rest), and
// the launch image at the 2732 the asset catalogue's three scales all share.
await render(
  browser,
  maskableSvg,
  1024,
  `${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`,
  false,
);
for (const name of [
  "splash-2732x2732.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732-2.png",
]) {
  await render(browser, splashSvg, 2732, `${IOS}/Splash.imageset/${name}`, true);
}
await browser.close();
console.log("icons written to", PUBLIC + ",", DESKTOP, "and", IOS);
