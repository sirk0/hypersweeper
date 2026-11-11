import { describe, expect, it } from "vitest";
import aperiodicColourings from "../../src/aperiodicColourings.json";
import { cyclotomic, strictlyBetween, type Cyc } from "../../src/geometry/cyclotomic";
import { colours, label, labelMark, mirrored, partner } from "../../src/geometry/marks";
import { piece, posed, regular } from "../../src/geometry/shape";
import {
  LEVELS,
  MAX_COLOURED_TRAY,
  NO_PATCH_RULES,
  PATCH_MARKED,
  patchFrames,
  levelByKey,
  patchWindow,
} from "../../src/levels";
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

  const sq = (marks: number[], t: Cyc = Z4.zero) =>
    posed(regular(Z4, 4), { rot: 0, flip: false, t }).map((p) => piece(p.verts, undefined, marks));

  it("draws a lone label as a half disc in its class's colour, nearer its head", () => {
    const ahead = decorParts(loopsOf(Z4, sq([labelMark(1, true), 0, 0, 0])));
    const behind = decorParts(loopsOf(Z4, sq([labelMark(1, false), 0, 0, 0])));
    expect(ahead.map((p) => p.class)).toEqual(["decor label label-1"]);
    // the same class the other way: the same disc, at the edge's other end
    expect(ahead[0]!.d).not.toBe(behind[0]!.d);
  });

  // the points a part's paths start and end at, and the way each leaves
  const ends = (d: string): { at: string; dir: [number, number] }[] =>
    d
      .split("M")
      .filter(Boolean)
      .flatMap((seg) => {
        const n = seg.match(/-?[\d.]+/g)!.map(Number);
        const [x0, y0] = [n[0]!, n[1]!];
        const [x1, y1] = [n[n.length - 2]!, n[n.length - 1]!];
        const [cx, cy] = [n[2]!, n[3]!];
        const [dx, dy] = [n[n.length - 4]!, n[n.length - 3]!];
        const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
        // a spoke ends at its hub, inside: only its start is on an edge
        const hub = /Q/.test(seg);
        return [
          { at: key(x0, y0), dir: [cx - x0, cy - y0] as [number, number] },
          ...(hub ? [] : [{ at: key(x1, y1), dir: [dx - x1, dy - y1] as [number, number] }]),
        ];
      });

  it("joins a class's labels on a tile by a line, running on into the tile across", () => {
    // two squares side by side; the left one's right edge (1) and top (2)
    // carry class 1, the right one's left edge (3), its partner, and bottom
    const left = decorParts(loopsOf(Z4, sq([0, labelMark(1, true), labelMark(1, false), 0])));
    const right = decorParts(
      loopsOf(Z4, sq([labelMark(1, true), 0, 0, partner(labelMark(1, true))], [1, 0])),
    );
    for (const parts of [left, right]) {
      expect(parts.map((p) => p.class)).toEqual(["decor label-line label-1"]);
      expect(parts[0]!.width).toBeGreaterThan(0);
    }
    // they meet at one point on the shared edge, x = 1, each square on to it
    // from its own side: one line across
    const [a, b] = [ends(left[0]!.d), ends(right[0]!.d)];
    const shared = a.find((e) => e.at.startsWith("1.000,"))!;
    const across = b.find((e) => e.at === shared.at)!;
    expect(across).toBeDefined();
    expect(Math.abs(shared.dir[1])).toBeLessThan(1e-3);
    expect(Math.abs(across.dir[1])).toBeLessThan(1e-3);
    expect(Math.sign(shared.dir[0])).toBe(-Math.sign(across.dir[0]));
  });

  it("meets three labels of a class at a hub, and pairs four", () => {
    const three = decorParts(
      loopsOf(Z4, sq([labelMark(2, null), labelMark(2, null), labelMark(2, null), 0])),
    );
    expect(three.map((p) => p.class)).toEqual(["decor label-line label-2"]);
    expect(three[0]!.d.match(/M/g)).toHaveLength(3);
    expect(three[0]!.d.match(/Q/g)).toHaveLength(3);
    const four = decorParts(loopsOf(Z4, sq([1, 1, 1, 1].map(() => labelMark(0, null)))));
    expect(four[0]!.d.match(/C/g)).toHaveLength(2);
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
      const refined = refine(patchFrames(key));
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

describe("the spirals' rules", () => {
  const SPIRALS = ["phyllotaxis", "klaassen", "pentaspiral5", "pentaspiral6", "pentaspiral7"];

  it("frames every tile of a spiral's patch as its first, turned", () => {
    for (const key of SPIRALS) {
      const { ring, cells } = patchFrames(key);
      const first = cells[0]!.pieces[0]!;
      const edge = (c: Cyc[], i: number) => ring.sub(c[(i + 1) % c.length]!, c[i]!);
      for (const { pieces } of cells) {
        const [c] = pieces as [Cyc[]];
        // the turn that carries the first edge onto this one carries them all
        const k = [...Array(ring.n).keys()].find((k) =>
          ring.eq(ring.mul(ring.zeta(k), edge(first, 0)), edge(c, 0)),
        )!;
        expect(k, key).toBeDefined();
        for (let i = 0; i < c.length; i++)
          expect(ring.eq(ring.mul(ring.zeta(k), edge(first, i)), edge(c, i)), key).toBe(true);
      }
    }
  });

  it("marks every spiral but Klaassen's, whose patch asks nothing", () => {
    for (const key of SPIRALS) {
      const rules = [...deriveRules(refine(patchFrames(key))).values()];
      const trivial = rules.every((r) => r.cls === 0 && r.toEnd === null);
      expect(trivial, key).toBe(NO_PATCH_RULES.has(key));
      expect(
        LEVELS.some((l) => l.key === `${key}.rules`),
        key,
      ).toBe(!trivial);
    }
    // the phyllotactic hexagon's: one class, every arrow pointing one way
    // across the tile, so it is told from itself turned half round
    const phyllo = deriveRules(refine(patchFrames("phyllotaxis")));
    expect(new Set([...phyllo.values()].map((r) => r.cls))).toEqual(new Set([0]));
    expect([...phyllo.values()].map((r) => r.toEnd)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});

describe("the rep-tiles' rules", () => {
  const REP_TILES = LEVELS.filter((l) => l.group === "reptile").map((l) => l.key);

  it("reads every rep-tile off its own board", () => {
    expect(REP_TILES).toHaveLength(17);
    for (const key of REP_TILES) expect(PATCH_MARKED, key).toContain(key);
  });

  it.each(REP_TILES)(
    "%s: its patch is its board, every cell the first one turned or mirrored, edge for edge",
    (key) => {
      const { ring, cells } = patchFrames(key);
      const level = levelByKey(key)!;
      // the board's cells, by their corners, and the patch's
      const corners = (pieces: readonly Cyc[][]) =>
        pieces
          .flatMap((p) => p.map((v) => ring.key(v)))
          .sort()
          .join("|");
      expect(new Set(cells.map((c) => corners(c.pieces)))).toEqual(
        new Set(level.cells.map((c) => corners(c.map((p) => p.verts)))),
      );
      const edges = (c: Cyc[]) => c.map((v, i) => ring.sub(c[(i + 1) % c.length]!, v));
      const first = cells[0]!.pieces.map(edges);
      for (const { pieces } of cells) {
        const own = pieces.map(edges);
        // one turn, and a mirror or not, carries every edge of the first
        // onto this cell's edge of the same place
        const fits = [false, true].some((conj) =>
          [...Array(ring.n).keys()].some((k) =>
            first.every((p, j) =>
              p.every((e, i) =>
                ring.eq(ring.mul(ring.zeta(k), conj ? ring.conj(e) : e), own[j]![i]!),
              ),
            ),
          ),
        );
        expect(fits, key).toBe(true);
      }
    },
  );

  it("marks every rep-tile but the P-pentomino, whose board asks nothing, and the kissing triangles", () => {
    for (const key of REP_TILES) {
      const rules = [...deriveRules(refine(patchFrames(key))).values()];
      const trivial = rules.every((r) => r.cls === 0 && r.toEnd === null);
      expect(trivial, key).toBe(key === "ppentomino");
      expect(
        LEVELS.some((l) => l.key === `${key}.rules`),
        key,
      ).toBe(!NO_PATCH_RULES.has(key));
    }
  });

  it("gives each rim edge a neighbour of its own past the board, for its colouring", () => {
    const { refined, cells, around, edges } = patchWindow(levelByKey("sphinx")!);
    const past = around.filter((c) => c >= refined.cells.length);
    expect(past.length).toBe(around.length);
    for (const cell of cells)
      for (const p of cell.pieces) for (const a of p.across) expect(a).toBeGreaterThanOrEqual(0);
    for (const c of past) expect(edges.filter(([a, b]) => a === c || b === c)).toHaveLength(1);
  });
});

describe("colourings read off a patch", () => {
  it("lists an aperiodic colouring only where its tray is small enough to play", () => {
    for (const key of PATCH_MARKED) {
      const listed = LEVELS.filter((l) => l.decor?.of === key && !l.decor.rules);
      expect(listed.length, key).toBe(CHOSEN[key]!.tiles <= MAX_COLOURED_TRAY ? 1 : 0);
    }
    // so far Ammann–Beenker's, at five tray tiles, Klaassen's spiral's, and
    // six rep-tiles', at four each
    expect(
      LEVELS.filter((l) => l.decor && PATCH_MARKED.includes(l.decor.of) && !l.decor.rules).map(
        (l) => l.key,
      ),
    ).toEqual([
      "ammannbeenker.3apart",
      "klaassen.3apart",
      "trapezoid.3apart",
      "rightisosceles.3apart",
      "drafter.3apart",
      "fish.3apart",
      "kissingsquares.3apart",
      "kissingtriangles.3apart",
    ]);
  });

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
