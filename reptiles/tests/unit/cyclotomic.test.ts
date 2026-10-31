import { describe, expect, it } from "vitest";
import {
  crossSign,
  cyclotomic,
  cyclotomicPolynomial,
  properlyCross,
  strictlyBetween,
} from "../../src/geometry/cyclotomic";

// Every ring a Hypersweeper flat board needs.
const ORDERS = [4, 5, 7, 8, 10, 12, 24];

describe("cyclotomic", () => {
  it("builds Φn", () => {
    expect(cyclotomicPolynomial(4)).toEqual([1, 0, 1]);
    expect(cyclotomicPolynomial(5)).toEqual([1, 1, 1, 1, 1]);
    expect(cyclotomicPolynomial(12)).toEqual([1, 0, -1, 0, 1]);
    expect(cyclotomicPolynomial(24)).toEqual([1, 0, 0, 0, -1, 0, 0, 0, 1]);
  });

  it.each(ORDERS)("ℤ[ζ%i]: ζ^n = 1 and ζ^k lands on the unit circle", (n) => {
    const r = cyclotomic(n);
    expect(r.eq(r.zeta(n), r.one)).toBe(true);
    for (let k = 0; k < n; k++) {
      const [x, y] = r.toXY(r.zeta(k));
      expect(x).toBeCloseTo(Math.cos((2 * Math.PI * k) / n), 12);
      expect(y).toBeCloseTo(Math.sin((2 * Math.PI * k) / n), 12);
      expect(r.eq(r.mul(r.zeta(k), r.zeta(n - k)), r.one)).toBe(true);
    }
  });

  it.each(ORDERS)("ℤ[ζ%i]: conjugation is an involution and a mirror", (n) => {
    const r = cyclotomic(n);
    const a = r.add(r.zeta(1), r.add(r.zeta(3), r.zeta(3)));
    expect(r.eq(r.conj(r.conj(a)), a)).toBe(true);
    const [x, y] = r.toXY(a);
    const [cx, cy] = r.toXY(r.conj(a));
    expect(cx).toBeCloseTo(x, 12);
    expect(cy).toBeCloseTo(-y, 12);
  });

  it("decides collinearity exactly", () => {
    const r = cyclotomic(12);
    // 1 + ζ² + ζ⁴ − … : the long diagonal of a hexagon is collinear with ζ³ twice
    const a = r.zero;
    const b = r.add(r.zeta(3), r.zeta(3));
    expect(crossSign(r, b, r.zeta(3))).toBe(0);
    expect(strictlyBetween(r, a, b, r.zeta(3))).toBe(true);
    // ζ + ζ⁵ = ζ³·√3 … points on the same ray from different sums
    const c = r.add(r.zeta(1), r.zeta(5));
    expect(crossSign(r, r.zeta(3), c)).toBe(0);
    expect(crossSign(r, r.zeta(2), c)).toBe(1);
    expect(properlyCross(r, r.zero, r.add(r.one, r.zeta(3)), r.one, r.zeta(3))).toBe(true);
  });
});
