// The levels. A level is a region (exact loops in its ring), the tile kinds
// the tray offers, and whether a tile may be turned over. Levels follow
// Hypersweeper's flat boards — the same tilings, at a size a hand can fill
// tile by tile — and their outlines are written exactly here; the unit tests
// tie each one back to the Hypersweeper builder it comes from.

import { cyclotomic, type Cyc, type Ring } from "./geometry/cyclotomic";
import { regular, walk, type Shape } from "./geometry/shape";

export interface Level {
  key: string;
  label: string;
  ring: Ring;
  /** Outer loop counter-clockwise, any holes clockwise. */
  region: Cyc[][];
  /** The tray: one entry per tile kind, each always in supply. */
  tiles: Shape[];
  /** Tiles may be mirrored as well as turned. */
  mirror: boolean;
}

const Z4 = cyclotomic(4);

/** An `cols` × `rows` rectangle of unit squares — Hypersweeper's
 * `squareBoard(rows, cols)` outline. */
function rectangle(ring: Ring, cols: number, rows: number): Cyc[] {
  const q = ring.n / 4;
  return walk(ring, [
    [0, cols],
    [q, rows],
    [2 * q, cols],
    [3 * q, rows],
  ]);
}

export const LEVELS: Level[] = [
  {
    key: "squares",
    label: "Squares",
    ring: Z4,
    region: [rectangle(Z4, 4, 4)],
    tiles: [regular(Z4, 4)],
    mirror: false,
  },
];

export function levelByKey(key: string): Level | undefined {
  return LEVELS.find((l) => l.key === key);
}
