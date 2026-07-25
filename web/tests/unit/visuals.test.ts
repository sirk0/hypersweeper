import { describe, expect, it } from "vitest";
import { baseColorFor, COLORS, glyphFor, type CellVisual } from "../../src/render/boardMesh";
import { cellPalette } from "../../src/render/shapePalette";

const ALL_KINDS: CellVisual[] = [
  { kind: "hidden" },
  { kind: "flagged" },
  { kind: "wrongFlag" },
  { kind: "revealed", mines: 1 },
  { kind: "mine" },
  { kind: "exploded" },
];

// The per-cell visual vocabulary shared by the flat and 3D board meshes. Guards
// the glyph/colour mapping — in particular the crossed-out "wrongFlag" shown on
// a misplaced flag when the board is revealed on loss.
describe("cell visuals", () => {
  it("maps every visual kind to a glyph", () => {
    expect(glyphFor({ kind: "hidden" })).toBeNull();
    expect(glyphFor({ kind: "flagged" })).toBe("flag");
    expect(glyphFor({ kind: "wrongFlag" })).toBe("wrongFlag");
    expect(glyphFor({ kind: "mine" })).toBe("mine");
    expect(glyphFor({ kind: "exploded" })).toBe("mine");
    expect(glyphFor({ kind: "revealed", mines: 0 })).toBeNull();
    expect(glyphFor({ kind: "revealed", mines: 3 })).toBe(3);
  });

  it("a misplaced flag keeps the tile colour of a normal flag", () => {
    expect(baseColorFor({ kind: "wrongFlag" })).toBe(baseColorFor({ kind: "flagged" }));
  });

  it("returns a colour for every kind (exhaustive switch)", () => {
    for (const v of ALL_KINDS) expect(baseColorFor(v)).toBeDefined();
  });

  it("takes the closed/opened tones from the cell's shape palette", () => {
    const palette = cellPalette({ sides: 6, regularity: 1 }, "flat");
    expect(baseColorFor({ kind: "hidden" }, palette)).toBe(palette.hidden);
    expect(baseColorFor({ kind: "flagged" }, palette)).toBe(palette.hidden);
    expect(baseColorFor({ kind: "wrongFlag" }, palette)).toBe(palette.hidden);
    expect(baseColorFor({ kind: "revealed", mines: 1 }, palette)).toBe(palette.revealed);
    expect(baseColorFor({ kind: "mine" }, palette)).toBe(palette.revealed);
    // A detonated mine means the same thing on every board, so it is never
    // shape-coded.
    expect(baseColorFor({ kind: "exploded" }, palette)).toBe(COLORS.exploded);
  });

  it("falls back to the neutral grays without a palette", () => {
    expect(baseColorFor({ kind: "hidden" })).toBe(COLORS.hidden);
    expect(baseColorFor({ kind: "revealed", mines: 0 })).toBe(COLORS.revealed);
  });
});
