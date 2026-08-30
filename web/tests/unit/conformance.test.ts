import { describe, expect, it } from "vitest";
import conformance from "@data/conformance.json";
import { DIFFICULTIES } from "../../src/boards/catalog";
import {
  boundaryComponents,
  edgeCount,
  eulerCharacteristic,
  symmetryOf,
  vertexCount,
  type AnyBoard,
} from "../../src/boards/core";
import { buildBoard, MODES } from "../../src/boards/presets";
import { MAX_DIGIT_GLYPH } from "../../src/render/glyphAtlas";

// The board conformance oracle: every ported mode × difficulty must reproduce
// the statistics the Python implementation exported into data/conformance.json,
// so the two implementations cannot drift. Also checks structural invariants
// the oracle does not encode (adjacency symmetry, no self-loops, closure).
const MODE_STATS = conformance.modes as Record<
  string,
  Record<string, {
    cellCount: number;
    mineCount: number;
    euler: number;
    boundaryComponents: number;
    edgeCount: number;
    vertexCount: number;
    hasCellCycle: boolean;
  }>
>;

function checkInvariants(board: AnyBoard): void {
  const cells = new Set(board.adjacency.keys());
  for (const [cell, neighbors] of board.adjacency) {
    expect(neighbors).not.toContain(cell); // no self-loops
    for (const n of neighbors) {
      expect(cells.has(n)).toBe(true); // neighbours are on the board
      expect(board.adjacency.get(n)).toContain(cell); // symmetric
    }
    // A cell can be asked to draw its whole neighbourhood, so no board may
    // out-count the glyph atlas. `glyphFor` clamps rather than blanks, so a
    // board that did would draw the *wrong* number and nothing would say so.
    expect(neighbors.length).toBeLessThanOrEqual(MAX_DIGIT_GLYPH);
  }
}

describe("board conformance oracle", () => {
  it("ported modes match the exported set", () => {
    expect(new Set(MODES)).toEqual(new Set(Object.keys(MODE_STATS)));
  });

  for (const mode of Object.keys(MODE_STATS)) {
    for (const difficulty of DIFFICULTIES) {
      it(`${mode}/${difficulty} matches the oracle`, () => {
        const board = buildBoard(mode, difficulty);
        const want = MODE_STATS[mode]![difficulty]!;
        expect(board.polygons.size).toBe(want.cellCount);
        expect(board.mineCount).toBe(want.mineCount);
        expect(eulerCharacteristic(board)).toBe(want.euler);
        expect(boundaryComponents(board)).toBe(want.boundaryComponents);
        expect(edgeCount(board)).toBe(want.edgeCount);
        expect(vertexCount(board)).toBe(want.vertexCount);
        // One-directional on purpose. `hasCellCycle` is what the pygame
        // reference builds — the Klein bottle's ring translation, and nothing
        // else — while this app derives the whole symmetry group of every
        // wrapped surface and offers it as controls (see boards/core.ts
        // BoardSymmetry). So the oracle pins that a board the reference can
        // scroll is one this app can scroll too; the boards that gained a ring
        // step here are pinned in tests/unit/surfaces.test.ts instead.
        if (want.hasCellCycle) expect(symmetryOf(board, "ring")).not.toBeNull();
        checkInvariants(board);
      });
    }
  }
});
