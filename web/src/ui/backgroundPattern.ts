// The page behind a board, patterned with that board's own tiling.
//
// Realistic is the one theme with a textured page (ui/theme.ts), and on
// Realistic the opened cells are translucent — so the page is not just the
// field around the board, it is what shows *through* it. This module makes that
// page follow the tiling: open `torustrihex` and the paper behind it is
// trihexagonal; open `kleincairo` and it is Cairo pentagons. Very small and
// very faint, on purpose: the detail is meant to be something a player notices
// after a while, not decoration competing with the board.
//
// Everything here is one CSS `background-image` layer — an inline SVG data URI.
// It has to be: the packaged macOS and iOS builds assert the bundle fetches
// nothing (scripts/check-offline-assets.mjs), so a texture that is a file on a
// CDN is a texture that does not exist offline. The only URL a tile may contain
// is the SVG namespace, which that checker already allows.
//
// THE PATTERN IS THE BOARD'S TILE, LAID DOWN PERIODICALLY.
//
// A board's own patch may be aperiodic, a fractal or wrapped round a solid, but
// what the page wants is the *tile* — and nearly every tile in the catalogue
// tiles the plane periodically all by itself, which is what makes a seamless
// repeat possible at all.
//
//  * The 27 `ARCH_TILINGS` come from `archTemplate`: a rectangular fundamental
//    domain, which is exactly a seamless repeat tile.
//  * The three regular tilings have no template — they are direct lattice
//    builders in boards/tilings.ts — so their domains are written out below, in
//    the units and the orientation those builders use.
//  * The five **fractal** boards do not repeat, but their tiles do: the Gosper
//    island is plain hexagons, the sphinx and the chair are rep-tiles that also
//    tile the plane in pairs, and the Sierpinski carpet is periodic once you
//    stop inflating. The pentaflake takes two tiles rather than one — regular
//    pentagons do not tile the plane, but pentagons and 36° rhombs do.
//  * Two of the three **aperiodic** boards are the same story. The
//    phyllotactic spiral's hexagon is a *parallelohexagon*, so it tiles by
//    translation alone — the spiral is in how the board's wedges are offset,
//    not in the tile. Penrose's two rhombs make a plain periodic tiling as
//    alternating courses of fat and thin diamonds. Neither is the board's own
//    tiling, and neither pretends to be: an aperiodic tiling has no repeat, so
//    a page that repeats can only be its tile.
//  * The **Spectre** is the one tile with no periodic tiling small enough to
//    use, so it alone is a cropped patch of the real board. See PATCH_BUILDERS.
//  * The spheres have no flat tiling at all, so they get circles.
//
// Every one of those reduces to `{width, height, cells}` (or, for the spheres,
// circle centres) in its own units, and one pipeline scales it, strokes it and
// encodes it. A tiling whose lattice is not rectangular goes through
// `latticeDomain`, which finds a rectangle inside it.

import type { Board, Vertex } from "../boards/core";
import { spectreBoard } from "../boards/aperiodic";
import {
  APERIODIC_MODES,
  POLYHEDRA_MODES,
  SHAPED_MODES,
  SPHERE_MODES,
  tilingOf,
} from "../boards/catalog";
import { MODES } from "../boards/presets";
import { archTemplate, templateCells } from "../boards/tilings";

// -- the look ---------------------------------------------------------------

/** Target mean cell area in CSS px² — about a 10 px cell. Several times finer
 * than a board cell, which is what makes the pattern something you find rather
 * than something you are shown. Normalising by *area* and not by edge length is
 * what keeps the line density even across the catalogue: a domain's mean tile
 * area runs from 0.33 (the three-brick basket weave) to 4.02 (truncated
 * hexagonal) in edge-length units, a 12x spread, so a fixed edge would draw the
 * bonds as a hatch and the dodecagons nearly board-sized. */
const CELL_AREA_PX = 108;

/** About how many line segments an aperiodic tile may hold — roughly 20–30 KB
 * encoded, which is the whole reason that tier is bounded at all: a period
 * carries one copy of a repeat, a crop carries every edge it draws. */
const PATCH_SEGMENT_BUDGET = 1600;

/** How much room an aperiodic tile's cell gets, per corner it has. Cells there
 * are coarser than the periodic tier's, and by a tile's own complexity: a
 * Penrose rhombus reads at any size, while a Spectre is a fourteen-gon and at
 * ten pixels is a smudge. It also spends the segment budget where it buys
 * something — the same budget as four hundred rhombi is two hundred spectres. */
const PATCH_AREA_PER_CORNER_PX = 70;

/** The largest share of a patch's shorter side the crop window may take. These
 * boards are grown and trimmed to a disc, so a window near the full width would
 * hang off the rim however it is placed. */
const PATCH_WINDOW = 0.62;

