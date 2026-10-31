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
  classifyShapes,
  iconHex,
  shapeMetrics,
  type IconTint,
  type IconVariant,
  type ShapeTone,
} from "../render/shapePalette";
import {
  ARCH_TILINGS,
  type ArchTemplate,
  archTemplate,
  templateCells,
  placePoint,
  fiveTriangles,
  substitutionPlacements,
  substitutionXy,
  SUBSTITUTIONS,
  CLOSED_SURFACES,
  gcDisc,
  SURFACE_MODES,
  binaryBoard,
  hyperbolicBoard,
  hyperbolicUniformBoard,
  type WythoffOp,
  ammannBeenkerBoard,
  brickRingsBoard,
  brickRingsTiles,
  klaassenBoard,
  klaassenTiles,
  penroseBoard,
  kiteDartBoard,
  pentaSpiralBoard,
  phyllotaxisBoard,
  spectreBoard,
  z7ToXy,
  deltoidalHexecontahedronBoard,
  deltoidalIcositetrahedronBoard,
  disdyakisDodecahedronBoard,
  disdyakisTriacontahedronBoard,
  pentagonalIcositetrahedronBoard,
  pentakisDodecahedronBoard,
  rhombicDodecahedronBoard,
  rhombicTriacontahedronBoard,
  sphereBoard,
  tetrakisHexahedronBoard,
  triakisIcosahedronBoard,
  triakisOctahedronBoard,
  triakisTetrahedronBoard,
  brickCubeBoard,
  c180Board,
  gp21Board,
  cubeBoard,
  cubeFrameBoard,
  dodecahedronBoard,
  icosahedronBoard,
  octahedronBoard,
  sphereSquareBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  steppedPyramidBoard,
  tetrahedronBoard,
  tetrahedronFrameBoard,
  cuboctahedronBoard,
  rhombicosidodecahedronSplitBoard,
  snubCubeBoard,
  snubDodecahedronSplitBoard,
  truncatedIcosidodecahedronSplitBoard,
  truncatedOctahedronBoard,
  boyBoard,
  cylinderBoard,
  doubleTorusBoard,
  kleinBoard,
  mobiusBoard,
  projectiveBoard,
  torusBoard,
  trefoilBoard,
  solidCubeBoard,
  cid,
  isBoard3D,
  newellNormal,
  type Board,
  type Board3D,
  type Vec3,
} from "../boards";
import { FRACTAL_MODES, REPTILE_MODES, SHAPED_MODES, surfaceOf } from "../modes/catalog";
import { hasMode, presetBoard } from "../modes/presets";
import { DOMAINS } from "./backgroundPattern";

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

/** What a theme may say about the icon set: how vivid the shape-derived colours
 * are drawn (`tint`, see `IconTint`), and what the non-tile chrome is painted in
 * instead of the indigo above (`plain`). Both optional — a theme naming neither
 * gets the set exactly as it always was. */
export interface IconPalette {
  tint?: IconTint;
  plain?: Record<IconVariant, string>;
}

/** The palette the icons are currently drawn in.
 *
 * Module state rather than an argument threaded through: an icon is assembled by
 * several dozen small drawing helpers, and every one of them would otherwise
 * have to carry a palette it does not care about. What makes that safe is that
 * there is exactly one writer — `setIconPalette`, called by App when the theme
 * changes — and that it clears the cache below, so no icon can outlive the
 * colours it was drawn in. */
let iconPalette: IconPalette = {};

/** Repaint the icon set for a theme.
 *
 * The cache has to go with it: `menuIcon` memoises a *string of SVG* with its
 * colours already baked in, so an entry drawn under the old theme would keep
 * those colours for the life of the page. Call this before the menu renders. */
export function setIconPalette(next: IconPalette | undefined): void {
  iconPalette = next ?? {};
  cache.clear();
  previewCache.clear();
  levelCache.clear();
}

const BASE: IconVariant = "base";
const LIGHT: IconVariant = "light";
const DARK: IconVariant = "dark";

/** The non-tile chrome's colour for a variant — the theme's, or the indigo. */
function plain(variant: IconVariant): string {
  return (iconPalette.plain ?? PLAIN)[variant];
}

/** The colour a variant paints `tone` in; `null` is the non-tile chrome. */
function tint(variant: IconVariant, tone: ShapeTone | null): string {
  return tone ? iconHex(tone, variant, iconPalette.tint) : plain(variant);
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
  // Square corners are a straight walk. Left to the arc code below, a radius
  // of zero comes out as a quadratic through each corner from the corner to
  // itself — the same shape, in three times the markup.
  if (radius <= 0) {
    return `${points.map((p, i) => `${i ? "L" : "M"}${n(p[0])} ${n(p[1])}`).join("")}Z`;
  }
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

function line(
  a: P,
  b: P,
  variant: IconVariant = DARK,
  width = 3,
  tone: ShapeTone | null = null,
): string {
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
  /** The tone measured across the whole board, where a preview has a real
   * board to measure (`classifyShapes`). Left off, `shape` reads the polygon
   * on its own, which is what the small patches do. */
  tone?: ShapeTone;
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
    for (let n = -2; n <= 2; n++) tiles.push(...copyTiles(t, m, n));
  }
  return tiles;
}

/** One domain copy as icon tiles: the template's own geometry, plus the kind
 * stem and the centroid this file sorts and shades by. */
function copyTiles(t: ArchTemplate, m: number, n: number): Tile[] {
  return templateCells(t, m, n).map(({ name, pts }) => ({
    kind: name.replace(/\d+$/, ""),
    pts: pts as P[],
    centre: centroid(pts as P[]),
  }));
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
  const ring = tiles.filter((tile) => tile !== hub && tile.pts.some((p) => corners.has(vkey(p))));
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
    for (let n = 0; n < copies; n++) tiles.push(...copyTiles(t, m, n));
  }
  return tiles;
}

/** How far out a "disc" patch reaches, in edge lengths, per tiling. */
const DISC_RADIUS: Record<string, number> = {
  // Most of the twenty need a disc past the first ring to hold both kinds of
  // vertex, and the five pairs that share their kinds — the (1)s and (2)s —
  // one wide enough that the two come out different: the studded triangular
  // ones reach the next hexagons, the square-and-trihexagonal ones the next
  // band, where the one shift tells them apart.
  studdedtri: 3.1,
  studdedtri2: 3.7,
  elongated2: 2.2,
  elongated3: 2.6,
  // the hexagon cut into six triangles, ringed by squares and triangles: the
  // 3⁶ vertex at the middle, a 3².4.3.4 one at each of its corners
  trirhombitrihex: 2,
  tritrunctrihex: 3.6,
  hexbands: 2.2,
  snubelongated: 2.4,
  snubelongated2: 2.6,
  squarerows3: 2.6,
  dodecasquare: 3.2,
  hexrings: 2.6,
  squaretrihex: 2.8,
  squaretrihex2: 2.8,
  // the dissected dodecagon, plus the six triangles between it and its
  // neighbours and the six of theirs that pair with its own into rhombi —
  // the pairs are what tell it from plain 3.4.6.4
  dissectedtrunchex: 2.3,
  // the dodecagon with its ring of squares and hexagons, plus the triangle in
  // each notch between two hexagons — where plain 4.6.12 has a square
  dodecarhombitrihex: 3.3,
};

/** Every tile whose centre lies within `DISC_RADIUS` of the board's own window
 * centre (`ArchTemplate.centre`, else its biggest tile — the hub `tileRing`
 * takes). A 2-uniform tiling has two kinds of vertex, so a patch round one tile
 * or one vertex shows only one of them, and reads as the uniform tiling it was
 * cut from or merged out of; a disc reaching past the first ring holds both. */
