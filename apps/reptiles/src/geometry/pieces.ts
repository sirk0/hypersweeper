// Rep-tiles of several pieces: a tile that is two or more polygons moved as
// one — the fish, a tail and a body meeting at a single point; the kissing
// squares and triangles, corner to corner — whose big copy is filled by small
// ones. Hypersweeper has no board for these (a minesweeper cell is one
// polygon), so they are defined here: each tile, the factor its big copy is
// grown by — an element of the ring, so the copy is exact: 2, 3, 4, or 2 + 2i,
// which grows the fish by 2√2 and turns it 45° — and that copy cut into
// copies of the tile, as a gallery picture of rep-tiles draws it. The tests check every child is the tile,
// turned or mirrored, and that together they cover the big copy exactly.
//
// Nothing here asks a tile's pieces to touch: the Socolar–Taylor tile, whose
// pieces lie apart, is one of these too.

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { ccw } from "./outline";
import { piece, posed, spotKey, turnsOnto, type Shape } from "./shape";

export interface PieceTile {
  ring: Ring;
  /** The tile, a polygon per piece. */
  tile: Cyc[][];
  /** What the big copy is grown by: the tile times this is the region. */
  factor: Cyc;
  /** The big copy cut into copies of the tile, each its pieces. */
  children: Cyc[][][];
}

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);

/** A point of the square lattice, x + y·i. */
const sq = ([x, y]: [number, number]): Cyc => [x, y];

/** A point of the triangular lattice as the 60° fish is drawn: x along the
 * fish's axis in half-widths of a unit rhombus (cos 30° each), y across it in
 * half-units — X + Y even. It is ((X + Y)/2)·ζ + ((X − Y)/2)·ζ⁻¹ in ℤ[ζ12]. */
const tri = ([x, y]: [number, number]): Cyc => {
  if ((x + y) % 2) throw new Error(`(${x}, ${y}) is no point of the lattice`);
  const [i, j] = [(x + y) / 2, (x - y) / 2];
  return Z12.add(
    Z12.zeta(1).map((c) => c * i),
    Z12.zeta(11).map((c) => c * j),
  );
};

/** Polygons from lattice points. */
const polys = (at: (p: [number, number]) => Cyc, ...ps: [number, number][][]): Cyc[][] =>
  ps.map((p) => p.map(at));

/** The isosceles right fish: a right isosceles triangle, the tail, whose
 * right angle touches the right-angled corner at the short end of a right
 * trapezoid, the body. Rep-8: the fish grown by 2 + 2i — 2√2, turned 45° —
 * is eight of them, two in the tail and six in the body. Read off the
 * picture y down, eight units wide and four tall. */