/** How full the crop window has to be before it is accepted — the fraction of
 * *sampled points* the tiling actually covers. `PATCH_WINDOW` is a guess about
 * a disc, and a patch is rarely one; this measures instead of guessing. A bay
 * of empty paper anywhere in the window shows up on the page as a smudge, and
 * shows up four times over where the tile's corners meet, so the bar is high. */
const PATCH_FILL = 0.995;

/** No repeat tile smaller than this on either axis. Rounding the tile to whole
 * pixels keeps it crisp across the seam; a tiny tile would round badly (and a
 * 12 px tile is 30 000 draws on a large page). */
const MIN_TILE_PX = 36;

/** The ink. Written plainly: `layer()` percent-encodes the whole document, so
 * a `#` escaped here would come back out as `%2523` and the stroke would be
 * dropped for an unparsable colour. */
const INK = "#4a5568";
const INK_ALPHA = 0.07;
/** A washed hole is a whole area rather than a line, so it reads much stronger
 * than the stroke at the same alpha; two thirds lands it about level. */
const HOLE_ALPHA = 0.035;
const STROKE_PX = 1;

// -- geometry ---------------------------------------------------------------

const ROOT3 = Math.sqrt(3);
const H3 = ROOT3 / 2;

/** A periodic patch: `cells` tile the plane under translation by `width` in x
 * and `height` in y. Units are the tiling's own (edge length 1, mostly). */
interface Domain {
  width: number;
  height: number;
  cells: Vertex[][];
  /** Where the tiling has a hole rather than a tile. Stroked outlines alone
   * cannot show one — a missing cell's boundary is still drawn, by the cells
   * around it — so a hole is washed in faintly instead. Only the Sierpinski
   * carpet has any, and without them its page would be a plain square grid. */
  holes?: Vertex[][];
}

const shift = (cell: Vertex[], dx: number, dy: number): Vertex[] =>
  cell.map(([x, y]): Vertex => [x + dx, y + dy]);

/** A `Domain` from a tiling given as tiles plus the lattice they repeat on.
 *
 * A rectangle is what a CSS background can tile, and most lattices are not
 * rectangular — the phyllotactic hexagon's is a rhombus at 36°. But a lattice
 * only needs to *contain* a rectangle: any orthogonal pair of lattice vectors
 * spans one, and the tiles in it are the tile set repeated over the cosets in
 * between. So: find the smallest orthogonal pair, turn it onto the axes, and
 * fill it.
 *
 * The search is over small integer combinations, which is enough because the
 * rectangle wanted is the smallest one — a rhombic lattice, the case here,
 * always has `v1 ± v2` and so index 2. A lattice with no orthogonal pair at all
 * has no rectangular tile either; this throws rather than emit a patch that
 * does not repeat. */
