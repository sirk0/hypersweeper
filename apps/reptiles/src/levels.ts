// The levels. A level is a region (exact loops in its ring), the tile kinds
// the tray offers, and whether a tile may be turned over. Levels follow
// Hypersweeper's flat boards — the same tilings and outlines, at a size a hand
// can fill tile by tile, each as near a square as its tiling allows (the
// Board-shape convention in docs/agents/difficulty.md): 4×4 squares, 4 rows
// of 6 triangles, 5 rows of 4 hexagons. Each is built here from the same cells, on the same
// lattice, as the Hypersweeper builder it mirrors, and its region is their
// outline; the unit tests check the cells against that builder.

import catalog from "@tiling/data/catalog.json";
import boardsData from "./boards.json";
import { ARCH_TILINGS, archTemplate, kiteDartLegs, penroseLegs } from "@tiling/geometry";
import { arrowMark } from "./geometry/marks";
import { cyclotomic, type Cyc, type Ring } from "./geometry/cyclotomic";
import { templateWindow, type XY } from "./geometry/fromTemplate";
import { lavesWindow } from "./geometry/laves";
import { piecePatch } from "./geometry/pieces";
import { repTilePatch } from "./geometry/repTile";
import { spiralPatch } from "./geometry/spiral";
import { aperiodicPatch } from "./geometry/aperiodic";
import { socolarTaylorPatch } from "./geometry/socolarTaylor";
import { hatPatch, type HatTile } from "./geometry/hat";
import { ccw, outline } from "./geometry/outline";
import { paintings, sameEdges, traySignature, type Lattice, type Painting } from "./colourings";
import {
  curveOnto,
  piece,
  posed,
  restFlat,
  selfTurns,
  sides,
  signedArea,
  turnsOnto,
  turnsOntoPieces,
  OUT,
  type Bulge,
  type Piece,
  type Shape,
} from "./geometry/shape";

export interface Level {
  key: string;
  /** The key of the tiling's first board — the level's own key there, and
   * what the catalog lists it by — and which of its `boards` this is, from 1.
   * A tiling's boards are windows cut from it in different places
   * (`boards.json`), each its own level with its own stars. */
  base: string;
  board: number;
  boards: number;
  label: string;
  ring: Ring;
  /** Outer loop counter-clockwise, any holes clockwise. */
  region: Cyc[][];
  /** On a level of round tiles, each region loop's curve, edge by edge (see
   * `Shape.curve`): the curve of the tile of `cells` that lies along it. */
  regionCurves?: Bulge[][];
  /** The tray: one shape per tile kind, fewest sides first, each always in
   * supply — regular, but for the Laves and 2-isohedral levels; one polygon,
   * but for a tile of several pieces (the fish) — and, for a round tile (the
   * Spectre), its `curve`. */
  tiles: Shape[];
  /** Per kind, its tiles' CSS classes: `sides-<n>`, coloured by side count —
   * or `pieces`, for a tile of several — and `twin` too on a kind coloured as
   * one before it (the two quadrilaterals of a 2-isohedral level), so the two
   * look apart. */
  colours: string[];
  /** Tiles may be mirrored as well as turned. */
  mirror: boolean;
  /** Per kind, the step between the ways the board turns it, as a power of ζ
   * — 60° for a triangle among triangles, 30° for the squares of 3.4.6.4 — or
   * 0 where every tile of that kind sits the same way. */
  turns: number[];
  /** What one press of the rotate control turns *every* tray tile by: the
   * largest step that reaches every way any kind is turned (30° on 3.4.6.4, so
   * its triangles and hexagons pass through turns they never fit at), or 0
   * where nothing ever needs turning and the control is left out. A tile lands
   * only as it is held. */
  turn: number;
  /** Per kind, how many tiles of it the board it was cut from takes — the
   * number on its pile. Using more is allowed; using no more than these, in
   * all, is worth the second star. */
  need: number[];
  /** The time limit for the third star, in seconds. */
  seconds: number;
  /** The board the level was cut from, tile by tile: one way to finish it,
   * not the only one — any exact cover wins (six triangles where a hexagon
   * was are fine), so a player can wander off it, and may have to take tiles
   * back off to finish. Each cell is its pieces, counter-clockwise, with
   * their round edges' curves on a level of round tiles. */
  cells: Piece[][];
  /** The tiling's vertex configurations — the polygons round a vertex, in
   * order: [[4, 4, 4, 4]] for squares, [[3, 4, 6, 4]] for the
   * rhombitrihexagonal; a 2-uniform tiling has two. A dual's are the
   * primal's — what its tiles' corners follow. None for a rep-tile, whose
   * tiles meet part-way along each other's sides. Not enforced. */
  configs: number[][];
  /** What the game calls the level: its configuration (`notation`), 3.4.6.4,
   * or for a 2-uniform tiling both, as Hypersweeper's catalog writes them,
   * [3⁶; 3⁴.6]₁ — the subscript telling apart two tilings with the same pair.
   * A name that says what meets at a point, not how the board is made. */
  name: string;
  /** Which family of tilings the level is in — the list's sections. */
  group: GroupKey;
  /** A vertex configuration every vertex *must* keep, for a level whose
   * puzzle is that rule — a tile then lands only where every point it touches
   * can still become it. Unset on every level so far. */
  rule?: number[];
  /** For a level on a Hypersweeper tiling window, which: the tiling and the
   * window `archimedeanBoard(tiling, nx, ny)` takes — unless the tiling had to
   * be `turned` (radians) to lay its edges on the ring, when the window is cut
   * in the turned frame instead. */
  window?: {
    tiling: string;
    nx: number;
    ny: number;
    turned: number;
    /** For a board after the first, where its square is centred, in the
     * template's own coordinates — the `centre` that `archimedeanBoard` cuts
     * the same window at. */
    centre?: XY;
  };
  /** For a Laves level, the uniform tiling it is the dual of; for a
   * 2-isohedral one, the 2-uniform tiling. */
  dualOf?: string;
  /** For a rep-tile level, how many times Hypersweeper's tile (`SUBSTITUTIONS`
   * in @tiling/geometry, keyed as the level is) was inflated — the board its
   * builder makes with that many `levels`. */
  inflations?: number;
  /** For a rep-tile of several pieces — one Hypersweeper has no board for
   * (a minesweeper cell is one polygon), defined here in `PIECE_TILES` and
   * keyed as the level is — how many times it was grown. */
  pieceTile?: { inflations: number };
  /** For a spiral level, the arguments Hypersweeper's builder for it
   * (`phyllotaxisBoard`, `klaassenBoard`, `pentaSpiral5Board`…, keyed as the
   * level is) makes it with: how far the spiral is grown, and how many of its
   * centremost tiles are kept. */
  spiral?: { rings: number; keep: number };
  /** For an aperiodic level, Hypersweeper's board it is cut from (`mode`:
   * `penroseBoard`, `kiteDartBoard`, `ammannBeenkerBoard`, `spectreBoard` —
   * keyed as the level is, but for Tile(1,1), which is the Spectre's board
   * with straight edges) and the arguments its builder makes it with: how
   * many substitutions grow the patch, and how many tiles its centred window
   * keeps. */
  aperiodic?: { mode: string; depth: number; keep: number; variant: number };
  /** For the Socolar–Taylor tile — an aperiodic monotile Hypersweeper has no
   * board for (a minesweeper cell is one polygon; this tile is nineteen),
   * defined here in `geometry/socolarTaylor.ts` — how many rings of its patch
   * round the middle hexagon the board keeps. */
  socolarTaylor?: { rings: number };
  /** For a level of the hat's family — the hat, the turtle or the hat's four
   * metatiles, cut in `geometry/hat.ts` from the patch Hypersweeper's boards
   * of them are cut from (`hatMetatiles` in @tiling/geometry) — which tile, how many substitutions grow the H
   * metatile its patch is, and how many tiles its centred window keeps. */
  hat?: { tile: HatTile; depth: number; keep: number; centre?: number };
  /** For a level whose tiles carry marks (geometry/marks.ts): the plain
   * level whose board it is, in how many colours (1 for `rules`: a matching
   * rule in one colour — lines across the tiles, made from a colouring by
   * drawing a line across every edge between two tiles that would be one
   * colour (src/colourings.ts), or the Penrose rhombi's arrows), and what it
   * is called after the plain level's name — "2 colours, striped". */
  decor?: { of: string; colours: number; rules: boolean; label: string };
}

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** The third star's time allowance per tile the board takes — room to pick
 * each one up, turn it and lay it, not to think hard. Rounded up to ten
 * seconds a level. */
