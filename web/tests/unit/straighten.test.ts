import { describe, expect, it } from "vitest";
import { archTemplate } from "../../src/boards/tilings";
import { buildBoard } from "../../src/boards/presets";
import { isBoard3D } from "../../src/boards/core";
import fixture from "./straighten.fixture.json";

// The straightening rule (tilings.straightVertices / surfaces.straightenPositions)
// moves a vertex the tiling runs *through* back onto the chord its line has
// become. The conformance oracle cannot see it — it counts cells, edges and
// vertices, and straightening moves points without merging any — so the rules
// and the geometry they produce are pinned here against
// scripts/export_straighten_fixture.py.
const rules = fixture.rules as Record<string, number[][]>;
const boards = fixture.boards as Record<string, number[][]>;

describe("straightened T-vertices", () => {
  it("only the tilings with a bounded run of them carry a rule", () => {
    const withRule = fixture.tilings.filter(
      (key) => archTemplate(key).straight.size > 0,
    );
    // a running bond's mortar line never reaches a corner, so it has no chord
    // to lie on and its vertices stay on the surface
    expect(withRule).toEqual(Object.keys(rules));
    expect(withRule).toEqual(["basketweave", "basketweave3"]);
  });

  it("every rule matches the one Python computed", () => {
    for (const [key, rows] of Object.entries(rules)) {
      const straight = archTemplate(key).straight;
      expect(straight.size).toBe(rows.length);
      for (const [vx, vy, t, ax, ay, adm, adn, bx, by, bdm, bdn] of rows) {
        const rule = straight.get(`${vx},${vy}`);
        expect(rule, `${key} ${vx},${vy}`).toBeDefined();
        // the two ends may come out either way round; `t` is measured from the
        // first, so the far end carries 1 - t
        const ends = [
          { end: rule!.a, t: rule!.t },
          { end: rule!.b, t: 1 - rule!.t },
        ];
        const from = ends.find((e) => e.end.tag === `${ax},${ay}`);
        expect(from, `${key} ${vx},${vy} from`).toBeDefined();
        expect([from!.end.dm, from!.end.dn]).toEqual([adm, adn]);
        expect(from!.t).toBeCloseTo(t!, 9);
        const to = ends.find((e) => e !== from)!;
        expect(to.end.tag).toBe(`${bx},${by}`);
        expect([to.end.dm, to.end.dn]).toEqual([bdm, bdn]);
      }
    }
  });

  it("the wrapped boards land on the positions Python computes", () => {
    // rounded to the fixture's own six places, and `+ 0` so that a coordinate
    // the immersion lands on the far side of zero (-8.8e-17) sorts and
    // compares as the 0 it is
    const round6 = (c: number): number => Math.round(c * 1e6) / 1e6 + 0;
    const order = (poly: number[]): string => poly.map((c) => c.toFixed(6)).join(",");
    for (const [mode, want] of Object.entries(boards)) {
      const board = buildBoard(mode, "easy");
      expect(isBoard3D(board)).toBe(true);
      const got = [...board.polygons.values()]
        .map((poly) => poly.flat().map(round6))
        .sort((a, b) => (order(a) < order(b) ? -1 : 1));
      const expected = [...want]
        .map((poly) => poly.map(round6))
        .sort((a, b) => (order(a) < order(b) ? -1 : 1));
      expect(got.length).toBe(expected.length);
      for (let i = 0; i < got.length; i++) {
        expect(got[i]!.length, `${mode} cell ${i}`).toBe(expected[i]!.length);
        for (let j = 0; j < got[i]!.length; j++) {
          expect(got[i]![j]!, `${mode} cell ${i} coord ${j}`).toBeCloseTo(
            expected[i]![j]!,
            6,
          );
        }
      }
    }
  });
});
