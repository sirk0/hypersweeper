// The hat family: Tile(1,√3), the hat, the first aperiodic monotile (Smith,
// Myers, Kaplan and Goodman-Strauss, 2023); Tile(√3,1), the turtle, the same
// outline with its two edge lengths swapped; and the four metatiles H, T, P
// and F the hat's tilings are built from. The patch itself — the substitution
// and every hat and metatile read onto the lattice — is `hatMetatiles` in
// @tiling/geometry, which Hypersweeper's three boards of this family are cut
// from too; this file cuts Rep-tiles' levels from it.
//
// The substitution is Craig S. Kaplan's hatviz (BSD 3-Clause licence; the
// port and its licence are in packages/geometry/src/hat.ts), every corner read
// back onto the Eisenstein lattice ℤ[ω] ⊂ ℤ[ζ12], exactly.
//
// The hat's short edges (length 1) point at multiples of 60°, its long ones
// (√3) at 30° past them, and every hat in a tiling is turned by a multiple of
// 60° and perhaps mirrored, which keeps that split. Every member of the family
// Tile(a,b) has the same edge directions with lengths a and b, and a hat
// tiling is a Tile(a,b) tiling with each edge's length changed: `deform` walks
// the hats' edges from one corner and lays each corner again with every short
// edge a in length and every long one b — exact, and the walk checks that each
// tile closes and that a corner two tiles share lands in one place.

import { hatMetatiles, type HatMeta, type Hex, type MetaKind } from "@tiling/geometry";
import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";

export { hatMetatiles, type HatMeta, type MetaKind };

const Z12 = cyclotomic(12);

const hexKey = ([x, y]: Hex): string => `${x},${y}`;
/** x + y·ω in ℤ[ζ12], ω = ζ². */
const hexCyc = ([x, y]: Hex): Cyc => [x, 0, y, 0];
const hexSub = (a: Hex, b: Hex): Hex => [a[0] - b[0], a[1] - b[1]];
/** |x + y·ω|². */
const hexNorm = ([x, y]: Hex): number => x * x + x * y + y * y;

/** √3 = ζ + ζ⁻¹. */
const SQRT3: Cyc = Z12.add(Z12.zeta(1), Z12.zeta(-1));

/** The hats as Tile(a,b): each corner laid again with every short edge (a
 * unit, at a multiple of 60°) `a` long and every long one (√3, at 30° past)
 * `b` long, `a` and `b` reals of ℤ[ζ12]. Walked from the first hat's first
 * corner; a tile whose corner the walk has laid already must land on it, or
 * the hats were no tiling. */
export function deform(hats: Hex[][], a: Cyc, b: Cyc): Cyc[][] {
  const at = new Map<string, Cyc>();
  at.set(hexKey(hats[0]![0]!), Z12.zero);
  const edge = (d: Hex): Cyc => {
    const norm = hexNorm(d);
    if (norm === 1) return Z12.mul(a, hexCyc(d));
    if (norm === 3) {
      // d = √3·u, u a unit at an odd multiple of 30°: u = d·√3/3
      const u3 = Z12.mul(SQRT3, hexCyc(d));
      if (u3.some((c) => c % 3)) throw new Error(`long edge ${d} is not √3 long`);
      return Z12.mul(
        b,
        u3.map((c) => c / 3),
      );
    }
    throw new Error(`edge ${d} is no edge of the hat`);
  };
  const out: (Cyc[] | undefined)[] = hats.map(() => undefined);
  let left = hats.length;
  while (left) {
    let progress = false;
    hats.forEach((hat, i) => {
      if (out[i]) return;
      const start = hat.findIndex((v) => at.has(hexKey(v)));
      if (start < 0) return;
      const laid: Cyc[] = new Array<Cyc>(hat.length);
      let p = at.get(hexKey(hat[start]!))!;
      for (let k = 0; k < hat.length; k++) {
        const j = (start + k) % hat.length;
        const v = hat[j]!;
        const known = at.get(hexKey(v));
        if (known && !Z12.eq(known, p)) throw new Error("the hats do not deform: a corner moved");
        at.set(hexKey(v), p);
        laid[j] = p;
        p = Z12.add(p, edge(hexSub(hat[(j + 1) % hat.length]!, v)));
      }
      if (!Z12.eq(p, laid[start]!)) throw new Error("a deformed hat does not close");
      out[i] = laid;
      left--;
      progress = true;
    });
    if (!progress) throw new Error("the hats are not joined corner to corner");
  }
  return out as Cyc[][];
}