const SECONDS_PER_TILE = 5;

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/** Cells of one piece each, as most builders make them. */
const whole = (cells: Cyc[][]): Cyc[][][] => cells.map((c) => [c]);

/**
 * A level from the exact cells of its board, each its pieces (one, but for a
 * tile of several). The tray, the turns, the piles
 * and the region are all read off the cells, so nothing about a level is
 * stated twice: each distinct side count is a tile kind, held in the tray
 * resting on a flat side (the regular polygon as `regular` builds it, turn 0);
 * how a cell of that kind is turned from there is measured exactly; and the
 * rotate step is the largest that still reaches every way the board turns
 * that kind from flat — so pointy-top hexagons need turning, though they all
 * sit alike.
 *
 * `round`, for a tile with round edges (the Spectre), is how the first edge of
 * each kind's tray tile bulges — the first half of the side it rests on —
 * the rest alternating, out and in, round the tile; every cell takes its
 * kind's curve, and the region's rim the curve of the cell along it.
 *
 * `marks`, for a coloured or lined level (src/colourings.ts), are each cell's
 * edge marks, piece by piece, edge by edge as its vertices run (see
 * geometry/marks.ts): cells alike but for their marks are different kinds,
 * and a kind's turns count its marks. `paints`, each cell's colour on a
 * coloured level, paint each kind (`paint-<c>`) instead of its side count —
 * the first colour among its cells, where cells of several colours read
 * alike and are one kind (a striped board's).
 */
function makeLevel(
  key: string,
  label: string,
  ring: Ring,
  cells: Cyc[][][],
  group: GroupKey,
  configs: number[][],
  name = notation(configs[0]!),
  round?: Bulge,
  marks?: number[][][],
  paints?: number[],
): Level {
  // The tile kinds: cells alike up to a turn, or up to a turn and a mirror —
  // a mirrored copy is the same kind, flipped (the kisrhombille's triangles).
  // Each kind's tray tile is its first cell resting flat on its longest side.
  type Kind = { shape: Shape; mirrored: Shape; ks: number[]; flipped: boolean; paint: number };
  const kinds: Kind[] = [];
  // how each cell sits: its kind, turned by ζ^rot, mirrored if `flip`
  const sits: { cell: Cyc[][]; kind: Kind; rot: number; flip: boolean; i: number }[] = [];
  for (const [i, raw] of cells.entries()) {
    const cell = raw.map((p) => ccw(ring, p));
    const own = marks?.[i];
    if (own && cell.some((p, q) => p !== raw[q]))
      throw new Error(`${key}: a marked cell must be listed counter-clockwise`);
    let found = false;
    for (const kind of kinds) {
      const direct = turnsOnto(kind.shape, cell, own);
      const flipped = direct.length ? [] : turnsOnto(kind.mirrored, cell, own);
      if (direct.length || flipped.length) {
        const rot = (direct[0] ?? flipped[0])!;
        kind.ks.push(rot);
        if (!direct.length) kind.flipped = true;
        sits.push({ cell, kind, rot, flip: !direct.length, i });
        kind.paint = Math.min(kind.paint, paints?.[i] ?? 0);
        found = true;
        break;
      }
    }
    if (!found) {
      const shape = restFlat(ring, cell, own);
      const mirrored = { ring, pieces: posed(shape, { rot: 0, flip: true, t: ring.zero }) };
      const kind = {
        shape,
        mirrored,
        ks: [turnsOnto(shape, cell, own)[0]!],
        flipped: false,
        paint: paints?.[i] ?? 0,
      };
      kinds.push(kind);
      sits.push({ cell, kind, rot: kind.ks[0]!, flip: false, i });
    }
  }
  // A marked tile rests, where it can, on a side that leaves it fitting none
  // of the board's cells as the tray holds it: its marks are the puzzle, and
  // the tray should not hand over the turn — squares striped across are held
  // striped up and down. (An unmarked tile rests on its first longest side,
  // as ever, and a marked one that fits every cell whichever way it rests —
  // a checkerboard's — does too.)
  if (marks) {
    for (const kind of kinds) {
      const mine = sits.filter((s) => s.kind === kind);
      const first = mine[0]!;
      if (first.cell.length !== 1) continue;
      const fitsAsHeld = (shape: Shape, rots: number[]): boolean => {
        const period = selfTurns(shape).find((k) => k > 0) ?? ring.n;
        return rots.some((r) => r % period === 0);
      };
      if (!fitsAsHeld(kind.shape, kind.ks)) continue;
      const verts = first.cell[0]!;
      const own = marks[first.i]![0]!;
      const m = verts.length;
      for (let q = 1; q < m; q++) {
        const shape = restFlat(
          ring,
          [[...verts.slice(q), ...verts.slice(0, q)]],
          [[...own.slice(q), ...own.slice(0, q)]],
        );
        const mirrored = { ring, pieces: posed(shape, { rot: 0, flip: true, t: ring.zero }) };
        const rots = mine.map((s) => turnsOnto(s.flip ? mirrored : shape, s.cell, marks[s.i])[0]);
        if (rots.some((r) => r === undefined)) continue;
        if (fitsAsHeld(shape, rots as number[])) continue;
        kind.shape = shape;
        kind.mirrored = mirrored;
        kind.ks = rots as number[];
        mine.forEach((s, n) => (s.rot = rots[n]!));
        break;
      }
    }
  }
  const area = (s: Shape): number =>
    s.pieces.reduce((sum, p) => sum + signedArea(p.verts.map((v) => ring.toXY(v))), 0);
  kinds.sort(
    (a, b) => sides(a.shape) - sides(b.shape) || area(a.shape) - area(b.shape) || a.paint - b.paint,
  );
  const tiles = kinds.map((k) => k.shape);
  const colour = (s: Shape): string => (s.pieces.length > 1 ? "pieces" : `sides-${sides(s)}`);
  const colours = tiles.map((t, i) => {
    if (paints) return `${colour(t)} paint paint-${kinds[i]!.paint}`;
    const twin = tiles.slice(0, i).some((u) => colour(u) === colour(t));
    return `${colour(t)}${twin ? " twin" : ""}`;
  });
  const region = outline(ring, cells.flat());
  let regionCurves: Bulge[][] | undefined;
  if (round) {
    for (const { shape } of kinds) {
      for (const p of shape.pieces) {
        if (p.verts.length % 2) throw new Error(`${key}: round edges alternate, in pairs`);
        p.curve = p.verts.map((_, i) => (i % 2 ? -round : round) as Bulge);
      }
    }
  }
  // each cell's pieces, with their curves: the kind's, turned onto them
  const laid: Piece[][] = sits.map(({ cell, kind, rot, flip, i }) =>
    round
      ? curveOnto({ ring, pieces: posed(kind.shape, { rot, flip, t: ring.zero }) }, cell)
      : cell.map((verts, q) => piece(verts, undefined, marks?.[i]?.[q])),
  );
  if (round) {
    const bulges = new Map<string, Bulge>();
    for (const { verts, curve } of laid.flat()) {
      verts.forEach((a, i) => {
        const b = verts[(i + 1) % verts.length]!;
        bulges.set(`${ring.key(a)}>${ring.key(b)}`, curve![i]!);
      });
    }
    regionCurves = region.map((loop) =>
      loop.map((a, i) => {
        const b = loop[(i + 1) % loop.length]!;
        const bulge = bulges.get(`${ring.key(a)}>${ring.key(b)}`);
        if (bulge === undefined) throw new Error(`${key}: a rim edge is no cell's whole edge`);
        return bulge;
      }),
    );
  }
  // A kind's rotate step: the largest that reaches, from resting flat, every
  // way the board turns it (`period` turns it back to itself).
  const turns = kinds.map(({ shape, ks }) => {
    const period = selfTurns(shape).find((k) => k > 0) ?? ring.n;
    const step = ks.reduce((g, k) => gcd(g, k % period), period);
    return step === period ? 0 : step;
  });
  const need = kinds.map((k) => k.ks.length);
  const mirror = kinds.some((k) => k.flipped);
  const turn = turns.reduce((g, k) => gcd(g, k), 0);
  const seconds = Math.ceil((cells.length * SECONDS_PER_TILE) / 10) * 10;
  return {
    key,
    base: key,
    board: 1,
    boards: 1,
    label,
    ring,
    region,
    ...(regionCurves ? { regionCurves } : {}),
    tiles,
    colours,
    mirror,
    turns,
    turn,
    need,
    seconds,
    cells: laid,
    configs,
    name,
    group,
  };
}

