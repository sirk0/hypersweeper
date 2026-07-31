// Menu icons, as inline SVG in a 0..100 box (the pygame menu's `d`, so the
// coordinate expressions below still read like the `_render_icon` shapes they
// grew out of; its stroke widths are given in a 352-unit supersampled space and
// scaled here by `sw`).
//
// Where an icon stands for something the app can already build, it is drawn
// from that thing rather than approximated: a tiling row shows a patch of the
// real tiling, a sphere row the real solid projected, a surface row the real
// immersion meshed and shaded, the two frames and the stepped bipyramid the
// real 3D board. What is left hand-drawn is only what has no geometry to read
// or reads better as a symbol — the question mark, the shaped flat boards, the
// cube, the cube frame and the tetrahedron.

import {
  iconHex,
  shapeMetrics,
  type IconVariant,
  type ShapeTone,
} from "../render/shapePalette";
import { ARCH_TILINGS, archTemplate } from "../boards/tilings";
import { placePoint, repPlacements, REP_TILES } from "../boards/fractal";
import {
  c80Board,
  c180Board,
  rhombicosidodecahedronBoard,
  snubDodecahedronBoard,
  sphereBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  tetrahedronFrameBoard,
  truncatedIcosidodecahedronBoard,
} from "../boards/solids";
import type { Board3D } from "../boards/core";

const D = 100;
const C = D / 2;

// Icons are painted in the board's shape colours (render/shapePalette.ts): the
// hue and regularity of the polygon being drawn, at the icon set's own
// saturation, so a triangle is the same red in the menu as on the board. A
// call names a *variant* — base / light / dark / outline — rather than a
// colour, and the shape supplies the hue.
//
// Where the art is not a tile (the question mark, the surface tubes, the
// frames, hairlines) a `null` tone falls back to the original indigo from
// gui.py: a mid indigo, a lighter and a darker shade, and a soft same-hue
// hairline outline.
const PLAIN: Record<IconVariant, string> = {
  base: "#6366f1",
  light: "#9fa6fc",
  dark: "#4338ca",
  outline: "#4f52c2",
};

const BASE: IconVariant = "base";
const LIGHT: IconVariant = "light";
const DARK: IconVariant = "dark";

/** The colour a variant paints `tone` in; `null` is the non-tile chrome. */
function tint(variant: IconVariant, tone: ShapeTone | null): string {
  return tone ? iconHex(tone, variant) : PLAIN[variant];
}

/** A tone argument left off means "read it off the polygon being drawn"; an
 * explicit `null` means the plain chrome. */
function toneOf(points: P[], tone: ShapeTone | null | undefined): ShapeTone | null {
  return tone === undefined ? shapeMetrics(points) : tone;
}

/** Corner radius the flat glyphs round their corners by (gui.py _ICON_CORNER). */
const CORNER = D * 0.03;

type P = [number, number];

/** A pygame stroke width (in its 352-unit render space) in icon units. */
function sw(width: number): number {
  return (width * D) / 352;
}

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

function ngon(cx: number, cy: number, r: number, sides: number, rotation = 0): P[] {
  const pts: P[] = [];
  for (let k = 0; k < sides; k++) {
    const a = ((360 / sides) * k + rotation) * (Math.PI / 180);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function hexagon(cx: number, cy: number, r: number, rotation = 30): P[] {
  return ngon(cx, cy, r, 6, rotation);
}

function lerp(a: P, b: P, t: number): P {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** A closed polygon with every corner tucked back into a short quadratic arc
 * (gui.py _round_corners), as an SVG path. */
function roundedPath(points: P[], radius = CORNER): string {
  const len = points.length;
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    const prev = points[(i - 1 + len) % len]!;
    const cur = points[i]!;
    const next = points[(i + 1) % len]!;
    const toward = (nb: P): P => {
      const [vx, vy] = [nb[0] - cur[0], nb[1] - cur[1]];
      const dist = Math.hypot(vx, vy) || 1;
      const r = Math.min(radius, dist / 2);
      return [cur[0] + (vx / dist) * r, cur[1] + (vy / dist) * r];
    };
    const a = toward(prev);
    const b = toward(next);
    parts.push(`${i === 0 ? "M" : "L"}${n(a[0])} ${n(a[1])}`);
    parts.push(`Q${n(cur[0])} ${n(cur[1])} ${n(b[0])} ${n(b[1])}`);
  }
  return `${parts.join("")}Z`;
}

/** A filled, hairline-outlined glyph shape (gui.py _icon_shape); `width` 0
 * fills without an outline. The colour comes from the polygon itself unless
 * `tone` overrides it (art that does not draw its board's actual cell). */
function shape(
  points: P[],
  variant: IconVariant = BASE,
  width = 4,
  tone?: ShapeTone | null,
  radius = CORNER,
): string {
  const t = toneOf(points, tone);
  const stroke =
    width > 0
      ? ` stroke="${tint("outline", t)}" stroke-width="${n(
          sw(Math.max(2, width - 1)),
        )}" stroke-linejoin="round"`
      : "";
  return `<path d="${roundedPath(points, radius)}" fill="${tint(variant, t)}"${stroke}/>`;
}

/** A polygon with an inner polygon punched out of it (pygame erases the hole
 * with a transparent fill); even-odd makes the hole show the background. */
function holed(
  outer: P[],
  inner: P[],
  variant: IconVariant = BASE,
  width = 4,
  tone?: ShapeTone | null,
): string {
  const t = toneOf(outer, tone);
  return `<path d="${roundedPath(outer)}${roundedPath(
    inner,
  )}" fill="${tint(variant, t)}" fill-rule="evenodd" stroke="${tint(
    "outline",
    t,
  )}" stroke-width="${n(sw(Math.max(2, width - 1)))}" stroke-linejoin="round"/>`;
}

function line(a: P, b: P, variant: IconVariant = DARK, width = 3, tone: ShapeTone | null = null): string {
  return `<path d="M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}" stroke="${tint(
    variant,
    tone,
  )}" stroke-width="${n(sw(width))}" stroke-linecap="round" fill="none"/>`;
}

function circle(
  cx: number,
  cy: number,
  r: number,
  tone: ShapeTone | null = null,
  width = 4,
  variant: IconVariant = BASE,
): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${tint(
    variant,
    tone,
  )}" stroke="${tint(DARK, tone)}" stroke-width="${n(sw(width))}"/>`;
}

/** Blend two #rrggbb colours. Straight sRGB: these are shading tweaks around a
 * colour the palette already chose, not new hues. */
function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ra, ga, ba] = parse(a) as [number, number, number];
  const [rb, gb, bb] = parse(b) as [number, number, number];
  const byte = (x: number, y: number): string =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(ra, rb)}${byte(ga, gb)}${byte(ba, bb)}`;
}

/** Deeper into shadow — for surfaces the palette has no variant for: the inside
 * of a bored-out frame, the far side of a curved surface. */
function darker(hex: string, t: number): string {
  return mixHex(hex, "#111226", t);
}

/** A polygon in an explicit colour (the shading helpers above), outside the
 * variant vocabulary `shape` speaks. */
function poly(points: P[], fill: string, radius = CORNER, stroke = fill): string {
  return `<path d="${roundedPath(points, radius)}" fill="${fill}" stroke="${stroke}" stroke-width="${n(
    sw(1.2),
  )}" stroke-linejoin="round"/>`;
}