const down = ([x, y]: [number, number]): Cyc => sq([x, 4 - y]);
const FISH: PieceTile = {
  ring: Z4,
  tile: polys(
    sq,
    [
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    [
      [1, 0],
      [2, 0],
      [2, -2],
      [1, -1],
    ],
  ),
  factor: [2, 2],
  children: [
    // the tail
    [
      [
        [0, 0],
        [1, 1],
        [1, 2],
        [0, 2],
      ],
      [
        [1, 2],
        [2, 2],
        [1, 3],
      ],
    ],
    [
      [
        [0, 2],
        [1, 2],
        [1, 3],
        [0, 4],
      ],
      [
        [1, 1],
        [2, 2],
        [1, 2],
      ],
    ],
    // the body, its front half
    [
      [
        [2, 2],
        [3, 1],
        [3, 2],
      ],
      [
        [3, 2],
        [4, 2],
        [4, 4],
        [3, 3],
      ],
    ],
    [
      [
        [3, 1],
        [4, 0],
        [4, 2],
        [3, 2],
      ],
      [
        [2, 2],
        [3, 2],
        [3, 3],
      ],
    ],
    // its back half
    [
      [
        [4, 0],
        [5, 1],
        [5, 2],
        [4, 2],
      ],
      [
        [5, 2],
        [6, 2],
        [5, 3],
      ],
    ],
    [
      [
        [5, 1],
        [6, 2],
        [5, 2],
      ],
      [
        [4, 2],
        [5, 2],
        [5, 3],
        [4, 4],
      ],
    ],
    [
      [
        [5, 3],
        [6, 2],
        [6, 3],
      ],
      [
        [6, 3],
        [7, 3],
        [8, 4],
        [6, 4],
      ],
    ],
    [
      [
        [6, 2],
        [7, 3],
        [6, 3],
      ],
      [
        [4, 4],
        [5, 3],
        [6, 3],
        [6, 4],
      ],
    ],
  ].map((child) => polys(down, ...(child as [number, number][][]))),
};

/** The 60° fish: an equilateral triangle, the tail, touching the sharp
 * corner of a 60° rhombus, the body, both of unit side. Rep-9: grown by 3 it
 * is nine of them — three round each of three points along its axis. */
const FISH60: PieceTile = {
  ring: Z12,
  tile: polys(
    tri,
    [
      [0, 0],
      [1, -1],
      [2, 0],
      [1, 1],
    ],
    [
      [2, 0],
      [3, -1],
      [3, 1],
    ],
  ),
  factor: [3, 0, 0, 0],
  children: (
    [
      // round the body's first point
      [
        [
          [0, 0],
          [1, 1],
          [2, 0],
          [1, -1],
        ],
        [
          [2, 0],
          [3, 1],
          [3, -1],
        ],
      ],
      [
        [
          [1, 1],
          [2, 2],
          [2, 0],
        ],
        [
          [2, 0],
          [3, -1],
          [3, -3],
          [2, -2],
        ],
      ],
      [
        [
          [2, 2],
          [3, 3],
          [3, 1],
          [2, 0],
        ],
        [
          [1, -1],
          [2, 0],
          [2, -2],
        ],
      ],
      // round its second
      [
        [
          [3, 3],
          [4, 2],
          [4, 0],
          [3, 1],
        ],
        [
          [4, 0],
          [5, -1],
          [4, -2],
        ],
      ],
      [
        [
          [4, 2],
          [5, 1],
          [4, 0],
        ],
        [
          [3, -1],
          [4, 0],
          [4, -2],
          [3, -3],
        ],
      ],
      [
        [
          [3, 1],
          [4, 0],
          [3, -1],
        ],
        [
          [4, 0],
          [5, 1],
          [6, 0],
          [5, -1],
        ],
      ],
      // and the tail's middle
      [
        [
          [6, 0],
          [7, 1],
          [8, 0],
          [7, -1],
        ],
        [
          [8, 0],
          [9, 1],
          [9, -1],
        ],
      ],
      [
        [
          [7, 1],
          [8, 2],
          [8, 0],
        ],
        [
          [8, 0],
          [9, -1],
          [9, -3],
          [8, -2],
        ],
      ],
      [
        [
          [8, 2],
          [9, 3],
          [9, 1],
          [8, 0],
        ],
        [
          [7, -1],
          [8, 0],
          [8, -2],
        ],
      ],
    ] as [number, number][][][]
  ).map((child) => polys(tri, ...child)),
};

/** A unit square with its lower-left corner at (x, y). */
const unit = ([x, y]: [number, number]): Cyc[] => [
  sq([x, y]),
  sq([x + 1, y]),
  sq([x + 1, y + 1]),
  sq([x, y + 1]),
];

/** Two unit squares corner to corner. Rep-4: grown by 2 it is two 2×2
 * blocks corner to corner, each a checkerboard of two of them. */
const KISSING_SQUARES: PieceTile = {
  ring: Z4,
  tile: [unit([0, 0]), unit([1, 1])],
  factor: [2, 0],
  children: (
    [
      [
        [0, 0],
        [1, 1],
      ],
      [
        [0, 1],
        [1, 0],
      ],
      [
        [2, 2],
        [3, 3],
      ],
      [
        [2, 3],
        [3, 2],
      ],
    ] as [number, number][][]
  ).map((child) => child.map(unit)),
};

/** Four unit squares in a zigzag, each meeting the next at a corner: up,
 * down, up, down. Rep-16: grown by 4 it is four 4×4 blocks in the same
 * zigzag, each four of them — two lying along it, two standing across. */
const CHAIN: [number, number][][] = [
  // in a block, from its lower-left corner
  [
    [0, 3],
    [1, 2],
    [2, 3],
    [3, 2],
  ],
  [
    [1, 3],
    [0, 2],
    [1, 1],
    [0, 0],
  ],
  [
    [3, 3],
    [2, 2],
    [3, 1],
    [2, 0],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 1],
    [3, 0],
  ],
];
const KISSING_CHAIN: PieceTile = {
  ring: Z4,
  tile: (
    [
      [0, 1],
      [1, 0],
      [2, 1],
      [3, 0],
    ] as [number, number][]
  ).map(unit),
  factor: [4, 0],
  children: (
    [
      [0, 4],
      [4, 0],
      [8, 4],
      [12, 0],
    ] as [number, number][]
  ).flatMap(([bx, by]) => CHAIN.map((chain) => chain.map(([x, y]) => unit([bx + x, by + y])))),
};