/** A level on a `box`-edge square window of one of Hypersweeper's periodic
 * tilings (see `templateWindow`), keyed and labelled as the tiling is. A
 * uniform tiling is named by its one vertex configuration; a 2-uniform one by
 * the pair in Hypersweeper's catalog, which the tests also hold its inner
 * vertices to. */
function windowLevel(tiling: string, box: number, at?: Variant): Level {
  const spec = ARCH_TILINGS.find((t) => t.key === tiling);
  if (!spec) throw new Error(`unknown tiling ${tiling}`);
  const t = archTemplate(tiling);
  const { ring, cells, turned, centre } = windowCut(tiling, box, at);
  const size = boxOf(box, at);
  const window = {
    tiling,
    nx: size / t.width,
    ny: size / t.height,
    turned,
    ...(at === undefined ? {} : { centre }),
  };
  if (spec.family === "uniform") {
    return {
      ...makeLevel(tiling, spec.label, ring, whole(cells), "uniform", [spec.config]),
      window,
    };
  }
  if (spec.family === "rectangle" || spec.family === "pentagonal" || spec.family === "isogonal") {
    // A bond has no vertex configuration to be named by (a brick corner can
    // land part-way along a neighbour's side), nor has a pentagonal tiling
    // one (its corners are of two or three kinds, three or four tiles round
    // each), so each goes by Hypersweeper's name for it, and its config is the
    // tile, as Hypersweeper's is. An isogonal tiling's vertices are all alike,
    // but its config counts the tiles round one — the one whose side runs
    // through it among them — not corners in order, and two of the family
    // share each count (4.4.4, 3⁴), so it goes by Hypersweeper's name too.
    const level = makeLevel(
      tiling,
      spec.label,
      ring,
      whole(cells),
      spec.family,
      [spec.config],
      spec.label,
    );
    return { ...level, window };
  }
  const written = NOTATIONS[tiling];
  if (!written) throw new Error(`no notation for ${tiling} in data/catalog.json`);
  return {
    ...makeLevel(
      tiling,
      spec.label,
      ring,
      whole(cells),
      "2-uniform",
      parseNotation(written),
      written,
    ),
    window,
  };
}

/** The `box`-edge square window of `tiling` (see `templateWindow`), moved
 * `at` steps of 1/GRID of the tiling's domain each way off its centre and
 * grown by its third, in quarter edges. */
function windowCut(tiling: string, box: number, at?: Variant) {
  const spec = ARCH_TILINGS.find((t) => t.key === tiling);
  // (an isogonal window can leave a lone tile at a corner, touching nothing
  // else kept: the rotated hexagonal does at every box up to 85 tiles)
  return templateWindow(tiling, boxOf(box, at), {
    dropStrays: spec?.family === "isogonal",
    offset: gridOffset(tiling, at),
  });
}

/** The edge of a window's square `box`, grown as `at` says. */
function boxOf(box: number, at?: Variant): number {
  return typeof at === "object" ? box + (at[2] ?? 0) * BOX_STEP : box;
}

/** `at`, a step on the grid a window's square is moved on, as a vector in
 * the template's coordinates. */
function gridOffset(tiling: string, at?: Variant): XY {
  if (at === undefined) return [0, 0];
  if (typeof at === "number") throw new Error(`${tiling}: a window moves by a step, not ${at}`);
  const t = archTemplate(tiling);
  return [(at[0] / GRID) * t.width, (at[1] / GRID) * t.height];
}

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);

/** a·u + b·v, for small integers a and b. */
function combo(a: number, u: Cyc, b: number, v: Cyc): Cyc {
  return u.map((x, i) => a * x + b * v[i]!);
}

/** Hypersweeper's `squareBoard(rows, cols)`: unit squares, `cols` wide. */
export function squareCells(rows: number, cols: number): Cyc[][] {
  const cells: Cyc[][] = [];
  const at = (x: number, y: number): Cyc => combo(x, Z4.one, y, Z4.zeta(1));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      cells.push([at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)]);
  }
  return cells;
}

/**
 * Hypersweeper's `triangleGridBoard(rows, rowWidth)`: `rows` rows of
 * `rowWidth` unit triangles, alternately up and down, every row starting at
 * the left edge — so the sides zigzag. The builder's lattice point (kx, ky) is
 * (kx/2, ky·√3/2) with y down, and every vertex has kx + ky odd; here that
 * point is m + ky·ζ⁻² (ζ⁻² is half a side right and a row down) with
 * m = (kx − 1 − ky)/2 — the same lattice, shifted to start at 0.
 */
export function triangleGridCells(rows: number, rowWidth: number): Cyc[][] {
  const at = (kx: number, ky: number): Cyc => {
    if ((kx + ky) % 2 !== 1) throw new Error("triangle lattice: kx + ky must be odd");
    return combo((kx - 1 - ky) / 2, Z12.one, ky, Z12.zeta(-2));
  };
  const cells: Cyc[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rowWidth; i++) {
      // the builder's triangleVertices(i, r, up)
      const up = (r + i) % 2 === 0;
      cells.push(
        up
          ? [at(i, r + 1), at(i + 2, r + 1), at(i + 1, r)]
          : [at(i, r), at(i + 2, r), at(i + 1, r + 1)],
      );
    }
  }
  return cells;
}

/** A pointy-top unit hexagon about the origin, counter-clockwise from its
 * bottom corner. */
const HEXAGON: Cyc[] = [9, 11, 1, 3, 5, 7].map((k) => Z12.zeta(k));

/**
 * Hypersweeper's `hexBoard(rows, cols)`: pointy-top hexagons of circumradius
 * 1 in odd-r offset rows — each odd row half a hexagon to the right. A step
 * along a row is √3 across, ζ + ζ⁻¹; a row down is ζ⁻¹ − ζ³ (down-right) or
 * that less a step (down-left), taken alternately.
 */
export function hexCells(rows: number, cols: number): Cyc[][] {
  const along = Z12.add(Z12.zeta(1), Z12.zeta(-1));
  const downRight = Z12.sub(Z12.zeta(-1), Z12.zeta(3));
  const downLeft = Z12.sub(downRight, along);
  const cells: Cyc[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowStart = combo(Math.ceil(r / 2), downRight, Math.floor(r / 2), downLeft);
    for (let c = 0; c < cols; c++) {
      const centre = combo(1, rowStart, c, along);
      cells.push(HEXAGON.map((v) => Z12.add(centre, v)));
    }
  }
  return cells;
}

/** Hypersweeper's names for its tiling families (`menu.familyLabels` in the
 * shared data), by its keys — its Laves family is keyed `dual`. */
const FAMILY_LABELS = catalog.menu.familyLabels as Record<string, string>;

const familyLabel = (key: string): string => {
  const label = FAMILY_LABELS[key];
  if (!label) throw new Error(`no family label for ${key} in data/catalog.json`);
  return label;
};