// -- real tiling patches -----------------------------------------------------
//
// The uniform and dual-uniform icons are not hand-drawn approximations: they
// are a patch of the actual tiling, lifted from the same `_ArchTemplate` the
// boards are built from. So every tile has its true shape, its true size
// relative to its neighbours (a Laves kite really is that kite), its true
// colour — `shape()` reads the tone off the polygon, exactly as the board does
// — and, since the tiles come out of one tiling, they meet edge to edge instead
// of floating apart.
//
// Which figure is cut out of the tiling — a tile with its ring of neighbours,
// or the rosette of tiles round one vertex — is per family; see PATCH_STYLE.

interface Tile {
  /** the template's cell-name stem — "sq", "tri", "hex", ... */
  kind: string;
  pts: P[];
  centre: P;
}

function centroid(pts: P[]): P {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** Every tile of a periodic tiling across a 5x5 block of fundamental domains,
 * in the template's own coordinates. */
function tilingTiles(key: string): Tile[] {
  const t = archTemplate(key);
  const tiles: Tile[] = [];
  for (let m = -2; m <= 2; m++) {
    for (let n = -2; n <= 2; n++) {
      for (const cell of t.cells) {
        const pts: P[] = cell.refs.map((r) => {
          const v = t.verts.get(r.tag)!;
          return [v[0] + (r.dm + m) * t.width, v[1] + (r.dn + n) * t.height];
        });
        tiles.push({ kind: cell.name.replace(/\d+$/, ""), pts, centre: centroid(pts) });
      }
    }
  }
  return tiles;
}

const vkey = (p: P): string => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`;

/** The tiles meeting at one vertex, ordered around it. `degree` picks which
 * kind of vertex (a Laves tiling has several); the default is the busiest one,
 * which is the only kind a uniform tiling has. */
function rosette(key: string, degree?: number): Tile[] {
  const tiles = tilingTiles(key);
  const t = archTemplate(key);
  const at = new Map<string, number[]>();
  const pos = new Map<string, P>();
  tiles.forEach((tile, i) => {
    for (const p of tile.pts) {
      const k = vkey(p);
      pos.set(k, p);
      const group = at.get(k);
      if (group) group.push(i);
      else at.set(k, [i]);
    }
  });
  // Only vertices well inside the generated block have all their tiles.
  const home: P = [t.width / 2, t.height / 2];
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [k, ids] of at) {
    const p = pos.get(k)!;
    if (Math.abs(p[0] - home[0]) > t.width || Math.abs(p[1] - home[1]) > t.height) continue;
    if (degree !== undefined && ids.length !== degree) continue;
    // busiest vertex first, then the one nearest the middle of the block
    const score = ids.length * 1e3 - Math.hypot(p[0] - home[0], p[1] - home[1]);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best === null) return [];
  const hub = pos.get(best)!;
  return at
    .get(best)!
    .map((i) => tiles[i]!)
    .sort(
      (a, b) =>
        Math.atan2(a.centre[1] - hub[1], a.centre[0] - hub[0]) -
        Math.atan2(b.centre[1] - hub[1], b.centre[0] - hub[0]),
    );
}

/** One tile of the tiling with the whole ring of tiles touching it — the patch
 * a board is built out of, centred the way `archimedeanBoard` centres its
 * window: on the tiling's biggest tile. */
function tileRing(key: string): Tile[] {
  const tiles = tilingTiles(key);
  const t = archTemplate(key);
  const home: P = [t.width / 2, t.height / 2];
  const inside = tiles.filter(
    (tile) =>
      Math.abs(tile.centre[0] - home[0]) <= t.width &&
      Math.abs(tile.centre[1] - home[1]) <= t.height,
  );
  let hub = inside[0]!;
  for (const tile of inside) {
    const better =
      tile.pts.length - hub.pts.length ||
      Math.hypot(hub.centre[0] - home[0], hub.centre[1] - home[1]) -
        Math.hypot(tile.centre[0] - home[0], tile.centre[1] - home[1]);
    if (better > 0) hub = tile;
  }
  const corners = new Set(hub.pts.map(vkey));
  const ring = tiles.filter(
    (tile) => tile !== hub && tile.pts.some((p) => corners.has(vkey(p))),
  );
  ring.sort(
    (a, b) =>
      Math.atan2(a.centre[1] - hub.centre[1], a.centre[0] - hub.centre[0]) -
      Math.atan2(b.centre[1] - hub.centre[1], b.centre[0] - hub.centre[0]),
  );
  return [hub, ...ring];
}

/** A whole-periods block of the tiling — its repeat unit, repeated until the
 * patch holds at least `MIN_DOMAIN_TILES` tiles. For a bond of congruent
 * rectangles that is the picture: a vertex figure there is two or three bricks
 * (an L or a plus sign) and a tile ring barely more, while a block of periods
 * shows the whole stagger the bond is named for. A domain's cells are
 * normalised to sit in copy (0, 0), so this is exactly whole periods — the
 * patch tiles a rectangle and fills the icon box. */
const MIN_DOMAIN_TILES = 6;

function domainPatch(key: string): Tile[] {
  const t = archTemplate(key);
  // enough copies for a patch that reads as a pattern: one domain for the
  // weaves and the herringbone (eight and twelve bricks), a block of them for
  // the stacked and running bonds (one and two)
  const copies = Math.max(1, Math.ceil(Math.sqrt(MIN_DOMAIN_TILES / t.cells.length)));
  const tiles: Tile[] = [];
  for (let m = 0; m < copies; m++) {
    for (let n = 0; n < copies; n++) {
      for (const cell of t.cells) {
        const pts: P[] = cell.refs.map((r) => {
          const v = t.verts.get(r.tag)!;
          return [v[0] + (r.dm + m) * t.width, v[1] + (r.dn + n) * t.height];
        });
        tiles.push({ kind: cell.name.replace(/\d+$/, ""), pts, centre: centroid(pts) });
      }
    }
  }
  return tiles;
}

/** Scale a patch into the icon box (y flipped — tilings are y-up, SVG y-down). */
function fitTiles(tiles: Tile[], box = D * 0.9): Tile[] {
  const xs = tiles.flatMap((t) => t.pts.map((p) => p[0]));
  const ys = tiles.flatMap((t) => t.pts.map((p) => p[1]));
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = box / Math.max(maxX - minX, maxY - minY, 1e-9);
  const ox = (D - (maxX - minX) * scale) / 2;
  const oy = (D - (maxY - minY) * scale) / 2;
  const place = (p: P): P => [ox + (p[0] - minX) * scale, oy + (maxY - p[1]) * scale];
  return tiles.map((t) => ({ ...t, pts: t.pts.map(place), centre: place(t.centre) }));
}

/** Neighbouring tiles of the same shape are drawn a shade apart, so a rosette
 * of six identical pentagons still reads as six tiles; different shapes are
 * already different hues and all stay on the base tone. */
function patchSvg(tiles: Tile[]): string[] {
  const counts = new Map<string, number>();
  for (const t of tiles) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const seen = new Map<string, number>();
  const cycle: IconVariant[] = [BASE, LIGHT, DARK];
  // Corners are rounded in proportion to the tiles, not to the icon box, so a
  // twelve-triangle rosette does not dissolve into blobs.
  const span = Math.min(
    ...tiles.map((t) => {
      const xs = t.pts.map((p) => p[0]);
      const ys = t.pts.map((p) => p[1]);
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }),
  );
  const radius = Math.min(CORNER, span * 0.12);
  return tiles.map((t) => {
    const i = seen.get(t.kind) ?? 0;
    seen.set(t.kind, i + 1);
    const count = counts.get(t.kind)!;
    // Three of a kind get three shades — that is what makes rhombille read as
    // a tumbling block and triakis as a solid corner; any other count just
    // alternates, so no tile lands on the muddy dark end of its hue.
    const variant = count === 1 ? BASE : count === 3 ? cycle[i % 3]! : i % 2 ? LIGHT : BASE;
    return shape(t.pts, variant, 4, undefined, radius);
  });
}

/** Which vertex of a Laves tiling its icon is built around, where the busiest
 * one is not the clearest picture: a triakis triangle reads as one triangle cut
 * in three, a tetrakis square as one square cut by its diagonals, and rhombille
 * as the three-rhombus "tumbling block" — the figures those tilings are known
 * by. Everything else takes the busiest vertex (the only kind a uniform tiling
 * has, and the fullest rosette a Laves one offers). */
const ROSETTE_DEGREE: Record<string, number> = {
  triakis: 3,
  tetrakis: 4,
  rhombille: 3,
};

/** The icons whose patch is not the plain vertex rosette. */
const PATCH_PICK: Record<string, (tiles: Tile[]) => Tile[]> = {
  // Elongated triangular: the two squares of one row with the triangle that
  // stands on each — the rosette's middle (downward) triangle would only make
  // the figure lopsided.
  elongated: (tiles) => {
    const squares = tiles.filter((t) => t.kind === "sq");
    const tris = tiles.filter((t) => t.kind === "tri");
    tris.sort((a, b) => a.centre[0] - b.centre[0]);
    return [...squares, tris[0]!, tris[tris.length - 1]!];
  },
};

type PatchStyle = "ring" | "rosette" | "domain";

// The tilings drawn as a tile with the ring of tiles round it rather than as a
// vertex rosette (see styleFor): everything but the face-transitive Laves
// duals, whose rosette is the compact figure they are known by. A rectangle
// bond's rosette is only two or three bricks — an L or a plus sign — while its
// ring shows the stagger the bond is named for.
const RING_PATCH = new Set(ARCH_TILINGS.filter((t) => t.family !== "dual").map((t) => t.key));
const ARCH_KEYS = new Set(ARCH_TILINGS.map((t) => t.key));

/** Which figure a tiling's icon is cut from. A *uniform* tiling is drawn as one
 * tile with the ring of tiles touching it — its rosette holds only three or
 * four tiles, and a pair of octagons or dodecagons filling the box reads as a
 * pair of circles. A *Laves* tiling is drawn as the rosette, which for a
 * face-transitive tiling closes into the compact symmetric disc it is known by:
 * a square cut by its diagonals, three rhombi as a tumbling block, six florets
 * pinwheeling round a point.
 *
 * A *rectangle bond* is drawn as one fundamental domain — see domainPatch.
 *
 * The exception is elongated triangular, whose icon is picked out of the
 * rosette by hand (see PATCH_PICK). */
const PATCH_STYLE: Record<string, PatchStyle> = {
  elongated: "rosette",
  // The isogonal tilings are about what happens *at a vertex* — two corners
  // and an edge running straight past them — so they are drawn as the rosette,
  // where that T-junction is the whole picture. A ring of running-bond squares
  // is just a plus sign.
  // Three-scale triangular is the exception: its rosette is three triangles of
  // nearly the same size, while the ring shows the run of sizes it is named for.
  offsetsquare: "rosette",
  staggeredtri: "rosette",
  pythagorean: "rosette",
  // The rectangle bonds are about the stagger of a whole course of bricks, so
  // they are drawn as one repeat unit of the pattern.
  ...Object.fromEntries(
    ARCH_TILINGS.filter((t) => t.family === "rectangle").map((t) => [t.key, "domain" as const]),
  ),
};

function styleFor(key: string): PatchStyle {
  return PATCH_STYLE[key] ?? (RING_PATCH.has(key) ? "ring" : "rosette");
}

/** Patches drawn the other way up, so the icon points the way the tiling is
 * usually pictured. */
const PATCH_FLIP = new Set(["triakis"]);

function tilingPatch(key: string, style: PatchStyle = styleFor(key)): string[] {
  let picked =
    style === "ring"
      ? tileRing(key)
      : style === "domain"
        ? domainPatch(key)
        : rosette(key, ROSETTE_DEGREE[key]);
  const pick = PATCH_PICK[key];
  if (pick) picked = pick(picked);
  if (PATCH_FLIP.has(key)) {
    const flip = (p: P): P => [-p[0], -p[1]];
    picked = picked.map((t) => ({ ...t, pts: t.pts.map(flip), centre: flip(t.centre) }));
  }
  return patchSvg(fitTiles(picked));
}

// -- real solids -------------------------------------------------------------
//
// The sphere-family icons are the actual boards seen head-on: every closed 3D
// board is built, its front faces projected orthographically and painted in
// their own shape colours. So the C80 icon really is a fullerene's hexagons and
// pentagons and the snub dodecahedron really is its twelve pentagons among
// eighty triangles — detail no hand-drawn badge carries.

type V3 = readonly [number, number, number];

// Built at the easy preset's parameters (data/presets.json), so an icon has as
// many cells as the board a tap on that row opens.
const SOLID_BUILDERS: Record<string, () => Board3D> = {
  sphere: () => sphereBoard(0),
  snubdodec: () => snubDodecahedronBoard(0),
  c80: () => c80Board(0),
  c180: () => c180Board(0),
  spheretri: () => sphereTriangleBoard(0),
  rhombicosidodeca: () => rhombicosidodecahedronBoard(0),
  truncicosidodeca: () => truncatedIcosidodecahedronBoard(0),
  tetraframe: () => tetrahedronFrameBoard(0, 2),
  steppedbipyramid: () => steppedBipyramidBoard(7, 4, 0),
};

/** How each solid is turned before projecting, in degrees about x then y —
 * chosen so the face the board is named for sits in the middle of the icon. */
const SOLID_VIEW: Record<string, [number, number] | [number, number, number]> = {
  sphere: [-18, 12],
  snubdodec: [-14, 20],
  c80: [-20, 10],
  c180: [-20, 10],
  spheretri: [-10, 18],
  rhombicosidodeca: [-16, 15],
  truncicosidodeca: [-16, 15],
  // Seen from just above the equator: from any higher the widest terrace hides
  // the whole lower pyramid, and the icon stops being a bipyramid at all.
  steppedbipyramid: [-85, 0, 28],
  tetraframe: [-50, 18, 45],
};

const solidCache = new Map<string, Board3D>();

function solidBoard(key: string): Board3D {
  let board = solidCache.get(key);
  if (!board) solidCache.set(key, (board = SOLID_BUILDERS[key]!()));
  return board;
}

/** Spin about z, then pitch about x, then yaw about y. The spin comes first so
 * a board with an axis of its own — the bipyramid stacks along z, the
 * Sierpinski tetrahedron stands on a z-diagonal — can be turned about that axis
 * before it is tipped toward the viewer. */
function rotate(p: V3, rx: number, ry: number, rz = 0): V3 {
  const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
  const [x0, y0] = [p[0] * cz - p[1] * sz, p[0] * sz + p[1] * cz];
  const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
  const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
  const y = y0 * cx - p[2] * sx;
  const z1 = y0 * sx + p[2] * cx;
  return [x0 * cy + z1 * sy, y, -x0 * sy + z1 * cy];
}

/**
 * The visible half of a 3D board, as icon-space polygons: every cell shaded by
 * how squarely it faces the viewer — the same cue that makes the board's 3D
 * modes read as solid — and inset a little so the tiles show their seams, as
 * the board's grout does.
 *
 * Which face is visible is decided one of two ways. A **round** board (every
 * sphere-family solid) is convex about the origin, so a cell faces the viewer
 * exactly when its centroid does — cheap, and immune to how the builder wound
 * its polygons. A **blocky** board (the frames, the stepped bipyramid) is not:
 * a tunnel wall or the underside of an overhang points away from its own
 * centroid direction. Those take the polygon's own normal, which the builders
 * wind outward for the renderer's back-face culling, and are painted back to
 * front so a near tile covers the far one behind it.
 */
function solidFaces(key: string, kind: "round" | "blocky" = "round"): string[] {
  const board = solidBoard(key);
  const [rxDeg, ryDeg, rzDeg = 0] = SOLID_VIEW[key] ?? [-18, 15];
  const rad = Math.PI / 180;
  const [rx, ry, rz] = [rxDeg * rad, ryDeg * rad, rzDeg * rad];
  const faces: { pts: P[]; depth: number; facing: number; tone: ShapeTone }[] = [];
  const box: number[][] = [];
  for (const poly of board.polygons.values()) {
    const spun = poly.map((v) => rotate(v as V3, rx, ry, rz));
    const mid: V3 = [
      spun.reduce((s, v) => s + v[0], 0) / spun.length,
      spun.reduce((s, v) => s + v[1], 0) / spun.length,
      spun.reduce((s, v) => s + v[2], 0) / spun.length,
    ];
    box.push(...spun.map((v) => [v[0], v[1]]));
    let facing: number;
    if (kind === "round") {
      facing = mid[2] / (Math.hypot(mid[0], mid[1], mid[2]) || 1);
    } else {
      const [a, b, c] = [spun[0]!, spun[1]!, spun[2]!];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      facing = nz / (Math.hypot(nx, ny, nz) || 1);
    }
    if (facing <= 0.06) continue; // back-facing, and the rim it would alias with
    // Blocky boards have far more, far smaller cells than a sphere's, so their
    // seams are cut thinner or the tiles dissolve into speckle.
    const inset = kind === "round" ? 0.9 : 0.94;
    faces.push({
      pts: spun.map((v) => [mid[0] + (v[0] - mid[0]) * inset, mid[1] + (v[1] - mid[1]) * inset]),
      depth: mid[2],
      facing,
      tone: shapeMetrics(poly),
    });
  }
  // Fit the silhouette rather than the bounding sphere, so a solid that is not
  // round (a bipyramid, a frame) still fills the icon box.
  const span = (k: 0 | 1): number =>
    Math.max(...box.map((p) => p[k]!)) - Math.min(...box.map((p) => p[k]!));
  const scale = (D * 0.92) / Math.max(span(0), span(1));
  faces.sort((f, g) => f.depth - g.depth);
  return faces.map((f) =>
    shape(
      f.pts.map(([x, y]) => [C + x * scale, C - y * scale] as P),
      f.facing > 0.8 ? LIGHT : f.facing > 0.45 ? BASE : DARK,
      0,
      f.tone,
      D * 0.008,
    ),
  );
}

// -- the four surfaces -------------------------------------------------------
//
// Torus, cylinder, Möbius strip and Klein bottle are drawn from the same
// immersions the boards are wrapped onto (surfaces.ts), meshed into quads,
// depth-sorted and flat-shaded. A twist that is really a twist beats any
// arrangement of ellipse arcs: the Möbius strip shows its single edge running
// round the band, and the Klein bottle's neck really does pass through the
// belly and open into the inside.

type SurfacePoint = (u: number, v: number) => V3;

/** u round the ring, v round the tube. */
const TORUS: SurfacePoint = (u, v) => {
  const r = 0.42;
  const radial = 1 + r * Math.cos(v);
  return [radial * Math.cos(u), radial * Math.sin(u), r * Math.sin(v)];
};

/** u round the loop, v across the half-twisting band. */
const MOBIUS: SurfacePoint = (u, v) => {
  const radial = 1 + v * Math.cos(u / 2);
  return [radial * Math.cos(u), radial * Math.sin(u), v * Math.sin(u / 2)];
};

/** u round the axis, v up it. */
const CYLINDER: SurfacePoint = (u, v) => [Math.cos(u), v, Math.sin(u)];

/** The classic self-intersecting bottle (kleinPoint in surfaces.ts): u runs up
 * the belly, over the top and back down through the neck, v round the tube. */
const KLEIN: SurfacePoint = (u, v) => {
  const [cu, su, cv] = [Math.cos(u), Math.sin(u), Math.cos(v)];
  const r = 1.05 * (2.5 - 1.5 * cu);
  const x = u < Math.PI ? 3 * cu * (1 + su) + r * cu * cv : 3 * cu * (1 + su) - r * cv;
  const y = u < Math.PI ? 8 * su + r * su * cv : 8 * su;
  return [x, y, r * Math.sin(v)];
};

interface MeshOptions {
  /** rotation about x then y, in degrees, before projecting */
  view: [number, number];
  /** v range (u always runs a full turn) */
  vFrom?: number;
  vTo?: number;
  uSteps?: number;
  vSteps?: number;
  /** an open surface is seen from both sides, so nothing is culled */
  twoSided?: boolean;
}

/** Flat-shaded quads of a parametric surface, far ones first. Adjacent quads
 * share an edge, so each is stroked in its own fill: without that the
 * antialiased seams show the page through the surface. */
function surfaceMesh(point: SurfacePoint, opts: MeshOptions): string[] {
  const {
    view: [rxDeg, ryDeg],
    vFrom = 0,
    vTo = 2 * Math.PI,
    uSteps = 36,
    vSteps = 12,
    twoSided = false,
  } = opts;
  const [rx, ry] = [rxDeg * (Math.PI / 180), ryDeg * (Math.PI / 180)];
  const grid: V3[][] = [];
  for (let i = 0; i <= uSteps; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= vSteps; j++) {
      row.push(
        rotate(point((2 * Math.PI * i) / uSteps, vFrom + ((vTo - vFrom) * j) / vSteps), rx, ry),
      );
    }
    grid.push(row);
  }
  const flat = grid.flat();
  const bounds = (k: 0 | 1): [number, number] => [
    Math.min(...flat.map((p) => p[k])),
    Math.max(...flat.map((p) => p[k])),
  ];
  const [minX, maxX] = bounds(0);
  const [minY, maxY] = bounds(1);
  const scale = (D * 0.94) / Math.max(maxX - minX, maxY - minY);
  const ox = (D - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (D + (maxY - minY) * scale) / 2 + minY * scale;
  const at = (p: V3): P => [ox + p[0] * scale, oy - p[1] * scale];

  const light = [-0.35, 0.5, 0.79] as const;
  const faces: { pts: P[]; depth: number; fill: string }[] = [];
  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const corners: V3[] = [
        grid[i]![j]!,
        grid[i + 1]![j]!,
        grid[i + 1]![j + 1]!,
        grid[i]![j + 1]!,
      ];
      const [a, b, c] = [corners[0]!, corners[1]!, corners[3]!];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      const len = Math.hypot(nx, ny, nz) || 1;
      const facing = nz / len;
      if (!twoSided && facing <= 0) continue;
      const lambert = Math.abs((nx * light[0] + ny * light[1] + nz * light[2]) / len);
      faces.push({
        pts: corners.map(at),
        depth: corners.reduce((s, p) => s + p[2], 0) / 4,
        // the inside of an open surface reads a shade cooler than the outside
        fill: mixHex(
          facing < 0 ? PLAIN.dark : PLAIN.base,
          facing < 0 ? PLAIN.base : PLAIN.light,
          0.15 + 0.85 * lambert,
        ),
      });
    }
  }
  faces.sort((f, g) => f.depth - g.depth);
  // Hundreds of quads per icon, so they are written as bare polygons at one
  // decimal (0.04 px at the size a menu row draws them) and grown 2% about
  // their own centre instead of being stroked — that seals the antialiased
  // seams between neighbours, which would otherwise show the page through the
  // surface, for none of the markup a per-path stroke costs.
  const f1 = (v: number): string => (Math.round(v * 10) / 10).toString();
  return faces.map((f) => {
    const [cx, cy] = centroid(f.pts);
    const d = f.pts
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${f1(cx + (p[0] - cx) * 1.02)} ${f1(cy + (p[1] - cy) * 1.02)}`,
      )
      .join("");
    return `<path d="${d}Z" fill="${f.fill}"/>`;
  });
}