function discPatch(key: string): Tile[] {
  const tiles = tilingTiles(key);
  const t = archTemplate(key);
  const hub: P = t.centre ? [t.centre[0], t.centre[1]] : tileRing(key)[0]!.centre;
  const radius = DISC_RADIUS[key] ?? 2;
  return tiles.filter(
    (tile) => Math.hypot(tile.centre[0] - hub[0], tile.centre[1] - hub[1]) <= radius,
  );
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

type PatchStyle = "ring" | "rosette" | "domain" | "disc";

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
 * A *rectangle bond* is drawn as one fundamental domain — see domainPatch — and
 * a *2-uniform* tiling as a disc wide enough to hold both its kinds of vertex —
 * see discPatch.
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
  // The sphinx pattern is its half-turned *pair*: two sphinxes locking into a
  // parallelogram, which is a figure. A ring of them is a huddle of
  // same-coloured tiles with no figure in it, so this one is drawn as its
  // domain. The L-tromino keeps the ring, where the notch of each L against
  // the next is what shows; its domain reads as a plain course of bricks.
  sphinxpairs: "domain",
  // The 2-uniform tilings show both of their kinds of vertex — see discPatch.
  ...Object.fromEntries(
    ARCH_TILINGS.filter((t) => t.family === "2-uniform").map((t) => [t.key, "disc" as const]),
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
        : style === "disc"
          ? discPatch(key)
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
// their own shape colours. So the C180 icon really is a fullerene's hexagons and
// pentagons and the snub dodecahedron really is its twelve pentagons among
// eighty triangles — detail no hand-drawn badge carries.

type V3 = readonly [number, number, number];

// Built at the easy preset's parameters (data/presets.json), so an icon has as
// many cells as the board a tap on that row opens.
const SOLID_BUILDERS: Record<string, () => Board3D> = {
  sphere: () => sphereBoard(),
  gp21: () => gp21Board(),
  c180: () => c180Board(),
  spheretri: () => sphereTriangleBoard(),
  spheresquare: () => sphereSquareBoard(),
  tetraframe: () => tetrahedronFrameBoard(2),
  // The three solids the small icon draws as a symbol rather than a board — a
  // fanned triangle and two isometric boxes, which is what fits in 38px. A card
  // has room for the real thing, so they are built here for `previewIcon`;
  // `draw` still routes them to their hand-drawn branches.
  tetrahedron: () => tetrahedronBoard(5),
  cube: () => cubeBoard(4),
  cubeframe: () => cubeFrameBoard(3, 1),
  octahedron: () => octahedronBoard(3),

  icosahedron: () => icosahedronBoard(2),
  dodecahedron: () => dodecahedronBoard(1),
  steppedbipyramid: () => steppedBipyramidBoard(7, 4),
  steppedpyramid: () => steppedPyramidBoard(5, 3),
  // the cube of cubes at its easy size: four sheets of sixteen, which is the
  // board itself and about the density of a brick cube's icon
  cube3d: () => solidCubeBoard(4),
  // the four brick cubes, at their own easy block (or ring) counts
  cubestackedbond: () => brickCubeBoard("stackedbond", 3),
  cubebasketweave: () => brickCubeBoard("basketweave", 3),
  cubebasketweave3: () => brickCubeBoard("basketweave3", 2),
  cubebrickrings: () => brickCubeBoard("brickrings", 3),
  // The thirteen Catalan solids, at their own easy frequencies. There is no
  // drawing of a disdyakis triacontahedron a reader could tell from a pentakis
  // dodecahedron, so every one of these is the real board.
  triakistetra: () => triakisTetrahedronBoard(3),
  rhombicdodeca: () => rhombicDodecahedronBoard(3),
  triakisocta: () => triakisOctahedronBoard(2),
  tetrakishexa: () => tetrakisHexahedronBoard(2),
  deltoidalicositetra: () => deltoidalIcositetrahedronBoard(2),
  pentagonalicositetra: () => pentagonalIcositetrahedronBoard(1),
  disdyakisdodeca: () => disdyakisDodecahedronBoard(1),
  rhombictriaconta: () => rhombicTriacontahedronBoard(2),
  triakisicosa: () => triakisIcosahedronBoard(2),
  pentakisdodeca: () => pentakisDodecahedronBoard(1),
  deltoidalhexeconta: () => deltoidalHexecontahedronBoard(1),
  disdyakistriaconta: () => disdyakisTriacontahedronBoard(1),
  // The Archimedean solids cut into boards, flat-faced like the Catalan ones,
  // at their own easy frequencies.
  cubocta: () => cuboctahedronBoard(2),
  truncocta: () => truncatedOctahedronBoard(2),
  snubcube: () => snubCubeBoard(2),
  rhombicosidodecasplit: () => rhombicosidodecahedronSplitBoard(0),
  truncicosidodecasplit: () => truncatedIcosidodecahedronSplitBoard(0),
  snubdodecsplit: () => snubDodecahedronSplitBoard(0),
  // The flat manifolds in squares, at their easy sizes: the wrapped lattice
  // itself, every cell of the board a quad on the icon (see SURFACE_ICONS).
  // Two are the exception. The trefoil is at its medium size: the easy knot's
  // sixteen cells along it are bent into trapezoids at every turn, and the
  // knot draws as a chain of kinks. Boy's surface is at its hard size: the
  // easy board's 75 cells are too coarse for its lobes and funnel to read at
  // all, and the surface is a lump of a few dozen bent squares.
  mobius: () => mobiusBoard(14, 6),
  cylinder: () => cylinderBoard(16, 5),
  torus: () => torusBoard(10, 8, 0.38),
  trefoil: () => trefoilBoard(32, 8, 0.8),
  klein: () => kleinBoard(10, 8, 1.15),
  projective: () => projectiveBoard(5),
  boy: () => boyBoard(13),
  doubletorus: () => doubleTorusBoard(8, 8, 0.38),
};

/** The thirteen Catalan solids, drawn as the real board in projection like the
 * Platonic ones — see SOLID_BUILDERS. Kept as its own list so the icon branch
 * and the view table cannot drift apart. */
const CATALAN_ICONS = [
  "triakistetra",
  "rhombicdodeca",
  "triakisocta",
  "tetrakishexa",
  "deltoidalicositetra",
  "pentagonalicositetra",
  "disdyakisdodeca",
  "rhombictriaconta",
  "triakisicosa",
  "pentakisdodeca",
  "deltoidalhexeconta",
  "sphere",
  "disdyakistriaconta",
];

/** The Archimedean solids cut into boards, drawn the same way: flat faces cut
 * into the cells they are played on -- or, for the icosahedral three, whose
 * easy board is the solid uncut, one cell a face. */
const ARCHIMEDEAN_FLAT_ICONS = [
  "cubocta",
  "truncocta",
  "snubcube",
  "rhombicosidodecasplit",
  "truncicosidodecasplit",
  "snubdodecsplit",
];

/** The flat manifolds, drawn like the solids: the easy board's own squares on
 * the board's own immersion, rather than a smooth mesh of the surface. The
 * open and one-sided ones (`twoSided`) keep the faces turned away from the
 * viewer, a shade darker, since their back is what shows through the band, the
 * open end or the neck. The projective plane is not here: it is played on the
 * whole sphere, every cell and its antipode, and is drawn as that sphere, with
 * the sphere boards (`SPHERES`). */
const SURFACE_ICONS: Record<string, { twoSided: boolean }> = {
  mobius: { twoSided: true },
  cylinder: { twoSided: true },
  torus: { twoSided: false },
  trefoil: { twoSided: false },
  klein: { twoSided: true },
  boy: { twoSided: true },
  doubletorus: { twoSided: false },
};

/** How each solid is turned before projecting, in degrees about x then y —
 * chosen so the face the board is named for sits in the middle of the icon. */
const SOLID_VIEW: Record<string, [number, number] | [number, number, number]> = {
  sphere: [-18, 12],
  gp21: [-20, 10],
  c180: [-20, 10],
  spheretri: [-10, 18],
  // the cube's own view: one of the eight 3-valent corners in the middle
  spheresquare: [-24, 28],
  // Seen from just above the equator: from any higher the widest terrace hides
  // the whole lower pyramid, and the icon stops being a bipyramid at all.
  steppedbipyramid: [-85, 0, 28],
  // Half of the bipyramid's view: seen just above the foundation, so the
  // apex and the terraces both read rather than the foundation hiding
  // everything above it or the apex hiding everything below.
  steppedpyramid: [-70, 0, 28],
  tetraframe: [-50, 18, 45],
  // Nearly face on: the sheets are what there is to read, and the small pitch
  // and yaw are only enough to show that they step back from one another.
  cube3d: [-12, 16],
  // The brick cubes, turned so three faces show and the courses read running a
  // different way on each. Just shallow enough that the top face clears the
  // `facing > 0.8` line (cos 24 * cos 28 = 0.807) and so takes the light tone:
  // at a steeper 3/4 turn no face did, and all three came out in the same two
  // shades, which reads flat next to the other blocky solids.
  cubestackedbond: [-24, 28],
  cubebasketweave: [-24, 28],
  cubebasketweave3: [-24, 28],
  cubebrickrings: [-24, 28],
  // The two boxes and the tetrahedron, turned like the brick cubes: a three
  // quarter view, shallow enough that the top face still takes the light.
  cube: [-24, 28],
  cubeframe: [-24, 28],
  tetrahedron: [-20, 24],
  // Down a 4-fold vertex axis and tipped, so three of the eight faces show.
  octahedron: [-24, 24],
  // Down a 5-fold vertex axis and tipped, echoing the snub dodecahedron's view.
  icosahedron: [-18, 22],
  // Down a 3-fold vertex axis and tipped, so three of its twelve pentagons show.
  dodecahedron: [-20, 20],
  // The Catalan solids, each turned so the face it is named for reads rather
  // than pointing straight at or away from the viewer.
  triakistetra: [-18, 20],
  rhombicdodeca: [-20, 12],
  triakisocta: [-22, 18],
  tetrakishexa: [-20, 12],
  deltoidalicositetra: [-20, 15],
  pentagonalicositetra: [-18, 20],
  disdyakisdodeca: [-22, 18],
  rhombictriaconta: [-14, 20],
  triakisicosa: [-18, 22],
  pentakisdodeca: [-20, 20],
  deltoidalhexeconta: [-16, 18],
  disdyakistriaconta: [-16, 20],
  // The cube-group Archimedean solids, tipped off a 3-fold axis so a square
  // and the faces round it read, and the icosahedral ones as their uncut
  // sphere boards are turned.
  cubocta: [-20, 22],
  truncocta: [-20, 22],
  snubcube: [-18, 20],
  rhombicosidodecasplit: [-16, 15],
  truncicosidodecasplit: [-16, 15],
  snubdodecsplit: [-14, 20],
  // The flat manifolds, each in its board's own frame.
  torus: [-62, 0],
  // three-quarters on: the easy band is six cells wide, nearly a disc with a
  // hole, and seen from above its twist hides in the far side of the loop
  mobius: [-20, 40],
  // tipped toward the viewer, so the open end that shows is the top one (a
  // negative tilt looks up into it from below and reads upside down)
  cylinder: [32, 0],
  // flatter than the single donut's view: the eight is what identifies it,
  // and at -62 degrees the two rings overlap into one blob
  doubletorus: [-48, 0],
  // down the knot's three-fold axis, the view it is known by, spun so a lobe
  // points straight up and tipped a little toward the viewer: the picture is
  // then symmetric left to right, where a lobe pointing sideways put two
  // crossings on one side and left that side a tangle
  trefoil: [12, 0, 90],
  // the body with the neck looping over the top and back into its side; the
  // board's coarse easy tube shows its open bottom ring from below
  klein: [20, 30],
  // the cubed sphere it is played on, a corner of the cube in the middle like
  // the square sphere's
  projective: [-24, 28],
  // from above and to one side, the textbook view: two of the three lobes
  // folding over the funnel that the third one dives into
  boy: [-60, 0, 30],
};

/** Where a card turns a solid further than its 38px icon does. Two boards read
 * as themselves only once there is room for the turn: a tetrahedron stood on
 * its base, where the icon's shallower tip reads as a wedge, and the cube of
 * cubes seen from a corner, where the icon's nearly-face-on view — the sheets
 * being what there is to read at that size — spreads into four loose squares.
 * Kept apart from `SOLID_VIEW` so the small icons stay exactly as they are. */
const PREVIEW_VIEW: Record<string, [number, number] | [number, number, number]> = {
  tetrahedron: [-30, 15, 45],
  cube3d: [-24, 28],
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

/** The mean of a polygon's vertices. */
function centre3(poly: V3[]): V3 {
  const k = 1 / poly.length;
  return [
    poly.reduce((s, v) => s + v[0], 0) * k,
    poly.reduce((s, v) => s + v[1], 0) * k,
    poly.reduce((s, v) => s + v[2], 0) * k,
  ];
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
function solidFaces(
  key: string,
  kind: "round" | "blocky" | "surface" = "round",
  lit = false,
  source?: Board3D,
): string[] {
  // `key` names the view (and, without `source`, the board); a level preview
  // hands in the real board and its surface's key for the view.
  const board = source ?? solidBoard(key);
  // A level's surface is never culled, closed or not: its cells can be big
  // (an easy board of rotated hexagons on a torus), and a big cell whose one
  // normal points away still has a part that faces the viewer — culled, it
  // leaves a hole at the silhouette. Painted back to front, every cell, the
  // near side covers the far one as it does on an open band.
  const surface =
    kind === "surface" ? { twoSided: source ? true : SURFACE_ICONS[key]!.twoSided } : null;
  const [rxDeg, ryDeg, rzDeg = 0] = (lit ? PREVIEW_VIEW[key] : undefined) ??
    SOLID_VIEW[key] ?? [-18, 15];
  const rad = Math.PI / 180;
  const [rx, ry, rz] = [rxDeg * rad, ryDeg * rad, rzDeg * rad];
  // A card has room for the board's own colours: `classifyShapes` normalises
  // regularity across the whole board and reads the corner mask, exactly as
  // render/solidBoard.ts does, where the small icon measures each polygon on
  // its own. The difference shows on the boards with T-vertices.
  // A surface takes them on the small icon too: its squares are bent by the
  // immersion, each by a different amount, and measured one at a time they
  // would scatter over the regularity scale where the board paints them one
  // colour.
  const tones = lit || surface ? classifyShapes(board.polygons, board.cornerMask) : null;
  const faces: {
    pts: P[];
    /** the face before its inset: on a card, the grout laid under it */
    full: P[];
    depth: number;
    facing: number;
    lambert: number;
    tone: ShapeTone;
    back: boolean;
  }[] = [];
  const box: number[][] = [];
  for (const [cell, poly] of board.polygons) {
    const spun = poly.map((v) => rotate(v as V3, rx, ry, rz));
    const mid = centre3(spun);
    box.push(...spun.map((v) => [v[0], v[1]]));
    let facing: number;
    if (kind === "round") {
      facing = mid[2] / (Math.hypot(mid[0], mid[1], mid[2]) || 1);
    } else {
      // Newell's normal, summed over every edge, rather than the cross product
      // of the first three vertices: a face whose first three points happen to
      // be **collinear** has no normal by that rule, and the answer is not a
      // clean zero the `|| 1` guard could catch but rounding noise, so `facing`
      // comes out as an arbitrary value in [-1, 1]. Half such faces are then
      // culled below and the rest take a random shade. That is no hypothetical:
      // a brick cube's `splitAtLatticePoints` emits `corner, splits-of-edge-0,
      // corner, …`, so every brick whose first edge carries a T-vertex lands
      // exactly there — a quarter of the faces on a basket-weave cube.
      const n = newellNormal(spun as Vec3[]);
      facing = n[2] / (Math.hypot(n[0], n[1], n[2]) || 1);
    }
    // An open or one-sided surface shows its back through the band, the open
    // end or the neck, so nothing of it is culled; the back is shaded by how
    // squarely it faces the viewer just the same, and darkened below.
    const back = facing < 0;
    if (surface?.twoSided) facing = Math.abs(facing);
    else if (facing <= 0.06) continue; // back-facing, and the rim it would alias with
    // Blocky boards have far more, far smaller cells than a sphere's, so their
    // seams are cut thinner or the tiles dissolve into speckle. A card's seams
    // are cut thinner again: at four times the size the icon's 6-10% gap reads
    // as a gap rather than as the board's grout.
    const inset = lit ? (kind === "round" ? 0.96 : 0.975) : kind === "round" ? 0.9 : 0.94;
    faces.push({
      pts: spun.map((v) => [mid[0] + (v[0] - mid[0]) * inset, mid[1] + (v[1] - mid[1]) * inset]),
      full: spun.map((v) => [v[0], v[1]]),
      depth: mid[2],
      facing,
      lambert: lit ? lambertOf(spun as Vec3[], facing) : 0,
      tone: tones?.get(cell) ?? shapeMetrics(poly),
      back,
    });
  }
  // Fit the silhouette rather than the bounding sphere, so a solid that is not
  // round (a bipyramid, a frame) still fills the icon box — and place it by the
  // *silhouette's* centre, not the board's origin. The two are not the same
  // thing: a tetrahedron is centred on its centroid, but its projection runs
  // from the apex at +R to the opposite face plane at -R/3, so scaling the span
  // and then drawing about the origin hung 8% of the drawing over the top of
  // the box, where the SVG root clipped it, while a quarter of the box sat
  // empty below. Same recentring as `fitTiles`, `surfaceMesh` and the
  // whole-patch branch below.
  const lo = (k: 0 | 1): number => Math.min(...box.map((p) => p[k]!));
  const hi = (k: 0 | 1): number => Math.max(...box.map((p) => p[k]!));
  const scale = (D * 0.92) / Math.max(hi(0) - lo(0), hi(1) - lo(1));
  const [mx, my] = [(lo(0) + hi(0)) / 2, (lo(1) + hi(1)) / 2];
  faces.sort((f, g) => f.depth - g.depth);
  const toBox = ([x, y]: P): P => [C + (x - mx) * scale, C - (y - my) * scale];
  return faces.map((f) => {
    const pts = f.pts.map(toBox);
    // Lit: a continuous ramp between the tone's three variants, the way the
    // surfaces are shaded (see surfaceMesh). The icon's three buckets are what
    // a 38px solid needs to read as solid at all; on a card they band.
    if (!lit) {
      // the far side of a two-sided surface a shade down from the near side
      const step = f.back ? 1 : 0;
      const variants = [LIGHT, BASE, DARK, DARK];
      const variant = variants[(f.facing > 0.8 ? 0 : f.facing > 0.45 ? 1 : 2) + step]!;
      return shape(pts, variant, 0, f.tone, D * 0.008);
    }
    const base = tint(BASE, f.tone);
    const l = f.lambert;
    const lit2 =
      l > 0.5
        ? mixHex(base, tint(LIGHT, f.tone), (l - 0.5) * 2)
        : mixHex(tint(DARK, f.tone), base, l * 2);
    const fill = f.back ? mixHex(lit2, tint(DARK, f.tone), 0.4) : lit2;
    // The grout first, the whole face, as the board lays its grout under the
    // tiles (render/solidBoard.ts): the seams are then solid lines rather
    // than holes onto whatever is behind — the far side of a band, the
    // inside of a tube. Lit with the tile, so it turns with the surface, and
    // stroked in its own colour to seal the hairline between two neighbours'
    // grout. The tile over it is fill alone: a stroke over the deliberate
    // inset would only smear the edge the card is big enough to show cleanly.
    const grout = mixHex(fill, GROUT_INK, 0.5);
    return (
      `<path d="${roundedPath(f.full.map(toBox), 0)}" fill="${grout}" stroke="${grout}" ` +
      `stroke-width="${n(sw(1.2))}" stroke-linejoin="round"/>` +
      `<path d="${roundedPath(pts, D * 0.006)}" fill="${fill}"/>`
    );
  });
}

/** What a card's grout is mixed toward: the board's mid-grey grout
 * (render/solidBoard.ts `BASE_COLOR`) a step warmer and deeper, so a seam reads
 * as the shadowed edge between two tiles rather than a grey wire. */
const GROUT_INK = "#5f5850";

/** How squarely a face meets the light, in 0..1 — the shading a card's solids
 * take. Falls back to how squarely the face meets the viewer when the polygon
 * is too degenerate to have a normal (see the Newell note above). */
function lambertOf(spun: Vec3[], facing: number): number {
  const light = [-0.35, 0.5, 0.79] as const;
  const nrm = newellNormal(spun);
  const len = Math.hypot(nrm[0], nrm[1], nrm[2]);
  if (len < 1e-9) return facing;
  return Math.abs((nrm[0] * light[0] + nrm[1] * light[1] + nrm[2] * light[2]) / len);
}

/** The tiling a flat family row is drawn from: a small patch of it on the row
 * icon, and on a desktop card the whole tiling wallpapered, as its boards' own
 * cards are (`buildPreview`), rather than the row icon blown up. */
const FAMILY_TILINGS: Record<string, string> = {
  // 3.4.6.4: a triangle, a square and a hexagon in one figure
  uniform: "rhombitrihex",
  // its own Laves dual (the two family rows are a dual pair themselves)
  dual: "deltoidal",
  // 4.6.12; 3.4.6.4: a dodecagon ringed by squares and hexagons beside a
  // 3.4.6.4 patch — the four shapes the family is made of
  "2-uniform": "dodecarhombitrihex",
  // rotated hexagonal, the clearest picture of what the family is — tiles
  // sliding along each other's edges rather than meeting them, with the gaps
  // that opens filled by a second shape
  isogonal: "rotatedhex",
  // the herringbone, the bond whose staggered rectangles read as a pattern even
  // at icon size (a stacked or running bond patch is a handful of plain bars)
  rectangle: "herringbone",
  // Dürer's pentagons, the one of its three that reads in two colours at icon
  // size (a rep-tile patch is a huddle of one tone)
  other: "durer",
};

/** Menu keys that reuse another key's drawing (gui.py _ICON_ALIASES). */
const ALIASES: Record<string, string> = {
  tri: "trigrid",
  aperiodic: "penrose",
  spiral: "phyllotaxis", // the Spirals family row: the sunflower
  reptile: "sphinx", // the Rep-tiles family row
  fractal: "pentaflake", // the Fractals family row: round, gaps at every scale
  hyperbolic: "hyperbolic73", // the Hyperbolic family row: the game's namesake
  // the Hyperbolic page's three submenus: a {p,q} other than the group's own
  // {7,3}, the uniform tiling with the most kinds of corner on show, and
  // Klein's quartic, the best known of the closed surfaces
  "hyperbolic-regular": "hyperbolic54",
  "hyperbolic-uniform": "hyperbolic3474",
  "hyperbolic-closed": "quartic",
  // the solid-group rows borrow one of their own members' icons: there is no
  // board named "platonic", "archimedean" or "catalan" to draw, and
  // "polyhedra" now holds the frames and the stacks rather than the cube
  platonic: "tetrahedron",
  archimedean: "cubocta",
  catalan: "rhombictriaconta",
  polyhedra: "steppedbipyramid",
  solids: "dodecahedron", // the Solids page: the four above are its submenus
  volume: "cube3d", // the Volumes row: its only board
  classic: "square", // the "Classic" home entry: flat squares
  manifolds: "torus", // the "Flat manifolds" entry under Custom
  // the Sphere group's row and the "3D" home entry: a Goldberg polyhedron,
  // hexagons with the twelve pentagons a sphere needs. Not "sphere", which
  // names the pentagonal hexecontahedron, now one of the Catalan solids
  spheres: "c180",
  "3d": "c180", // a random board off the plane
  // the "Custom" home entry: the uniform tiling with three shapes in one
  // figure, the triangle, square and hexagon the regular tilings are made of
  custom: "rhombitrihex",
  random: "start", // the pygame menu's "Random" picker entry
};

const SPHERES = ["gp21", "c180", "spheretri", "spheresquare", "projective"];

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
  steppedpyramid: { sides: 4, regularity: 1 },
  // a brick, not a square. All four angles are right, so `shapeMetrics`
  // averages a perfect 1 against the side ratio: 0.75 for a 2-to-1 brick,
  // 2/3 for the three-brick weave's 3-to-1 one
  cubestackedbond: { sides: 4, regularity: 0.75 },
  cubebasketweave: { sides: 4, regularity: 0.75 },
  cubebasketweave3: { sides: 4, regularity: 2 / 3 },
  cubebrickrings: { sides: 4, regularity: 0.75 },
  tetrahedron: { sides: 3, regularity: 1 },
  tetraframe: { sides: 3, regularity: 1 },
  octahedron: { sides: 3, regularity: 1 },
  icosahedron: { sides: 3, regularity: 1 },
  dodecahedron: { sides: 3, regularity: 0.8 }, // the pentagon's fan wedge, 72-54-54
  sphere: { sides: 5, regularity: 0.95 },
  gp21: { sides: 6, regularity: 0.95 },
  c180: { sides: 6, regularity: 0.95 },
  spheretri: { sides: 3, regularity: 1 },
  spheresquare: { sides: 4, regularity: 1 },
  projective: { sides: 4, regularity: 1 }, // the same cubed sphere
};

// -- achievement badges ----------------------------------------------------
//
// Four symbols, in the icon set's plain indigo rather than a shape colour:
// they stand for a milestone rather than for a tile, and painting them in a
// tile hue would claim a shape they are not about. (The wins tiers' trophies
// are the exception: bronze, silver and gold, see `trophy`.)

/** A symbol on the icon set's plain disc, so a badge with no tiling in it still
 * fills the same box a tiling patch does. */
function badge(path: string): string[] {
  // even-odd: these symbols have holes in them -- the warning triangle's bar
  // and dot -- and a hole is a subpath, not a second colour.
  return [
    circle(C, C, D * 0.42, null, 0, LIGHT),
    `<path d="${path}" fill="${plain("dark")}" fill-rule="evenodd"/>`,
  ];
}

function starPath(d: number): string {
  // A five-pointed star: alternate points on two circles.
  const outer = d * 0.28;
  const inner = outer * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-90 + i * 36) * (Math.PI / 180);
    pts.push(`${n(C + r * Math.cos(a))} ${n(C + r * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/** The difficulty ladder: three bars rising left to right, `filled` of them
 * solid. All three are always drawn — one lonely bar says nothing about which
 * rung of what, where a filled bar against two empty ones does. */
function barsRects(d: number, filled: number, total: number): string[] {
  const width = d * 0.14;
  const gap = d * 0.06;
  const left = C - (total * width + (total - 1) * gap) / 2;
  const foot = d * 0.72;
  const rects: string[] = [];
  for (let i = 0; i < total; i++) {
    const h = d * 0.18 + i * d * 0.13;
    const x = left + i * (width + gap);
    const on = i < filled;
    rects.push(
      `<rect x="${n(x)}" y="${n(foot - h)}" width="${n(width)}" height="${n(h)}" rx="${n(
        d * 0.02,
      )}" fill="${on ? plain("dark") : "none"}" stroke="${plain("dark")}" stroke-width="${n(
        sw(3),
      )}" stroke-opacity="${on ? 1 : 0.45}"/>`,
    );
  }
  return rects;
}