/** The families the levels come in, in the order the catalog shows them,
 * named as Hypersweeper names them, with its plain-words hints. */
export const GROUPS = [
  {
    key: "regular",
    name: familyLabel("regular"),
    hint: "One regular shape throughout: triangles, squares or hexagons",
  },
  {
    key: "uniform",
    name: familyLabel("uniform"),
    hint: "Two or three shapes, same at every corner",
  },
  {
    key: "2-uniform",
    name: familyLabel("2-uniform"),
    hint: "Regular shapes, two kinds of corner",
  },
  {
    key: "laves",
    name: familyLabel("dual"),
    hint: "The uniform tilings' duals — one shape throughout",
  },
  {
    key: "2-isohedral",
    name: familyLabel("2-isohedral"),
    hint: "The 2-uniform tilings' duals — two shapes, neither regular",
  },
  {
    key: "pentagonal",
    name: familyLabel("pentagonal"),
    hint: "One convex pentagon throughout, found 1975 to 2015",
  },
  {
    key: "isogonal",
    name: familyLabel("isogonal"),
    hint: "Regular shapes, every corner alike — but a corner can meet mid-side",
  },
  {
    key: "rectangle",
    name: familyLabel("rectangle"),
    hint: "One brick throughout, laid in a bond — corners can meet mid-side",
  },
  {
    key: "reptile",
    name: familyLabel("reptile"),
    hint: "One tile, filled with smaller copies of itself",
  },
  {
    key: "spiral",
    name: familyLabel("spiral"),
    hint: "One tile, wound round a centre in spiral arms",
  },
  {
    key: "aperiodic",
    name: familyLabel("aperiodic"),
    hint: "A window onto a tiling that repeats nowhere",
  },
] as const;

/** A level's family: one of `GROUPS`, or for a level of marked tiles (its
 * `decor`) what it marks them with — listed with the tiling it marks, not as
 * a family of its own (`markedOf`). */
export type GroupKey = (typeof GROUPS)[number]["key"] | "rules" | "colourings";

/** The two kinds of marked level, in the order a tiling's page lists them. */
export const MARKED_GROUPS = [
  {
    key: "rules",
    name: "Matching rules",
    hint: "Lines or arrows on the tiles that must meet across every edge",
  },
  {
    key: "colourings",
    name: "Colourings",
    hint: "Coloured tiles — each edge must match the one it meets",
  },
] as const;

const NOTATIONS = catalog.tilingNotations as Record<string, string>;

/** The vertex configurations in a written name, "[3⁶; 3⁴.6]₁" or "3.4.6.4". */
export function parseNotation(written: string): number[][] {
  const digits = (s: string): number =>
    Number([...s].map((c) => (SUPERSCRIPT.includes(c) ? SUPERSCRIPT.indexOf(c) : c)).join(""));
  return written
    .replace(/^\[|\][₀-₉]*$/g, "")
    .split(";")
    .map((part) =>
      part
        .trim()
        .split(".")
        .flatMap((term) => {
          const m = /^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/.exec(term);
          if (!m) throw new Error(`parseNotation: cannot read ${term} in ${written}`);
          return new Array<number>(m[2] ? digits(m[2]) : 1).fill(Number(m[1]));
        }),
    );
}

/** The 2-uniform tilings and each one's window (`box`, in edges): the
 * squarest near two or three dozen tiles that keeps one outline and has both
 * kinds of vertex inside it, found by scanning sizes. studdedtri2 is turned
 * like the snub hexagonal, and its squarest such window is 47 tiles. */
const TWO_UNIFORM: [string, number][] = [
  ["studdedtri", 5.2],
  ["studdedtri2", 5.2],
  ["elongated2", 4],
  ["elongated3", 4.5],
  ["trirhombitrihex", 4.8],
  ["tritrunctrihex", 7.2],
  ["fannedhex", 5.2],
  ["hexbands", 7],
  ["snubelongated2", 4.8],
  ["snubelongated", 4.4],
  ["dissectedtrunchex2", 5.8],
  ["squarerows2", 4],
  ["squarerows3", 5],
  ["dissectedtrunchex", 4.8],
  ["hexrows", 5.2],
  ["dodecasquare", 11.2],
  ["hexrings", 7.2],
  ["squaretrihex", 5.5],
  ["squaretrihex2", 5.5],
  ["dodecarhombitrihex", 8.5],
];

/** A Laves level: the dual of a uniform tiling, cut `box` uniform edges square
 * (see `lavesWindow`), named V and the configuration — V3.4.6.4 is the tiling
 * whose every tile has corners where 3, 4, 6 and 4 tiles meet. Keyed and
 * labelled as Hypersweeper's dual tiling is. */
function lavesLevel(dual: string, box: number, at?: Variant): Level {
  const spec = ARCH_TILINGS.find((t) => t.key === dual && t.family === "dual");
  const of = lavesPrimal(dual);
  if (!spec) throw new Error(`no uniform tiling is dual to ${dual}`);
  const { ring, cells } = lavesWindow(of, boxOf(box, at), gridOffset(of, at));
  const level = makeLevel(
    dual,
    spec.label,
    ring,
    whole(cells),
    "laves",
    [spec.config],
    `V${notation(spec.config)}`,
  );
  return { ...level, dualOf: of };
}

/** The uniform tiling the Laves tiling `dual` is the dual of. */
function lavesPrimal(dual: string): string {
  const spec = ARCH_TILINGS.find((t) => t.key === dual && t.family === "dual");
  const of = ARCH_TILINGS.find(
    (t) => t.family === "uniform" && spec && t.config.join() === spec.config.join(),
  );
  if (!spec || !of) throw new Error(`no uniform tiling is dual to ${dual}`);
  return of.key;
}

/** A 2-isohedral level: the dual of 2-uniform tiling `primal`, cut `box` of
 * its edges square, built as a Laves board is (`lavesWindow`) — the primal's
 * two kinds of vertex are its two kinds of tile. Keyed and labelled as
 * Hypersweeper's tiling is (`<primal>dual`), and named as its catalog writes
 * it, V[3⁶; 3⁴.6]₁: the configurations its tiles' corners follow, the
 * primal's. */
function twoIsohedralLevel(primal: string, box: number, at?: Variant): Level {
  const key = `${primal}dual`;
  const spec = ARCH_TILINGS.find((t) => t.key === key && t.family === "2-isohedral");
  const written = NOTATIONS[key];
  const configs = NOTATIONS[primal];
  if (!spec || !written || !configs) throw new Error(`no 2-isohedral tiling ${key}`);
  const { ring, cells } = lavesWindow(primal, boxOf(box, at), gridOffset(primal, at));
  const level = makeLevel(
    key,
    spec.label,
    ring,
    whole(cells),
    "2-isohedral",
    parseNotation(configs),
    written,
  );
  return { ...level, dualOf: primal };
}

/** The Laves tilings and each one's window (`box`, in the uniform tiling's
 * edges): the squarest near two or three dozen tiles with one outline. The
 * three with hexagonal symmetry — rhombille, triakis, kisrhombille — come no
 * nearer square than 0.87 at that size; the rhombille's next is 50 tiles. */
const LAVES: [string, number][] = [
  ["tetrakis", 7.3],
  ["rhombille", 7],
  ["triakis", 8.7],
  ["cairo", 5.8],
  ["prismaticpent", 6],
  ["floret", 6.4],
  ["deltoidal", 7.1],
  ["kisrhombille", 8.2],
];

/** The 2-isohedral tilings, by their 2-uniform primals, and each one's window
 * (`box`, in the primal's edges): the squarest near two or three dozen tiles
 * with one outline, found by scanning sizes and taken mid-range. The
 * dodecagons' duals have a corner twelve tiles meet at, so their windows are
 * coarse: V[3.4.3.12; 3.12²] is 20 tiles, its next square one 60. */