function latticeDomain(tiles: Vertex[][], v1: Vertex, v2: Vertex): Domain {
  const RANGE = 6;
  const combos: { v: Vertex; i: number; j: number }[] = [];
  for (let i = -RANGE; i <= RANGE; i++) {
    for (let j = -RANGE; j <= RANGE; j++) {
      if (i === 0 && j === 0) continue;
      combos.push({ v: [i * v1[0] + j * v2[0], i * v1[1] + j * v2[1]], i, j });
    }
  }
  let best: { a: Vertex; b: Vertex; area: number } | null = null;
  for (const p of combos) {
    for (const q of combos) {
      const dot = p.v[0] * q.v[0] + p.v[1] * q.v[1];
      const det = p.v[0] * q.v[1] - p.v[1] * q.v[0];
      if (Math.abs(dot) > 1e-9 || det <= 1e-9) continue;
      if (!best || det < best.area) best = { a: p.v, b: q.v, area: det };
    }
  }
  if (!best) throw new Error("no rectangular sublattice");
  // Turn `a` onto +x; `b` is perpendicular to it, so it lands on +y.
  const width = Math.hypot(best.a[0], best.a[1]);
  const height = Math.hypot(best.b[0], best.b[1]);
  const [cos, sin] = [best.a[0] / width, -best.a[1] / width];
  const turn = ([x, y]: Vertex): Vertex => [x * cos - y * sin, x * sin + y * cos];
  // One tile set per coset of the rectangle's lattice inside the tiling's own:
  // every i·v1 + j·v2, reduced into the rectangle and de-duplicated.
  const cells: Vertex[][] = [];
  const seen = new Set<string>();
  for (const { v } of [{ v: [0, 0] as Vertex }, ...combos]) {
    const [x, y] = turn(v);
    const rx = x - Math.floor(x / width + 1e-9) * width;
    const ry = y - Math.floor(y / height + 1e-9) * height;
    const key = `${Math.round(rx * 1e6)},${Math.round(ry * 1e6)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const tile of tiles) cells.push(shift(tile.map(turn), rx, ry));
  }
  return { width, height, cells };
}

const hexagon = (cx: number, cy: number, rotated: boolean): Vertex[] =>
  [0, 1, 2, 3, 4, 5].map((k): Vertex => {
    const a = ((k * 60 + (rotated ? 90 : 0)) * Math.PI) / 180;
    return [cx + Math.cos(a), cy + Math.sin(a)];
  });

const unitSquare = (x: number, y: number): Vertex[] => [
  [x, y],
  [x + 1, y],
  [x + 1, y + 1],
  [x, y + 1],
];

/** The sphinx (a hexiamond) in the triangular lattice, as boards/fractal.ts
 * writes it: bottom edge 3, then up-left, left, up-left, and two down-left. */
const SPHINX_TILE: Vertex[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [2.5, H3],
  [1.5, H3],
  [1, ROOT3],
  [0.5, H3],
];

/** The chair (the L-tromino), as boards/fractal.ts writes it — a vertex at
 * every lattice step, including the two that are collinear. Those are not
 * decoration: `collect` de-duplicates an edge by its endpoints, so a tile
 * carrying one long edge where its neighbour carries two short ones leaves
 * both in the set and strokes that line twice as dark as the rest. */
const CHAIR_TILE: Vertex[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 1],
];

/** The phyllotactic spiral's tile: the equilateral convex hexagon with angles
 * 72° and 144°, written the way boards/aperiodic.ts does — the partial sums of
 * three unit vectors 36° apart, so its opposite sides are equal and parallel.
 * That makes it a *parallelohexagon*, which tiles the plane by translation
 * alone on the lattice `u0 + u1`, `u1 + u2` (`PHYLLO_A` and `PHYLLO_B` there).
 * The board's spiral comes from how the ten wedges are offset against each
 * other, not from the tile; laid down plainly, the same hexagon is periodic. */
const PHYLLO_U: Vertex[] = [0, 1, 2].map((k): Vertex => [
  Math.cos((36 * k * Math.PI) / 180),
  Math.sin((36 * k * Math.PI) / 180),
]);

const PHYLLO_TILE: Vertex[] = [
  [0, 0],
  PHYLLO_U[0]!,
  [PHYLLO_U[0]![0] + PHYLLO_U[1]![0], PHYLLO_U[0]![1] + PHYLLO_U[1]![1]],
  [
    PHYLLO_U[0]![0] + PHYLLO_U[1]![0] + PHYLLO_U[2]![0],
    PHYLLO_U[0]![1] + PHYLLO_U[1]![1] + PHYLLO_U[2]![1],
  ],
  [PHYLLO_U[1]![0] + PHYLLO_U[2]![0], PHYLLO_U[1]![1] + PHYLLO_U[2]![1]],
  PHYLLO_U[2]!,
];

/** A tile turned a half turn about `(cx, cy)`. Both rep-tiles tile the plane in
 * pairs, and the second of each pair is the first upside down. */
const halfTurn = (cell: Vertex[], cx: number, cy: number): Vertex[] =>
  cell.map(([x, y]): Vertex => [2 * cx - x, 2 * cy - y]);

/** The domains this module states itself, because the boards they belong to are
 * built by hand rather than from an `ArchTemplate`. */
const DOMAINS: Record<string, () => Domain> = {
  // squareBoard: unit squares, axis aligned.
  square: () => ({ width: 1, height: 1, cells: [unitSquare(0, 0)] }),

  // triangleGridBoard: equilateral triangles of side 1 with horizontal bases,
  // rows √3/2 apart, alternating up and down. The rectangular period is
  // 1 x √3 — four triangles, area 4·(√3/4) = √3. ✓
  tri: () => {
    const row: Vertex[][] = [
      [
        [0, 0],
        [1, 0],
        [0.5, H3],
      ],
      [
        [1, 0],
        [1.5, H3],
        [0.5, H3],
      ],
    ];
    return {
      width: 1,
      height: ROOT3,
      cells: [...row, ...row.map((c) => shift(c, 0.5, H3))],
    };
  },

  // hexBoard: pointy-top hexagons of circumradius 1. Centres on (√3, 0) and
  // (√3/2, 3/2), so the rectangular period is √3 x 3 — two hexagons, area
  // 2·(3√3/2) = 3√3. ✓
  hex: () => ({
    width: ROOT3,
    height: 3,
    cells: [hexagon(0, 0, true), hexagon(H3, 1.5, true)],
  }),

  // The Gosper island's own hexagon is flat-top (its corners are the six units
  // of the Eisenstein lattice, so one sits on the real axis), and its centres
  // are the sublattice generated by 1 + ζ. Period 3 x √3, two hexagons.
  gosper: () => ({
    width: 3,
    height: ROOT3,
    cells: [hexagon(0, 0, false), hexagon(1.5, H3, false)],
  }),

  // The Sierpinski carpet is periodic once you stop inflating: take the
  // construction two levels deep and repeat the 9x9 block. Two levels rather
  // than one because the carpet is *holes at more than one scale* — one level
  // is a square grid with every ninth cell missing, which is a grid — so this
  // block carries the eight small holes and the big one they surround.
  carpet: () => {
    const gone = (x: number, y: number, step: number): boolean =>
      Math.floor(x / step) % 3 === 1 && Math.floor(y / step) % 3 === 1;
    const cells: Vertex[][] = [];
    const holes: Vertex[][] = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (gone(x, y, 3)) continue; // inside the big hole; drawn once, below
        (gone(x, y, 1) ? holes : cells).push(unitSquare(x, y));
      }
    }
    holes.push([
      [3, 3],
      [6, 3],
      [6, 6],
      [3, 6],
    ]);
    return { width: 9, height: 9, cells, holes };
  },

  // Two chairs — one of them upside down — fill a 3 x 2 rectangle, and that
  // rectangle tiles the plane. (The board's own chair tiling is the
  // substitution, which is reflection-free and not periodic; this is the same
  // tile laid down the plain way.)
  chair: () => ({
    width: 3,
    height: 2,
    cells: [CHAIR_TILE, halfTurn(CHAIR_TILE, 1.5, 1)],
  }),

  // Two sphinxes — again, one upside down — fill the parallelogram spanned by
  // (3, 0) and (1, √3). That lattice is not rectangular, but it contains
  // (0, 3√3), so three of those parallelograms stacked up the diagonal make a
  // 3 x 3√3 rectangle: six sphinxes, and a period in both axes.
  sphinx: () => ({
    width: 3,
    height: 3 * ROOT3,
    cells: [0, 1, 2].flatMap((k) => [
      shift(SPHINX_TILE, k, k * ROOT3),
      shift(halfTurn(SPHINX_TILE, 2, H3), k, k * ROOT3),
    ]),
  }),

  // The phyllotactic hexagon on its own translation lattice — no spiral, since
  // a spiral is not periodic, but the same tile and the same five-fold angles.
  // The lattice is a rhombus (|u0 + u1| = |u1 + u2|), so its smallest
  // rectangle is spanned by the two diagonals and holds two hexagons.
  phyllotaxis: () =>
    latticeDomain(
      [PHYLLO_TILE],
      [PHYLLO_U[0]![0] + PHYLLO_U[1]![0], PHYLLO_U[0]![1] + PHYLLO_U[1]![1]],
      [PHYLLO_U[1]![0] + PHYLLO_U[2]![0], PHYLLO_U[1]![1] + PHYLLO_U[2]![1]],
    ),

  // Two regular pentagons and one thin rhomb, on the lattice a torus
  // exact-cover search turns up for them — the smallest cell there is, and the
  // one the corner count above predicts. See PENT_U.
  pentaflake: () => {
    const pent = walk([0, 2, 4, 6, 8]);
    const rhomb = walk([0, 1, 5, 6]);
    const apex = pent[3]!; // the pentagon's far corner, (1/2, sin 72° + sin 36°)
    const shoulder = pent[2]!;
    const PHI = (1 + Math.sqrt(5)) / 2;
    return latticeDomain(
      [
        placeTile(pent, 0, [0, 0]),
        placeTile(pent, 3, apex),
        placeTile(rhomb, 8, [apex[0] - PHI, apex[1]]),
      ],
      [-shoulder[0], -shoulder[1]],
      [PHI * PHI - apex[0], -apex[1]],
    );
  },

  // Two rows of diamonds: a course of Penrose's fat rhombs (72°) and a course
  // of its thin ones (36°), which is the plainest periodic tiling the two of
  // them make. Each course fills a strip on its own, so the only question is
  // whether the strips ever line up again: a fat course shifts the vertices
  // along its upper edge by cos 72° and a thin one *mirrored* by cos 144°,
  // which is −cos 36°, and those sum to exactly −1/2. Two of each, and the
  // pattern has come back a whole edge — so the period is four courses, and
  // every interface is edge to edge.
  penrose: () => {
    const rhomb = (y: number, x: number, deg: number): Vertex[] => {
      const [dx, dy] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
      return [
        [x, y],
        [x + 1, y],
        [x + 1 + dx, y + dy],
        [x + dx, y + dy],
      ];
    };
    const [fat, thin] = [Math.sin((72 * Math.PI) / 180), Math.sin((36 * Math.PI) / 180)];
    let [y, x] = [0, 0];
    const cells: Vertex[][] = [];
    for (const [deg, rise] of [
      [72, fat],
      [144, thin],
      [72, fat],
      [144, thin],
    ] as const) {
      cells.push(rhomb(y, x, deg));
      x += Math.cos((deg * Math.PI) / 180);
      y += rise;
    }
    return { width: 1, height: y, cells };
  },
};

/** The pentaflake's page: regular pentagons and thin rhombs.
 *
 * Regular pentagons alone do not tile the plane — that is exactly why the
 * pentaflake is a fractal with gnomon-shaped holes rather than a tiling — but
 * pentagons *and* 36° rhombs do, and periodically. Three pentagons round a
 * point leave 360 − 3·108 = 36°, which is the rhomb's sharp corner, and two
 * leave 144°, which is its blunt one; count corners over those two vertex
 * figures (5p = 3a + 2b with a = b = 2r) and the ratio comes out at two
 * pentagons to one rhomb, which is the cell below.
 *
 * Both tiles have unit edges and every edge direction is a multiple of 36°, so
 * the whole thing lives in ℤ[ζ10] — the pentaflake's own ring
 * (boards/fractal.ts). The lattice is not rectangular; `latticeDomain` finds
 * the rectangle inside it. */
const PENT_U = (k: number): Vertex => [
  Math.cos((36 * k * Math.PI) / 180),
  Math.sin((36 * k * Math.PI) / 180),
];

/** The closed walk of unit steps in the given 36° directions. */
function walk(dirs: number[]): Vertex[] {
  const pts: Vertex[] = [];
  let [x, y] = [0, 0];
  for (const d of dirs) {
    pts.push([x, y]);
    const [dx, dy] = PENT_U(d);
    x += dx;
    y += dy;
  }
  return pts;
}

/** A tile turned `rot` steps of 36° and moved to `at`. */
const placeTile = (tile: Vertex[], rot: number, at: Vertex): Vertex[] => {
  const [c, s] = PENT_U(rot);
  return tile.map(([x, y]): Vertex => [x * c - y * s + at[0], x * s + y * c + at[1]]);
};

/** The three genuinely aperiodic boards: no period exists, so their page is a
 * crop of the real tiling, repeated. Two honest artefacts come with that — the
 * repeat itself (aperiodicity is a global property and a tile cannot carry it),
 * and line ends that do not meet their continuation across the tile edge. At
 * this contrast neither is findable without being told, and the alternative —
 * three of a hundred and fifty-nine boards with a visibly different page — is
 * the thing a player *would* notice.
 *
 * Built a level below the real easy board, and memoised, so only the first open
 * of one of these three pays for it. */
const PATCH_BUILDERS: Record<string, () => Board> = {
  spectre: () => spectreBoard(3, 0, null, 21),
};

/** The pattern keys whose tile is a crop rather than a period — everything else
 * repeats seamlessly, and the tests hold it to that. */
export const CROP_KEYS: readonly string[] = Object.keys(PATCH_BUILDERS);

// -- what a mode is patterned with ------------------------------------------

/** The pattern key every mode of the same geometry shares — "trihex" for all
 * five surfaces of the trihexagonal tiling, so the cache holds one entry for
 * the lot. `null` for a mode this build has not got (a link from a newer one). */
const MODE_PATTERN = new Map<string, string>();
{
  for (const mode of MODES) {
    const tiling = tilingOf(mode);
    if (tiling) MODE_PATTERN.set(mode, tiling);
  }
  // The shaped flat boards are the regular tilings cut to a triangular or
  // hexagonal outline, and SHAPED_MODES is already keyed by which.
  for (const [tiling, modes] of Object.entries(SHAPED_MODES)) {
    for (const mode of modes) MODE_PATTERN.set(mode, tiling);
  }
  // The fractal boards: their own tile, laid down periodically (see DOMAINS).
  for (const mode of ["sphinx", "chair", "carpet", "gosper", "pentaflake"]) {
    MODE_PATTERN.set(mode, mode);
  }
  for (const mode of APERIODIC_MODES) MODE_PATTERN.set(mode, mode);
  // The polyhedra are folded flat grids — a cube and the stepped bipyramid are
  // squares, a tetrahedron is triangles — so they take that grid. The sphere
  // family is the one group with no flat tiling behind it: a geodesic's
  // triangles and a Catalan solid's faces only close up because the surface
  // curves. Those get circles, which have no tiling to be wrong about.
  for (const mode of POLYHEDRA_MODES) {
    MODE_PATTERN.set(mode, mode === "tetrahedron" || mode === "tetraframe" ? "tri" : "square");
  }
  for (const mode of SPHERE_MODES) MODE_PATTERN.set(mode, "circles");
}

/** The pattern key for `mode` — shared by every mode drawn with the same
 * geometry — or null when this build does not know the mode. */
export function patternKey(mode: string | null | undefined): string | null {
  if (mode == null) return null;
  return MODE_PATTERN.get(mode) ?? null;
}

// -- the pipeline -----------------------------------------------------------

type Segment = readonly [number, number, number, number];

/** Twice the signed area of a polygon (the shoelace sum). */
function doubleArea(cell: Vertex[]): number {
  let sum = 0;
  for (let i = 0; i < cell.length; i++) {
    const [x1, y1] = cell[i]!;
    const [x2, y2] = cell[(i + 1) % cell.length]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

const meanCellArea = (cells: Vertex[][]): number =>
  cells.reduce((sum, cell) => sum + Math.abs(doubleArea(cell)) / 2, 0) / cells.length;

/** The grid every placed point lands on, a tenth of a pixel.
 *
 * Snapping *before* de-duplication rather than when the number is printed is
 * what makes the rest of this file work. Two cells' shared edge is computed
 * twice, by two different routes through the lattice, and comes out a
 * ten-thousandth of a pixel apart; de-duplicating on the raw values leaves both
 * and strokes the line twice. And because a tile's width and height are whole
 * pixels, snapping to a grid that divides them commutes with shifting by one
 * tile — which is the seam: a segment and its copy in the next tile agree
 * exactly, so the pattern repeats without a hairline.
 *
 * The bias is a tie-break, and it is load-bearing too. An endpoint often lands
 * exactly halfway between two grid points — the Gosper island's hexagons put
 * one at −3.25 px — and there the two routes' last-bit disagreement is what
 * decides the rounding, so the copies come out a tenth of a pixel apart after
 * all. A nudge far larger than that noise and far smaller than the grid settles
 * it the same way every time, and a whole-tile shift is a whole number of grid
 * steps, so it still commutes. */
const snap = (v: number): number => Math.round(v * 10 + 1e-6) / 10;

/** A snapped coordinate as markup. */
const num = (v: number): string => String(v);

/** Collect a tile's polygon edges as pixel segments, each drawn **once**.
 *
 * De-duplication is not just compression: stroking every cell as a closed path
 * paints each shared edge twice, and at seven percent alpha that makes every
 * interior line twice as dark as a boundary one — the pattern comes out
 * blotchy exactly where the tiling is most regular. */
function collect(
  cells: Vertex[][],
  place: (p: Vertex) => Vertex,
  w: number,
  h: number,
  into: Map<string, Segment>,
): void {
  for (const cell of cells) {
    const pts = cell.map((p): Vertex => {
      const [x, y] = place(p);
      return [snap(x), snap(y)];
    });
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      // Outside the tile on the same side at both ends: the neighbouring tile
      // draws it. (The SVG viewport clips anyway; this keeps the markup down.)
      if (Math.min(x1, x2) > w + 1 || Math.max(x1, x2) < -1) continue;
      if (Math.min(y1, y2) > h + 1 || Math.max(y1, y2) < -1) continue;
      const a = `${x1},${y1}`;
      const b = `${x2},${y2}`;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!into.has(key)) into.set(key, [x1, y1, x2, y2]);
    }
  }
}

const polygon = (pts: Vertex[]): string =>
  `<path d='M${pts.map(([x, y]) => `${num(snap(x))},${num(snap(y))}`).join("L")}Z'/>`;

const pathData = (segments: Iterable<Segment>): string =>
  [...segments].map(([x1, y1, x2, y2]) => `M${num(x1)},${num(y1)}L${num(x2)},${num(y2)}`).join("");

/** Wrap a body in the tile's SVG. Sizing is baked into the coordinates, so the
 * viewBox is in whole CSS pixels: `stroke-width` is then one real pixel, and
 * the intrinsic `width`/`height` are what make the layer repeat at the right
 * size without a `background-size` to say so. Without those attributes Chrome
 * falls back to 300x150 and Firefox stretches the tile to the page. */
const svg = (w: number, h: number, body: string): string =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
  `<g fill='none' stroke='${INK}' stroke-opacity='${INK_ALPHA}' ` +
  `stroke-width='${STROKE_PX}'>${body}</g></svg>`;

/** A seamless tile of a periodic domain.
 *
 * The tile is drawn from a block of domain copies *around* the viewBox and left
 * to the viewport to clip, never from the one domain the viewBox covers. That
 * is what makes it seamless: a cell straddling the tile edge is drawn whole on
 * this side and its other half arrives from the neighbouring copy of the tile.
 * The widest cell in the catalogue spans 1.08 domains (rotated hexagonal), so
 * one copy of margin on each side is enough. */
function periodicTile(domain: Domain): string {
  const { width, height, cells, holes } = domain;
  const s = Math.sqrt(CELL_AREA_PX / meanCellArea(cells));
  const kx = Math.max(1, Math.ceil(MIN_TILE_PX / (width * s)));
  const ky = Math.max(1, Math.ceil(MIN_TILE_PX / (height * s)));
  const w = Math.round(kx * width * s);
  const h = Math.round(ky * height * s);
  const sx = w / (kx * width);
  const sy = h / (ky * height);
  const segments = new Map<string, Segment>();
  const washes: string[] = [];
  for (let m = -1; m <= kx; m++) {
    for (let n = -1; n <= ky; n++) {
      // y is flipped: a tiling is y-up and SVG is y-down.
      const place = ([x, y]: Vertex): Vertex => [
        (x + m * width) * sx,
        h - (y + n * height) * sy,
      ];
      collect(cells, place, w, h, segments);
      for (const hole of holes ?? []) washes.push(polygon(hole.map(place)));
    }
  }
  const body =
    (washes.length ? `<g stroke='none' fill='${INK}' fill-opacity='${HOLE_ALPHA}'>${washes.join("")}</g>` : "") +
    `<path d='${pathData(segments.values())}'/>`;
  return svg(w, h, body);
}

/** Hex-packed circles, for the boards with no flat tiling to follow. Packed
 * rather than gridded so the field has no direction — the right reading for a
 * board you turn. The Voronoi cell of a hexagonal packing at spacing `d` is a
 * hexagon of area d²√3/2, so `d` follows from the same target area every tiling
 * uses and the circles come out the size of everything else's tiles. */
function circleTile(): string {
  const d = Math.sqrt((2 * CELL_AREA_PX) / ROOT3);
  const kx = Math.max(1, Math.ceil(MIN_TILE_PX / d));
  const ky = Math.max(1, Math.ceil(MIN_TILE_PX / (d * ROOT3)));
  const w = Math.round(kx * d);
  const h = Math.round(ky * d * ROOT3);
  const r = Math.round(0.42 * d * 10) / 10;
  const body: string[] = [];
  for (let m = -1; m <= kx; m++) {
    for (let n = -1; n <= ky; n++) {
      for (const [ox, oy] of [
        [0, 0],
        [0.5, 0.5],
      ]) {
        const cx = ((m + ox!) * w) / kx;
        const cy = ((n + oy!) * h) / ky;
        if (cx < -r - 1 || cx > w + r + 1 || cy < -r - 1 || cy > h + r + 1) continue;
        body.push(`<circle cx='${num(snap(cx))}' cy='${num(snap(cy))}' r='${r}'/>`);
      }
    }
  }
  return svg(w, h, body.join(""));
}

/** Where a patch has tiling under it and where it has bare paper, as a raster
 * with a summed-area table over it — so the coverage of *any* window is three
 * additions rather than a sweep over every cell in it. Built by scan-converting
 * the cells once; the alternative, point-testing each candidate window against
 * the polygons near it, is the same answer some thousands of times slower. */
function coverageTable(cells: Vertex[][], step: number, w: number, h: number) {
  const nx = Math.max(1, Math.ceil(w / step));
  const ny = Math.max(1, Math.ceil(h / step));
  const hit = new Uint8Array(nx * ny);
  for (const cell of cells) {
    let [lo, hi] = [Infinity, -Infinity];
    for (const [, y] of cell) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    for (let j = Math.max(0, Math.floor(lo / step)); j < Math.min(ny, Math.ceil(hi / step)); j++) {
      const y = (j + 0.5) * step;
      const xs: number[] = [];
      for (let a = 0, b = cell.length - 1; a < cell.length; b = a++) {
        const [x1, y1] = cell[a]!;
        const [x2, y2] = cell[b]!;
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(xs[k]! / step - 0.5));
        const to = Math.min(nx - 1, Math.floor(xs[k + 1]! / step - 0.5));
        for (let i = from; i <= to; i++) hit[j * nx + i] = 1;
      }
    }
  }
  // Summed-area table, one row and column of zeros in front so a window that
  // starts at the edge needs no special case.
  const sum = new Int32Array((nx + 1) * (ny + 1));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      sum[(j + 1) * (nx + 1) + i + 1] =
        hit[j * nx + i]! +
        sum[j * (nx + 1) + i + 1]! +
        sum[(j + 1) * (nx + 1) + i]! -
        sum[j * (nx + 1) + i]!;
    }
  }
  /** The share of the window at `(ox, oy)` of side `side` that is covered. */
  return (side: number, ox: number, oy: number): number => {
    const i0 = Math.max(0, Math.min(nx, Math.round(ox / step)));
    const j0 = Math.max(0, Math.min(ny, Math.round(oy / step)));
    const i1 = Math.max(i0, Math.min(nx, Math.round((ox + side) / step)));
    const j1 = Math.max(j0, Math.min(ny, Math.round((oy + side) / step)));
    const area = (i1 - i0) * (j1 - j0);
    if (area === 0) return 0;
    const total =
      sum[j1 * (nx + 1) + i1]! -
      sum[j0 * (nx + 1) + i1]! -
      sum[j1 * (nx + 1) + i0]! +
      sum[j0 * (nx + 1) + i0]!;
    return total / area;
  };
}

/** A square crop of a real aperiodic board, used as the repeat tile.
 *
 * Two things are fitted rather than fixed. The **window** is as large as the
 * patch and the segment budget allow, because the wider it is the further apart
 * the repeat lands; and it is not simply the centre — these boards are grown
 * and trimmed to a disc, and a Spectre patch is ragged at its rim — so
 * candidate origins are scored and the fullest wins, then the window shrinks
 * until that best placement is genuinely full.
 *
 * "Full" is measured by **sampling the window and asking whether a tile covers
 * each point**, not by counting the cells whose centroid lands inside. Counting
 * centroids cannot see a hole: a window can hold its full quota of cells and
 * still have a bay of empty paper at one edge, because the cells it counted are
 * bunched elsewhere. That is exactly what the Spectre's crop had — a blank
 * region big enough to read as a smudge on the page once the tile repeated.
 *
 * The **cell size** then follows from the tile's own corner count, and the
 * tile's pixel size from the two together. */
function patchTile(mode: string): string {
  const board = PATCH_BUILDERS[mode]!();
  const cells = [...board.polygons.values()];
  const mean = meanCellArea(cells);
  // Each cell contributes about half its corners as unique edges; the other
  // half belong to its neighbours.
  const corners = cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
  const maxCells = (2 * PATCH_SEGMENT_BUDGET) / corners;

  // A raster fine enough to see a bay of bare paper: a few steps across a
  // cell, which for the Spectre is about fifteen board units.
  const fill = coverageTable(cells, Math.sqrt(mean) / 4, board.width, board.height);

  // A full window holds one cell per mean cell area, so this is the widest one
  // the segment budget pays for.
  let side = Math.min(
    PATCH_WINDOW * Math.min(board.width, board.height),
    Math.sqrt(maxCells * mean),
  );
  let best: Vertex = [0, 0];
  const steps = 8;
  for (let attempt = 0; attempt < 12; attempt++) {
    let bestFill = -1;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const ox = Math.max(0, ((board.width - side) * i) / steps);
        const oy = Math.max(0, ((board.height - side) * j) / steps);
        const got = fill(side, ox, oy);
        if (got > bestFill) {
          bestFill = got;
          best = [ox, oy];
        }
      }
    }
    if (bestFill >= PATCH_FILL) break;
    side *= 0.92;
  }
  const s = Math.sqrt((corners * PATCH_AREA_PER_CORNER_PX) / mean);
  const w = Math.round(side * s);
  const segments = new Map<string, Segment>();
  const place = ([x, y]: Vertex): Vertex => [(x - best[0]) * s, (y - best[1]) * s];
  collect(cells, place, w, w, segments);
  return svg(w, w, `<path d='${pathData(segments.values())}'/>`);
}

/** The tile for a pattern key, as an SVG document. Exported for the tests,
 * which run under the node environment and cannot read a stylesheet. */
export function patternSvg(key: string): string {
  if (key === "circles") return circleTile();
  if (PATCH_BUILDERS[key]) return patchTile(key);
  const domain = DOMAINS[key];
  if (domain) return periodicTile(domain());
  const t = archTemplate(key); // throws on an unknown key: a bug in the table
  return periodicTile({
    width: t.width,
    height: t.height,
    cells: templateCells(t, 0, 0).map((c) => c.pts),
  });
}

/** An SVG document as a CSS `background-image` layer.
 *
 * `%` first, or it would re-encode the escapes it has just written. Attributes
 * are single-quoted so the CSS `url("…")` never meets one of its own; path data
 * uses commas so there is no whitespace to argue about; `<`/`>` are encoded
 * because Firefox and Safari are stricter about them than Chrome is, and `#`
 * because it would otherwise start a fragment. Same shape as the WOVEN constant
 * in ui/theme.ts. */
function layer(doc: string): string {
  const encoded = doc
    .replace(/%/g, "%25")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23")
    .replace(/"/g, "%22");
  return `url("data:image/svg+xml,${encoded}")`;
}

const CACHE = new Map<string, string>();

/** The `background-image` layer for the page behind `mode`, or null on the menu
 * and for a mode this build has not got. Memoised by pattern key, so the whole
 * catalogue costs at most one tile per distinct geometry. */
export function patternLayer(mode: string | null | undefined): string | null {
  const key = patternKey(mode);
  if (key === null) return null;
  let built = CACHE.get(key);
  if (built === undefined) {
    built = layer(patternSvg(key));
    CACHE.set(key, built);
  }
  return built;
}
