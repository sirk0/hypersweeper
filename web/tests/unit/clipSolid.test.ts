import { describe, expect, it } from "vitest";
import {
  buildClipSolid,
  capsulePiece,
  crossingSegments,
  fanTriangles,
  insideOccluder,
  intersectSolid,
  pruneSolid,
  reachesSolid,
  solidDepth,
  subtractSolid,
  trianglesBelow,
  type Tri,
} from "../../src/boards/clipSolid";
import type { Vec3 } from "../../src/boards/core";

// The enclosed region of a self-intersecting immersion, taken from the drawn
// triangles rather than from the smooth surface behind them (see clipSolid.ts).

/** A closed tube of `rings` bands of `sides` quads, each quad fanned from its
 * centroid exactly as the renderer lays a cell down — which is what makes its
 * cross-section a *star*, dipping in to the centroids between its corners.
 * `radius` may vary with height, to lean the tube the way the neck does. */
function drawnTube(
  sides: number,
  rings: number,
  height: number,
  radius: (t: number) => number,
  centre: (t: number) => [number, number] = () => [0, 0],
): Tri[] {
  const ring = (k: number): Vec3[] => {
    const t = k / rings;
    const r = radius(t);
    const [cx, cz] = centre(t);
    return Array.from({ length: sides }, (_, i): Vec3 => [
      cx + r * Math.cos((2 * Math.PI * i) / sides),
      t * height,
      cz + r * Math.sin((2 * Math.PI * i) / sides),
    ]);
  };
  const tris: Tri[] = [];
  for (let k = 0; k < rings; k++) {
    const a = ring(k);
    const b = ring(k + 1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const quad = [a[i]!, a[j]!, b[j]!, b[i]!];
      const c: Vec3 = [
        quad.reduce((s, p) => s + p[0], 0) / 4,
        quad.reduce((s, p) => s + p[1], 0) / 4,
        quad.reduce((s, p) => s + p[2], 0) / 4,
      ];
      tris.push(...fanTriangles(quad, c));
    }
  }
  return tris;
}

/** Area of the polygon the drawn tube's own cross-section encloses at `y`,
 * worked out from the occluder alone (slice, sort by angle, shoelace) — the
 * independent answer the cut is measured against. */