const TWO_ISOHEDRAL: [string, number][] = [
  ["studdedtri", 6.7],
  ["studdedtri2", 6.65],
  ["elongated2", 5.9],
  ["elongated3", 6.5],
  ["trirhombitrihex", 6.08],
  ["tritrunctrihex", 9],
  ["fannedhex", 6.65],
  ["hexbands", 7.5],
  ["snubelongated2", 6],
  ["snubelongated", 6],
  ["dissectedtrunchex2", 7],
  ["squarerows2", 6.5],
  ["squarerows3", 6.5],
  ["dissectedtrunchex", 7],
  ["hexrows", 6.45],
  ["dodecasquare", 9.35],
  ["hexrings", 6.9],
  ["squaretrihex", 6.85],
  ["squaretrihex2", 6.85],
  ["dodecarhombitrihex", 7.65],
];

/** The pentagonal tilings, in Hypersweeper's order — one convex pentagon each,
 * its edges short reals of the ring (√2/2, 2cos 15°) — and each one's window
 * (`box`, in the tile's unit side): the squarest near two or three dozen tiles
 * with one outline, found by scanning sizes and taken mid-range. Type 10's
 * 24-tile window is 0.88 square, so it takes the next, 38 tiles and square;
 * types 13 and 15 are 22 tiles each, 1.00 and 1.04. */
const PENTAGONAL: [string, number][] = [
  ["pentagon10", 6.7],
  ["pentagon13", 8.8],
  ["pentagon15", 9.55],
];

/** The isogonal tilings, in Hypersweeper's order — regular polygons, every
 * vertex alike, but not edge to edge: at each, one tile's side runs straight
 * through (90 + 90 + 180, 60 + 120 + 180, …), its edges a half of the unit —
 * and each one's window (`box`, in the unit side): the squarest near two or
 * three dozen tiles with one outline, found by scanning sizes. The rotated
 * hexagonal leaves a lone tile at a corner of every window under 85 tiles,
 * dropped (`windowLevel`); the three-scale triangular's windows either side
 * of 30 tiles are two or three pieces. */
const ISOGONAL: [string, number][] = [
  ["offsetsquare", 5],
  ["staggeredtri", 4.8],
  ["pythagorean", 4],
  ["rotatedhex", 6.1],
  ["rotatedtri", 4.5],
  ["threescaletri", 4.5],
];

/** The congruent-rectangle bonds — one brick, 1 by ½ (by ⅓ in the 3×3 basket
 * weave), not edge to edge but the stacked bond — and each one's window
 * (`box`, in brick lengths): the squarest near two or three dozen tiles with
 * one outline, found by scanning sizes. A bond's window is centred on a
 * brick, so the stacked bond comes in odd counts of columns and rows: 3 by 7
 * bricks, 0.86 square, its next 5 by 9 at 45. The basket weaves are whole
 * squares of blocks, 4 by 4: the 3×3's smaller windows are a lopsided
 * pinwheel of 20 bricks, so it takes 48. */
const RECTANGLES: [string, number][] = [
  ["stackedbond", 3.5],
  ["runningbond", 4.5],
  ["basketweave", 4],
  ["basketweave3", 4],
  ["herringbone", 4.5],
];

/** The rep-tiles, in Hypersweeper's order (`menu.reptile` in the shared data),
 * and how many times each is inflated: the count nearest two dozen tiles —
 * twice for the rep-4 tiles (16), five times for the rep-2 isosceles right
 * triangle (32), three for the rep-3 30-60-90 triangle (27), once for the
 * rep-16 T-tetromino. Hypersweeper's last, the five-triangle, is left out: it
 * is the pinwheel, whose children turn by atan(½) — no power of ζ — so its
 * tiles cannot be held in a tray that turns by steps. */
const REPTILES: [string, number][] = [
  ["sphinx", 2],
  ["chair", 2],
  ["ltetromino", 2],
  ["ppentomino", 2],
  ["trapezoid", 2],
  ["righttrapezoid", 2],
  ["halftrapezoid", 2],
  ["stretchedchair", 2],
  ["rhombicl", 2],
  ["rightisosceles", 5],
  ["drafter", 3],
  ["ttetromino", 1],
];

const MODE_INFO = catalog.modeInfo as Record<string, { label: string }>;

/** A rep-tile level: Hypersweeper's rep-tile board `mode`, inflated
 * `inflations` times (see `repTilePatch`) — a big copy of the tile to fill with
 * small ones. A rep-tile has no vertex configuration (its tiles meet part-way
 * along each other's sides), so it goes by Hypersweeper's name for it. */
function repTileLevel(mode: string, inflations: number): Level {
  const label = MODE_INFO[mode]?.label;
  if (!label) throw new Error(`no label for ${mode} in data/catalog.json`);
  const { ring, cells } = repTilePatch(mode, inflations);
  return { ...makeLevel(mode, label, ring, whole(cells), "reptile", [], label), inflations };
}

/** The rep-tiles of several pieces (`PIECE_TILES`), which Hypersweeper has
 * no board for, each with its name and how many times it is grown: once for
 * the fish (8 and 9 tiles; the next, 64 and 81, are too many — and the
 * right-angled fish turns as it grows) and the chain (16), twice for the
 * rep-4 kissing squares and triangles (16). As in the picture they come from,
 * but for those two, whose single growth is four tiles. */
const PIECE_REPTILES: [key: string, name: string, inflations: number][] = [
  ["fish", "Right-angled fish", 1],
  ["fish60", "60° fish", 1],
  ["kissingsquares", "Kissing squares", 2],
  ["kissingtriangles", "Kissing triangles", 2],
  ["kissingchain", "Kissing square chain", 1],
];

/** A rep-tile of several pieces: `key`'s tile grown `inflations` times (see
 * `piecePatch`), a big copy to fill with small ones, under its own name. */
function pieceTileLevel(key: string, name: string, inflations: number): Level {
  const { ring, cells } = piecePatch(key, inflations);
  return {
    ...makeLevel(key, name, ring, cells, "reptile", [], name),
    pieceTile: { inflations },
  };
}

/** The spirals, in Hypersweeper's order (`menu.spiral` in the shared data),
 * each with how far its builder grows it (`rings`: its easy board's, turns
 * for Klaassen's) and how many centremost tiles it keeps: the squarest near
 * two or three dozen with one outline, found by scanning sizes, and where one
 * is as square a whole number of the spiral's arms — 30 for the five-fold
 * hexagons and pentagons, 24 for the six-fold, 28 for the seven-fold — so the
 * centre keeps its symmetry. Klaassen's has one arm; 28 is its squarest. The
 * brick rings are left out: their board is a square of bricks, laid as easily
 * in stacked rows. */
const SPIRALS: [string, number, number][] = [
  ["phyllotaxis", 5, 30],
  ["klaassen", 4, 28],
  ["pentaspiral5", 4, 30],
  ["pentaspiral6", 4, 24],
  ["pentaspiral7", 3, 28],
];

/** A spiral level: Hypersweeper's spiral board `mode` with `rings` and `keep`
 * (see `spiralPatch`). A spiral is not vertex-transitive (its centre is a
 * point unlike every other), so it goes by Hypersweeper's name for it. */
function spiralLevel(mode: string, rings: number, keep: number): Level {
  const label = MODE_INFO[mode]?.label;
  if (!label) throw new Error(`no label for ${mode} in data/catalog.json`);
  const { ring, cells } = spiralPatch(mode, rings, keep);
  return {
    ...makeLevel(mode, label, ring, whole(cells), "spiral", [], label),
    spiral: { rings, keep },
  };
}

/** The aperiodic tilings, in Hypersweeper's order (`menu.aperiodic` in the
 * shared data), each with how many substitutions its builder grows the patch
 * by (its easy board's) and how many tiles the centred window keeps — the
 * patch's sun or star in the middle: the squarest near two or three dozen with
 * one outline, found by scanning sizes. Hypersweeper's Spectre board is two
 * levels here: Tile(1,1), the Spectre with straight edges, and the Spectre
 * itself, the same tile with its fourteen unit edges bulging out and in by
 * turns — every edge two tiles share, out on one side and in on the other.
 * Neither is ever turned over (no flip control).
 *
 * Each entry: the level's key, Hypersweeper's board, the depth and the window,
 * and for a round tile how its tray tile's first edge bulges (`makeLevel`). */