/** A rectangle with its corners rounded by `r`, as a clockwise subpath. */
function roundRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M ${n(x + r)} ${n(y)} H ${n(x + w - r)} Q ${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)} ` +
    `V ${n(y + h - r)} Q ${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} ` +
    `H ${n(x + r)} Q ${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)} V ${n(y + r)} ` +
    `Q ${n(x)} ${n(y)} ${n(x + r)} ${n(y)} Z`
  );
}

/** The wins milestones' metals, lowest tier first: a light disc and the cup
 * on it in a deep shade of the same metal, the two-tone of every other badge. */
const TROPHY_METALS: { disc: string; ink: string }[] = [
  { disc: "#e8c2a0", ink: "#8c5530" }, // bronze
  { disc: "#d9dee4", ink: "#5f6b78" }, // silver
  { disc: "#f3d77e", ink: "#94700f" }, // gold
];

/** The trophy: a lipped rim, a bowl that narrows into its stem, a collar and a
 * plinth, and two loop handles.
 *
 * Not a `badge()`: the pieces meet and overlap (the handles run into the bowl,
 * the collar onto the stem), and under even-odd every overlap is a hole — the
 * old drawing had a light sliver across its stem for exactly that reason. It
 * has no holes, so the body is one nonzero fill, every subpath clockwise, and
 * the handles are a round-capped stroke rather than outlines of one.
 *
 * `tier` 1 to 3 is the wins milestone it stands for, drawn in bronze, silver
 * and gold — the one place a badge leaves the theme's palette, because a
 * metal's rank is the thing the colour says. A bare `trophy` is the plain
 * chrome. */
function trophy(d: number, tier?: number): string[] {
  const metal = tier === undefined ? undefined : TROPHY_METALS[tier - 1];
  const ink = metal?.ink ?? plain("dark");
  const body =
    roundRectPath(d * 0.31, d * 0.24, d * 0.38, d * 0.05, d * 0.015) +
    ` M ${n(d * 0.34)} ${n(d * 0.29)} H ${n(d * 0.66)} ` +
    `C ${n(d * 0.66)} ${n(d * 0.45)} ${n(d * 0.6)} ${n(d * 0.54)} ${n(d * 0.525)} ${n(d * 0.565)} ` +
    `V ${n(d * 0.64)} H ${n(d * 0.475)} V ${n(d * 0.565)} ` +
    `C ${n(d * 0.4)} ${n(d * 0.54)} ${n(d * 0.34)} ${n(d * 0.45)} ${n(d * 0.34)} ${n(d * 0.29)} Z ` +
    roundRectPath(d * 0.42, d * 0.63, d * 0.16, d * 0.04, d * 0.01) +
    " " +
    roundRectPath(d * 0.37, d * 0.67, d * 0.26, d * 0.08, d * 0.016);
  const handles =
    `M ${n(d * 0.35)} ${n(d * 0.32)} C ${n(d * 0.24)} ${n(d * 0.31)} ${n(d * 0.24)} ${n(d * 0.47)} ` +
    `${n(d * 0.39)} ${n(d * 0.49)} ` +
    `M ${n(d * 0.65)} ${n(d * 0.32)} C ${n(d * 0.76)} ${n(d * 0.31)} ${n(d * 0.76)} ${n(d * 0.47)} ` +
    `${n(d * 0.61)} ${n(d * 0.49)}`;
  return [
    metal
      ? `<circle cx="${n(C)}" cy="${n(C)}" r="${n(D * 0.42)}" fill="${metal.disc}"/>`
      : circle(C, C, D * 0.42, null, 0, LIGHT),
    `<path d="${body}" fill="${ink}"/>`,
    `<path d="${handles}" fill="none" stroke="${ink}" stroke-width="${n(d * 0.036)}" ` +
      `stroke-linecap="round"/>`,
  ];
}

/** The "No flags" badge: the board's own flag (render/glyphAtlas.ts
 * `drawFlag`, the header's copy in ui/hud.ts) — the mast with its knob, the
 * pennant flush against it, the splayed foot — on the plain disc, with the
 * mast thickened a little, since a badge is seen far smaller than a cell.
 *
 * Not a `badge()`: the knob and the foot overlap the mast, and under even-odd
 * every overlap is a hole — the old T-stand flag had a light notch through its
 * foot for exactly that reason. */
function flagBadge(d: number): string[] {
  // the glyph's 24-unit grid, its extremes (x 3.3-20.4, y 2.4-20.6) 0.52 d
  // tall, nudged right of centre so the pennant's weight sits over the middle
  const u = (d * 0.52) / 18.2;
  const at = (x: number, y: number): P => [C + (x - 11.85) * u + d * 0.02, C + (y - 11.5) * u];
  const poly = (...pts: [number, number][]): string =>
    `M ${pts.map(([x, y]) => at(x, y).map(n).join(" ")).join(" L ")} Z`;
  const [kx, ky] = at(7.3, 3.5);
  const ink = plain("dark");
  return [
    circle(C, C, D * 0.42, null, 0, LIGHT),
    `<path d="${poly([6.4, 4], [8.2, 4], [8.2, 19.4], [6.4, 19.4])} ` +
      `${poly([5.6, 18.2], [9, 18.2], [11.4, 20.6], [3.3, 20.6])} ` +
      `${poly([8.2, 4.2], [20.4, 8.6], [8.2, 13.8])}" fill="${ink}"/>`,
    `<circle cx="${n(kx)}" cy="${n(ky)}" r="${n(1.15 * u)}" fill="${ink}"/>`,
  ];
}

