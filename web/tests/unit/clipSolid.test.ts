import { describe, expect, it } from "vitest";
import {
  buildClipSolid,
  capOpenRims,
  fanTriangles,
  insideOccluder,
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
  // slab's own floor and both answers read zero, which says nothing. x and z
  // take *different* offsets for the same reason one step down — sharing one
  // leaves x − z a whole number of steps, so the grid lies along the 45° lines
  // of its own lattice, and a decomposition whose seams run that way is read as
  // full of holes when every one of those points sits on a seam and is covered
  // by the pieces either side of it.
  const off = 1 / Math.PI;
  const offZ = 1 / Math.E;
  for (let i = 0; i < steps; i++) {
    const y = lo + ((hi - lo) * (i + off)) / steps;
    for (let j = 0; j < steps; j++) {
      for (let k = 0; k < steps; k++) {
        const p: Vec3 = [
          -span + (2 * span * (j + off)) / steps,
          y,
          -span + (2 * span * (k + offZ)) / steps,
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

/** The same, for a tube of a given cross-section rather than a regular one:
 * `section` is the closed polygon in x–z, extruded to `rings` bands and fanned
 * from each quad's centroid the way the renderer lays a cell down. */
function extrudedTube(section: readonly [number, number][], rings: number, height: number): Tri[] {
  const tris: Tri[] = [];
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < section.length; i++) {
      const j = (i + 1) % section.length;
      const [ax, az] = section[i]!;
      const [bx, bz] = section[j]!;
      const lo = (k * height) / rings;
      const hi = ((k + 1) * height) / rings;
      const quad: Vec3[] = [
        [ax, lo, az],
        [bx, lo, bz],
        [bx, hi, bz],
        [ax, hi, az],
      ];
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

  it("tiles a section that is not star shaped about its own centre", () => {
    // A crescent: run out along an arc and back along a tighter one, and the
    // mean of the section's own points lands in the bite taken out of it. A fan
    // from that mean covers part of the interior twice and part of it not at
    // all, and what it leaves uncovered is left uncut on the board — a slab of
    // the outer sheet standing in the bore. Cutting the section into ears owes
    // nothing to where its centre is.
    const arc = (from: number, to: number, r: number, n: number): [number, number][] =>
      Array.from({ length: n }, (_, i): [number, number] => {
        const a = from + ((to - from) * i) / (n - 1);
        return [r * Math.cos(a), r * Math.sin(a)];
      });
    const section = [
      ...arc(0, (5 * Math.PI) / 3, 1, 11),
      ...arc((5 * Math.PI) / 3, 0, 0.55, 11),
    ];
    const mean: Vec3 = [
      section.reduce((s, p) => s + p[0], 0) / section.length,
      0,
      section.reduce((s, p) => s + p[1], 0) / section.length,
    ];
    const occluder = extrudedTube(section, 2, 1);
    // The mean really is outside the shape, so nothing about it is a kernel.
    expect(insideOccluder(occluder, [mean[0], 0.5, mean[2]])).toBe(false);
    const { inside, missed, spurious } = agreement(occluder, 1.2);
    expect(inside).toBeGreaterThan(500);
    expect(missed).toBe(0);
    expect(spurious).toBe(0);
  });

  it("has no inside across an open rim until the rim is capped", () => {
    // A tube cut off at a slant: under the highest point of the rim a
    // horizontal plane meets it in an arc, not a loop, and there is no inside
    // for either the parity test or the decomposition to find — they answer by
    // which way the arc happens to face, and disagree. Capping the rim is what
    // makes the region a region, and it is the bottom of a Klein bottle, where
    // the rim the two sheets share zigzags over a good part of the tube.
    const open = drawnTube(6, 2, 1, () => 1).map(
      (t) => t.map((p): Vec3 => [p[0], Math.max(p[1], 0.35 + 0.25 * p[0]), p[2]]) as Tri,
    );
    const capped = capOpenRims(open);
    expect(rimEdges(open)).toBeGreaterThan(0);
    expect(rimEdges(capped)).toBe(0); // every edge answered by a second triangle
    const before = agreement(open, 1);
    const after = agreement(capped, 1);
    expect(before.missed + before.spurious).toBeGreaterThan(500);
    // Capped, the two agree bar a shell along the lid itself, where the slant
    // leans through a slab as the tube's own wall does.
    expect(after.missed / after.inside).toBeLessThan(0.005);
    expect(after.spurious).toBe(0);
    // ...and the lid closes the rim without reaching past it: under the slant,
    // where the tube has stopped, is outside.
    expect(solidDepth(buildClipSolid(capped), [0.6, 0.2, 0.13])).toBeGreaterThan(0);
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

  it("has nothing to say about geometry with no tube in it", () => {
    expect(buildClipSolid([])).toEqual([]);
    // A flat lid encloses nothing: no slab has a height to span.
    expect(buildClipSolid(fanTriangles([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [0.5, 0, 0.5])))
      .toEqual([]);
  });
});

/** How many edges of a triangle soup are answered by only one triangle — the
 * rims where it is open. */
function rimEdges(tris: readonly Tri[]): number {
  const seen = new Map<string, number>();
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const a = t[i]!;
      const b = t[(i + 1) % 3]!;
      const ka = a.join(",");
      const kb = b.join(",");
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen.values()].filter((n) => n === 1).length;
}
