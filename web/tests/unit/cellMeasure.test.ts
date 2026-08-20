import { describe, expect, it } from "vitest";
import { brickCubeBoard } from "../../src/boards/solids";
import { archimedeanBoard } from "../../src/boards/tilings";
import { newellNormal, type Vec3 } from "../../src/boards/core";
import { corners } from "../../src/render/shapePalette";
import { polygonInradius } from "../../src/render/boardMesh";

// How a cell is *measured* is not how it is drawn. A tiling that is not edge to
// edge carries T-vertices — extra points sitting flat in the middle of an edge,
// there so two tiles share a vertex id and the mesh closes — and every measure
// of a cell has to drop them first, or it answers about the polygon's vertex
// list rather than about the shape.
//
// Two things went wrong for want of that, both on the brick cubes, and both are
// pinned here rather than left to a screenshot: a screenshot of a menu icon is
// 38 px, and a number drawn a fifth too small next to one drawn right is a
// difference of about a pixel.

/** The mean of some points — the vertex average the renderers take. */
function mean(points: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = points.length;
  return [x / n, y / n, z / n];
}

/** A planar cell's inradius, measured in its own plane from `centre`. */
function inradiusOf(poly: readonly Vec3[], centre: Vec3): number {
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (v: Vec3): Vec3 => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  };
  const normal = unit(newellNormal(poly as Vec3[]));
  const ex = unit(cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const ey = cross(normal, ex);
  const flat = poly.map((p): [number, number] => {
    const d: Vec3 = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    return [
      d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2],
      d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2],
    ];
  });
  return polygonInradius(flat, [0, 0]);
}

const BONDS = ["stackedbond", "basketweave", "basketweave3"] as const;

describe("a cell is measured by its corners, not by its vertex list", () => {
  // Every brick on a brick cube is congruent — that is what "tiled by one
  // congruent rectangle" means — so every one of them must have room for the
  // same number. Measured off the raw vertex list they do not: a brick whose
  // long edge carries a T-vertex has its mean dragged a fifth of the way to
  // that edge, and the inradius is a `min` over the edges, so the distance to
  // that very edge is what wins.
  it.each(BONDS)("every brick of a %s cube fits the same glyph", (bond) => {
    const board = brickCubeBoard(bond, 3, 0);
    const fits = [...board.polygons.values()].map((poly) => {
      const shape = corners(poly) as Vec3[];
      return inradiusOf(shape, mean(shape));
    });
    const lo = Math.min(...fits);
    const hi = Math.max(...fits);
    expect(hi - lo).toBeLessThan(1e-9 * hi);
  });

  it("...which the raw vertex list gets wrong, by a fifth or a third", () => {
    // The bug this guards, stated as the number it was: a split brick measured
    // 0.80 of its true size on the two-brick bonds and 0.667 on the three-brick
    // weave, and a flat basket weave 3x3 had the same defect on the plane.
    const worst = (poly: readonly Vec3[]): number => {
      const shape = corners(poly) as Vec3[];
      return inradiusOf(poly, mean(poly)) / inradiusOf(shape, mean(shape));
    };
    const ratios = (bond: string): number[] =>
      [...brickCubeBoard(bond, 3, 0).polygons.values()].map(worst);
    expect(Math.min(...ratios("stackedbond"))).toBeCloseTo(0.8, 6);
    expect(Math.min(...ratios("basketweave"))).toBeCloseTo(0.8, 6);
    expect(Math.min(...ratios("basketweave3"))).toBeCloseTo(2 / 3, 6);
  });

  it("the flat three-brick basket weave has the same two tile orbits", () => {
    // Not a brick cube at all: the same defect on the plane, which is why the
    // fix lives in both renderers rather than in the cube builder.
    const board = archimedeanBoard("basketweave3", 3, 3, 0);
    const fits = [...board.polygons.values()].map((poly) => {
      const flat = poly.map(([x, y]) => [x, y, 0] as Vec3);
      const shape = corners(flat) as Vec3[];
      return inradiusOf(shape, mean(shape));
    });
    // the flat templates round their vertex tags to 1e-6, so this is as exact
    // as the plane gets; the defect it guards was a third, not a millionth
    expect(Math.max(...fits) - Math.min(...fits)).toBeLessThan(1e-4 * Math.max(...fits));
  });
});

describe("a face normal survives collinear vertices", () => {
  // The menu icons took their normal from the cross product of a face's first
  // three vertices. `splitAtLatticePoints` emits `corner, splits-of-edge-0,
  // corner, …`, so a brick whose first edge carries a T-vertex has three
  // collinear points there and no normal at all — and the result is not a clean
  // zero but rounding noise, so the face was culled or randomly shaded. A
  // quarter of a basket-weave cube's bricks went that way.
  it.each(BONDS)("%s cube: three-vertex normals degenerate, Newell's do not", (bond) => {
    const polys = [...brickCubeBoard(bond, 3, 0).polygons.values()];
    let degenerate = 0;
    for (const poly of polys) {
      const [a, b, c] = [poly[0]!, poly[1]!, poly[2]!];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = Math.hypot(
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      );
      if (cross < 1e-9) degenerate++;
      const n = newellNormal(poly);
      expect(Math.hypot(n[0], n[1], n[2])).toBeGreaterThan(1e-6);
    }
    expect(degenerate).toBeGreaterThan(0); // ...or this test proves nothing
  });
});
