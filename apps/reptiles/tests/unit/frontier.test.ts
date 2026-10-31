import { describe, expect, it } from "vitest";
import { cyclotomic, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import { posed, regular, walk, type Shape } from "../../src/geometry/shape";

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);
const square = regular(Z4, 4);
const at = (shape: Shape, x: number, y: number): Cyc[] =>
  posed(shape, { rot: 0, flip: false, t: [x, y] });
const box = (cols: number, rows: number): Cyc[] =>
  walk(Z4, [
    [0, cols],
    [1, rows],
    [2, cols],
    [3, rows],
  ]);

describe("frontier", () => {
  it("cancels the edges two neighbours share", () => {
    let f = Frontier.ofRegion(Z4, [box(2, 1)]);
    expect(f.edges).toHaveLength(6);
    f = f.cover(at(square, 0, 0));
    expect(f.edges).toHaveLength(4); // the right square's outline
    f = f.cover(at(square, 1, 0));
    expect(f.empty).toBe(true);
  });

  it("rejects overlap and leaving the region, accepts a corner touch", () => {
    const f = Frontier.ofRegion(Z4, [box(3, 3)]).cover(at(square, 0, 0));
    expect(f.fits(at(square, 0, 0))).toBe(false); // on top of the first
    expect(f.fits(at(square, 3, 0))).toBe(false); // off the region
    expect(f.fits(at(square, 1, 1))).toBe(true); // touches at a corner only
    expect(f.fits(at(square, 1, 0))).toBe(true);
    const big: Shape = { ring: Z4, verts: box(2, 2) };
    expect(f.fits(at(big, 0, 1))).toBe(true);
    expect(f.fits(at(big, 0, 0))).toBe(false); // covers the first square
  });

  it("splits an edge where a corner lands part-way along it (T-junction)", () => {
    const brick: Shape = { ring: Z4, verts: box(2, 1) };
    // a running bond: two bricks below, one straddling them above
    let f = Frontier.ofRegion(Z4, [box(4, 2)]);
    f = f.cover(at(brick, 0, 0)).cover(at(brick, 2, 0));
    expect(f.fits(at(brick, 1, 1))).toBe(true);
    f = f.cover(at(brick, 1, 1));
    expect(f.fits(at(square, 0, 1))).toBe(true);
    expect(f.fits(at(square, 3, 1))).toBe(true);
    f = f.cover(at(square, 0, 1)).cover(at(square, 3, 1));
    expect(f.empty).toBe(true);
  });

  it("places a concave tile", () => {
    const ell: Shape = {
      ring: Z4,
      verts: walk(Z4, [
        [0, 2],
        [1, 1],
        [2, 1],
        [1, 1],
        [2, 1],
        [3, 2],
      ]),
    };
    let f = Frontier.ofRegion(Z4, [box(2, 2)]);
    expect(f.fits(at(ell, 0, 0))).toBe(true);
    f = f.cover(at(ell, 0, 0));
    expect(f.fits(at(square, 1, 1))).toBe(true);
    expect(f.fits(at(square, 0, 1))).toBe(false); // inside the L
    expect(f.cover(at(square, 1, 1)).empty).toBe(true);
  });

  it("names every corner a placement meets, part-way along an edge too", () => {
    const f = Frontier.ofRegion(Z4, [box(3, 3)]).cover(at(square, 0, 0));
    const keys = (vs: Cyc[]): string[] => vs.map((v) => v.join(",")).sort();
    // next to the first: its two corners, and the rim part-way along the bottom
    expect(keys(f.touching(at(square, 1, 0)))).toEqual(["1,0", "1,1", "2,0"]);
    // the middle square meets the first one at a single point
    expect(keys(f.touching(at(square, 1, 1)))).toEqual(["1,1"]);
  });

  it("snaps triangles and hexagons in ℤ[ζ12]", () => {
    const tri = regular(Z12, 3);
    const hex = regular(Z12, 6);
    // a unit hexagon is six triangles round its centre
    let f = Frontier.ofRegion(Z12, [hex.verts]);
    for (let i = 0; i < 6; i++) {
      const spots = f.placements(tri, [0.5, 0.87], 3, false);
      expect(spots.length).toBeGreaterThan(0);
      f = f.cover(spots[0]!);
    }
    expect(f.empty).toBe(true);
  });

  it("sticks only at corners, never part-way along an edge", () => {
    let f = Frontier.ofRegion(Z4, [box(3, 3)]);
    // the region's four corners, though its outline has a vertex every unit
    expect(f.corners.size).toBe(4);
    const centres = (spots: Cyc[][]): string[] =>
      spots.map((s) => s.map((v) => v.join(",")).sort()[0]!).sort();
    expect(centres(f.placements(square, [1.5, 1.5], 10, false))).toEqual(["0,0", "0,2", "2,0", "2,2"]);
    expect(f.nearest(square, [1.5, 0.5], 0.7, false)).toBeNull(); // mid-edge
    // one square in the corner: next to it, above it, or another region corner
    f = f.cover(at(square, 0, 0));
    expect(centres(f.placements(square, [1.5, 1.5], 10, false))).toEqual(["0,1", "0,2", "1,0", "2,0", "2,2"]);
  });
});
