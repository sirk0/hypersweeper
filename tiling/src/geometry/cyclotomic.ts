// Exact plane coordinates: the cyclotomic integers ℤ[ζn], ζ = e^{2πi/n}.
//
// Every flat Hypersweeper board whose tiles are laid edge to edge from a finite
// set of directions lives in one of these rings — squares in ℤ[ζ4], triangles,
// hexagons and most uniform tilings in ℤ[ζ12], 4.8.8 and Ammann–Beenker in
// ℤ[ζ8], Penrose in ℤ[ζ5]/ℤ[ζ10], Klaassen in ℤ[ζ7], mixes in ℤ[ζ24] — so a
// point is a short vector of integers and two points are the same point exactly
// when the vectors are equal. Nothing here ever rounds a coordinate to decide
// identity (the repo-wide rule in AGENTS.md); floats appear only in `toXY`, for
// drawing, and in `sign`, which is asked only about a value already known
// exactly to be non-zero.
//
// An element is its coefficients in the power basis 1, ζ, …, ζ^{d-1}, where
// d = φ(n) is the degree of the cyclotomic polynomial Φn; ζ^d and up are
// reduced through Φn(ζ) = 0. Coefficients stay small integers on any board
// this game builds, far inside a double's exact range.

export type Cyc = readonly number[];

export interface Ring {
  /** The order of ζ: the ring is ℤ[e^{2πi/n}]. */
  readonly n: number;
  /** φ(n), the length of every element. */
  readonly dim: number;
  readonly zero: Cyc;
  readonly one: Cyc;
  /** ζ^k for any integer k. */
  zeta(k: number): Cyc;
  add(a: Cyc, b: Cyc): Cyc;
  sub(a: Cyc, b: Cyc): Cyc;
  neg(a: Cyc): Cyc;
  mul(a: Cyc, b: Cyc): Cyc;
  /** Complex conjugation, ζ ↦ ζ⁻¹ — a mirror in the x axis. */
  conj(a: Cyc): Cyc;
  eq(a: Cyc, b: Cyc): boolean;
  isZero(a: Cyc): boolean;
  /** A string naming the point exactly, for Map/Set keys. */
  key(a: Cyc): string;
  toXY(a: Cyc): [number, number];
}

type Poly = number[]; // integer coefficients, lowest degree first

function trim(p: Poly): Poly {
  while (p.length > 1 && p[p.length - 1] === 0) p.pop();
  return p;
}

/** Exact long division by a monic polynomial; throws if it does not divide. */
function divideExact(num: Poly, den: Poly): Poly {
  const rem = num.slice();
  const dd = den.length - 1;
  const quot: Poly = new Array(Math.max(rem.length - dd, 1)).fill(0);
  for (let i = rem.length - 1; i >= dd; i--) {
    const c = rem[i]!;
    if (c === 0) continue;
    quot[i - dd] = c;
    for (let j = 0; j <= dd; j++) rem[i - dd + j]! -= c * den[j]!;
  }
  if (rem.some((c) => c !== 0)) throw new Error("cyclotomic: inexact division");
  return trim(quot);
}

const PHI_CACHE = new Map<number, Poly>();

/** Φn: xⁿ − 1 divided by Φd for every proper divisor d of n. */
export function cyclotomicPolynomial(n: number): Poly {
  if (!Number.isInteger(n) || n < 1) throw new Error(`cyclotomic: bad order ${n}`);
  const cached = PHI_CACHE.get(n);
  if (cached) return cached;
  let p: Poly = new Array(n + 1).fill(0);
  p[0] = -1;
  p[n] = 1;
  for (let d = 1; d < n; d++) if (n % d === 0) p = divideExact(p, cyclotomicPolynomial(d));
  PHI_CACHE.set(n, p);
  return p;
}

const RING_CACHE = new Map<number, Ring>();

