// When two boards are the same board: one is the other turned, mirrored or
// moved, tile for tile. A tiling's boards are cut from it by moving a window
// about (`boards.json`), and two windows often keep the same tiles in another
// place, or turned by one of the tiling's own symmetries — so a board is kept
// only if its key is new.
//
// Exact, as identity is everywhere here. Moving is taken out by centring: each
// point p of a board of N corners is replaced by N·p − Σ, which is in the ring
// (no division) and the same wherever the board lies. Turning and mirroring
// are tried in every way the ring holds — ζᵏ and its conjugate — which is
// every way two boards of one tiling can be congruent: a congruence carries
// the tiling's edge directions, all powers of ζ, onto powers of ζ. The key is
// the least of those readings, each tile its sorted corners and the board its
// sorted tiles.

import type { Cyc, Ring } from "./cyclotomic";

/** A key shared by exactly the boards congruent to `cells`. */
export function congruenceKey(ring: Ring, cells: readonly (readonly Cyc[])[]): string {
  const points = cells.flat();
  const sum = points.reduce((acc, v) => ring.add(acc, v), ring.zero);
  const n = points.length;
  const centred = cells.map((cell) =>
    cell.map((v) =>
      ring.sub(
        v.map((x) => n * x),
        sum,
      ),
    ),
  );
  let best: string | undefined;
  for (const mirror of [false, true]) {
    for (let k = 0; k < ring.n; k++) {
      const turn = ring.zeta(k);
      const read = centred
        .map((cell) =>
          cell
            .map((v) => ring.key(ring.mul(turn, mirror ? ring.conj(v) : v)))
            .sort()
            .join(" "),
        )
        .sort()
        .join("|");
      if (best === undefined || read < best) best = read;
    }
  }
  return best!;
}
