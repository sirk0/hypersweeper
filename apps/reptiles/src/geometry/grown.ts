// The aperiodic tilings Rep-tiles grows itself, by a substitution or from a
// patch of another tiling — not cut from one of Hypersweeper's boards: one
// registry, so each is a level, a board search, the tiling past a finished
// board and a rule read off its patch the same way. Each names how its whole
// patch is grown (`patch`, every tile its kind's first tile turned, listed
// from the corner that carries it there) and the window its level keeps:
// the `keep` tiles nearest the patch's middle by Chebyshev distance
// (`centredWindow`), as the hat's and the self-similar girih's are.

import type { Cyc, Ring } from "./cyclotomic";
import { centredWindow } from "./hat";
import { mysticPatch } from "./mystic";
import { p1Grown } from "./penroseP1";
import { robinsonPatch } from "./robinson";

/** A grown patch: its cells, and each one's kind. */
export interface GrownPatch {
  ring: Ring;
  cells: Cyc[][];
  kinds: number[];
}

export interface GrownTiling {
  /** The level's key. */
  key: string;
  /** What the game calls it. */
  name: string;
  /** What it is, in words: the catalog's tooltip. */
  label: string;
  /** How many times its level's patch is grown. */
  depth: number;
  /** How many tiles its level's window keeps. */
  keep: number;
  /** For a tiling whose patch's very middle lacks one of its tiles, the kind
   * its first board is centred on instead: the tile of that kind nearest the
   * middle (Penrose's pentagons, whose middle is a ring of pentagons, a star
   * the nearest five tiles away). */
  centreOn?: number;
  /** The level the catalog lists it after. */
  after: string;
  /** The whole patch grown `depth` times. */
  patch(depth: number): GrownPatch;
}

/** Every grown tiling, in the order the catalog lists them. */
export const GROWN: readonly GrownTiling[] = [
  {
    key: "penrosep1",
    name: "Penrose pentagons",
    label: "Penrose's first tiling: pentagons, stars, boats and diamonds",
    depth: 1,
    keep: 31,
    centreOn: 1,
    after: "penrose",
    patch: p1Grown,
  },
  {
    key: "robinson",
    name: "Robinson triangles",
    label: "Penrose's kites and darts each cut in two: an acute and an obtuse golden triangle",
    depth: 4,
    keep: 42,
    after: "kitedart",
    patch: robinsonPatch,
  },
  {
    key: "mystic",
    name: "Tile(1,1) and the Mystic",
    label:
      "Tile(1,1), and the Mystic: two of it, one turned 30°, that the Spectre's substitution lays as one",
    depth: 3,
    keep: 33,
    after: "spectre",
    patch: mysticPatch,
  },
];

export function grownTiling(key: string): GrownTiling {
  const found = GROWN.find((g) => g.key === key);
  if (!found) throw new Error(`no grown tiling ${key}`);
  return found;
}

const PATCHES = new Map<string, GrownPatch>();

/** `key`'s patch grown `depth` times, remembered: the board search cuts
 * hundreds of windows from one. */
export function grownPatch(key: string, depth: number): GrownPatch {
  const id = `${key}:${depth}`;
  let patch = PATCHES.get(id);
  if (!patch) PATCHES.set(id, (patch = framed(grownTiling(key).patch(depth))));
  return patch;
}

/** A window on `key`'s patch grown `depth` times: its `keep` tiles nearest
 * the middle, or nearest tile `centre`'s middle — another board from the same
 * patch. With `keep` null, the whole patch. */
export function grownWindow(
  key: string,
  depth: number,
  keep: number | null,
  centre?: number,
): GrownPatch {
  const patch = grownPatch(key, depth);
  if (keep === null) return patch;
  const { centreOn } = grownTiling(key);
  const at = centre ?? (centreOn === undefined ? undefined : nearestMiddle(patch, centreOn));
  const kept = centredWindow(patch.ring, patch.cells, keep, at);
  return {
    ring: patch.ring,
    cells: kept.map((i) => patch.cells[i]!),
    kinds: kept.map((i) => patch.kinds[i]!),
  };
}

/** The tile of `kind` whose middle is nearest the patch's — the mean of its
 * tiles' middles, as `centredWindow` takes it — ties to the first listed. */
function nearestMiddle({ ring, cells, kinds }: GrownPatch, kind: number): number {
  const middles = cells.map((cell) => {
    let x = 0;
    let y = 0;
    for (const v of cell) {
      const [px, py] = ring.toXY(v);
      x += px;
      y += py;
    }
    return [x / cell.length, y / cell.length] as const;
  });
  const gx = middles.reduce((s, [x]) => s + x, 0) / middles.length;
  const gy = middles.reduce((s, [, y]) => s + y, 0) / middles.length;
  let best = -1;
  let bestD = Infinity;
  middles.forEach(([x, y], i) => {
    if (kinds[i] !== kind) return;
    const d = Math.floor(Math.hypot(x - gx, y - gy) * 1e6 + 0.5);
    if (d < bestD) [best, bestD] = [i, d];
  });
  if (best < 0) throw new Error(`no tile of kind ${kind} in the patch`);
  return best;
}

/** Each cell listed from the corner that carries its kind's first cell onto
 * it by a turn — so edge j of every tile of a kind is the same edge of the
 * prototile, which a rule read off the patch needs (src/patchMarks.ts). A
 * tile that is no turn of its kind's first throws: a grown tiling is never
 * mirrored but where its tile is its own mirror image turned. */
function framed({ ring, cells, kinds }: GrownPatch): GrownPatch {
  const edges = (c: readonly Cyc[]): Cyc[] => c.map((v, i) => ring.sub(c[(i + 1) % c.length]!, v));
  const firsts = new Map<number, Cyc[]>();
  return {
    ring,
    kinds,
    cells: cells.map((c, i) => {
      const kind = kinds[i]!;
      const own = edges(c);
      const first = firsts.get(kind);
      if (!first) {
        firsts.set(kind, own);
        return c;
      }
      const m = first.length;
      if (own.length === m)
        for (let s = 0; s < m; s++)
          for (let k = 0; k < ring.n; k++) {
            const z = ring.zeta(k);
            if (first.every((e, j) => ring.eq(ring.mul(z, e), own[(j + s) % m]!)))
              return [...c.slice(s), ...c.slice(0, s)];
          }
      throw new Error(`a tile of kind ${kind} is not its first turned`);
    }),
  };
}