/** Menu keys that reuse another key's drawing (gui.py _ICON_ALIASES). */
const ALIASES: Record<string, string> = {
  tri: "trigrid",
  aperiodic: "penrose",
  fractal: "sphinx", // the Fractals family row
  polyhedra: "cube",
  classic: "square", // the "Classic" home entry: flat squares
  manifolds: "torus", // the "Flat manifolds" home entry
  random: "start", // the "Random" picker entry
};

const SPHERES = [
  "sphere",
  "c80",
  "c180",
  "spheretri",
  "snubdodec",
  "rhombicosidodeca",
  "truncicosidodeca",
];

/** What a board's cells actually are, for the icons whose art is not a drawing
 * of one: a subdivided outer polygon (the Laves triangle tilings), an
 * idealised regular stand-in for an irregular tile (the Laves pentagons), a
 * solid seen in projection, or a sphere with a badge. Regularities are those of
 * the real tile, measured shortest-edge-first — see boards/tilings.py. */
const ICON_TONES: Record<string, ShapeTone> = {
  trigrid: { sides: 3, regularity: 1 }, // drawn tall, the tiling is equilateral
  tetrakis: { sides: 3, regularity: 0.604 }, // 45-45-90
  triakis: { sides: 3, regularity: 0.414 }, // 30-30-120
  kisrhombille: { sides: 3, regularity: 0.417 }, // 30-60-90
  cairo: { sides: 5, regularity: 0.74 },
  prismaticpent: { sides: 5, regularity: 0.664 },
  floret: { sides: 5, regularity: 0.5 },
  cube: { sides: 4, regularity: 1 },
  cubeframe: { sides: 4, regularity: 1 },
  steppedbipyramid: { sides: 4, regularity: 1 },
  tetrahedron: { sides: 3, regularity: 1 },
  tetraframe: { sides: 3, regularity: 1 },
  sphere: { sides: 5, regularity: 0.95 },
  snubdodec: { sides: 3, regularity: 1 },
  spheretri: { sides: 3, regularity: 1 },
  c80: { sides: 6, regularity: 0.95 },
  c180: { sides: 6, regularity: 0.95 },
  rhombicosidodeca: { sides: 4, regularity: 1 }, // squares are the majority face
  truncicosidodeca: { sides: 4, regularity: 1 }, // squares are the majority face
};

