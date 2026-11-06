import { describe, expect, it } from "vitest";
import { cyclotomic, type Cyc } from "../../src/geometry/cyclotomic";
import { Frontier } from "../../src/geometry/frontier";
import {
  allVerts,
  IN,
  OUT,
  WAVE,
  piece,
  polygon,
  posed,
  posedCurve,
  regular,
  walk,
  type Bulge,
  type Piece,
  type Shape,
} from "../../src/geometry/shape";

const Z4 = cyclotomic(4);
const Z12 = cyclotomic(12);
const square = regular(Z4, 4);
const at = (shape: Shape, x: number, y: number): Piece[] =>
  posed(shape, { rot: 0, flip: false, t: [x, y] });
/** `pieces` with round edges. */
const round = (pieces: Piece[], curve: Bulge[]): Piece[] =>
  pieces.map((p) => piece(p.verts, curve));
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
    const big = polygon(Z4, box(2, 2));
    expect(f.fits(at(big, 0, 1))).toBe(true);
    expect(f.fits(at(big, 0, 0))).toBe(false); // covers the first square
  });

  it("splits an edge where a corner lands part-way along it (T-junction)", () => {
    const brick = polygon(Z4, box(2, 1));
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
    const ell = polygon(
      Z4,
      walk(Z4, [
        [0, 2],
        [1, 1],
        [2, 1],
        [1, 1],
        [2, 1],
        [3, 2],
      ]),
    );
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
    expect(keys(f.touching(allVerts(at(square, 1, 0))))).toEqual(["1,0", "1,1", "2,0"]);
    // the middle square meets the first one at a single point
    expect(keys(f.touching(allVerts(at(square, 1, 1))))).toEqual(["1,1"]);
  });

  it("snaps triangles and hexagons in ℤ[ζ12]", () => {
    const tri = regular(Z12, 3);
    const hex = regular(Z12, 6);
    // a unit hexagon is six triangles round its centre
    let f = Frontier.ofRegion(Z12, [hex.pieces[0]!.verts]);
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
    const centres = (spots: Piece[][]): string[] =>
      spots
        .map(
          (s) =>
            allVerts(s)
              .map((v) => v.join(","))
              .sort()[0]!,
        )
        .sort();
    expect(centres(f.placements(square, [1.5, 1.5], 10, false))).toEqual([
      "0,0",
      "0,2",
      "2,0",
      "2,2",
    ]);
    expect(f.nearest(square, [1.5, 0.5], 0.7, false)).toBeNull(); // mid-edge
    // one square in the corner: next to it, above it, or another region corner
    f = f.cover(at(square, 0, 0));
    expect(centres(f.placements(square, [1.5, 1.5], 10, false))).toEqual([
      "0,1",
      "0,2",
      "1,0",
      "2,0",
      "2,2",
    ]);
  });

  it("lays a round edge only against the same curve", () => {
    // squares bulging out and in by turns: two side by side meet out to in
    // only with the right one turned a quarter
    const curve: Bulge[] = [OUT, IN, OUT, IN];
    const rim: Bulge[] = [OUT, IN, OUT, IN, OUT, IN];
    const f = Frontier.ofRegion(Z4, [box(2, 1)], [rim]);
    expect(f.edges.map((e) => e.bulge)).toEqual(rim);
    expect(f.fits(at(square, 0, 0))).toBe(false); // a straight square on a round rim
    expect(f.fits(round(at(square, 0, 0), curve))).toBe(true);
    const left = f.cover(round(at(square, 0, 0), curve));
    // unturned, the right square's left edge bulges the way the left one's
    // right edge does: the two would overlap
    expect(left.fits(round(at(square, 1, 0), curve))).toBe(false);
    const turned = round(posed(square, { rot: 1, flip: false, t: [2, 0] }), curve);
    expect(left.fits(turned)).toBe(true);
    expect(left.cover(turned).empty).toBe(true);
  });

  it("lays a wave against the same wave", () => {
    // a wave is one S from either side: squares waved alike sit side by side
    // unturned, and a square waved the other way about (a mirror's) fits
    // neither the rim nor its neighbour
    const wave: Bulge[] = [WAVE, WAVE, WAVE, WAVE];
    const other = posedCurve(wave, true)!;
    expect(other).toEqual([-WAVE, -WAVE, -WAVE, -WAVE]);
    const f = Frontier.ofRegion(Z4, [box(2, 1)], [[WAVE, WAVE, WAVE, WAVE, WAVE, WAVE]]);
    expect(f.fits(round(at(square, 0, 0), other))).toBe(false);
    const left = f.cover(round(at(square, 0, 0), wave));
    expect(left.edges.find((e) => e.bulge !== WAVE)).toBeUndefined();
    expect(left.fits(round(at(square, 1, 0), other))).toBe(false);
    expect(left.fits(round(at(square, 1, 0), wave))).toBe(true);
    expect(left.cover(round(at(square, 1, 0), wave)).empty).toBe(true);
  });

  it("never cuts a round edge part-way", () => {
    // a round 2×1 rim: a unit square in it would lie along half an edge
    const rim: Bulge[] = [OUT, IN, OUT, IN];
    const long: Cyc[] = [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ];
    const f = Frontier.ofRegion(Z4, [long], [rim]);
    expect(f.fits(round(at(square, 0, 0), [OUT, IN, OUT, IN]))).toBe(false);
    expect(f.fits([piece(long, rim)])).toBe(true);
  });

  it("keeps a tile's corner off the middle of a round edge", () => {
    // a triangle with a corner on the middle of a 2×2 square's bottom, one
    // edge from corner to corner
    const square2: Cyc[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    const triangle: Cyc[] = [
      [1, 0],
      [2, 1],
      [1, 2],
    ];
    expect(Frontier.ofRegion(Z4, [square2]).fits([piece(triangle)])).toBe(true);
    // round, the bottom bulges into the square: the corner would cut it
    expect(Frontier.ofRegion(Z4, [square2], [[IN, 0, 0, 0]]).fits([piece(triangle)])).toBe(false);
  });
});