function warningPath(d: number): string {
  // A triangle with a bar and a dot -- the same sign the menu marks a graded
  // board's row with.
  return (
    `M ${n(C)} ${n(d * 0.24)} L ${n(d * 0.78)} ${n(d * 0.72)} ` +
    `H ${n(d * 0.22)} Z ` +
    `M ${n(C - d * 0.035)} ${n(d * 0.4)} h ${n(d * 0.07)} v ${n(d * 0.16)} ` +
    `h ${n(-d * 0.07)} Z ` +
    `M ${n(C - d * 0.035)} ${n(d * 0.6)} h ${n(d * 0.07)} v ${n(d * 0.07)} ` +
    `h ${n(-d * 0.07)} Z`
  );
}

function draw(rawKey: string): string[] {
  const key = ALIASES[rawKey] ?? rawKey;
  const d = D;
  const parts: string[] = [];
  // The cell shape this icon stands for, where its art does not draw one.
  const cell: ShapeTone | undefined = ICON_TONES[key];

  // The achievement badges (ui/achievements.ts). A shape badge is the regular
  // polygon it is about, painted by the board palette's own rule for that side
  // count -- so the hexagon badge is the green a hexagonal board is drawn in,
  // and the badge and the board it stands for match without a table. The rest
  // are symbols: there is no geometry in "win ten boards".
  if (key.startsWith("ngon:")) {
    const sides = Number(key.slice(5));
    if (Number.isInteger(sides) && sides >= 3) {
      // Point-up for a triangle, flat-bottomed for everything else -- a
      // pentagon standing on a vertex reads as a fallen kite at icon size.
      const rotation = sides === 3 ? -90 : sides % 2 === 0 ? 180 / sides : -90;
      // `shape` measures the polygon it is given, so a regular n-gon picks up
      // the palette's hue for n with nothing passed in.
      return [shape(ngon(C, C, d * 0.4, sides, rotation))];
    }
  }
  if (key.startsWith("bars:")) {
    const filled = Number(key.slice(5));
    if (Number.isInteger(filled) && filled >= 1) {
      return [circle(C, C, D * 0.42, null, 0, LIGHT), ...barsRects(d, filled, 3)];
    }
  }
  if (key === "star") return badge(starPath(d));
  if (key === "trophy") return trophy(d);
  if (key.startsWith("trophy:")) {
    const tier = Number(key.slice(7));
    if (Number.isInteger(tier) && tier >= 1 && tier <= TROPHY_METALS.length) return trophy(d, tier);
  }
  if (key === "flag") return flagBadge(d);
  if (key === "warning") return badge(warningPath(d));

  // Every uniform and dual-uniform tiling draws a real patch of itself, and so
  // does each flat family row, from the member FAMILY_TILINGS names.
  if (ARCH_KEYS.has(key)) return tilingPatch(key);
  // the uniform family row is 3.4.6.4's vertex rosette rather than the ring
  // of tiles round one tile its own row draws
  if (key === "uniform") return tilingPatch(FAMILY_TILINGS[key]!, "rosette");
  if (key in FAMILY_TILINGS) return tilingPatch(FAMILY_TILINGS[key]!);
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
        `font-weight="700" font-size="${n(d * 0.92)}" fill="${plain("base")}">?</text>`,
    );
  } else if (key === "flat" || key === "square" || key === "torus_tile") {
    // a two-by-two corner of the grid, the way the hexagon icon is a 3-2-3
    // cluster: one square alone reads as a button, four as a board. Sized so
    // the outer corners stay 56 units out, inside the round crop the Game
    // Center badges are cut to (scripts/make-gamecenter.mts `BADGE_PX`)
    const s = d * 0.41;
    for (const [i, j] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as const) {
      const [x, y] = [C - s + i * s, C - s + j * s];
      const sq: P[] = [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
      ];
      parts.push(shape(seamed(sq)));
    }
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
    // a square's worth of the triangular grid, matching the two-by-two squares
    // and the 3-2-3 hexagons: three whole rows of five equilateral cells, 3
    // sides wide by 2.6 tall, each row a trapezoid the next one turns over, so
    // the sides step in and out rather than cutting a cell
    const h = Math.sqrt(3) / 2;
    const tiles: Tile[] = [];
    for (let j = 0; j < 3; j++) {
      const [top, bottom] = [j * h, (j + 1) * h];
      for (let i = 0; i < 5; i++) {
        const x = i / 2 - 1;
        // up and down cells alternate along a row, and swap row to row
        const pts: P[] =
          (i + j) % 2 === 0
            ? [
                [x - 0.5, bottom],
                [x + 0.5, bottom],
                [x, top],
              ]
            : [
                [x - 0.5, top],
                [x + 0.5, top],
                [x, bottom],
              ];
        tiles.push({ kind: "tri", pts, centre: centroid(pts) });
      }
    }
    // twice the seam: a triangle's edges sit closer to its centre than a
    // square's or a hexagon's, so the same fraction would be a thinner line
    for (const t of fitTiles(tiles, d * 0.92)) {
      parts.push(shape(seamed(t.pts, 2 * SEAM), BASE, 4, cell));
    }
  } else if (key === "hex") {
    // three, two, three: pointy-top hexagons a cell apart, the middle row
    // offset half a cell, which comes out as near a square as hexagons get
    // (5.2 radii wide by 5 tall)
    const r = (d * 0.92) / (3 * Math.sqrt(3));
    const dx = Math.sqrt(3) * r;
    for (const [row, count] of [
      [-1, 3],
      [0, 2],
      [1, 3],
    ] as const) {
      for (let k = 0; k < count; k++) {
        const hx = C + (k - (count - 1) / 2) * dx;
        parts.push(shape(seamed(hexagon(hx, C + row * 1.5 * r, r))));
      }
    }
  } else if (key === "hextri") {
    // the hexagonal triangle board: one hexagon cut into six triangles,
    // vertices left and right the way the board's outline sits
    const h = hexagon(C, C, d * 0.46, 0);
    for (let k = 0; k < 6; k++) {
      parts.push(shape([h[k]!, h[(k + 1) % 6]!, [C, C]], k % 2 ? BASE : LIGHT));
    }
  } else if (key === "squarediamond") {
    // the square tiling turned 45 degrees, on the radius-2 board: thirteen
    // diamonds whose centres are (u, v) with max(|u|, |v|) <= 2 and the two
    // the same parity -- a square outline with the sawtooth edge that is what
    // the board is for. The lattice unit is a half-diagonal, so the patch
    // spans 6 of them corner to corner.
    const r = (d * 0.92) / 6;
    for (let v = -2; v <= 2; v++) {
      for (let u = -2; u <= 2; u++) {
        if ((u + v) % 2 !== 0) continue;
        const [cx, cy] = [C + u * r, C + v * r];
        parts.push(
          shape([
            [cx, cy - r],
            [cx + r, cy],
            [cx, cy + r],
            [cx - r, cy],
          ]),
        );
      }
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
  } else if (SUBSTITUTIONS[key] || key === "fivetriangle") {
    // the substitution itself: the once-smaller tiles that fill one tile
    // (four for most rep-tiles, two to sixteen for the rest, eight around a
    // hole for the carpet), drawn from the board's own geometry -- turned the
    // way the board stands, for the two triangles whose inflation turns
    const tile = SUBSTITUTIONS[key];
    let polygons: P[][];
    if (tile) {
      const toXy = substitutionXy(tile, 1);
      polygons = substitutionPlacements(tile, 1).map((at) =>
        tile.outline.map((v): P => toXy(placePoint(tile, at, v))),
      );
    } else {
      // the five-triangle is no lattice substitution: its five triangles, cut once
      polygons = fiveTriangles(1).map((tri) => tri.map(([x, y]): P => [x!, y!]));
    }
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
  } else if (key === "kitedart") {
    // the star: five darts, tips at the centre, and a kite in each notch, its
    // 144° tail in the dart's reflex corner — both tiles at once, in the two
    // shades the board's own palette tells them apart by
    const r = (d * 0.485) / 1.618; // as far out as the rhombi's star reaches
    const at = (deg: number, radius: number): P => [
      C + radius * r * Math.cos((deg * Math.PI) / 180),
      C + radius * r * Math.sin((deg * Math.PI) / 180),
    ];
    for (let k = 0; k < 5; k++) {
      const a = 72 * k - 90;
      parts.push(shape([at(a, 0), at(a - 36, 1), at(a, 0.618), at(a + 36, 1)]));
      parts.push(shape([at(a, 0.618), at(a - 36, 1), at(a, 1.618), at(a + 36, 1)], LIGHT));
    }
  } else if (key === "ammannbeenker") {
    // the tiling's eight-fold centre: the star of eight 45° rhombi, and the
    // eight squares its 90° notches hold
    const side = (d * 0.46) / (1 + Math.SQRT2);
    const u: P[] = Array.from({ length: 10 }, (_, k) => [
      Math.cos(((45 * k - 90) * Math.PI) / 180),
      Math.sin(((45 * k - 90) * Math.PI) / 180),
    ]);
    const at = (...steps: number[]): P => [
      C + side * steps.reduce((x, k) => x + u[k]![0], 0),
      C + side * steps.reduce((y, k) => y + u[k]![1], 0),
    ];
    for (let k = 0; k < 8; k++) {
      parts.push(shape([at(), at(k), at(k, k + 1), at(k + 1)], LIGHT, 3));
      parts.push(shape([at(k + 1), at(k, k + 1), at(k, k + 1, k + 2), at(k + 1, k + 2)], BASE, 3));
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
  } else if (key === "klaassen") {
    // the seed and the first three hubs of the chain it starts: the nine-tile
    // fan where the chain turns back on itself (lighter), and the three fans of
    // four that already curl it into the spiral's one arm
    const tiles = klaassenTiles(1).filter((t) => t.hub <= 3);
    const pts = tiles.map((t) => t.ids.map(z7ToXy));
    const xs = pts.flat().map((p) => p[0]);
    const ys = pts.flat().map((p) => p[1]);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const sc = (d * 0.9) / Math.max(maxX - minX, maxY - minY);
    const ox = (d - (maxX - minX) * sc) / 2;
    const oy = (d - (maxY - minY) * sc) / 2;
    tiles.forEach((t, i) => {
      parts.push(
        shape(
          pts[i]!.map(([x, y]): P => [ox + (x - minX) * sc, oy + (maxY - y) * sc]),
          t.hub === 0 ? LIGHT : BASE,
          2,
        ),
      );
    });
  } else if (key === "hyperbolicbinary") {
    // the binary tiling's top three rows, two tiles, four and eight: each row
    // half the width of the one above, the top row lighter. Three, because the
    // fourth's sixteen are already too narrow to read at row size.
    const board = binaryBoard(2, 3, 1);
    const sc = (d * 0.9) / board.width;
    const ox = (d - board.width * sc) / 2;
    const oy = (d - board.height * sc) / 2;
    for (const [cell, poly] of board.polygons) {
      parts.push(
        shape(
          poly.map(([x, y]): P => [ox + x * sc, oy + y * sc]),
          cell.startsWith("0,") ? LIGHT : BASE,
          2,
        ),
      );
    }
  } else if (key === "hyperbolic-home") {
    // the Hyperbolic home entry: {5,4}, the right-angled pentagons, cut apart
    // by seams the way the sphere icons' faces are, so it reads as cells at a
    // glance where the family row's hairlines blur into one disc
    parts.push(...hyperbolicIcon("hyperbolic54", true));
  } else if (key in HYPERBOLIC_ICON_SHELLS) {
    parts.push(...hyperbolicIcon(key, false));
  } else if (key.startsWith("pentaspiral")) {
    // the innermost ring of hexagons, each drawn as its two pentagons: the n
    // that meet at the centre and the n of the odd wedges offset one side out,
    // the half with the 360/n corner lighter
    const board = pentaSpiralBoard(Number(key.slice("pentaspiral".length)), 1, null, 1);
    const cells = [...board.polygons];
    const xs = cells.flatMap(([, poly]) => poly.map((p) => p[0]));
    const ys = cells.flatMap(([, poly]) => poly.map((p) => p[1]));
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const sc = (d * 0.9) / Math.max(maxX - minX, maxY - minY);
    const ox = (d - (maxX - minX) * sc) / 2;
    const oy = (d - (maxY - minY) * sc) / 2;
    for (const [cell, poly] of cells) {
      parts.push(
        shape(
          poly.map(([x, y]): P => [ox + (x - minX) * sc, oy + (y - minY) * sc]),
          cell.endsWith(",0") ? LIGHT : BASE,
          2,
        ),
      );
    }
  } else if (key === "brickrings") {
    // the two-ring board, eight bricks in a 4×4 square: the smallest patch that
    // already shows a ring closing round the core. The core's own two bricks
    // are picked out in the darker tone — it is what the rings nest about, and
    // what tells the board from a plain bond at icon size
    const tiles = brickRingsTiles(2);
    const minX = Math.min(...tiles.map((t) => t[0]));
    const minY = Math.min(...tiles.map((t) => t[1]));
    const sc = (d * 0.84) / 4;
    const o = (d - 4 * sc) / 2;
    for (const [x, y, w, h] of tiles) {
      const left = o + (x - minX) * sc;
      const top = o + (4 - (y - minY) - h) * sc;
      const core = x >= -1 && x + w <= 1 && y >= -1 && y + h <= 1;
      parts.push(
        shape(
          [
            [left, top],
            [left + w * sc, top],
            [left + w * sc, top + h * sc],
            [left, top + h * sc],
          ],
          core ? BASE : LIGHT,
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
            (s, p, i) =>
              s + (p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1]),
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
  } else if (
    key === "steppedbipyramid" ||
    key === "steppedpyramid" ||
    key === "cubestackedbond" ||
    key === "cubebasketweave" ||
    key === "cubebasketweave3" ||
    key === "cubebrickrings" ||
    key === "tetraframe" ||
    key === "cube3d" ||
    key === "octahedron" ||
    key === "icosahedron" ||
    key === "dodecahedron" ||
    CATALAN_ICONS.includes(key) ||
    ARCHIMEDEAN_FLAT_ICONS.includes(key)
  ) {
    // All are the real board projected — a bipyramid whose terraces really do
    // step 7-5-3-1 out from the equator, a single stepped pyramid (the same
    // terraces with a playable foundation instead of a mirrored twin), a
    // Sierpinski tetrahedron with its four sub-tetrahedra and the hollow
    // between them, the octahedron/icosahedron's own flat triangular facets,
    // the dodecahedron's pentagons already fanned into triangles, and every
    // Catalan solid's own flat faces cut into the cells it is played on — all
    // tiled the way they are played on.
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
  } else if (SURFACE_ICONS[key]) {
    // the flat manifolds: the easy board's squares on its own immersion
    parts.push(...solidFaces(key, "surface"));
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

// -- card previews -----------------------------------------------------------
//
// The desktop menu draws a board as a card about 240x168, where the 38px glyph
// blown up reads as a blown-up glyph: one shape adrift in the middle of an
// empty box. A card shows the board instead — a flat board as its tiling
// running off all four edges, a solid as the real solid lit rather than sorted
// into three shades. Both come off the geometry the small icon already uses
// (the same `ArchTemplate`, the same easy-preset board), so a card and its
// sidebar row are one picture at two sizes rather than two drawings.

/** The preview's own box: wider than tall, and *covered* rather than fitted
 * (`slice` below), so one drawing fills a card of any width. */
const PREVIEW_W = 100;
const PREVIEW_H = 70;

/** Roughly how many tiles a wallpaper shows. Tiles are scaled to this count
 * rather than fitted to the patch the way `fitTiles` does, so a card of
 * hexagons and a card of triakis triangles show tiles of about the same size
 * instead of one filling the box with three shapes and the next with ninety. */
const PREVIEW_TILES = 20;

/** The boards that do not repeat, and the patch of each to draw.
 *
 * These must never reach the lattice below. `DOMAINS` has an entry for most of
 * them — but it exists to give the *page* a background CSS can tile, and says
 * so: its penrose is "the plainest periodic tiling the two of them make", its
 * phyllotaxis has "no spiral, since a spiral is not periodic". Repeating a
 * stand-in like that on a card claims the board repeats, which for an
 * aperiodic tiling or a substitution is the one thing that is not true of it.
 *
 * So each is the real thing instead, from the generator the board itself is
 * built by. `keep: null` asks for the whole patch the deflation already
 * computed rather than the board-sized window the preset trims it to — free,
 * and bigger than a card needs. Depths are the preset's, raised where a crop
 * would otherwise run past the patch's own boundary.
 *
 * `whole` is where the board's identity is its overall shape rather than the
 * arrangement underfoot: an island's ragged outline, the hyperbolic disc.
 * Cropped close, those are a hex grid and a field of polygons — true of the
 * neighbourhood, and the wrong thing said. They get the whole patch, fitted
 * with air around it, the way the shaped boards keep their silhouette. The
 * rest say what they are locally: Penrose's two rhombi never settling into a
 * repeat, the substitutions' tiles inside their own inflation, the pentaflake
 * and the carpet with the holes that are what they are made of.
 *
 * The spirals sit between the two. Their picture is the winding, which a
 * crop anywhere but the middle loses — but fitted whole, a patch grown out by
 * rings is a star of ragged arms, and the card shows the star rather than the
 * spiral. So they are cropped round their own `centre`, the card running edge
 * to edge, with `tiles` enough of them in the window for the arms to turn. */
interface PatchBoard {
  build: () => Board;
  whole?: true;
  /** Where the crop sits, instead of on the densest window. */
  centre?: (board: Board) => P;
  /** How many tiles the crop shows, instead of `PREVIEW_TILES`. */
  tiles?: number;
}

/** The middle of a patch with a rotational symmetry: the mean of its vertices,
 * which the symmetry carries onto itself. */
function symmetryCentre(board: Board): P {
  const pts = [...board.polygons.values()].flat();
  return [
    pts.reduce((sum, p) => sum + p[0], 0) / pts.length,
    pts.reduce((sum, p) => sum + p[1], 0) / pts.length,
  ];
}

/** Klaassen's seed has no symmetry to find it by; it is the hub its first fan
 * of tiles all start from (`klaassenTiles`: hub 0, each tile's first vertex). */
function klaassenSeed(board: Board): P {
  return board.polygons.get(cid(0, 0))![0] as P;
}

const SPIRAL = { centre: symmetryCentre, tiles: 60 } as const;

const PATCH_BOARDS: Record<string, PatchBoard> = {
  penrose: { build: () => penroseBoard(5, 437.727, null) },
  kitedart: { build: () => kiteDartBoard(5, 437.727, null) },
  ammannbeenker: { build: () => ammannBeenkerBoard(3, 35.891, null) },
  spectre: { build: () => spectreBoard(3, null, 14.361) },
  phyllotaxis: { build: () => phyllotaxisBoard(5, null, 22.907), ...SPIRAL },
  klaassen: { build: () => klaassenBoard(3, null, 29.521), ...SPIRAL, centre: klaassenSeed },
  pentaspiral5: { build: () => pentaSpiralBoard(5, 4, null, 10.85), ...SPIRAL },
  pentaspiral6: { build: () => pentaSpiralBoard(6, 4, null, 11.389), ...SPIRAL },
  pentaspiral7: { build: () => pentaSpiralBoard(7, 3, null, 12.097), ...SPIRAL },
  // Cropped, not whole: the rings are a course of bricks turning a quarter at
  // each remove from the middle, which is what the crop catches — a whole ring
  // block shrunk into the card is just a brick wall.
  brickrings: { build: () => brickRingsBoard(8, 27) },
  // The rep-tiles, the fractals and the shaped boards: the easy board itself,
  // whole. A rep-tile's or a fractal's picture is the one tile grown into
  // itself, which a crop of a
  // deeper patch loses; a shaped board *is* a regular tiling cut to an
  // outline, so wallpapered it would be the plain tiling it is cut from — the
  // one thing its picture must not say.
  ...Object.fromEntries(
    [...REPTILE_MODES, ...FRACTAL_MODES, ...Object.values(SHAPED_MODES).flat()].map((mode) => [
      mode,
      { build: () => presetBoard(mode, "easy") as Board, whole: true } as const,
    ]),
  ),
  // Whole: the disc is the picture -- the tiles shrinking toward a rim they
  // never reach is what a hyperbolic tiling looks like.
  hyperbolic93: { build: () => hyperbolicBoard(9, 3, 11, 100), whole: true },
  hyperbolic83: { build: () => hyperbolicBoard(8, 3, 13, 100), whole: true },
  hyperbolic73: { build: () => hyperbolicBoard(7, 3, 16, 100), whole: true },
  hyperbolic74: { build: () => hyperbolicBoard(7, 4, 14, 100), whole: true },
  hyperbolic64: { build: () => hyperbolicBoard(6, 4, 14, 100), whole: true },
  hyperbolic54: { build: () => hyperbolicBoard(5, 4, 18, 100), whole: true },
  hyperbolic55: { build: () => hyperbolicBoard(5, 5, 15, 100), whole: true },
  hyperbolic45: { build: () => hyperbolicBoard(4, 5, 21, 100), whole: true },
  hyperbolic46: { build: () => hyperbolicBoard(4, 6, 17, 100), whole: true },
  hyperbolic37: { build: () => hyperbolicDisc("hyperbolic37", 16, 100), whole: true },
  hyperbolic38: { build: () => hyperbolicDisc("hyperbolic38", 14, 100), whole: true },
  hyperbolic667: { build: () => hyperbolicDisc("hyperbolic667", 18, 100), whole: true },
  hyperbolic31414: { build: () => hyperbolicDisc("hyperbolic31414", 17, 100), whole: true },
  hyperbolic3737: { build: () => hyperbolicDisc("hyperbolic3737", 18, 100), whole: true },
  hyperbolic3474: { build: () => hyperbolicDisc("hyperbolic3474", 16, 100), whole: true },
  hyperbolic4614: { build: () => hyperbolicDisc("hyperbolic4614", 16, 100), whole: true },
  hyperbolic668: { build: () => hyperbolicDisc("hyperbolic668", 16, 100), whole: true },
  hyperbolic31616: { build: () => hyperbolicDisc("hyperbolic31616", 16, 100), whole: true },
  hyperbolic3838: { build: () => hyperbolicDisc("hyperbolic3838", 16, 100), whole: true },
  hyperbolic3484: { build: () => hyperbolicDisc("hyperbolic3484", 16, 100), whole: true },
  hyperbolic4616: { build: () => hyperbolicDisc("hyperbolic4616", 16, 100), whole: true },
  hyperbolic588: { build: () => hyperbolicDisc("hyperbolic588", 18, 100), whole: true },
  hyperbolic41010: { build: () => hyperbolicDisc("hyperbolic41010", 18, 100), whole: true },
  hyperbolic4545: { build: () => hyperbolicDisc("hyperbolic4545", 18, 100), whole: true },
  hyperbolic4445: { build: () => hyperbolicDisc("hyperbolic4445", 18, 100), whole: true },
  hyperbolic4810: { build: () => hyperbolicDisc("hyperbolic4810", 18, 100), whole: true },
  hyperbolic688: { build: () => hyperbolicDisc("hyperbolic688", 16, 100), whole: true },
  hyperbolic41212: { build: () => hyperbolicDisc("hyperbolic41212", 16, 100), whole: true },
  hyperbolic4646: { build: () => hyperbolicDisc("hyperbolic4646", 16, 100), whole: true },
  hyperbolic4446: { build: () => hyperbolicDisc("hyperbolic4446", 16, 100), whole: true },
  hyperbolic4812: { build: () => hyperbolicDisc("hyperbolic4812", 16, 100), whole: true },
  hyperbolic51010: { build: () => hyperbolicDisc("hyperbolic51010", 16, 100), whole: true },
  hyperbolic669: { build: () => hyperbolicDisc("hyperbolic669", 11, 100), whole: true },
  // Whole as well: the rectangle with its rows halving down to the ideal line
  // is the picture, as the disc is the {p,q} boards'.
  hyperbolicbinary: { build: () => binaryBoard(2, 5, 100), whole: true },
  // The closed surfaces' tilings, drawn in the disc on their own: the boards
  // themselves build the surface and its cover, a second or more for all of
  // them, which a menu page cannot wait on. Up close a closed surface looks
  // like the plane it is glued from, so each card shows one of the tilings it
  // grows through: the quartic its subdivided medium, Macbeath's surface its
  // 6.6.7 (the soccer ball's disc), the triplet the plain heptagons of its
  // easy, the Bolza and Dyck surfaces the octagons among hexagons of their
  // GC(3,0) and GC(2,0), and Bring's surface its easy 4.4.4.5.
  bolza: { build: () => gcDisc(8, 3, 3, 24, 100), whole: true },
  quartic: { build: () => gcDisc(7, 3, 3, 30, 100), whole: true },
  dyck: { build: () => gcDisc(8, 3, 2, 18, 100), whole: true },
  bring: { build: () => hyperbolicDisc("hyperbolic4445", 18, 100), whole: true },
  macbeath: { build: () => hyperbolicDisc("hyperbolic667", 18, 100), whole: true },
  triplet: { build: () => hyperbolicDisc("hyperbolic73", 16, 100), whole: true },
};

/** The uniform hyperbolic boards, each one of Wythoff's operations on a {p,q}
 * (boards/hyperbolic.ts); every other hyperbolic mode is `hyperbolic{p}{q}`.
 * Must match `_HYPERBOLIC_UNIFORM` in gui.py. */
const HYPERBOLIC_UNIFORM: Record<string, readonly [number, number, WythoffOp]> = {
  hyperbolic667: [7, 3, "zip"],
  hyperbolic31414: [7, 3, "truncate"],
  hyperbolic3737: [7, 3, "ambo"],
  hyperbolic3474: [7, 3, "expand"],
  hyperbolic4614: [7, 3, "bevel"],
  hyperbolic668: [8, 3, "zip"],
  hyperbolic31616: [8, 3, "truncate"],
  hyperbolic3838: [8, 3, "ambo"],
  hyperbolic3484: [8, 3, "expand"],
  hyperbolic4616: [8, 3, "bevel"],
  hyperbolic588: [5, 4, "zip"],
  hyperbolic41010: [5, 4, "truncate"],
  hyperbolic4545: [5, 4, "ambo"],
  hyperbolic4445: [5, 4, "expand"],
  hyperbolic4810: [5, 4, "bevel"],
  hyperbolic688: [6, 4, "zip"],
  hyperbolic41212: [6, 4, "truncate"],
  hyperbolic4646: [6, 4, "ambo"],
  hyperbolic4446: [6, 4, "expand"],
  hyperbolic4812: [6, 4, "bevel"],
  hyperbolic51010: [5, 5, "zip"],
  hyperbolic669: [9, 3, "zip"],
  // the closed surface's row icon is its tiling's disc (see the icon above)
  bolza: [8, 3, "zip"],
  quartic: [7, 3, "zip"],
  dyck: [8, 3, "zip"],
  bring: [5, 4, "expand"],
  macbeath: [7, 3, "zip"],
  triplet: [7, 3, "zip"],
};

/** The closed surfaces (boards/hurwitz.ts), whose icon lights every face of
 * the surface's own tiling (every heptagon of a Hurwitz surface's).
 * Must match `_CLOSED_SURFACE_MODES` in gui.py. */
const CLOSED_SURFACE_MODES = Object.values(SURFACE_MODES);

/** A hyperbolic board's row icon: the board itself, a ring and a half deep,
 * inside the rim of the disc it never reaches -- drawn with its geodesic arcs
 * and square corners (a rounded corner on every arc point would blur the curve
 * away), the central polygon lighter (on {3,q}, the star of q triangles round
 * the central vertex: cells 0 .. q-1). Toned by the board's own corner mask,
 * so the arc points do not make a heptagon read as a 21-gon.
 *
 * `seams` parts the cells instead of outlining them, the rim left as a ring
 * with the background showing through: the home entry's look (see `draw`). */
function hyperbolicIcon(key: string, seams: boolean): string[] {
  const board = hyperbolicDisc(key, HYPERBOLIC_ICON_SHELLS[key]!, 1);
  const central = !(key in HYPERBOLIC_UNIFORM) && key.at(-2) === "3" ? Number(key.at(-1)) : 1;
  // A closed surface lights every face of its tiling (a Hurwitz surface's
  // heptagons) rather than the central one: with no rim, each of them is a
  // full cell. Must match gui.py.
  const lit = (cell: string) =>
    CLOSED_SURFACE_MODES.includes(key)
      ? board.cornerMask!.get(cell)!.filter(Boolean).length === CLOSED_SURFACES[key]!.p
      : Number(cell) < central;
  const tones = classifyShapes(board.polygons, board.cornerMask, true);
  const r = D * 0.46;
  const sc = (2 * r) / board.width;
  const parts = [
    seams
      ? `<circle cx="${n(C)}" cy="${n(C)}" r="${n(r)}" fill="none" stroke="${tint(
          "outline",
          tones.get("0")!,
        )}" stroke-width="${n(sw(3))}"/>`
      : circle(C, C, r, tones.get("0")!, 2, LIGHT),
  ];
  for (const [cell, polygon] of board.polygons) {
    const pts = polygon.map(([x, y]): P => [C - r + x * sc, C - r + y * sc]);
    parts.push(
      shape(
        seams ? inset(pts, centroid(pts), HYPERBOLIC_SEAM) : pts,
        lit(cell) ? LIGHT : BASE,
        seams ? 0 : 4,
        tones.get(cell)!,
        0,
      ),
    );
  }
  return parts;
}

/** The seamed hyperbolic icon's seam, a little wider than the flat cells'
 * (`SEAM`): its cells shrink toward the rim, and a seam in proportion to each
 * cell is what keeps the outer rings from closing up. */
const HYPERBOLIC_SEAM = 0.12;

/** A hyperbolic mode's disc trimmed to `shells`, with no mines. */
function hyperbolicDisc(key: string, shells: number, scale: number): Board {
  const uniform = HYPERBOLIC_UNIFORM[key];
  if (uniform) return hyperbolicUniformBoard(...uniform, shells, 0, scale);
  return hyperbolicBoard(Number(key.at(-2)), Number(key.at(-1)), shells, scale);
}

/** The hyperbolic boards' row icons: how many distance shells to draw -- the
 * central polygon, its ring, and the next ring's nearest cells, which is as
 * much as reads at row-icon size. Must match
 * `_HYPERBOLIC_ICON_SHELLS` in gui.py. */
const HYPERBOLIC_ICON_SHELLS: Record<string, number> = {
  hyperbolic93: 4,
  hyperbolic83: 4,
  hyperbolic73: 4,
  hyperbolic74: 4,
  hyperbolic64: 4,
  hyperbolic54: 4,
  hyperbolic55: 4,
  hyperbolic45: 5,
  hyperbolic46: 6,
  hyperbolic37: 5,
  hyperbolic38: 5,
  hyperbolic667: 4,
  hyperbolic31414: 4,
  hyperbolic3737: 4,
  hyperbolic3474: 5,
  hyperbolic4614: 5,
  hyperbolic668: 4,
  hyperbolic31616: 4,
  hyperbolic3838: 4,
  hyperbolic3484: 5,
  hyperbolic4616: 5,
  hyperbolic588: 5,
  hyperbolic41010: 5,
  hyperbolic4545: 5,
  hyperbolic4445: 5,
  hyperbolic4810: 5,
  hyperbolic688: 5,
  hyperbolic41212: 5,
  hyperbolic4646: 5,
  hyperbolic4446: 4,
  hyperbolic4812: 4,
  hyperbolic51010: 4,
  hyperbolic669: 3,
  bolza: 4,
  quartic: 4,
  dyck: 4,
  bring: 5,
  macbeath: 4,
  triplet: 4,
};

/** Where a mode's repeat domain is filed under another name. */
const DOMAIN_KEY: Record<string, string> = { trigrid: "tri" };

export interface Preview {
  svg: string;
  /** Whether the drawing runs to the edges (a tiling) or is a centred figure
   * with air around it (a solid, a surface, a shaped board's outline) — the
   * card drops its padding for the first and keeps it for the second. */
  tiled: boolean;
}

const previewCache = new Map<string, Preview>();

/** The large drawing a menu card shows for an icon key. Falls back to the row
 * icon for anything with neither a lattice nor a solid behind it. */
export function previewIcon(key: string): Preview {
  let preview = previewCache.get(key);
  if (preview === undefined) previewCache.set(key, (preview = muted(() => buildPreview(key))));
  return preview;
}

/** How much of the icon set's chroma a card keeps.
 *
 * The set is tuned for a 38px glyph, where a colour has a moment to carry
 * before the eye moves on; the same value over a 168px field shouts, most of
 * all on Sand, whose board runs at a fraction of it. Every preview is drawn
 * through this, not just the solids — a wallpapered tiling and a centred
 * glyph are the same large field, and muting one and not the other would put
 * two weights of the same palette side by side on one page. */
const PREVIEW_CHROMA = 0.5;

/** Draw under the icon palette turned down for a card.
 *
 * The drawing helpers all read the module-level palette rather than being
 * handed one (see `iconPalette`), so a card's colours are a scoped swap of it.
 * Nothing can observe the swap: `draw` is synchronous throughout, and the
 * palette is restored before this returns either way. */
function muted<T>(paint: () => T): T {
  const saved = iconPalette;
  const tint = saved.tint;
  iconPalette = {
    ...saved,
    tint: {
      ...(tint?.lightness === undefined ? {} : { lightness: tint.lightness }),
      chroma: (tint?.chroma ?? 0.85) * PREVIEW_CHROMA,
    },
  };
  try {
    return paint();
  } finally {
    iconPalette = saved;
  }
}

function buildPreview(rawKey: string): Preview {
  // the Hyperbolic home entry's card is its board's disc, as the {5,4} row's is
  if (rawKey === "hyperbolic-home") return buildPreview("hyperbolic54");
  const key = ALIASES[rawKey] ?? FAMILY_TILINGS[rawKey] ?? rawKey;
  // The patch source first: most of these keys have a `DOMAINS` entry too, and
  // it is the one that would lie about them (see PATCH_BOARDS).
  const board = patch(key);
  if (board) return board;
  const tiles = wallpaper(key);
  if (tiles) return tiledSvg(tiles);
  return figureSvg(
    SOLID_BUILDERS[key]
      ? solidFaces(
          key,
          SURFACE_ICONS[key] ? "surface" : SPHERES.includes(key) ? "round" : "blocky",
          true,
        )
      : // Neither a patch, a lattice nor a solid: a family rosette, a shaped
        // board's outline. `draw` rather than `menuIcon`, which would
        // fill the row icons' cache with a card's muted colours.
        draw(rawKey),
  );
}

/** A drawing that runs to the card's edges. `slice` rather than the default
 * `meet`: the card is wider than this box on a roomy pane and narrower on a
 * tight one, and a tiling should fill it either way. Anything outside the
 * viewBox is clipped by the root element. */
function tiledSvg(parts: string[]): Preview {
  return {
    svg:
      `<svg viewBox="0 0 ${PREVIEW_W} ${PREVIEW_H}" preserveAspectRatio="xMidYMid slice"` +
      ` aria-hidden="true" focusable="false">${parts.join("")}</svg>`,
    tiled: true,
  };
}

/** A drawing that sits in the card with air around it — the card's padding,
 * and nothing more. The parts are drawn for the row icon's square box with a
 * margin of their own, and a square box `meet`-fitted into a card half again
 * as wide as it is tall leaves a wide board (a triangle, a Möbius band, a row
 * of fractal pentagons) at the height of the card and the air on every side.
 * So the viewBox is the drawing's own bounding box: the card's frame then
 * fits the board, whichever of its two sides is the one that limits it. */
function figureSvg(parts: string[]): Preview {
  const [x, y, w, h] = figureBox(parts) ?? [0, 0, D, D];
  return {
    svg:
      `<svg viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}" aria-hidden="true" focusable="false">` +
      `${parts.join("")}</svg>`,
    tiled: false,
  };
}

/** Room left round a figure's bounding box for the outlines drawn on its
 * edge, in icon units — wider than the widest stroke `shape` gives a tile. */
const FIGURE_MARGIN = 1.5;

/** The bounding box of a figure's paths and circles, as `[x, y, w, h]`, or
 * `null` for a drawing with anything this does not read — a relative or arc
 * path command, a rectangle, text — which keeps the whole icon box. Every
 * number in an absolute M/L/Q path is a coordinate pair, control points
 * included; a control point lies on the hull of its curve, so the box can
 * only come out a touch generous, never short. */
function figureBox(parts: string[]): [number, number, number, number] | null {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number, r = 0): void => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  for (const part of parts) {
    for (const [, tag, attrs = ""] of part.matchAll(/<(\w+)\b([^>]*)>/g)) {
      if (tag === "path") {
        const d = /\sd="([^"]*)"/.exec(attrs)?.[1];
        if (d === undefined || /[^MLQZ\d\s.,-]/.test(d)) return null;
        const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) take(nums[i]!, nums[i + 1]!);
      } else if (tag === "circle") {
        const num = (name: string): number =>
          Number(new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1]);
        take(num("cx"), num("cy"), num("r"));
      } else {
        return null;
      }
    }
  }
  if (!(maxX > minX && maxY > minY)) return null;
  return [
    minX - FIGURE_MARGIN,
    minY - FIGURE_MARGIN,
    maxX - minX + 2 * FIGURE_MARGIN,
    maxY - minY + 2 * FIGURE_MARGIN,
  ];
}

