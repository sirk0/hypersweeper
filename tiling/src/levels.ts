// The levels. A level is a region (exact loops in its ring), the tile kinds
// the tray offers, and whether a tile may be turned over. Levels follow
// Hypersweeper's flat boards — the same tilings and outlines, at a size a hand
// can fill tile by tile, each as near a square as its tiling allows (the
// Board-shape convention in docs/agents/difficulty.md): 4×4 squares, 4 rows
// of 6 triangles, 5 rows of 4 hexagons. Each is built here from the same cells, on the same
// lattice, as the Hypersweeper builder it mirrors, and its region is their
// outline; the unit tests check the cells against that builder.

import { archTemplate } from "@boards/tilings";
import { cyclotomic, type Cyc, type Ring } from "./geometry/cyclotomic";
import { templateWindow } from "./geometry/fromTemplate";
import { ccw, outline } from "./geometry/outline";
import { regular, selfTurns, turnsOnto, type Shape } from "./geometry/shape";

export interface Level {
  key: string;
  label: string;
  ring: Ring;
  /** Outer loop counter-clockwise, any holes clockwise. */
  region: Cyc[][];
  /** The tray: one regular polygon per tile kind, fewest sides first, each
   * always in supply. */
  tiles: Shape[];
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
   * back off to finish. */
  cells: Cyc[][];
  /** The tiling's vertex configuration — the polygons round every vertex, in
   * order: [4, 4, 4, 4] for squares, [3, 4, 6, 4] for the rhombitrihexagonal.
   * What the level is called in the game (`notation`). Not enforced. */
  config: number[];
  /** A vertex configuration every vertex *must* keep, for a level whose
   * puzzle is that rule — a tile then lands only where every point it touches
   * can still become it. Unset on every level so far. */
  rule?: number[];
  /** For a level on a Hypersweeper tiling window, which: the tiling and the
   * window `archimedeanBoard(tiling, nx, ny)` takes. */
  window?: { tiling: string; nx: number; ny: number };
}

/** The third star's time allowance per tile the board takes — room to pick
 * each one up, turn it and lay it, not to think hard. Rounded up to ten
 * seconds a level. */
const SECONDS_PER_TILE = 5;

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/**
 * A level from the exact cells of its board. The tray, the turns, the piles
 * and the region are all read off the cells, so nothing about a level is
 * stated twice: each distinct side count is a tile kind, held in the tray
 * resting on a flat side (the regular polygon as `regular` builds it, turn 0);
 * how a cell of that kind is turned from there is measured exactly; and the
 * rotate step is the largest that still reaches every way the board turns
 * that kind from flat — so pointy-top hexagons need turning, though they all
 * sit alike.
 */
function makeLevel(key: string, label: string, ring: Ring, cells: Cyc[][], config: number[]): Level {
  const sides = [...new Set(cells.map((c) => c.length))].sort((a, b) => a - b);
  const tiles = sides.map((m) => regular(ring, m));
  const turns: number[] = [];
  const need: number[] = [];
  tiles.forEach((shape, kind) => {
    // turning by `period` leaves the shape as it was
    const period = selfTurns(shape).find((k) => k > 0) ?? ring.n;
    const ks = cells
      .filter((c) => c.length === sides[kind])
      .map((c) => {
        const k = turnsOnto(shape, ccw(ring, c))[0];
        if (k === undefined) throw new Error(`${key}: a ${c.length}-sided cell is not a regular polygon`);
        return k % period;
      });
    const step = ks.reduce((g, k) => gcd(g, k), period);
    turns.push(step === period ? 0 : step);
    need.push(ks.length);
  });
  const turn = turns.reduce((g, k) => gcd(g, k), 0);
  const seconds = Math.ceil((cells.length * SECONDS_PER_TILE) / 10) * 10;
  return { key, label, ring, region: outline(ring, cells), tiles, mirror: false, turns, turn, need, seconds, cells, config };
}

/** A level on a window of one of Hypersweeper's uniform tilings, `box` edges
 * square — the window `archimedeanBoard(tiling, box / width, box / height)`
 * keeps — named by the tiling's vertex configuration. */
function uniformLevel(key: string, label: string, tiling: string, box: number, config: number[]): Level {
  const t = archTemplate(tiling);
  const nx = box / t.width;
  const ny = box / t.height;
  const { ring, cells } = templateWindow(tiling, nx, ny);
  return { ...makeLevel(key, label, ring, cells, config), window: { tiling, nx, ny } };
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
    for (let c = 0; c < cols; c++) cells.push([at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)]);
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

export const LEVELS: Level[] = [
  makeLevel("squares", "Squares", Z4, squareCells(4, 4), [4, 4, 4, 4]),
  makeLevel("triangles", "Triangles", Z12, triangleGridCells(4, 6), [3, 3, 3, 3, 3, 3]),
  makeLevel("hexagons", "Hexagons", Z12, hexCells(5, 4), [6, 6, 6]),
  // Two uniform tilings, the first with two tile kinds and the second with
  // three: the trihexagonal (kagome) tiling, and the rhombitrihexagonal, which
  // sets squares between the triangles and hexagons. Each window is the
  // squarest near a couple of dozen tiles.
  uniformLevel("trihex", "Trihexagonal", "trihex", 5.5, [3, 6, 3, 6]),
  uniformLevel("rhombitrihex", "Rhombitrihexagonal", "rhombitrihex", 7, [3, 4, 6, 4]),
];

const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** A vertex configuration as tilings are named: the polygons round a vertex,
 * dot-separated, a run of one polygon written as a power — 4⁴, 3⁶, 6³,
 * 3.4.6.4, 3³.4². What the game calls a level, rather than a word that gives
 * away how it is made. */
export function notation(config: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < config.length; ) {
    let j = i;
    while (j < config.length && config[j] === config[i]) j++;
    const run = j - i;
    const power = run > 1 ? [...String(run)].map((d) => SUPERSCRIPT[Number(d)]).join("") : "";
    parts.push(`${config[i]}${power}`);
    i = j;
  }
  return parts.join(".");
}

export function levelByKey(key: string): Level | undefined {
  return LEVELS.find((l) => l.key === key);
}
