import { describe, expect, it } from "vitest";
import { Frontier } from "../../src/geometry/frontier";
import {
  KNOBS,
  KNOB_SIZES,
  SEAM_FLAT,
  SEAM_S,
  SEAM_Z,
  colours,
  jigsaw,
  knobMark,
  label,
  mirrored,
  partner,
  seamMark,
} from "../../src/geometry/marks";
import type { XY } from "../../src/geometry/shape";
import { LEVELS, boardKeys, levelByKey, type Level } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";
import { jigsawPoints } from "../../src/view/curve";

const JIGSAWS = LEVELS.filter((l) => l.decor?.jigsaw);

describe("jigsaw marks", () => {
  const sizes = KNOB_SIZES.map((_, s) => s);
  it("a knob's partner is its socket, the same shape and size, and a mirror keeps it", () => {
    for (const size of sizes)
      for (let shape = 0; shape < KNOBS; shape++) {
        const knob = knobMark(shape, true, size);
        const socket = knobMark(shape, false, size);
        expect(partner(knob)).toBe(socket);
        expect(partner(socket)).toBe(knob);
        expect(mirrored(knob)).toBe(knob);
        expect(jigsaw(knob)).toEqual({ knob: shape, out: true, size });
        expect(label(knob)).toBeNull();
        expect(colours(knob)).toBeNull();
      }
  });

  it("a seam is its own partner, and a mirror turns an S into a Z", () => {
    for (const size of sizes) {
      for (const seam of [SEAM_FLAT, SEAM_S, SEAM_Z])
        expect(partner(seamMark(seam, size))).toBe(seamMark(seam, size));
      expect(mirrored(seamMark(SEAM_FLAT, size))).toBe(seamMark(SEAM_FLAT, size));
      expect(mirrored(seamMark(SEAM_S, size))).toBe(seamMark(SEAM_Z, size));
      expect(mirrored(seamMark(SEAM_Z, size))).toBe(seamMark(SEAM_S, size));
    }
  });

  // A tile's edge a → b and its neighbour's b → a, marked as partners, must
  // be drawn as one line: the same points, the other way along.
  const sameLine = (p: XY[], q: XY[]): void => {
    expect(p.length).toBe(q.length);
    const back = [...q].reverse();
    // each list ends at its edge's far corner; reversed, the other's starts
    // there, so compare each point with the one a place on
    p.slice(0, -1).forEach((pt, i) => {
      expect(pt[0]).toBeCloseTo(back[i + 1]![0], 9);
      expect(pt[1]).toBeCloseTo(back[i + 1]![1], 9);
    });
  };
  const a: XY = [0.3, -0.2];
  const b: XY = [2.1, 0.9];

  it("draws a knob a → b as the very line of its socket b → a", () => {
    for (const size of sizes)
      for (let shape = 0; shape < KNOBS; shape++) {
        const knob = jigsawPoints(a, b, knobMark(shape, true, size))!;
        const socket = jigsawPoints(b, a, knobMark(shape, false, size))!;
        sameLine(knob, socket);
        // and the knob stands out of the tile: to the right of a → b
        const right = knob.some(
          ([x, y]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-6,
        );
        expect(right).toBe(true);
      }
  });

  it("draws an S or a Z seam from either end as one line, and a flat one straight", () => {
    for (const size of sizes) {
      for (const seam of [SEAM_S, SEAM_Z])
        sameLine(
          jigsawPoints(a, b, seamMark(seam, size))!,
          jigsawPoints(b, a, seamMark(seam, size))!,
        );
      expect(jigsawPoints(a, b, seamMark(SEAM_FLAT, size))).toBeNull();
    }
  });

  it("starts and ends every jigsaw edge on its own corners, at every size", () => {
    for (const size of sizes) {
      const marks = [
        ...Array.from({ length: KNOBS }, (_, s) => knobMark(s, true, size)),
        seamMark(SEAM_S, size),
      ];
      for (const m of marks) {
        const pts = jigsawPoints(a, b, m)!;
        expect(pts.at(-1)![0]).toBeCloseTo(b[0], 12);
        expect(pts.at(-1)![1]).toBeCloseTo(b[1], 12);
      }
    }
  });
});

describe("jigsaw levels", () => {
  it("are listed, each a colouring's twin", () => {
    expect(JIGSAWS.length).toBeGreaterThan(100);
    for (const level of JIGSAWS) {
      const coloured = LEVELS.find((l) => l.key === level.decor!.jigsaw);
      expect(coloured?.group, level.key).toBe("colourings");
      expect(level.key).toBe(`${coloured!.key}.jigsaw`);
      expect(level.group).toBe("jigsaw");
      expect(level.decor!.of).toBe(coloured!.decor!.of);
    }
  });

  it("are on every board their colouring is", () => {
    for (const level of JIGSAWS)
      expect(boardKeys(level.key)).toEqual(
        boardKeys(level.decor!.jigsaw!).map((k) => k.replace(level.decor!.jigsaw!, level.key)),
      );
  });

  // every board of every jigsaw, against its colouring on the same board
  const pairs = JIGSAWS.flatMap((level) =>
    boardKeys(level.key).map((key) => [key, key.replace(".jigsaw", "")] as const),
  );

  it.each(pairs)("%s plays as %s: one mark for one colour pair, partners kept", (key, of) => {
    const level = levelByKey(key)!;
    const coloured = levelByKey(of)!;
    expect(level.tiles.length).toBe(coloured.tiles.length);
    expect(level.need).toEqual(coloured.need);
    expect(level.turns).toEqual(coloured.turns);
    expect(level.turn).toBe(coloured.turn);
    expect(level.mirror).toBe(coloured.mirror);
    expect(level.colours.some((c) => c.includes("paint"))).toBe(false);
    // the colour marks and the jigsaw ones, edge for edge, cell by cell and
    // tile by tile: one to one, each pair's partners each other's
    const map = new Map<number, number>();
    const back = new Map<number, number>();
    const both = [
      ...coloured.cells.map((c, i) => [c, level.cells[i]!] as const),
      ...coloured.tiles.map((t, i) => [t.pieces, level.tiles[i]!.pieces] as const),
    ];
    for (const [from, to] of both)
      from.forEach((p, q) =>
        p.marks!.forEach((m, e) => {
          const j = to[q]!.marks![e]!;
          expect(jigsaw(j), key).not.toBeNull();
          expect(map.get(m) ?? j).toBe(j);
          expect(back.get(j) ?? m).toBe(m);
          map.set(m, j);
          back.set(j, m);
        }),
      );
    for (const [m, j] of map) if (map.has(partner(m))) expect(map.get(partner(m))).toBe(partner(j));
    // one size of knob on a level
    expect(new Set([...map.values()].map((j) => jigsaw(j)!.size)).size).toBe(1);
    // the rim asks for the mark of the tile along it
    const rim = level.regionMarks!;
    expect(rim.length).toBe(level.region.length);
    rim.forEach((loop, i) => expect(loop.length).toBe(level.region[i]!.length));
    expect(rim.flat().every((m) => jigsaw(m) !== null)).toBe(true);
  });

  const sample = ["squares.2apart.jigsaw", "hexagons.3apart.jigsaw", "squares.3striped.jigsaw"];

  it.each(sample)(
    "%s: the board's own tiles fit the rim, a tile of the other side does not",
    (key) => {
      const level = levelByKey(key)!;
      const untouched = (l: Level): Frontier =>
        Frontier.ofRegion(l.ring, l.region, l.regionCurves, l.regionMarks);
      const f = untouched(level);
      // a rim cell — one with an edge on the rim — and the same cell with every
      // knob a socket and every socket a knob: the rim takes only the first
      const { ring } = level;
      const rimEdges = new Set(
        level.region.flatMap((loop) =>
          loop.map((a, i) => `${ring.key(a)}>${ring.key(loop[(i + 1) % loop.length]!)}`),
        ),
      );
      const onRim = level.cells.filter((cell) =>
        cell.some(({ verts }) =>
          verts.some((a, i) =>
            rimEdges.has(`${ring.key(a)}>${ring.key(verts[(i + 1) % verts.length]!)}`),
          ),
        ),
      );
      expect(onRim.length).toBeGreaterThan(0);
      let refused = 0;
      for (const cell of onRim) {
        expect(f.fits(cell)).toBe(true);
        const turned = cell.map((p) => ({ ...p, marks: p.marks!.map(partner) }));
        if (turned.some((p, q) => p.marks.some((m, e) => m !== cell[q]!.marks![e]))) {
          if (!f.fits(turned)) refused++;
        }
      }
      expect(refused).toBeGreaterThan(0);
    },
  );

  it.each(sample)("%s can be finished", (key) => {
    const p = new Puzzle(levelByKey(key)!);
    expect(p.solve()).toBe(true);
    expect(p.won).toBe(true);
  });
});