function sectionArea(occluder: readonly Tri[], y: number): number {
  const pts: [number, number][] = [];
  for (const t of occluder) {
    for (let i = 0; i < 3; i++) {
      const a = t[i]!;
      const b = t[(i + 1) % 3]!;
      const da = a[1] - y;
      const db = b[1] - y;
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue;
      const s = da / (da - db);
      if (s < 0 || s > 1) continue;
      pts.push([a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s]);
    }
  }
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const seen = new Set<string>();
  const loop = pts
    .filter((p) => {
      const k = `${p[0].toFixed(9)},${p[1].toFixed(9)}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((u, v) => Math.atan2(u[1] - cz, u[0] - cx) - Math.atan2(v[1] - cz, v[0] - cx));
  let twice = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

function area(tris: readonly Tri[]): number {
  let total = 0;
  for (const [a, b, c] of tris) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    total +=
      Math.hypot(
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ) / 2;
  }
  return total;
}

/** Grid points of the tube's box, split by the two ways of asking whether they
 * are inside it: the exact parity of a ray through the drawn cross-section, and
 * the union of convex pieces the decomposition builds. */
function agreement(occluder: Tri[], span: number, steps = 24) {
  const solid = buildClipSolid(occluder);
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of occluder) for (const p of t) {
    lo = Math.min(lo, p[1]);
    hi = Math.max(hi, p[1]);
  }
  let inside = 0;
  let missed = 0;
  let spurious = 0;
  // Offset off the halfway mark by an irrational fraction: land a sample on a
  // slab's own floor and both answers read zero, which says nothing.
  const off = 1 / Math.PI;
  for (let i = 0; i < steps; i++) {
    const y = lo + ((hi - lo) * (i + off)) / steps;
    for (let j = 0; j < steps; j++) {
      for (let k = 0; k < steps; k++) {
        const p: Vec3 = [
          -span + (2 * span * (j + off)) / steps,
          y,
          -span + (2 * span * (k + off)) / steps,
        ];
        const truth = insideOccluder(occluder, p);
        const guess = solidDepth(solid, p) < 0;
        if (truth) inside++;
        if (truth && !guess) missed++;
        if (!truth && guess) spurious++;
      }
    }
  }
  return { inside, missed, spurious };
}

describe("the enclosed region of a drawn tube", () => {
  it("is exactly what the drawn cross-section encloses, star and all", () => {
    // A straight prism: the decomposition should be exact to the last point.
    const { inside, missed, spurious } = agreement(drawnTube(8, 2, 1, () => 1), 1);
    expect(inside).toBeGreaterThan(1000);
    expect(missed).toBe(0);
    expect(spurious).toBe(0);
  });

  it("follows a tube that tapers and leans, to within a thousandth", () => {
    const occluder = drawnTube(
      7,
      3,
      4,
      (t) => 1.5 - 0.8 * t,
      (t) => [1.5 * t * t, 0],
    );
    const { inside, missed, spurious } = agreement(occluder, 3);
    // Both errors live in a shell thinner than a thousandth of the tube, so a
    // 24-cube grid only catches a sliver of the surface either way.
    expect(missed / inside).toBeLessThan(0.02);
    expect(spurious / inside).toBeLessThan(0.02);
  });

  it("takes the star's dips off too, which a convex bound would leave", () => {
    // The corner of a coarse tube's cell reaches much further out than the
    // middle of it: a point just inside a corner is inside the tube, and one at
    // the same radius between two corners is not.
    const occluder = drawnTube(5, 1, 1, () => 1);
    const solid = buildClipSolid(occluder);
    const at = (angle: number, r: number): Vec3 => [r * Math.cos(angle), 0.4, r * Math.sin(angle)];
    const corner = at(0, 0.9);
    const between = at(Math.PI / 5, 0.9);
    expect(insideOccluder(occluder, corner)).toBe(true);
    expect(insideOccluder(occluder, between)).toBe(false);
    expect(solidDepth(solid, corner)).toBeLessThan(0);
    expect(solidDepth(solid, between)).toBeGreaterThan(0);
  });

  it("slices a shared edge to one point, whichever way each side winds it", () => {
    // A twisted three-sided prism. Its edge B2–T2 is wound upward by one
    // triangle and downward by the other, and at y = 0.011 interpolating it
    // from either end rounds to a different z (-2.8923 / -2.8922999999999996,
    // in plain IEEE arithmetic, so on every platform). A +x ray from outside
    // through that vertex must still cross the loop an even number of times;
    // with two endpoints a hair apart it counted the vertex once or not at
    // all, and the Klein test failed on whichever machine rounded the wrong
    // way.
    const B: Vec3[] = [[3, 0, 0.1], [0.3, 0, 2.7], [0.2, 0, -2.9]];
    const T: Vec3[] = [[2.7, 1, 0.9], [-0.4, 1, 2.3], [0.6, 1, -2.2]];
    const occluder: Tri[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      occluder.push([B[i]!, B[j]!, T[j]!], [B[i]!, T[j]!, T[i]!]);
    }
    for (const z of [-2.8923, -2.8922999999999996]) {
      expect(insideOccluder(occluder, [-5, 0.011, z])).toBe(false);
    }
    expect(insideOccluder(occluder, [1, 0.011, 0])).toBe(true);
  });

  it("cuts a sheet that crosses it along the sheet's own crossing", () => {
    const occluder = drawnTube(6, 2, 2, () => 1);
    const solid = buildClipSolid(occluder);
    // A horizontal square right through the tube.
    const sheet: Vec3[] = [
      [-3, 0.75, -3],
      [3, 0.75, -3],
      [3, 0.75, 3],
      [-3, 0.75, 3],
    ];
    const whole = fanTriangles(sheet, [0, 0.75, 0]);
    const cut = subtractSolid(whole, solid);
    expect(area(cut)).toBeLessThan(area(whole));
    // What is gone is exactly the polygon the tube's own drawn section cuts out
    // of it — the star, not the circle the tube stands for.
    expect(area(whole) - area(cut)).toBeCloseTo(sectionArea(occluder, 0.75), 9);
    // Nothing left standing is inside the tube.
    for (const tri of cut) {
      for (const p of tri) expect(solidDepth(solid, p)).toBeGreaterThan(-1e-9);
    }
  });

  it("leaves a sheet that misses it, and reports as much", () => {
    const occluder = drawnTube(6, 2, 2, () => 1);
    const solid = buildClipSolid(occluder);
    const away = fanTriangles(
      [
        [4, 0.75, 4],
        [6, 0.75, 4],
        [6, 0.75, 6],
        [4, 0.75, 6],
      ],
      [5, 0.75, 5],
    );
    expect(subtractSolid(away, solid)).toHaveLength(away.length);
    expect(reachesSolid(away, solid, 1e-9)).toBe(false);
    expect(subtractSolid(away, null)).toBe(away);
    expect(subtractSolid(away, [])).toBe(away);
  });

  it("takes the occluder only as far as a seam, and prunes to what is cut", () => {
    const occluder = drawnTube(6, 4, 4, () => 1);
    const half = trianglesBelow(occluder, 2);
    for (const t of half) for (const p of t) expect(p[1]).toBeLessThanOrEqual(2 + 1e-9);
    const solid = buildClipSolid(half);
    expect(solid.length).toBeGreaterThan(0);
    // A sheet at y = 0.5 can only ever meet the pieces around it.
    const sheet: Vec3[] = [
      [-3, 0.5, -3],
      [3, 0.5, -3],
      [3, 0.5, 3],
      [-3, 0.5, 3],
    ];
    const pruned = pruneSolid(solid, [sheet]);
    expect(pruned.length).toBeLessThan(solid.length);
    expect(area(subtractSolid(fanTriangles(sheet, [0, 0.5, 0]), pruned))).toBeCloseTo(
      area(subtractSolid(fanTriangles(sheet, [0, 0.5, 0]), solid)),
      9,
    );
  });

  it("splits a sheet into its outside and its inside, with nothing lost", () => {
    const occluder = drawnTube(6, 2, 2, () => 1);
    const solid = buildClipSolid(occluder);
    const whole = fanTriangles(
      [
        [-3, 0.75, -3],
        [3, 0.75, -3],
        [3, 0.75, 3],
        [-3, 0.75, 3],
      ],
      [0, 0.75, 0],
    );
    const inside = intersectSolid(whole, solid);
    const outside = subtractSolid(whole, solid);
    // The two partition the sheet, and the inside is the drawn section itself.
    expect(area(inside) + area(outside)).toBeCloseTo(area(whole), 9);
    expect(area(inside)).toBeCloseTo(sectionArea(occluder, 0.75), 9);
    for (const tri of inside) {
      const c: Vec3 = [
        (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
        (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
        (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
      ];
      expect(solidDepth(solid, c)).toBeLessThan(1e-9);
    }
    // A sheet that misses the tube has no inside at all.
    const away = fanTriangles([[4, 0.75, 4], [6, 0.75, 4], [6, 0.75, 6], [4, 0.75, 6]], [5, 0.75, 5]);
    expect(intersectSolid(away, solid)).toEqual([]);
  });

  it("finds where two drawn sheets cross, and not where they only meet", () => {
    // A horizontal square and a vertical one through it: they cross along
    // the x axis, the width of the narrower of the two.
    const flat = fanTriangles([[-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2]], [0, 0, 0]);
    const wall = fanTriangles([[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]], [0, 0, 0.0001]);
    const segments = crossingSegments(flat, wall);
    const length = segments.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0);
    expect(length).toBeCloseTo(2, 6);
    for (const [a, b] of segments) {
      for (const p of [a, b]) {
        expect(p[1]).toBeCloseTo(0, 6);
        expect(Math.abs(p[2])).toBeLessThan(1e-3);
      }
    }
    // Two sheets that share an edge are joined there, not crossing.
    const hinge = fanTriangles([[-2, 0, -2], [2, 0, -2], [2, 2, -4], [-2, 2, -4]], [0, 1, -3]);
    const joined = crossingSegments(
      [[[-2, 0, -2], [2, 0, -2], [0, 0, 0]]],
      [[[-2, 0, -2], [2, 0, -2], [0, 2, -4]]],
    );
    expect(joined).toEqual([]);
    // ...and sheets that miss each other do not cross at all.
    expect(crossingSegments(flat, hinge.map((t) => t.map((p) => [p[0], p[1] + 5, p[2]]) as Tri))).toEqual([]);
  });

  it("wraps a segment in a capsule of the given radius", () => {
    const r = 0.25;
    const piece = capsulePiece([0, 0, 0], [2, 1, 0], r);
    const inside = (p: Vec3) => piece.planes.every((h) => h.n[0] * p[0] + h.n[1] * p[1] + h.n[2] * p[2] + h.d <= 1e-12);
    const axis: Vec3 = [2 / Math.sqrt(5), 1 / Math.sqrt(5), 0];
    const side: Vec3 = [-1 / Math.sqrt(5), 2 / Math.sqrt(5), 0];
    const up: Vec3 = [0, 0, 1];
    for (let k = 0; k <= 10; k++) {
      const along = (k / 10) * Math.sqrt(5);
      const base: Vec3 = [axis[0] * along, axis[1] * along, 0];
      for (let a = 0; a < 16; a++) {
        const th = (a * Math.PI) / 8;
        const dir: Vec3 = [
          Math.cos(th) * side[0] + Math.sin(th) * up[0],
          Math.cos(th) * side[1] + Math.sin(th) * up[1],
          Math.cos(th) * side[2] + Math.sin(th) * up[2],
        ];
        const at = (d: number): Vec3 => [base[0] + dir[0] * d, base[1] + dir[1] * d, base[2] + dir[2] * d];
        // Everything within r of the segment is in it, and in its box...
        const near = at(r * 0.999);
        expect(inside(near)).toBe(true);
        for (let i = 0; i < 3; i++) {
          expect(near[i]!).toBeGreaterThanOrEqual(piece.min[i]!);
          expect(near[i]!).toBeLessThanOrEqual(piece.max[i]!);
        }
        // ...and nothing past its corners.
        expect(inside(at((1.01 * r) / Math.cos(Math.PI / 8) ** 2))).toBe(false);
      }
    }
    // Rounded off past either end: everything within r of an end is in it,
    // nothing much further.
    for (let a = 0; a < 24; a++) {
      const el = ((a % 6) * Math.PI) / 12; // 0 (straight on) to 75 degrees
      const az = (Math.floor(a / 6) * Math.PI) / 2;
      const dir: Vec3 = [
        -axis[0] * Math.cos(el) + Math.sin(el) * (Math.cos(az) * side[0] + Math.sin(az) * up[0]),
        -axis[1] * Math.cos(el) + Math.sin(el) * (Math.cos(az) * side[1] + Math.sin(az) * up[1]),
        Math.sin(el) * (Math.cos(az) * side[2] + Math.sin(az) * up[2]),
      ];
      expect(inside([dir[0] * r * 0.999, dir[1] * r * 0.999, dir[2] * r * 0.999])).toBe(true);
      const far = (1.01 * r) / Math.cos(Math.PI / 8) ** 2;
      expect(inside([dir[0] * far, dir[1] * far, dir[2] * far])).toBe(false);
    }
  });

  it("has nothing to say about geometry with no tube in it", () => {
    expect(buildClipSolid([])).toEqual([]);
    // A flat lid encloses nothing: no slab has a height to span.
    expect(buildClipSolid(fanTriangles([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [0.5, 0, 0.5])))
      .toEqual([]);
  });
});