/** The `keep` cells nearest the patch's middle — the mean of their corners'
 * means — by Chebyshev distance, a square block, as Hypersweeper trims its
 * aperiodic boards (`windowRows` in @tiling/geometry, its centred window);
 * ties in substitution order. Returns their indices. With `centre`, the
 * window is centred on that tile's centroid instead — another board from the
 * same patch. */
export function centredWindow(ring: Ring, cells: Cyc[][], keep: number, centre?: number): number[] {
  const centroids = cells.map((cell) => {
    let x = 0;
    let y = 0;
    for (const v of cell) {
      const [px, py] = ring.toXY(v);
      x += px;
      y += py;
    }
    return [x / cell.length, y / cell.length] as const;
  });
  let gx = 0;
  let gy = 0;
  for (const [x, y] of centroids) {
    gx += x;
    gy += y;
  }
  gx /= centroids.length;
  gy /= centroids.length;
  if (centre !== undefined) [gx, gy] = centroids[centre]!;
  const rank = centroids.map(([x, y]) =>
    Math.floor(Math.max(Math.abs(x - gx), Math.abs(y - gy)) * 1e6 + 0.5),
  );
  return cells
    .map((_, i) => i)
    .sort((i, j) => rank[i]! - rank[j]! || i - j)
    .slice(0, keep);
}

/** The whole patch `hatPatch` cuts its windows from, each tile in its
 * prototile's own order — a hat's or a turtle's fourteen corners in `HAT14`
 * order, its long side's midpoint kept (counter-clockwise or not as it is
 * mirrored), a metatile's in its shape's — and which prototile it is (the
 * hat; H, T, P or F): what a matching rule on its edges is read off
 * (src/patchMarks.ts). */
export function hatFrames(tile: HatTile, depth: number): { kinds: number[]; cells: Cyc[][] } {
  const metas = hatMetatiles(depth);
  if (tile === "metatiles")
    return {
      kinds: metas.map((m) => "HTPF".indexOf(m.kind)),
      cells: metas.map((m) => m.corners.map(hexCyc)),
    };
  const corners = metas.flatMap((m) => m.hats).map((h) => h.corners);
  return {
    kinds: corners.map(() => 0),
    cells: tile === "hat" ? corners.map((c) => c.map(hexCyc)) : deform(corners, SQRT3, Z12.one),
  };
}

/** Which tile of the family a level is made of. */
export type HatTile = "hat" | "turtle" | "metatiles";

export interface HatPatch {
  ring: Ring;
  cells: Cyc[][];
  /** Per cell, whether it is a mirrored hat (or turtle); all false for the
   * metatiles. */
  mirrored: boolean[];
}

/** The window of `keep` tiles of `tile` nearest the middle of the H metatile
 * `depth` substitutions on: hats, turtles (the hats deformed, `deform`), or
 * the first-generation metatiles themselves. Each tile is its real corners;
 * a hat's long side runs straight through its fourteenth. `centre`, a tile's
 * index in the whole patch, centres the window on that tile instead. */
export function hatPatch(tile: HatTile, depth: number, keep: number, centre?: number): HatPatch {
  const metas = hatMetatiles(depth);
  let cells: Cyc[][];
  let mirrored: boolean[];
  if (tile === "metatiles") {
    cells = metas.map((m) => m.corners.map(hexCyc));
    mirrored = cells.map(() => false);
  } else {
    const hats = metas.flatMap((m) => m.hats);
    mirrored = hats.map((h) => h.mirrored);
    const corners = hats.map((h) => h.corners);
    cells = tile === "hat" ? corners.map((c) => c.map(hexCyc)) : deform(corners, SQRT3, Z12.one);
    // drop the long side's midpoint, the fourth corner of fourteen
    cells = cells.map((c) => c.filter((_, i) => i !== 3));
  }
  const kept = centredWindow(Z12, cells, keep, centre);
  return { ring: Z12, cells: kept.map((i) => cells[i]!), mirrored: kept.map((i) => mirrored[i]!) };
}