/** A periodic tiling as a lattice: one domain's tiles, and the translations
 * that repeat them. Two sources, both already in the build — the templates the
 * boards are cut from, and the handful of domains `backgroundPattern` states
 * for the boards that are built by hand rather than from a template. */
interface Lattice {
  width: number;
  height: number;
  cells: (m: number, n: number) => Tile[];
  /** mean tile area in the tiling's own units, for the scale above */
  area: number;
}

function latticeFor(key: string): Lattice | null {
  if (ARCH_KEYS.has(key)) {
    const t = archTemplate(key);
    return {
      width: t.width,
      height: t.height,
      cells: (m, n) => copyTiles(t, m, n),
      area: meanTileArea(copyTiles(t, 0, 0)),
    };
  }
  const build = DOMAINS[DOMAIN_KEY[key] ?? key];
  if (!build) return null;
  const domain = build();
  const cells = (m: number, n: number): Tile[] =>
    domain.cells.map((cell, i) => {
      const pts = cell.map(([x, y]): P => [x + m * domain.width, y + n * domain.height]);
      return { kind: `cell${i}`, pts, centre: centroid(pts) };
    });
  return { width: domain.width, height: domain.height, cells, area: meanTileArea(cells(0, 0)) };
}

/** Mean tile area, from the shoelace sum. `backgroundPattern` sizes the page's
 * pattern against the same measure, for the same reason: it is what makes one
 * tiling's tiles come out the size of another's. */
