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

import { cyclotomic, type Cyc, type Ring } from "./cyclotomic";
import { posedCurve, signedArea, type Piece, type Shape } from "./shape";

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

// When two tiles are the same figure: one is a turned, moved or mirrored copy
// of the other at its true size, whatever ring each is built in. Decided
// exactly: both are lifted into one ring, ℤ[ζN] for N the lcm of theirs, and
// compared by products of their edge vectors — never by rounding a
// coordinate. A round tile matches another only where their curves match
// too; a tile of several pieces (the fish) only piece for piece, all under
// the one motion.

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** `a` of ℤ[ζn] (`from`) as an element of ℤ[ζN] (`to`), n dividing N, times
 * the whole number `scale`: ζn is ζN^(N/n). */
function lift(from: Ring, to: Ring, a: Cyc, scale: number): Cyc {
  const step = to.n / from.n;
  let out = to.zero;
  a.forEach((c, j) => {
    if (c !== 0)
      out = to.add(
        out,
        to.zeta(j * step).map((x) => x * c * scale),
      );
  });
  return out;
}

/** The float area at true size: only ever a quick reject, by a margin far past
 * rounding, before the exact test. */
const area = (s: Shape): number =>
  Math.abs(s.pieces.reduce((sum, p) => sum + signedArea(p.verts.map((v) => s.ring.toXY(v))), 0));

/** A shape's pieces' side-count profile, the quick reject for a shape of
 * several: the vertex counts, sorted, and which are round. */
const profile = (s: Shape): string =>
  s.pieces
    .map((p) => `${p.verts.length}${p.curve ? "~" : ""}`)
    .sort()
    .join();

/** Whether `b` is a turned, moved, or mirrored copy of `a` — at the same size,
 * or with `size` false at any size (similar) — round edges and all, piece for
 * piece. Exact. */
export function sameFigure(a: Shape, b: Shape, size = true): boolean {
  if (profile(a) !== profile(b)) return false;
  if (size) {
    const [x, y] = [area(a), area(b)];
    if (Math.abs(x - y) > 1e-6 * Math.max(1, x, y)) return false;
  }
  const ring = cyclotomic(lcm(a.ring.n, b.ring.n));
  // at true size: each scaled by the other's drawing unit (whole numbers)
  const lifted = (s: Shape, scale: number): Piece[] =>
    s.pieces.map((p) => ({
      verts: p.verts.map((v) => lift(s.ring, ring, v, scale)),
      ...(p.curve ? { curve: p.curve } : {}),
    }));
  const pa = lifted(a, b.ring.unit);
  const pb = lifted(b, a.ring.unit);
  // a mirror is the conjugate, listed backwards to stay counter-clockwise
  const mirrored = pa.map((p) => ({
    verts: p.verts.map((v) => ring.conj(v)).reverse(),
    ...(p.curve ? { curve: posedCurve(p.curve, true)! } : {}),
  }));
  const norm = (z: Cyc): Cyc => ring.mul(z, ring.conj(z));
  for (const from of [pa, mirrored]) {
    const [first, ...rest] = from;
    const a0 = first!.verts[0]!;
    const sa = ring.sub(first!.verts[1]!, a0);
    // b = λ·a + τ for one complex λ: anchored on a's first edge landing on
    // each edge of each of b's pieces in turn
    for (const anchor of pb) {
      for (let s = 0; s < anchor.verts.length; s++) {
        const b0 = anchor.verts[s]!;
        const sb = ring.sub(anchor.verts[(s + 1) % anchor.verts.length]!, b0);
        if (size && !ring.eq(norm(sb), norm(sa))) continue;
        // q is where λ·a + τ takes p: (q − b₀)·(a₁ − a₀) = (b₁ − b₀)·(p − a₀)
        const lands = (p: Cyc, q: Cyc): boolean =>
          ring.eq(ring.mul(ring.sub(q, b0), sa), ring.mul(sb, ring.sub(p, a0)));
        // a piece lands on one of b's, listed from some vertex — each edge
        // bulging as the edge of b it lies on
        const onto = (p: Piece, q: Piece): boolean => {
          const m = p.verts.length;
          if (q.verts.length !== m) return false;
          for (let j = 0; j < m; j++) {
            if (
              p.verts.every((v, i) => lands(v, q.verts[(i + j) % m]!)) &&
              (!p.curve || p.curve.every((c, i) => q.curve![(i + j) % m] === c))
            )
              return true;
          }
          return false;
        };
        if (!onto(first!, anchor)) continue;
        const free = pb.filter((q) => q !== anchor);
        if (
          rest.every((p) => {
            const i = free.findIndex((q) => onto(p, q));
            return i >= 0 && free.splice(i, 1).length === 1;
          })
        )
          return true;
      }
    }
  }
  return false;
}