function draw(rawKey: string): string[] {
  const key = ALIASES[rawKey] ?? rawKey;
  const d = D;
  const parts: string[] = [];
  // The cell shape this icon stands for, where its art does not draw one.
  const cell: ShapeTone | undefined = ICON_TONES[key];

  // Every uniform and dual-uniform tiling draws a real patch of itself, and so
  // do the two family rows: a 3.4.6.4 rosette (a triangle, a square and a
  // hexagon in one figure) for the uniform family, and its own Laves dual for
  // the dual-uniform one.
  // (the two family rows are a dual pair themselves: 3.4.6.4's vertex figure
  // for the uniform family, its Laves dual's tile rosette for the other)
  if (ARCH_KEYS.has(key)) return tilingPatch(key);
  if (key === "uniform") return tilingPatch("rhombitrihex", "rosette");
  if (key === "dual") return tilingPatch("deltoidal");
  // the Isogonal family row: rotated hexagonal, the clearest picture of what
  // the family is — tiles sliding along each other's edges rather than meeting
  // them, with the gaps that opens filled by a second shape
  if (key === "isogonal") return tilingPatch("rotatedhex");
  // the Congruent rectangles family row: the herringbone, the bond whose
  // staggered rectangles read as a pattern even at icon size (a stacked or
  // running bond patch is a handful of plain bars)
  if (key === "rectangle") return tilingPatch("herringbone");
  if (key === "regular") {
    // the Regular family row: one tile of each of the three regular tilings
    return [
      shape(ngon(d * 0.29, d * 0.31, d * 0.25, 3, -90), LIGHT),
      shape(ngon(d * 0.73, d * 0.29, d * 0.23, 4, 45)),
      shape(hexagon(d * 0.5, d * 0.73, d * 0.25)),
    ];
  }

  if (key === "start") {
    // The random-tiling row: a question mark set in the game's own face, Rubik.
    parts.push(
      `<text x="${n(C)}" y="${n(d * 0.5)}" text-anchor="middle" ` +
        `dominant-baseline="central" font-family="Rubik, system-ui, sans-serif" ` +
        `font-weight="700" font-size="${n(d * 0.92)}" fill="${PLAIN.base}">?</text>`,
    );
  } else if (key === "flat" || key === "square" || key === "torus_tile") {
    // one square, the way the hexagon icon is one hexagon
    const r = d * 0.36;
    parts.push(
      shape([
        [C - r, C - r],
        [C + r, C - r],
        [C + r, C + r],
        [C - r, C + r],
      ]),
    );
  } else if (key === "triangle") {
    parts.push(
      holed(
        [
          [C, d * 0.08],
          [d * 0.05, d * 0.9],
          [d * 0.95, d * 0.9],
        ],
        [
          [C - d * 0.22, d * 0.49],
          [C + d * 0.22, d * 0.49],
          [C, d * 0.9],
        ],
      ),
    );
  } else if (key === "trigrid") {
    // one equilateral triangle, matching the one-square and one-hexagon icons
    parts.push(shape(ngon(C, C + d * 0.04, d * 0.46, 3, -90), BASE, 4, cell));
  } else if (key === "hex") {
    parts.push(shape(hexagon(C, C, d * 0.44)));
  } else if (key === "hextri") {
    // the hexagonal triangle board: one hexagon cut into six triangles,
    // vertices left and right the way the board's outline sits
    const h = hexagon(C, C, d * 0.46, 0);
    for (let k = 0; k < 6; k++) {
      parts.push(shape([h[k]!, h[(k + 1) % 6]!, [C, C]], k % 2 ? BASE : LIGHT));
    }
  } else if (key === "hexhex") {
    const r = d * 0.155;
    const centers: P[] = [[C, C]];
    for (let k = 0; k < 6; k++) {
      const a = (60 * k * Math.PI) / 180;
      centers.push([C + 2 * r * 0.95 * Math.cos(a), C + 2 * r * 0.95 * Math.sin(a)]);
    }
    for (const [hx, hy] of centers) parts.push(shape(hexagon(hx, hy, r)));
  } else if (key === "hextriangle") {
    // the triangular hex board: the six-cell case (axial q, r >= 0,
    // q + r <= 2), laid out with the same pointy-top spacing the real
    // board uses (unit circumradius: dx = sqrt(3)/2 per q, dy = 1.5 per r).
    const raw: P[] = [];
    for (let qq = 0; qq <= 2; qq++) {
      for (let rr = 0; rr <= 2 - qq; rr++) {
        raw.push([(2 * qq + rr) * (Math.sqrt(3) / 2), rr * 1.5]);
      }
    }
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const r = (d * 0.92) / (span + 2); // +2 hex radii of padding, one each side
    for (const [px, py] of raw) {
      parts.push(shape(hexagon(C + (px - midX) * r, C + (py - midY) * r, r)));
    }
  } else if (REP_TILES[key]) {
    // the rep-4 substitution itself: the four half-size tiles that fill one
    // tile, drawn from the board's own geometry
    const tile = REP_TILES[key]!;
    const polygons = repPlacements(tile, 1).map((at) =>
      tile.outline.map((v): P => tile.toXy(placePoint(tile, at, v))),
    );
    const xs = polygons.flat().map(([x]) => x!);
    const ys = polygons.flat().map(([, y]) => y!);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const sc = (d * 0.84) / Math.max(maxX - minX, maxY - minY);
    const ox = (d - (maxX - minX) * sc) / 2;
    const oy = (d - (maxY - minY) * sc) / 2;
    polygons.forEach((polygon, i) => {
      parts.push(
        shape(
          polygon.map(([x, y]): P => [ox + (x! - minX) * sc, oy + (maxY - y!) * sc]),
          i % 2 ? BASE : LIGHT,
          3,
        ),
      );
    });
  } else if (key === "penrose") {
    // a sun of five thick rhombi
    const side = d * 0.3;
    const diag = d * 0.3 * 1.618;
    for (let k = 0; k < 5; k++) {
      const a = ((72 * k - 90) * Math.PI) / 180;
      const s36 = Math.PI / 5;
      parts.push(
        shape([
          [C, C],
          [C + side * Math.cos(a - s36), C + side * Math.sin(a - s36)],
          [C + diag * Math.cos(a), C + diag * Math.sin(a)],
          [C + side * Math.cos(a + s36), C + side * Math.sin(a + s36)],
        ]),
      );
    }
  } else if (key === "spectre") {
    // The Spectre's menu icon keeps the nicer silhouette of its removed
    // sibling "The Hat" (the two aperiodic monotiles share a family
    // resemblance -- Tile(1,1) is a member of the hat continuum -- and this
    // outline reads better at icon size than a walk of the Spectre's own
    // edge directions).
    const hr3 = Math.sqrt(3) / 2;
    const ab: P[] = [
      [0, 0],
      [-1, -1],
      [0, -2],
      [2, -2],
      [2, -1],
      [4, -2],
      [5, -1],
      [4, 0],
      [3, 0],
      [2, 2],
      [0, 3],
      [0, 2],
      [-1, 2],
    ];
    const raw: P[] = ab.map(([a, b]) => [a + 0.5 * b, hr3 * b]);
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const span = Math.max(maxX - minX, maxY - minY);
    const sc = (d * 0.82) / span;
    const ox = (d - (maxX - minX) * sc) / 2;
    const oy = (d - (maxY - minY) * sc) / 2;
    parts.push(shape(raw.map(([x, y]) => [ox + (x - minX) * sc, oy + (maxY - y) * sc])));
  } else if (key === "phyllotaxis") {
    // the innermost ten tiles of the spiral: the five 72°/144° hexagons that
    // meet at the centre, and the five of the odd wedges, offset one edge out —
    // the offset that starts the arms turning
    const u: P[] = [0, 1, 2].map((k) => [
      Math.cos((36 * k * Math.PI) / 180),
      Math.sin((36 * k * Math.PI) / 180),
    ]);
    const hex: P[] = [
      [0, 0],
      u[0]!,
      [u[0]![0] + u[1]![0], u[0]![1] + u[1]![1]],
      [u[0]![0] + u[1]![0] + u[2]![0], u[0]![1] + u[1]![1] + u[2]![1]],
      [u[1]![0] + u[2]![0], u[1]![1] + u[2]![1]],
      u[2]!,
    ];
    // |D| + |u1|: the tip of an odd wedge's tile, the patch's outer radius
    const r = (d * 0.46) / (2 + 2 * Math.cos(Math.PI / 5));
    for (let k = 0; k < 10; k++) {
      const a = ((36 * k - 90) * Math.PI) / 180;
      const [cosA, sinA] = [Math.cos(a), Math.sin(a)];
      const [ox2, oy2] = k % 2 ? u[1]! : [0, 0];
      parts.push(
        shape(
          hex.map(([x, y]): P => {
            const [px, py] = [x + ox2, y + oy2];
            return [C + r * (px * cosA - py * sinA), C + r * (px * sinA + py * cosA)];
          }),
          k % 2 ? BASE : LIGHT,
          3,
        ),
      );
    }
  } else if (SPHERES.includes(key)) {
    // the real solid, projected: a dark disc behind it closes the silhouette
    // where the outermost faces fall away from the viewer
    parts.push(circle(C, C, d * 0.455, cell, 0, DARK), ...solidFaces(key));
  } else if (key === "cube" || key === "cubeframe") {
    // an isometric cube: three visible rhombic faces, grid-lined (cube) or
    // bored through (the Menger frame)
    const h = hexagon(C, C, d * 0.4, -90); // h0 top, then clockwise
    const faces: [P[], IconVariant][] = [
      [[h[0]!, h[1]!, [C, C], h[5]!], LIGHT], // top
      [[h[1]!, h[2]!, h[3]!, [C, C]], BASE], // right
      [[h[5]!, [C, C], h[3]!, h[4]!], DARK], // left
    ];
    for (const [quad, fill] of faces) {
      if (key === "cube") {
        parts.push(shape(quad, fill, 4, cell));
        const [a, b, cc, dd] = quad as [P, P, P, P];
        for (const k of [1, 2]) {
          const t = k / 3;
          parts.push(line(lerp(a, b, t), lerp(dd, cc, t), DARK, 3, cell));
          parts.push(line(lerp(a, dd, t), lerp(b, cc, t), DARK, 3, cell));
        }
      } else {
        // A level-1 Menger sponge face: three by three unit squares with the
        // middle one bored away. The bore goes right through, so it is a shaft
        // and not a window — sink a copy of the missing square toward the
        // cube's centre, wall the two sides that face the viewer, and let the
        // far opening go dark. The eight tiles are drawn over the top, so the
        // face is tiled the way the board is played on.
        const [a, b, cc, dd] = quad as [P, P, P, P];
        const at = (u: number, v: number): P => {
          const top = lerp(a, b, u);
          const bottom = lerp(dd, cc, u);
          return lerp(top, bottom, v);
        };
        const hole: P[] = [at(1 / 3, 1 / 3), at(2 / 3, 1 / 3), at(2 / 3, 2 / 3), at(1 / 3, 2 / 3)];
        const fx = (hole[0]![0] + hole[2]![0]) / 2;
        const fy = (hole[0]![1] + hole[2]![1]) / 2;
        const sunk: P[] = hole.map((p) => [p[0] + (C - fx) * 0.75, p[1] + (C - fy) * 0.75]);
        const area = (pts: P[]): number =>
          pts.reduce(
            (s, p, i) => s + (p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1]),
            0,
          );
        const skin = tint(fill, cell ?? null);
        parts.push(poly(sunk, darker(skin, 0.72), CORNER * 0.4));
        for (let k = 0; k < 4; k++) {
          const wall: P[] = [hole[k]!, hole[(k + 1) % 4]!, sunk[(k + 1) % 4]!, sunk[k]!];
          // the two walls turned toward the viewer wind the way the face does
          if (Math.sign(area(wall)) !== Math.sign(area(quad))) continue;
          parts.push(poly(wall, darker(skin, 0.42), CORNER * 0.4));
        }
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            if (i === 1 && j === 1) continue; // the bore
            const tile: P[] = [
              at(i / 3, j / 3),
              at((i + 1) / 3, j / 3),
              at((i + 1) / 3, (j + 1) / 3),
              at(i / 3, (j + 1) / 3),
            ];
            parts.push(shape(tile, fill, 3, cell, CORNER * 0.4));
          }
        }
      }
    }
  } else if (key === "steppedbipyramid" || key === "tetraframe") {
    // Both are the real board projected — a bipyramid whose terraces really do
    // step 7-5-3-1 out from the equator, and a Sierpinski tetrahedron with its
    // four sub-tetrahedra and the hollow between them, tiled the way they are
    // played on.
    parts.push(...solidFaces(key, "blocky"));
  } else if (key === "tetrahedron") {
    // seen down a vertex: outer triangle with edges to the centre
    const outer = ngon(C, C + d * 0.04, d * 0.46, 3, -90);
    const shades = [LIGHT, BASE, DARK];
    for (let k = 0; k < 3; k++) {
      const [a, b] = [outer[k]!, outer[(k + 1) % 3]!];
      parts.push(shape([a, b, [C, C]], shades[k], 4, cell));
      parts.push(line(lerp(a, b, 0.5), [C, C], DARK, 3, cell));
      parts.push(line(lerp(a, [C, C], 0.5), lerp(b, [C, C], 0.5), DARK, 3, cell));
    }
  } else if (key === "torus") {
    parts.push(...surfaceMesh(TORUS, { view: [-62, 0] }));
  } else if (key === "mobius") {
    // an open band: both faces show, and the half twist brings the far edge
    // round to meet the near one
    parts.push(
      ...surfaceMesh(MOBIUS, {
        view: [-52, 0],
        vFrom: -0.42,
        vTo: 0.42,
        uSteps: 60,
        vSteps: 3,
        twoSided: true,
      }),
    );
  } else if (key === "cylinder") {
    parts.push(
      ...surfaceMesh(CYLINDER, {
        view: [-32, 0],
        vFrom: -1.15,
        vTo: 1.15,
        uSteps: 36,
        vSteps: 5,
        twoSided: true,
      }),
    );
  } else if (key === "klein") {
    parts.push(...surfaceMesh(KLEIN, { view: [180, -18], uSteps: 48, vSteps: 14 }));
  } else {
    parts.push(circle(C, C, d * 0.4, null, 2));
  }
  return parts;
}

const cache = new Map<string, string>();

/** The inline SVG for a menu row's icon key (a tiling key, a family key, a
 * mode name or one of the home-page group keys). */
export function menuIcon(key: string): string {
  let svg = cache.get(key);
  if (svg === undefined) {
    svg = `<svg viewBox="0 0 ${D} ${D}" aria-hidden="true" focusable="false">${draw(key).join(
      "",
    )}</svg>`;
    cache.set(key, svg);
  }
  return svg;
}