const APERIODIC: [key: string, mode: string, depth: number, keep: number, round?: Bulge][] = [
  ["penrose", "penrose", 5, 29],
  ["kitedart", "kitedart", 4, 33],
  ["ammannbeenker", "ammannbeenker", 3, 24],
  ["tile11", "spectre", 3, 33],
  ["spectre", "spectre", 3, 33, OUT],
];

/** What a level on an aperiodic board is called where Hypersweeper's catalog
 * has no name for it. */
const APERIODIC_LABELS: Record<string, string> = { tile11: "Tile(1,1)" };

/** An aperiodic level: the centred window of Hypersweeper's board `mode`,
 * grown `depth` substitutions, `keep` tiles (see `aperiodicPatch`), round if
 * `round` says how. An aperiodic tiling has no one vertex configuration (that
 * is the point), so it goes by Hypersweeper's name for it. */
function aperiodicLevel(
  key: string,
  mode: string,
  depth: number,
  keep: number,
  round?: Bulge,
  variant = 0,
): Level {
  const label = APERIODIC_LABELS[key] ?? MODE_INFO[key]?.label;
  if (!label) throw new Error(`no label for ${key} in data/catalog.json`);
  // a round tile keeps its flat corner: an edge either side, each its own curve
  const { ring, cells } = aperiodicPatch(mode, depth, keep, round !== undefined, variant);
  return {
    ...makeLevel(key, label, ring, whole(cells), "aperiodic", [], label, round),
    aperiodic: { mode, depth, keep, variant },
  };
}

/** The hat's family (`geometry/hat.ts`, from the patch Hypersweeper's three
 * boards of it are cut from, but windowed here, Rep-tiles' own way):
 * the hat, Tile(1,√3), the first aperiodic monotile, used both ways up —
 * about one tile in seven mirrored, no two of those touching; the turtle,
 * Tile(√3,1), the same outline with its two edge lengths swapped, laid as the
 * hats are; and the hat's four metatiles, H, T, P and F — a hexagon, a
 * triangle, a parallelogram and a pentagon — that every hat tiling is built
 * from, none of them ever mirrored. Each is the centred window of the H
 * metatile three substitutions on (1156 hats, 442 metatiles): the squarest
 * near three dozen hats or two dozen metatiles, with one outline, found by
 * scanning sizes. Each entry: the level's key, its tile, the depth and the
 * window. */
const HAT_FAMILY: [key: string, tile: HatTile, depth: number, keep: number][] = [
  ["hat", "hat", 3, 36],
  ["turtle", "turtle", 3, 34],
  ["hatmetatiles", "metatiles", 3, 26],
];

const HAT_LABELS: Record<HatTile, string> = {
  hat: "The hat",
  turtle: "The turtle",
  metatiles: "Hat metatiles",
};

/** A level of the hat's family: the centred window of `keep` tiles of its
 * patch (see `hatPatch`), named for its tile, as the other aperiodic levels
 * are. */
function hatLevel(key: string, tile: HatTile, depth: number, keep: number, centre?: number): Level {
  const label = HAT_LABELS[tile];
  const { ring, cells } = hatPatch(tile, depth, keep, centre);
  return {
    ...makeLevel(key, label, ring, whole(cells), "aperiodic", [], label),
    hat: { tile, depth, keep, ...(centre === undefined ? {} : { centre }) },
  };
}

/** The Socolar–Taylor tile: a notched hexagon, six small rectangles and six
 * pairs of larger ones, moved as one — a single tile that tiles the plane, both
 * ways up, but never periodically. Hypersweeper has no board for it, so it
 * comes from `socolarTaylorPatch`: the middle two rings of a patch four rings
 * out, 19 tiles, a hexagon of them. Its outer tiles' far pieces lie off the
 * hexagon, and their missing neighbours leave gaps in it — the region is
 * those too. */
function socolarTaylorLevel(rings: number): Level {
  const name = "Socolar–Taylor tile";
  const { ring, cells } = socolarTaylorPatch(rings);
  return {
    ...makeLevel("socolartaylor", name, ring, cells, "aperiodic", [], name),
    socolarTaylor: { rings },
  };
}

// -- a tiling's boards ---------------------------------------------------------
// A level's first board is the window this game shipped with. A tiling cut
// from in more than one place has more: the same square moved about a
// periodic tiling, an aperiodic builder's other `variant`s, a hat window
// centred on another tile. `npm run boards` (scripts/find-boards.mts) finds
// the ones worth playing — about as many tiles as the first and as square,
// one outline, the same tray, and no two congruent — and writes where each is
// cut to `boards.json`; each is a level of its own (`<key>-<n>`), built only
// when it is opened.

/** Where a board after a tiling's first is cut: a periodic window's square
 * moved [i, j] steps of 1/GRID of the tiling's domain (a Laves or
 * 2-isohedral one's, of its primal's) and grown by a third, in BOX_STEPs
 * (the first board's square is the tightest that holds its tiles, so a moved
 * one loses some unless it grows); an aperiodic builder's `variant`; or the
 * tile of a hat patch its window is centred on. */
export type Variant = number | [number, number] | [number, number, number];

/** How finely a periodic window's square is moved across one domain. */
export const GRID: number = boardsData.grid;

/** How much a periodic window's square grows a step, in edges. */
export const BOX_STEP = 0.25;

const BOARD_VARIANTS = boardsData.boards as unknown as Record<string, Variant[]>;

/** How a tiling's boards are cut: `kind` says how its variants read
 * (`Variant`); `cut` is a board's cells, `make` its level. */
export interface BoardSource {
  kind: "window" | "variant" | "centre";
  cut(at?: Variant): { ring: Ring; cells: Cyc[][] };
  make(at?: Variant): Level;
}

/** Every level that can have more than one board, by its first board's key. */
export const BOARD_SOURCES = new Map<string, BoardSource>();

/** A level's first board, its source registered for the rest. */
function firstBoard(key: string, source: BoardSource): Level {
  BOARD_SOURCES.set(key, source);
  return source.make();
}

const asNumber = (at: Variant | undefined): number | undefined => {
  if (at !== undefined && typeof at !== "number") throw new Error(`a variant, not ${at}`);
  return at;
};

const windowBoards = (tiling: string, box: number): Level =>
  firstBoard(tiling, {
    kind: "window",
    cut: (at) => windowCut(tiling, box, at),
    make: (at) => windowLevel(tiling, box, at),
  });

const lavesBoards = (dual: string, box: number): Level =>
  firstBoard(dual, {
    kind: "window",
    cut: (at) => lavesWindow(lavesPrimal(dual), boxOf(box, at), gridOffset(lavesPrimal(dual), at)),
    make: (at) => lavesLevel(dual, box, at),
  });

const twoIsohedralBoards = (primal: string, box: number): Level =>
  firstBoard(`${primal}dual`, {
    kind: "window",
    cut: (at) => lavesWindow(primal, boxOf(box, at), gridOffset(primal, at)),
    make: (at) => twoIsohedralLevel(primal, box, at),
  });

const aperiodicBoards = (
  key: string,
  mode: string,
  depth: number,
  keep: number,
  round?: Bulge,
): Level =>
  firstBoard(key, {
    kind: "variant",
    cut: (at) => aperiodicPatch(mode, depth, keep, round !== undefined, asNumber(at)),
    make: (at) => aperiodicLevel(key, mode, depth, keep, round, asNumber(at)),
  });

const hatBoards = (key: string, tile: HatTile, depth: number, keep: number): Level =>
  firstBoard(key, {
    kind: "centre",
    cut: (at) => hatPatch(tile, depth, keep, asNumber(at)),
    make: (at) => hatLevel(key, tile, depth, keep, asNumber(at)),
  });

/** The lattice each regular board repeats by, for its colourings: the
 * squares' unit steps; the up triangles' side and its 60° turn; the
 * hexagons' centre-to-centre step, √3 along a row, and its 60° turn. */
