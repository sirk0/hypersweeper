import { describe, expect, it } from "vitest";
import {
  CELL_STYLES,
  CELL_STYLE_KEYS,
  cellStyle,
  cellStyleLoops,
  cellVertexCount,
  DEFAULT_CELL_STYLE,
  resolveCellStyle,
  type CellProfile,
} from "../../src/render/cellStyle";

// The cell-relief table. The invariants here are the ones a bad profile would
// otherwise break *in the vertex buffer* — a cell writing more vertices than it
// was allocated overruns into its neighbour's slice — plus the two the styles
// exist for: a closed cell must stand above an opened one, and a 3D board's
// relief has to stay lower than a flat board's.

const profiles = (): [string, string, CellProfile][] =>
  CELL_STYLE_KEYS.flatMap((key) => [
    [key, "flat", CELL_STYLES[key]!.flat] as [string, string, CellProfile],
    [key, "solid", CELL_STYLES[key]!.solid] as [string, string, CellProfile],
  ]);

const crown = (p: CellProfile, state: "closed" | "open"): number =>
  p[state][p[state].length - 1]!.height;

describe("cell styles", () => {
  it("has the classic style as the default", () => {
    expect(CELL_STYLE_KEYS[0]).toBe(DEFAULT_CELL_STYLE);
    expect(cellStyle(DEFAULT_CELL_STYLE).key).toBe("classic");
  });

  it("falls back for a style this build does not have", () => {
    // Stored settings, so: a key from a newer build, and a key that is only an
    // Object property (the `in` vs `Object.hasOwn` trap).
    expect(resolveCellStyle("hologram")).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle("toString")).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle(null)).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle("soft")).toBe("soft");
  });

  it("keys every style by its own key, and labels it", () => {
    for (const key of CELL_STYLE_KEYS) {
      const style = CELL_STYLES[key]!;
      expect(style.key).toBe(key);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.hint.length).toBeGreaterThan(0);
    }
  });

  it("gives both states of a profile the same loop count", () => {
    // The one that matters: an opened cell is re-cut into the slice of the
    // buffer the closed one wrote, so a mismatch corrupts the next cell.
    for (const [key, kind, profile] of profiles()) {
      expect(() => cellStyleLoops(profile), `${key} ${kind}`).not.toThrow();
      expect(profile.closed.length, `${key} ${kind}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("counts a cell's vertices from its loops", () => {
    // A square at two loops: 4 top-fan triangles + a ring of 4 quads.
    const twoLoop: CellProfile = {
      gap: 0,
      closed: [{ inset: 0, height: 0 }, { inset: 0.1, height: 0.2 }],
      open: [{ inset: 0, height: 0 }, { inset: 0.1, height: -0.1 }],
    };
    expect(cellVertexCount(4, twoLoop)).toBe(36); // 4 * (3 + 6)
    expect(cellVertexCount(6, twoLoop)).toBe(54);
    const threeLoop: CellProfile = {
      gap: 0,
      closed: [...twoLoop.closed, { inset: 0.3, height: 0.25 }],
      open: [...twoLoop.open, { inset: 0.3, height: -0.15 }],
    };
    expect(cellVertexCount(4, threeLoop)).toBe(60); // 4 * (3 + 12)
    // Every real profile's count is divisible by 3 (whole triangles).
    for (const [, , profile] of profiles()) {
      expect(cellVertexCount(5, profile) % 3).toBe(0);
    }
  });

  it("stands a closed cell above an opened one, on every board", () => {
    for (const [key, kind, profile] of profiles()) {
      expect(crown(profile, "closed"), `${key} ${kind}`).toBeGreaterThan(
        crown(profile, "open"),
      );
    }
  });

  it("keeps a 3D board's relief low, and off the grout", () => {
    for (const key of CELL_STYLE_KEYS) {
      const style = CELL_STYLES[key]!;
      // Cells of a curved surface tilt against each other, so a plateau as tall
      // as a flat board's shingles over its neighbours at the silhouette.
      expect(crown(style.solid, "closed"), key).toBeLessThanOrEqual(0.15);
      // A solid is always lit, so its relief is what shows the shape there: a
      // style that flattens the *plane* (Flat draws unlit plates, where relief
      // would not show anyway) still stands its 3D tiles up.
      expect(crown(style.solid, "closed"), key).toBeGreaterThan(0.02);
      // Nothing on a solid cuts below the grout, or the two z-fight (a flat
      // board has no grout, so there a recess may go below zero).
      for (const loop of [...style.solid.open, ...style.solid.closed]) {
        expect(loop.height, key).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps every loop inside its cell", () => {
    for (const [key, kind, profile] of profiles()) {
      for (const loop of [...profile.closed, ...profile.open]) {
        expect(profile.gap + loop.inset, `${key} ${kind}`).toBeLessThan(0.9);
        expect(loop.inset, `${key} ${kind}`).toBeGreaterThanOrEqual(0);
      }
      // Loops run outward-in, so their insets ascend within a state.
      for (const state of ["closed", "open"] as const) {
        let previous = -1;
        for (const loop of profile[state]) {
          expect(loop.inset, `${key} ${kind} ${state}`).toBeGreaterThan(previous);
          previous = loop.inset;
        }
      }
    }
  });
});
