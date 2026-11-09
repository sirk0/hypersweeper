import { describe, expect, it } from "vitest";
import { z12ToXy, type Z12Point } from "../src/aperiodic";
import type { Vertex } from "../src/core";
import {
  deformHats,
  hatBoard,
  hatExact,
  hatMetatiles,
  hatMetatilesBoard,
  hatMetatilesExact,
  turtleBoard,
  turtleExact,
} from "../src/hat";

// The hat's family, as TestHat in tests/test_boards.py holds the Python
// reference to account: the patch is the published one, the deformation to
// the turtle is exact, and every board's tiles cover their patch exactly, edge
// to edge. data/conformance.json then pins the two languages to each other.

const shoelace = (points: readonly Vertex[]): number =>
  points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return sum + (a[0] * b[1] - b[0] * a[1]) / 2;
  }, 0);

describe("the hat's patch", () => {
  it("is the H metatile substituted: 442 metatiles and 1156 hats at depth 3", () => {
    const metas = hatMetatiles(3);
    const hats = metas.flatMap((m) => m.hats);
    expect(metas).toHaveLength(442);
    expect(hats).toHaveLength(1156);
    expect(hats.filter((h) => h.mirrored)).toHaveLength(147);
    const count = (k: string): number => metas.filter((m) => m.kind === k).length;
    expect([count("H"), count("T"), count("P"), count("F")]).toEqual([147, 22, 105, 168]);
    expect(hatMetatiles(4)).toHaveLength(3025);
  });

  it("deforms to Tile(1,1) with unit edges, and to the turtle with swapped lengths", () => {
    const hats = hatMetatiles(2).flatMap((m) => m.hats.map((h) => h.corners));
    const one: Z12Point = [1, 0, 0, 0];
    for (const tile of deformHats(hats, one, one)) {
      const pts = tile.map(z12ToXy);
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length]!;
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(1, 12);
      });
    }
    const board = turtleBoard(3, null, 1);
    for (const polygon of board.polygons.values()) {
      const lengths = polygon
        .map((a, i) => {
          const b = polygon[(i + 1) % polygon.length]!;
          return Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1e9) / 1e9;
        })
        .sort();
      expect(lengths).toEqual([
        ...Array(6).fill(1),
        ...Array(8).fill(Math.round(Math.sqrt(3) * 1e9) / 1e9),
      ]);
    }
  });

  for (const [name, exact] of [
    ["hats", hatExact],
    ["turtles", turtleExact],
    ["metatiles", hatMetatilesExact],
  ] as const) {
    it(`lays its ${name} edge to edge, counter-clockwise, covering the patch exactly`, () => {
      const cells = exact(3).cells as Z12Point[][];
      const key = (p: Z12Point): string => p.join(",");
      const directed = new Map<string, number>();
      const next = new Map<string, Z12Point>();
      for (const cell of cells) {
        expect(shoelace(cell.map(z12ToXy))).toBeGreaterThan(0);
        cell.forEach((a, i) => {
          const b = cell[(i + 1) % cell.length]!;
          const k = `${key(a)}>${key(b)}`;
          directed.set(k, (directed.get(k) ?? 0) + 1);
        });
      }
      expect(new Set(directed.values())).toEqual(new Set([1]));
      // the edges no tile meets from the far side make one loop: a corner
      // strictly inside another tile's side would leave a little loop of its own
      for (const cell of cells) {
        cell.forEach((a, i) => {
          const b = cell[(i + 1) % cell.length]!;
          if (!directed.has(`${key(b)}>${key(a)}`)) next.set(key(a), b);
        });
      }
      const start = next.keys().next().value as string;
      const loop: Vertex[] = [];
      let at = start;
      do {
        const to = next.get(at)!;
        loop.push(z12ToXy(to));
        at = key(to);
      } while (at !== start && loop.length <= next.size);
      expect(loop).toHaveLength(next.size);
      const tiles = cells.reduce((sum, cell) => sum + shoelace(cell.map(z12ToXy)), 0);
      expect(tiles).toBeCloseTo(shoelace(loop), 6);
    });
  }

  it("puts each hat's and turtle's number in its biggest circle", () => {
    const toSegment = (p: Vertex, a: Vertex, b: Vertex): number => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.min(
        1,
        Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const radius = { hat: 1.3764764008373694, turtle: 3 / (1 + Math.sqrt(3) / 2) };
    for (const [mode, board] of [
      ["hat", hatBoard(3, 81, 1)],
      ["turtle", turtleBoard(3, 81, 1)],
    ] as const) {
      expect(board.glyphAnchor?.size).toBe(81);
      for (const [cell, polygon] of board.polygons) {
        const anchor = board.glyphAnchor!.get(cell)!;
        const reach = Math.min(
          ...polygon.map((a, i) => toSegment(anchor, a, polygon[(i + 1) % polygon.length]!)),
        );
        expect(reach, `${mode} ${cell}`).toBeCloseTo(radius[mode], 9);
      }
    }
    // the metatiles are convex: their vertex mean will do
    expect(hatMetatilesBoard(3, 81, 1).glyphAnchor).toBeUndefined();
  });
});