function meanTileArea(tiles: { pts: P[] }[]): number {
  const area = (pts: P[]): number => {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      sum += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(sum) / 2;
  };
  return tiles.reduce((sum, t) => sum + area(t.pts), 0) / tiles.length;
}

function wallpaper(key: string): string[] | null {
  const lattice = latticeFor(key);
  if (!lattice) return null;
  const scale = Math.sqrt((PREVIEW_W * PREVIEW_H) / PREVIEW_TILES / lattice.area);
  // Copies enough to reach either edge from the middle, plus one: a cell's
  // vertices can point into the neighbouring domain copy (`Ref.dm/dn`), so the
  // outermost ring is what keeps a corner from showing the card through.
  const cols = Math.ceil(PREVIEW_W / 2 / (lattice.width * scale)) + 1;
  const rows = Math.ceil(PREVIEW_H / 2 / (lattice.height * scale)) + 1;
  // y flipped: tilings are y-up, SVG is y-down.
  const place = (p: P): P => [PREVIEW_W / 2 + p[0] * scale, PREVIEW_H / 2 - p[1] * scale];
  const tiles: Tile[] = [];
  for (let m = -cols; m <= cols; m++) {
    for (let n = -rows; n <= rows; n++) {
      for (const tile of lattice.cells(m, n)) {
        const pts = tile.pts.map(place);
        if (offBox(pts)) continue;
        tiles.push({ ...tile, pts, centre: place(tile.centre) });
      }
    }
  }
  return tileSvg(tiles);
}