export function cyclotomic(n: number): Ring {
  const cached = RING_CACHE.get(n);
  if (cached) return cached;
  const phi = cyclotomicPolynomial(n);
  const dim = phi.length - 1;

  // ζ^k in the power basis, k = 0..n-1: multiply by ζ (shift up one) and fold
  // the ζ^dim term back through ζ^dim = −(φ0 + φ1 ζ + … + φ_{d-1} ζ^{d-1}).
  const powers: Cyc[] = [];
  let cur: number[] = new Array(dim).fill(0);
  cur[0] = 1;
  for (let k = 0; k < n; k++) {
    powers.push(cur.slice());
    const next: number[] = [0, ...cur.slice(0, dim - 1)];
    const top = cur[dim - 1]!;
    if (top !== 0) for (let j = 0; j < dim; j++) next[j]! -= top * phi[j]!;
    cur = next;
  }
  const basisXY: [number, number][] = [];
  for (let j = 0; j < dim; j++) {
    const a = (2 * Math.PI * j) / n;
    basisXY.push([Math.cos(a), Math.sin(a)]);
  }

  const zeta = (k: number): Cyc => powers[((k % n) + n) % n]!;
  const zero: Cyc = new Array(dim).fill(0);
  const add = (a: Cyc, b: Cyc): Cyc => a.map((x, i) => x + b[i]!);
  const sub = (a: Cyc, b: Cyc): Cyc => a.map((x, i) => x - b[i]!);
  const neg = (a: Cyc): Cyc => a.map((x) => -x || 0);
  const scaleAdd = (acc: number[], c: number, v: Cyc): void => {
    if (c !== 0) for (let j = 0; j < dim; j++) acc[j]! += c * v[j]!;
  };
  const mul = (a: Cyc, b: Cyc): Cyc => {
    const out: number[] = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) {
      if (a[i] === 0) continue;
      for (let j = 0; j < dim; j++) scaleAdd(out, a[i]! * b[j]!, zeta(i + j));
    }
    return out;
  };
  const conj = (a: Cyc): Cyc => {
    const out: number[] = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) scaleAdd(out, a[i]!, zeta(-i));
    return out;
  };
  const eq = (a: Cyc, b: Cyc): boolean => a.every((x, i) => x === b[i]);

  const ring: Ring = {
    n,
    dim,
    zero,
    one: zeta(0),
    zeta,
    add,
    sub,
    neg,
    mul,
    conj,
    eq,
    isZero: (a) => a.every((x) => x === 0),
    key: (a) => a.join(","),
    toXY: (a) => {
      let x = 0;
      let y = 0;
      for (let j = 0; j < dim; j++) {
        x += a[j]! * basisXY[j]![0];
        y += a[j]! * basisXY[j]![1];
      }
      return [x, y];
    },
  };
  RING_CACHE.set(n, ring);
  return ring;
}

// -- exact predicates ---------------------------------------------------------

/** The sign of a real number already known to be non-zero (or exactly zero),
 * read off the float — safe because the exact test has ruled zero in or out. */
function signOf(ring: Ring, real: Cyc): -1 | 0 | 1 {
  if (ring.isZero(real)) return 0;
  return ring.toXY(real)[0] > 0 ? 1 : -1;
}

/** conj(a)·b = (a·b) + i (a×b), the dot and cross products at once. */
function conjMul(ring: Ring, a: Cyc, b: Cyc): Cyc {
  return ring.mul(ring.conj(a), b);
}

/** Sign of the cross product a × b: +1 if b is counter-clockwise of a. */
export function crossSign(ring: Ring, a: Cyc, b: Cyc): -1 | 0 | 1 {
  const w = conjMul(ring, a, b);
  // 2i·Im(w) = w − conj(w); its imaginary part has the sign of Im(w).
  const twiceImag = ring.sub(w, ring.conj(w));
  if (ring.isZero(twiceImag)) return 0;
  return ring.toXY(twiceImag)[1] > 0 ? 1 : -1;
}

/** Sign of the dot product a · b. */
export function dotSign(ring: Ring, a: Cyc, b: Cyc): -1 | 0 | 1 {
  const w = conjMul(ring, a, b);
  return signOf(ring, ring.add(w, ring.conj(w)));
}

/** Orientation of the turn a → b → c: +1 left, −1 right, 0 collinear. */
export function orient(ring: Ring, a: Cyc, b: Cyc, c: Cyc): -1 | 0 | 1 {
  return crossSign(ring, ring.sub(b, a), ring.sub(c, a));
}

/** b is a positive real multiple of a (same direction, any length). */
export function sameDirection(ring: Ring, a: Cyc, b: Cyc): boolean {
  return crossSign(ring, a, b) === 0 && dotSign(ring, a, b) > 0;
}

/** p lies strictly inside the segment a–b (not at either end). */
export function strictlyBetween(ring: Ring, a: Cyc, b: Cyc, p: Cyc): boolean {
  if (ring.eq(p, a) || ring.eq(p, b)) return false;
  if (orient(ring, a, b, p) !== 0) return false;
  return dotSign(ring, ring.sub(p, a), ring.sub(b, a)) > 0 && dotSign(ring, ring.sub(p, b), ring.sub(a, b)) > 0;
}

/** The open segments a–b and c–d cross at one point interior to both. */
export function properlyCross(ring: Ring, a: Cyc, b: Cyc, c: Cyc, d: Cyc): boolean {
  const o1 = orient(ring, a, b, c);
  const o2 = orient(ring, a, b, d);
  if (o1 === 0 || o2 === 0 || o1 === o2) return false;
  const o3 = orient(ring, c, d, a);
  const o4 = orient(ring, c, d, b);
  return o3 !== 0 && o4 !== 0 && o3 !== o4;
}
