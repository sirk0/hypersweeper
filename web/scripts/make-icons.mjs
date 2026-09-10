// Generate the app icons for the TypeScript web app from a single vector
// source: the game's flat mine on a chamfered pentagon cell, on Sand's cream
// plate. The favicon ships as crisp SVG; the PWA/apple/desktop PNGs are
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
//   the plate + pentagon  are the Sand theme's ground and accent
//                         (data/ui/screens.json: themes.sand — #f5ead8 and
//                         #c67139). The cell is drawn the way Sand draws one:
//                         a chamfered rim whose five facets are shaded by
//                         where each faces the light, not a gradient.
//   the mine              is drawFlatMine() from render/glyphAtlas.ts,
//                         transcribed to SVG at the same proportions
//                         (everything is a multiple of the casing radius `r`):
//                         a filled disc, eight straight butt-capped spikes
//                         from 0.6r to 1.42r, one square glint at 0.3r.
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

// -- the palette -------------------------------------------------------------
// Sand (data/ui/screens.json → themes.sand), plus the flat mine's two inks
// (render/glyphAtlas.ts → MINE_COLORS.flatCasing / .glint).
const GROUND = "#f5ead8";
const ACCENT = "#c67139";
const INK = "#1f232b";
const GLINT = "#f4f1e8";

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)];
  return (
    "#" +
    x
      .map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"))
      .join("")
  );
};
const lite = (t) => mix(ACCENT, "#fff6e8", t);
const dark = (t) => mix(ACCENT, "#3a1c08", t);

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

/**
 * drawFlatMine() in render/glyphAtlas.ts, in SVG: one ink, two primitives.
 * The spikes start inside the casing and are butt-capped, so disc and spikes
 * fuse into one silhouette with nothing to alias at 32px.
 */
function mine(bx, by, r) {
  const spikes = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    spikes.push(
      `M${n(bx + ca * r * 0.6)} ${n(by + sa * r * 0.6)}` +
        `L${n(bx + ca * r * 1.42)} ${n(by + sa * r * 1.42)}`,
    );
  }
  return `
  <g>
    <path d="${spikes.join(" ")}" fill="none" stroke="${INK}"
          stroke-width="${n(r * 0.2)}" stroke-linecap="butt"/>
    <circle cx="${n(bx)}" cy="${n(by)}" r="${n(r)}" fill="${INK}"/>
    <rect x="${n(bx - r * 0.52)}" y="${n(by - r * 0.52)}"
          width="${n(r * 0.3)}" height="${n(r * 0.3)}" fill="${GLINT}"/>
  </g>`;
}

// The casing radius, and where it sits. The flat mine hangs nothing below it,
// so it is centred on the pentagon's own centre rather than lifted: 0.307 of
// the pentagon's circumradius, the ratio the mock uses.
const MINE_R = Math.round(R * 0.307); // 68
const MINE_Y = CY + R * 0.0545;

// -- the motif ---------------------------------------------------------------
// A pentagon cell with a chamfered rim: an outer pentagon, an inner top face
// inset from it, and the five quads between them shaded by how squarely each
// faces the light. Flat fills throughout — no gradient, which is what keeps the
// relief legible when the icon is 32 pixels wide.
const LIGHT = [-0.64, -0.77]; // up and to the left

function chamfer() {
  const outer = pentagon();
  const inner = pentagon(0.859).map(([x, y]) => [x, y - R * 0.0136]);
  const facets = outer.map((p, k) => {
    const q = outer[(k + 1) % 5];
    const [mx, my] = [(p[0] + q[0]) / 2 - CX, (p[1] + q[1]) / 2 - CY];
    const len = Math.hypot(mx, my);
    const d = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1];
    const fill = d > 0 ? lite(0.16 + d * 0.62) : dark(0.1 - d * 0.46);
    return `<polygon points="${points([p, q, inner[(k + 1) % 5], inner[k]])}"
             fill="${fill}"/>`;
  });
  return `
    <polygon points="${points(outer)}" fill="${ACCENT}" filter="url(#drop)"/>
    ${facets.join("\n    ")}
    <polygon points="${points(inner)}" fill="${lite(0.1)}"/>`;
}

const motif = `
  <g>
    ${chamfer()}
  </g>
  ${mine(CX, MINE_Y, MINE_R)}`;

const defs = `
  <defs>
    <filter id="drop" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="7" stdDeviation="9"
                    flood-color="#402310" flood-opacity="0.28"/>
    </filter>
  </defs>`;

// The plate: flat Sand cream. Light on purpose — the inverse of what this icon
// used to be. The terracotta cell is a mid tone, so it reads as a tile sitting
// on a page rather than needing a dark ground to lift it; the hairline is the
// theme's ink at 12% instead of white at 13%, since white is invisible here.
const plate = (x, y, w, rx) => `
  <rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(w)}" rx="${n(rx)}"
        fill="${GROUND}"/>
  <rect x="${n(x + 2)}" y="${n(y + 2)}" width="${n(w - 4)}" height="${n(w - 4)}"
        rx="${n(rx - 2)}" fill="none" stroke="#2e2b25" stroke-opacity="0.12"
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
  <rect width="512" height="512" fill="${GROUND}"/>
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