/** Placed tiles, drawn the way the board draws its cells.
 *
 * Every tile on its own tone — same shape, same colour, told apart by the
 * grout between them; the small patch alternates shades instead, which reads
 * as a figure at six tiles and as banding at sixty.
 *
 * Grout rather than an outline: a stroke sits centred on a shared edge, so
 * each seam is painted twice, once by each neighbour, in a colour a hair off
 * the fill — at card size a smear rather than a line. The board strokes
 * nothing; it pulls each cell in from its edges and lets the page show
 * through (`CellProfile.gap`, render/cellStyle.ts).
 *
 * And square corners, on every theme: `CellProfile` carries that gap and no
 * rounding at all, so every board's cells are as sharp as their polygons. The
 * icon set rounds by `CORNER` — the pygame menu's convention, about a pixel on
 * a 38px glyph, but five on a card, where it reads as a bevel the board does
 * not have. */
function tileSvg(tiles: Tile[]): string[] {
  return tiles.map((t) => shape(inset(t.pts, t.centre, GROUT), BASE, 0, t.tone, 0));
}

const patchCache = new Map<string, Board>();

/** A board that does not repeat, drawn from the board itself (see
 * PATCH_BOARDS) — so what a card shows is the tiling, rather than a repeat of
 * a sample of it. Cropped at a wallpaper's tile size, or fitted whole where
 * the board's shape is the thing to see. */
