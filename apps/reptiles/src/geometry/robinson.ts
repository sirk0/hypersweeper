// Robinson's triangles: Penrose's kites and darts each cut in two along its
// axis (Raphael Robinson, 1975) — the acute golden triangle (36°-72°-72°,
// sides 1, 1, 1/φ) from a kite, the obtuse one (36°-36°-108°, sides 1/φ,
// 1/φ, 1) from a dart. Every cut runs between two of the kite's or dart's
// own corners, so the patch stays exact in ℤ[ζ10], read off the very patch
// the kites-and-darts level is cut from (`aperiodicPatch("kitedart", …)`).
//
// Both triangles are isosceles, so a mirrored half is the other half turned:
// the tray needs no flip, only turns of 36°. What makes them a puzzle is
// that two of them make a kite, a dart, or a Penrose rhombus, and a pair can
// be laid either way round.

import { aperiodicPatch } from "./aperiodic";
import type { Cyc, Ring } from "./cyclotomic";
import { ccw } from "./outline";

/** The kinds: the acute triangle (a half kite) and the obtuse one (a half
 * dart). */
export const ROBINSON_ACUTE = 0;
export const ROBINSON_OBTUSE = 1;

/** The patch of `depth` kite-and-dart deflations from Penrose's sun, every
 * kite and dart cut along its axis: each triangle listed counter-clockwise
 * from its 36° corner on the axis — where the kite's or dart's two long
 * sides meet — and its kind. */
export function robinsonPatch(depth: number): { ring: Ring; cells: Cyc[][]; kinds: number[] } {
  const { ring, cells } = aperiodicPatch("kitedart", depth, null);
  const norm = (a: Cyc, b: Cyc): Cyc => {
    const v = ring.sub(b, a);
    return ring.mul(v, ring.conj(v));
  };
  const length = (a: Cyc, b: Cyc): number => {
    const [x, y] = ring.toXY(ring.sub(b, a));
    return Math.hypot(x, y);
  };
  const out: Cyc[][] = [];
  const kinds: number[] = [];
  for (const raw of cells) {
    const c = ccw(ring, raw);
    if (c.length !== 4) throw new Error("robinsonPatch: a kite or dart is not four corners");
    const at = (i: number): Cyc => c[(i + 4) % 4]!;
    // the axis runs between the two corners whose two sides are equal; the
    // apex is the one of them where the long sides meet
    const equal = (i: number): boolean => ring.eq(norm(at(i - 1), at(i)), norm(at(i), at(i + 1)));
    const ends = [0, 1, 2, 3].filter(equal);
    if (ends.length !== 2 || (ends[1]! - ends[0]!) % 2)
      throw new Error("robinsonPatch: a tile with no axis");
    const a =
      length(at(ends[0]!), at(ends[0]! + 1)) > length(at(ends[1]!), at(ends[1]! + 1))
        ? ends[0]!
        : ends[1]!;
    // a kite's axis is as long as its long sides; a dart's, as its short ones
    const kite = ring.eq(norm(at(a), at(a + 2)), norm(at(a), at(a + 1)));
    const kind = kite ? ROBINSON_ACUTE : ROBINSON_OBTUSE;
    out.push([at(a), at(a + 1), at(a + 2)], [at(a), at(a + 2), at(a + 3)]);
    kinds.push(kind, kind);
  }
  return { ring, cells: out, kinds };
}