/** Two right isosceles triangles meeting at a sharp corner of each, both on
 * one side of it, one above the other. Rep-4: grown by 2 it is four of them,
 * two in each big triangle — one pair the tile mirrored. */
const KISSING_TRIANGLES: PieceTile = {
  ring: Z4,
  tile: polys(
    sq,
    [
      [0, 2],
      [1, 2],
      [1, 1],
    ],
    [
      [0, 1],
      [1, 1],
      [0, 0],
    ],
  ),
  factor: [2, 0],
  children: (
    [
      [
        [
          [0, 4],
          [1, 4],
          [1, 3],
        ],
        [
          [1, 3],
          [2, 3],
          [2, 4],
        ],
      ],
      [
        [
          [1, 4],
          [2, 4],
          [1, 3],
        ],
        [
          [1, 3],
          [2, 3],
          [2, 2],
        ],
      ],
      [
        [
          [0, 2],
          [0, 1],
          [1, 1],
        ],
        [
          [1, 2],
          [2, 2],
          [1, 1],
        ],
      ],
      [
        [
          [0, 2],
          [1, 2],
          [1, 1],
        ],
        [
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      ],
    ] as [number, number][][][]
  ).map((child) => polys(sq, ...child)),
};

/** The rep-tiles of several pieces, by level key. */
export const PIECE_TILES: Record<string, PieceTile> = {
  fish: FISH,
  fish60: FISH60,
  kissingsquares: KISSING_SQUARES,
  kissingtriangles: KISSING_TRIANGLES,
  kissingchain: KISSING_CHAIN,
};

/** `def`'s tile as a shape, each piece counter-clockwise. */
export function tileShape(def: PieceTile): Shape {
  return { ring: def.ring, pieces: def.tile.map((p) => piece(ccw(def.ring, p))) };
}

/** How `cell` sits: the tile mirrored if `flip`, turned by ζ^rot, moved by t. */
function poseOf(def: PieceTile, cell: Cyc[][]): { rot: number; flip: boolean; t: Cyc } {
  const { ring } = def;
  const shape = tileShape(def);
  const want = spotKey(
    ring,
    cell.map((p) => piece(p)),
  );
  for (const flip of [false, true]) {
    const base = { ring, pieces: posed(shape, { rot: 0, flip, t: ring.zero }) };
    for (const rot of turnsOnto(base, cell)) {
      const turned = posed(shape, { rot, flip, t: ring.zero });
      for (const v of turned.flatMap((p) => p.verts)) {
        const t = ring.sub(cell[0]![0]!, v);
        if (spotKey(ring, posed(shape, { rot, flip, t })) === want) return { rot, flip, t };
      }
    }
  }
  throw new Error("poseOf: a child is not the tile");
}

/**
 * The tile `key` grown `inflations` times: its cells, each its pieces. Once
 * is the children; each time more, every child of the last round is itself
 * cut the same way — which needs a real factor wherever a child is mirrored
 * (a mirror does not commute with a turning growth), so only the fish, grown
 * once, turn as they grow.
 */
export function piecePatch(key: string, inflations: number): { ring: Ring; cells: Cyc[][][] } {
  const def = PIECE_TILES[key];
  if (!def) throw new Error(`no tile of several pieces ${key}`);
  if (inflations < 1) throw new Error("inflations must be >= 1");
  const { ring, factor } = def;
  const real = ring.eq(factor, ring.conj(factor));
  if (inflations > 1 && !real) throw new Error(`${key}: a turning growth is grown once only`);
  let cells = def.children.map((c) => c.map((p) => ccw(ring, p)));
  const poses = cells.map((c) => poseOf(def, c));
  // grown n times: each child's pose, its move scaled by factorⁿ⁻¹, applied
  // to the patch grown n − 1 times
  let scale = ring.one;
  for (let round = 2; round <= inflations; round++) {
    scale = ring.mul(scale, factor);
    const last = cells;
    cells = poses.flatMap(({ rot, flip, t }) => {
      const z = ring.zeta(rot);
      const at = (v: Cyc): Cyc =>
        ring.add(ring.mul(z, flip ? ring.conj(v) : v), ring.mul(scale, t));
      return last.map((c) => c.map((p) => ccw(ring, p.map(at))));
    });
  }
  return { ring, cells };
}