const COLOURED: [key: string, lattice: Lattice][] = [
  ["squares", { u: Z4.one, v: Z4.zeta(1) }],
  ["triangles", { u: Z12.one, v: Z12.zeta(2) }],
  [
    "hexagons",
    {
      u: Z12.add(Z12.zeta(1), Z12.zeta(-1)),
      v: Z12.add(Z12.zeta(3), Z12.zeta(1)),
    },
  ],
];

/** What a painting is called after the plain level's name, by how many of a
 * tile's edges have its own colour (or a line) across them. */
function decorLabel(colours: number, lines: boolean, same: number | null, third = false): string {
  if (lines)
    return same === 1
      ? "linked pairs"
      : same === 2
        ? "lines"
        : same === null
          ? "lines, mixed"
          : "branching lines";
  if (third) return `${colours} colours, one in three`;
  const how =
    same === 0
      ? "apart"
      : same === 1
        ? "paired"
        : same === 2
          ? "striped"
          : same === null
            ? "mixed"
            : "in patches";
  return `${colours} colours, ${how}`;
}

const ROMAN = ["", " II", " III", " IV", " V", " VI"];

/** The coloured and lined levels painted on `plain`'s board (see
 * src/colourings.ts): each painting that marks all of a colour's tiles
 * alike — one tray tile per colour — that asks something of where tiles go
 * (no tray of one mark all round), whose tiles do not all read alike but for
 * their colour (a striped board's, which plays as its lined board does:
 * `Painting.alike`), and whose tray no painting before it had; lined ones
 * first, then by colours.
 * Keyed `<plain>.<label>` — `squares.lines`, `squares.2striped` — a second of
 * one label numbered on. */
