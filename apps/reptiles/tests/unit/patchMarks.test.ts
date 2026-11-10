import { describe, expect, it } from "vitest";
import aperiodicColourings from "../../src/aperiodicColourings.json";
import { cyclotomic, strictlyBetween, type Cyc } from "../../src/geometry/cyclotomic";
import { colours, label, labelMark, mirrored, partner } from "../../src/geometry/marks";
import { piece, posed, regular } from "../../src/geometry/shape";
import { PATCH_MARKED, aperiodicFrames, levelByKey, patchWindow } from "../../src/levels";
import {
  deriveRules,
  meetings,
  refine,
  type ChosenColouring,
  type FramedPatch,
  type RefinedPatch,
} from "../../src/patchMarks";
import { decorParts } from "../../src/view/decor";
import { loopsOf } from "../../src/view/curve";

const Z4 = cyclotomic(4);
const CHOSEN = aperiodicColourings as Record<string, ChosenColouring>;

/** Whether the patch has a corner strictly inside any of its edges. */
function cutPartWay(refined: RefinedPatch): boolean {
  const { ring } = refined;
  const points = new Map<string, Cyc>();
  for (const cell of refined.cells)
    for (const { verts } of cell.pieces) for (const v of verts) points.set(ring.key(v), v);
  const all = [...points.values()].map((p) => ({ p, xy: ring.toXY(p) }));
  for (const cell of refined.cells)
    for (const { verts } of cell.pieces)
      for (let i = 0; i < verts.length; i++) {
        const [a, b] = [verts[i]!, verts[(i + 1) % verts.length]!];
        const [[ax, ay], [bx, by]] = [ring.toXY(a), ring.toXY(b)];
        for (const { p, xy } of all) {
          if (xy[0] < Math.min(ax, bx) - 1e-6 || xy[0] > Math.max(ax, bx) + 1e-6) continue;
          if (xy[1] < Math.min(ay, by) - 1e-6 || xy[1] > Math.max(ay, by) + 1e-6) continue;
          if (strictlyBetween(ring, a, b, p)) return true;
        }
      }
  return false;
}

describe("labels", () => {
  it("pairs a label with the same class the other way, a wayless one with itself", () => {
    expect(partner(labelMark(3, true))).toBe(labelMark(3, false));
    expect(partner(labelMark(3, null))).toBe(labelMark(3, null));
    expect(mirrored(labelMark(2, false))).toBe(labelMark(2, true));
    expect(label(labelMark(5, null))).toEqual({ cls: 5, forward: null });
    expect(colours(labelMark(0, true))).toBeNull();
  });

  it("draws a label as a half disc in its class's colour, nearer its head", () => {
    const sq = (marks: number[]) =>
      posed(regular(Z4, 4), { rot: 0, flip: false, t: Z4.zero }).map((p) =>
        piece(p.verts, undefined, marks),
      );
    const ahead = decorParts(loopsOf(Z4, sq([labelMark(1, true), 0, 0, 0])));
    const behind = decorParts(loopsOf(Z4, sq([labelMark(1, false), 0, 0, 0])));
    expect(ahead.map((p) => p.class)).toEqual(["decor label label-1"]);
    // the same class the other way: the same disc, at the edge's other end
    expect(ahead[0]!.d).not.toBe(behind[0]!.d);
  });
});