function patch(key: string): Preview | null {
  const source = PATCH_BOARDS[key];
  if (!source) return null;
  let board = patchCache.get(key);
  if (!board) patchCache.set(key, (board = source.build()));
  // Tones measured across the whole board, as the played board measures them
  // (render/solidBoard.ts) — it is what separates Penrose's thick rhombus from
  // its thin one, the pair being the same four-sided shape.
  const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
  const cells = [...board.polygons].map(([id, poly]) => ({
    pts: poly as P[],
    tone: tones.get(id)!,
  }));
  const mids = cells.map((c) => centroid(c.pts));

  if (source.whole) return wholeSvg(cells, mids);

  const scale = Math.sqrt(
    (PREVIEW_W * PREVIEW_H) /
      (source.tiles ?? PREVIEW_TILES) /
      meanTileArea(cells.map((c) => ({ pts: c.pts }))),
  );
  const [cx, cy] = source.centre
    ? source.centre(board)
    : densest(mids, PREVIEW_W / 2 / scale, PREVIEW_H / 2 / scale);
  const place = (p: P): P => [
    PREVIEW_W / 2 + (p[0] - cx) * scale,
    PREVIEW_H / 2 + (p[1] - cy) * scale,
  ];
  const tiles: Tile[] = [];
  for (const cell of cells) {
    const pts = cell.pts.map(place);
    if (offBox(pts)) continue;
    tiles.push({ kind: "cell", pts, centre: centroid(pts), tone: cell.tone });
  }
  return tiles.length > 0 ? tiledSvg(tileSvg(tiles)) : null;
}

/** A flat board's every cell, fitted whole into the figure box. */
function wholeSvg(cells: { pts: P[]; tone: ShapeTone }[], mids: P[]): Preview {
  const xs = cells.flatMap((c) => c.pts.map((p) => p[0]));
  const ys = cells.flatMap((c) => c.pts.map((p) => p[1]));
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = (D * 0.94) / Math.max(maxX - minX, maxY - minY);
  const place = (p: P): P => [
    C + (p[0] - (minX + maxX) / 2) * scale,
    C + (p[1] - (minY + maxY) / 2) * scale,
  ];
  return figureSvg(
    tileSvg(
      cells.map((c, i) => ({
        kind: "cell",
        pts: c.pts.map(place),
        centre: place(mids[i]!),
        tone: c.tone,
      })),
    ),
  );
}

// -- level previews ----------------------------------------------------------
//
// A board's own card shows the board it opens, at the difficulty the pills
// have selected: the whole level, every cell, the way the game deals it — a
// flat board as its outline, a solid or a wrapped surface as the real thing
// lit. So the card changes with the difficulty, as the level does. The
// `previewIcon` drawings stay for what is not a level (a family, a random
// pool) and as the placeholder a card shows while its board is built, which
// the menu does in the background (ui/menu.ts `paintLevel`).

const levelCache = new Map<string, Preview>();

/** How many level previews are kept. Each is a string of SVG, not a board, so
 * a few hundred — every board at one difficulty — cost little. */
const LEVEL_KEEP = 600;

/** The board an icon key stands for, when it stands for one: a mode's own
 * key, or the board an alias or a family row is drawn from — the Uniform
 * family's rhombitrihexagonal, Solids' dodecahedron, the Hyperbolic home
 * entry's {5,4}. `undefined` for a drawing that is no board (a badge, the
 * question mark). A family or group card shows this board's level, so it
 * follows the difficulty the way a board's own card does. */
export function iconBoard(rawKey: string): string | undefined {
  if (rawKey === "hyperbolic-home") return "hyperbolic54";
  const key = ALIASES[rawKey] ?? FAMILY_TILINGS[rawKey] ?? rawKey;
  return hasMode(key) ? key : undefined;
}

/** The card for `mode` at `difficulty`, if it has already been drawn. */
export function cachedLevelPreview(mode: string, difficulty: string): Preview | undefined {
  return levelCache.get(`${mode}|${difficulty}`);
}

/** The card for `mode` at `difficulty`: its real board, built fresh
 * (`presetBoard`, which leaves the game's restart cache alone) and drawn whole. */
export function levelPreview(mode: string, difficulty: string): Preview {
  const key = `${mode}|${difficulty}`;
  let preview = levelCache.get(key);
  if (preview === undefined) {
    preview = muted(() => buildLevel(mode, difficulty));
    levelCache.set(key, preview);
    if (levelCache.size > LEVEL_KEEP) levelCache.delete(levelCache.keys().next().value!);
  }
  return preview;
}

function buildLevel(mode: string, difficulty: string): Preview {
  const board = presetBoard(mode, difficulty);
  if (isBoard3D(board)) {
    // Seen as its row icon is, from the surface's view for a wrapped tiling
    // (a torus of triangles turns like the torus), and painted the same way.
    const surface = surfaceOf(mode);
    const view = surface?.is3d ? surface.key : mode;
    const kind = SPHERES.includes(view) ? "round" : surface?.is3d ? "surface" : "blocky";
    return figureSvg(solidFaces(view, kind, true, board));
  }
  // Tones measured across the whole board, as the played board measures them.
  const tones = classifyShapes(board.polygons, board.cornerMask, board.curved);
  const cells = [...board.polygons].map(([id, poly]) => ({
    pts: poly as P[],
    tone: tones.get(id)!,
  }));
  return wholeSvg(
    cells,
    cells.map((c) => centroid(c.pts)),
  );
}

/** How far a preview's tiles are pulled in from their shared edges, as a
 * fraction of the way to the centre. The board's own grout — `CellProfile.gap`
 * is 0.1 on the Flat and Sand cell styles, 0.04 on Classic. */
const GROUT = 0.08;

/** How far a row icon's cells are pulled apart (`seamed`), as a fraction of
 * the way to each cell's centre — the sphere icons' seam (`solidFaces`). */
const SEAM = 0.1;

/** A cell shrunk toward its own centre by `gap`, so the background shows
 * between it and its neighbours as a line of contrast. */
function seamed(pts: P[], gap = SEAM): P[] {
  return inset(pts, centroid(pts), gap);
}

/** A polygon shrunk toward a point — the board's grout, and the seams between
 * a solid's faces (see `solidFaces`). */
function inset(pts: P[], towards: P, gap: number): P[] {
  return pts.map(([x, y]): P => [
    towards[0] + (x - towards[0]) * (1 - gap),
    towards[1] + (y - towards[1]) * (1 - gap),
  ]);
}

/** Where to sit a crop of half-extents `hx` by `hy` over a patch: on the tile
 * whose window holds the most of them.
 *
 * Not the patch's middle. A substitution leaves holes at every scale and the
 * biggest of them is usually dead centre — the Sierpinski carpet's central
 * ninth is wide enough at this depth to swallow the whole crop and leave
 * nothing to draw at all, and the pentaflake's gnomon gaps are nearly as
 * greedy. Holes belong in the picture; a card of nothing but hole does not. */
function densest(mids: P[], hx: number, hy: number): P {
  // Every tile is a candidate, but a patch runs to hundreds of them and the
  // answer does not need that resolution — a coarse sweep finds the same
  // neighbourhood for a fraction of the comparisons.
  const step = Math.max(1, Math.floor(mids.length / 64));
  let best = mids[0] ?? [0, 0];
  let most = -1;
  for (let i = 0; i < mids.length; i += step) {
    const c = mids[i]!;
    let held = 0;
    for (const m of mids) {
      if (Math.abs(m[0] - c[0]) <= hx && Math.abs(m[1] - c[1]) <= hy) held++;
    }
    if (held > most) [most, best] = [held, c];
  }
  return best;
}

/** Whether a placed tile falls entirely off one side of the preview box. */
function offBox(pts: P[]): boolean {
  return (
    pts.every((p) => p[0] < 0) ||
    pts.every((p) => p[0] > PREVIEW_W) ||
    pts.every((p) => p[1] < 0) ||
    pts.every((p) => p[1] > PREVIEW_H)
  );
}