function colouredLevels(plain: Level, lattice: Lattice): Level[] {
  const seen = new Set<string>();
  const made: Level[] = [];
  const all = paintings(plain.ring, plain.cells, lattice).sort(
    (a, b) => Number(b.lines) - Number(a.lines) || a.colours - b.colours,
  );
  const build = (marks: number[][][], painting: Painting): Level =>
    makeLevel(
      plain.key,
      plain.label,
      plain.ring,
      plain.cells.map((cell) => cell.map((p) => p.verts)),
      painting.lines ? "rules" : "colourings",
      plain.configs,
      plain.name,
      undefined,
      marks,
      painting.lines ? undefined : painting.paints,
    );
  for (const painting of all) {
    // a colouring whose tiles read alike but for their colour plays as a
    // lined board does: it is one (the marks in another dress), so it is
    // left to the lined boards
    if (painting.alike && build(painting.alike, painting).tiles.length === plain.tiles.length)
      continue;
    const level = build(painting.marks, painting);
    // all of a colour's tiles one kind
    const kindOf = (cell: Piece[]): number =>
      level.tiles.findIndex(
        (t) =>
          turnsOntoPieces(t, cell).length > 0 ||
          turnsOntoPieces(
            { ring: t.ring, pieces: posed(t, { rot: 0, flip: true, t: t.ring.zero }) },
            cell,
          ).length > 0,
      );
    const byColour = new Map<number, Set<number>>();
    level.cells.forEach((cell, i) => {
      const c = painting.paints[i]!;
      byColour.set(c, (byColour.get(c) ?? new Set()).add(kindOf(cell)));
    });
    if ([...byColour.values()].some((kinds) => kinds.size !== 1)) continue;
    // a tray whose every edge carries one mark asks nothing
    if (new Set(level.tiles.flatMap((t) => t.pieces[0]!.marks!)).size < 2) continue;
    const signature = `${painting.lines}|${traySignature(level.tiles)}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const label = decorLabel(
      painting.colours,
      painting.lines,
      sameEdges(level.tiles),
      painting.third,
    );
    made.push({
      ...level,
      decor: { of: plain.key, colours: painting.colours, rules: painting.lines, label },
    });
  }
  // keys and names: one per label, numbered past the first
  const count = new Map<string, number>();
  return made.map((level) => {
    const label = level.decor!.label;
    const n = count.get(label) ?? 0;
    count.set(label, n + 1);
    const slug = label.replace(/(\d) colours, /, "$1").replace(/[^a-z0-9]/g, "");
    const key = `${plain.key}.${slug}${n ? n + 1 : ""}`;
    const full = `${label}${ROMAN[n] ?? ` ${n + 1}`}`;
    return {
      ...level,
      key,
      base: key,
      label: `${plain.label}, ${full}`,
      name: `${plain.name} · ${full}`,
      decor: { ...level.decor!, label: full },
    };
  });
}

/** An aperiodic board with arrows on its edges (geometry/marks.ts:
 * `arrowMark`): `plain`'s window again, each edge of builder cell n's edge i
 * (vertex i to i + 1, as the builder lists it) carrying the arrow
 * `arrowsOf(n, i)` gives — its kind, and whether it points at vertex i. */
function arrowLevel(
  plain: Level,
  arrowsOf: (n: number, i: number) => { kind: number; atStart: boolean },
): Level {
  const [, mode, depth, keep] = APERIODIC.find(([key]) => key === plain.key)!;
  const { ring, cells } = aperiodicPatch(mode, depth, keep);
  // each edge, by its two ends: its arrow's kind and the end it points to
  const arrows = new Map<string, { kind: number; head: string }>();
  const edgeKey = (p: Cyc, q: Cyc): string => [ring.key(p), ring.key(q)].sort().join("|");
  cells.forEach((cell, n) =>
    cell.forEach((p, i) => {
      const q = cell[(i + 1) % cell.length]!;
      const { kind, atStart } = arrowsOf(n, i);
      arrows.set(edgeKey(p, q), { kind, head: ring.key(atStart ? p : q) });
    }),
  );
  const turned = cells.map((cell) => ccw(ring, cell));
  const marks = turned.map((cell) => [
    cell.map((p, i) => {
      const q = cell[(i + 1) % cell.length]!;
      const { kind, head } = arrows.get(edgeKey(p, q))!;
      return arrowMark(kind, head === ring.key(q));
    }),
  ]);
  const label = "matching rules";
  const level = makeLevel(
    `${plain.key}.rules`,
    `${plain.label}, ${label}`,
    ring,
    whole(turned),
    "rules",
    [],
    `${plain.name} · ${label}`,
    undefined,
    marks,
  );
  return { ...level, decor: { of: plain.key, colours: 1, rules: true, label } };
}

/** The Penrose rhombi's matching rule: each edge a single or a double
 * arrow. The rhombi are merged from Robinson triangles (colour, apex a, base
 * b c), and the deflation names a, b and c alike at every step, so the rule
 * is stated on the triangles' legs (`penroseLegs`): every a–b leg a double
 * arrow — on a thin half pointing in to its apex, on a thick one out of it —
 * and every a–c leg a single arrow pointing out of its apex. Up to renaming
 * the two kinds and turning a kind's arrows round, it is the only rule of
 * that shape every shared edge of the builder's 430-rhombus patch keeps; the
 * tests check every shared edge of the board keeps it. */
function penroseRulesLevel(plain: Level): Level {
  const [, , depth, keep] = APERIODIC.find(([key]) => key === plain.key)!;
  const legs = penroseLegs(depth, keep, 0);
  return arrowLevel(plain, (n, i) => {
    const { color, leg, fromApex } = legs[n]![i]!;
    const toward = leg === 0 && color === 0;
    return { kind: leg === 0 ? 2 : 1, atStart: fromApex === toward };
  });
}

/** Penrose's kites and darts' matching rule: his two-colour vertex rule as
 * arrows, every edge pointing from one colour of corner to the other — on a
 * kite (Robinson half colour 0) towards its side corners, on a dart away
 * from them (`kiteDartLegs`) — so a kite never fills a dart's notch to make
 * a rhombus. Of the rules of that shape every shared edge of the builder's
 * 705-tile patch keeps, it is the one that forbids that; the other only
 * orients each half-tile from apex to axis, which the rhombus keeps. The
 * arrows come in two kinds, the long edges' and the short ones' (a rule the
 * edge lengths keep anyway), so the arcs drawn across them come in two
 * colours. */
function kiteDartRulesLevel(plain: Level): Level {
  const [, , depth, keep] = APERIODIC.find(([key]) => key === plain.key)!;
  const legs = kiteDartLegs(depth, keep, 0);
  return arrowLevel(plain, (n, i) => {
    const { color, leg, fromSide } = legs[n]![i]!;
    return {
      kind: (color === 0) === (leg === 0) ? 3 : 4,
      atStart: fromSide === (color === 0),
    };
  });
}

/** Easiest first, roughly: fewer tile kinds, then fewer tiles. */
const byEase = (a: Level, b: Level): number =>
  a.tiles.length - b.tiles.length || a.cells.length - b.cells.length;

const FIRST_BOARDS: Level[] = [
  // The three regular tilings, one tile each.
  makeLevel("squares", "Squares", Z4, whole(squareCells(4, 4)), "regular", [[4, 4, 4, 4]]),
  makeLevel("triangles", "Triangles", Z12, whole(triangleGridCells(4, 6)), "regular", [
    [3, 3, 3, 3, 3, 3],
  ]),
  makeLevel("hexagons", "Hexagons", Z12, whole(hexCells(5, 4)), "regular", [[6, 6, 6]]),
  // The eight other uniform tilings — every vertex alike, regular polygons
  // edge to edge — roughly easiest first: two tile kinds, then three. Each
  // window is the squarest near two or three dozen tiles that keeps one
  // outline (`box`, in edges, measured by scanning sizes). The snub hexagonal
  // is mostly triangles whatever the window — eight to each hexagon — and its
  // squarest is one hexagon in thirty triangles; the next square one is 65.
  windowBoards("trihex", 5.5),
  windowBoards("truncsquare", 8.7),
  windowBoards("trunchex", 11.95),
  windowBoards("elongated", 5),
  windowBoards("snubsquare", 4.6),
  windowBoards("snubhex", 5.2),
  windowBoards("rhombitrihex", 7),
  windowBoards("trunctrihex", 11.95),
  // The twenty 2-uniform tilings.
  ...TWO_UNIFORM.map(([tiling, box]) => windowBoards(tiling, box)).sort(byEase),
  // The eight Laves tilings with more than one kind of vertex (the regular
  // tilings are their own Laves duals, already above).
  ...LAVES.map(([dual, box]) => lavesBoards(dual, box)),
  // The twenty 2-isohedral tilings, the 2-uniform tilings' duals: two kinds
  // of tile, neither regular.
  ...TWO_ISOHEDRAL.map(([primal, box]) => twoIsohedralBoards(primal, box)).sort(byEase),
  // The three pentagonal tilings: one convex pentagon, turned and mirrored.
  ...PENTAGONAL.map(([tiling, box]) => windowBoards(tiling, box)),
  // The six isogonal tilings: regular polygons, every vertex alike, a corner
  // meeting the middle of a side at each.
  ...ISOGONAL.map(([tiling, box]) => windowBoards(tiling, box)),
  // The five congruent-rectangle bonds: one brick, laid in rows staggered or
  // turned.
  ...RECTANGLES.map(([tiling, box]) => windowBoards(tiling, box)),
  // The rep-tiles: one tile, a big copy of it to fill with small ones.
  ...REPTILES.map(([mode, inflations]) => repTileLevel(mode, inflations)),
  // …and those of several pieces: a fish's tail and body, squares or
  // triangles corner to corner, moved as one.
  ...PIECE_REPTILES.map(([key, name, inflations]) => pieceTileLevel(key, name, inflations)),
  // The spirals: one tile, wound round a centre.
  ...SPIRALS.map(([mode, rings, keep]) => spiralLevel(mode, rings, keep)),
  // The aperiodic tilings: a window onto a tiling that repeats nowhere.
  ...APERIODIC.map(([key, mode, depth, keep, round]) =>
    aperiodicBoards(key, mode, depth, keep, round),
  ),
  // …the hat's family: the hat and the turtle, both ways up, and the hat's
  // four metatiles…
  ...HAT_FAMILY.map(([key, tile, depth, keep]) => hatBoards(key, tile, depth, keep)),
  // …and one tile that does it alone, in nineteen pieces.
  socolarTaylorLevel(2),
];

// The regular boards painted: lined, then in two and three colours; and
// Penrose's rhombi and his kites and darts with their arrows.
FIRST_BOARDS.push(
  ...COLOURED.flatMap(([key, lattice]) =>
    colouredLevels(
      FIRST_BOARDS.find((l) => l.key === key)!,
      lattice,
    ),
  ),
  penroseRulesLevel(FIRST_BOARDS.find((l) => l.key === "penrose")!),
  kiteDartRulesLevel(FIRST_BOARDS.find((l) => l.key === "kitedart")!),
);

/** A level's boards past the first, as `boards.json` lists them. */
const variantsOf = (key: string): Variant[] =>
  BOARD_SOURCES.has(key) ? (BOARD_VARIANTS[key] ?? []) : [];

/** Every tiling's first board, in the order the catalog lists them — the
 * levels themselves, for everything that lists tilings rather than boards. */
export const LEVELS: Level[] = FIRST_BOARDS.map((level) => ({
  ...level,
  boards: 1 + variantsOf(level.key).length,
}));

/** The levels that mark the tiles of the tiling `key` is the first board
 * of — its matching rules and colourings — easiest first. */
export function markedOf(key: string): Level[] {
  return LEVELS.filter((l) => l.decor?.of === key);
}

/** One board of a tiling, by key: `<base>` for the first, `<base>-<n>` for
 * the n-th — built only when it is opened. */
export interface BoardRef {
  key: string;
  base: string;
  board: number;
}

/** Every board of every tiling: each tiling's in turn, first board first. */
export const BOARDS: BoardRef[] = LEVELS.flatMap((level) => [
  { key: level.key, base: level.key, board: 1 },
  ...variantsOf(level.key).map((_, i) => ({
    key: `${level.key}-${i + 2}`,
    base: level.key,
    board: i + 2,
  })),
]);

const BOARD_BY_KEY = new Map(BOARDS.map((b) => [b.key, b]));
const FIRST_BY_KEY = new Map(LEVELS.map((l) => [l.key, l]));
const BUILT = new Map<string, Level>();

/** The keys of every board of the tiling `base` is the first board of. */
export function boardKeys(base: string): string[] {
  const first = FIRST_BY_KEY.get(base);
  if (!first) return [];
  return Array.from({ length: first.boards }, (_, i) => (i === 0 ? base : `${base}-${i + 1}`));
}

/** A vertex configuration as tilings are named: the polygons round a vertex,
 * dot-separated, a run of one polygon written as a power — 4⁴, 3⁶, 6³,
 * 3.4.6.4, 3³.4². What the game calls a level, rather than a word that gives
 * away how it is made. */
export function notation(config: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < config.length;) {
    let j = i;
    while (j < config.length && config[j] === config[i]) j++;
    const run = j - i;
    const power = run > 1 ? [...String(run)].map((d) => SUPERSCRIPT[Number(d)]).join("") : "";
    parts.push(`${config[i]}${power}`);
    i = j;
  }
  return parts.join(".");
}

/** A board's level, by key — a first board's at once, any other's built the
 * first time it is asked for. */
export function levelByKey(key: string): Level | undefined {
  const first = FIRST_BY_KEY.get(key);
  if (first) return first;
  const ref = BOARD_BY_KEY.get(key);
  if (!ref) return undefined;
  let level = BUILT.get(key);
  if (!level) {
    const base = FIRST_BY_KEY.get(ref.base)!;
    const at = variantsOf(ref.base)[ref.board - 2]!;
    const made = BOARD_SOURCES.get(ref.base)!.make(at);
    level = { ...made, key, base: ref.base, board: ref.board, boards: base.boards };
    BUILT.set(key, level);
  }
  return level;
}