describe("rules read off a patch", () => {
  // two unit squares side by side, and a 2 × 1 brick across their tops
  const twoSquares: FramedPatch = {
    ring: Z4,
    cells: [
      { kind: 0, pieces: [[Z4.zero, [1, 0], [1, 1], [0, 1]]] },
      {
        kind: 0,
        pieces: [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
          ],
        ],
      },
      {
        kind: 1,
        pieces: [
          [
            [0, 1],
            [2, 1],
            [2, 2],
            [0, 2],
          ],
        ],
      },
    ],
  };

  it("cuts an edge where a corner of the tile across lands on it, every copy alike", () => {
    const refined = refine(twoSquares);
    expect(refined.cells[2]!.pieces[0]!.verts).toHaveLength(5);
    expect(refined.cells[2]!.pieces[0]!.slots.slice(0, 2)).toEqual(["1:0:0:0", "1:0:0:1"]);
    expect(cutPartWay(refined)).toBe(false);
  });

  it("makes slots that meet one class, an arrow where every meeting agrees on a way", () => {
    const rules = deriveRules(refine(twoSquares));
    // a square's right side meets its left side, run the other way: one
    // class, the heads at one point — the two ends of their own slots
    const [right, left] = [rules.get("0:0:1:0")!, rules.get("0:0:3:0")!];
    expect(right.cls).toBe(left.cls);
    expect(right.toEnd).not.toBeNull();
    expect(right.toEnd).toBe(!left.toEnd);
    // a square turned half round across its right side meets that side
    // itself, run the other way: no one way for it
    const turned: FramedPatch = {
      ring: Z4,
      cells: [
        { kind: 0, pieces: [[Z4.zero, [1, 0], [1, 1], [0, 1]]] },
        {
          kind: 0,
          pieces: [
            [
              [2, 1],
              [1, 1],
              [1, 0],
              [2, 0],
            ],
          ],
        },
      ],
    };
    expect(deriveRules(refine(turned)).get("0:0:1:0")!.toEnd).toBeNull();
  });

  it.each(PATCH_MARKED)(
    "%s: no edge of its patch is met part-way, and every meeting keeps the rule",
    (key) => {
      const refined = refine(aperiodicFrames(key));
      expect(cutPartWay(refined)).toBe(false);
      const rules = deriveRules(refined);
      const slot = (at: { cell: number; piece: number; edge: number }) =>
        refined.cells[at.cell]!.pieces[at.piece]!.slots[at.edge]!;
      for (const { a, b, same } of meetings(refined)) {
        const [x, y] = [rules.get(slot(a))!, rules.get(slot(b))!];
        expect(x.cls).toBe(y.cls);
        // the heads at one point: the same end of each, run the same way
        if (x.toEnd !== null) expect(x.toEnd === y.toEnd).toBe(same);
      }
    },
    60_000,
  );
});

describe("colourings read off a patch", () => {
  it.each(PATCH_MARKED)(
    "%s: src/aperiodicColourings.json is a proper colouring of the window and round it, in as few colours as can be",
    (key) => {
      const chosen = CHOSEN[key]!;
      const { window, around, edges } = patchWindow(levelByKey(key)!);
      expect(chosen.cells).toHaveLength(window.length);
      expect(chosen.around).toHaveLength(around.length);
      const colour = new Map<number, number>();
      window.forEach((c, i) => colour.set(c, chosen.cells[i]!));
      around.forEach((c, i) => colour.set(c, chosen.around[i]!));
      const near = new Map<number, number[]>();
      for (const [a, b] of edges) {
        if (!colour.has(a) || !colour.has(b)) continue;
        expect(colour.get(a)).not.toBe(colour.get(b));
        near.set(a, [...(near.get(a) ?? []), b]);
        near.set(b, [...(near.get(b) ?? []), a]);
      }
      expect(Math.max(...colour.values())).toBeLessThan(chosen.colours);
      // four only where three cannot do: no three-colouring of the window
      // and round it, searched exhaustively
      if (chosen.colours === 4) {
        const nodes = [...colour.keys()];
        const col = new Map<number, number>();
        const go = (left: number): boolean => {
          if (!left) return true;
          let pick = -1;
          let best = -1;
          for (const v of nodes) {
            if (col.has(v)) continue;
            const ns = near.get(v) ?? [];
            const sat = new Set(ns.filter((u) => col.has(u)).map((u) => col.get(u))).size;
            if (sat * 1000 + ns.length > best) [best, pick] = [sat * 1000 + ns.length, v];
          }
          const used = new Set((near.get(pick) ?? []).map((u) => col.get(u)));
          for (let c = 0; c < 3; c++) {
            if (used.has(c)) continue;
            col.set(pick, c);
            if (go(left - 1)) return true;
          }
          col.delete(pick);
          return false;
        };
        expect(go(nodes.length)).toBe(false);
      }
    },
    60_000,
  );
});
