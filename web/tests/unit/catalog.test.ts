import { describe, expect, it } from "vitest";
import {
  DUAL_ARCH,
  ISOGONAL_ARCH,
  MENU,
  POLYHEDRA_MODES,
  RECTANGLE_ARCH,
  SPHERE_MODES,
  SURFACES,
  TILINGS_BY_KEY,
  UNIFORM_ARCH,
  familyRows,
  pickerFamilies,
  tilingAllows,
} from "../../src/boards/catalog";
import { MODES } from "../../src/boards/presets";

// The catalog derivations: the uniform / Laves / isogonal / rectangle families
// lifted from the ARCH_TILINGS registry, chirality and flat-only gating, and
// the guarantee
// that every built mode is reachable through the geometry-first menu (the
// picker per surface plus the sphere / polyhedra groups). Mirrors catalog.py's
// family split and picker_modes reachability.

const MANIFOLD_ORDER = MENU.manifoldOrder as string[];

describe("catalog families", () => {
  it("splits the template tilings into 8 uniform, 8 dual, 6 isogonal, 5 bonds", () => {
    expect(UNIFORM_ARCH.length).toBe(8);
    expect(DUAL_ARCH.length).toBe(8);
    expect(ISOGONAL_ARCH.length).toBe(6);
    expect(RECTANGLE_ARCH.length).toBe(5);
    expect(
      new Set([...UNIFORM_ARCH, ...DUAL_ARCH, ...ISOGONAL_ARCH, ...RECTANGLE_ARCH]).size,
    ).toBe(27);
  });

  it("keeps the isogonal tilings on the plane", () => {
    // They have no wrap builders or preset windows yet, so they are gated out
    // of every surface but the plane and never appear in a manifold picker.
    for (const key of ISOGONAL_ARCH) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("flat")!)).toBe(true);
      for (const surface of MANIFOLD_ORDER) {
        expect(tilingAllows(tiling, SURFACES.get(surface)!)).toBe(false);
      }
    }
    expect(pickerFamilies("flat")).toContain("isogonal");
    for (const surface of MANIFOLD_ORDER) {
      expect(pickerFamilies(surface)).not.toContain("isogonal");
    }
    expect(familyRows("isogonal", "flat").map((r) => r.mode)).toEqual([...ISOGONAL_ARCH]);
  });

  it("keeps the congruent-rectangle bonds on the plane", () => {
    // Same gating as the isogonal family: no wrap builders or windows yet.
    for (const key of RECTANGLE_ARCH) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("flat")!)).toBe(true);
      for (const surface of MANIFOLD_ORDER) {
        expect(tilingAllows(tiling, SURFACES.get(surface)!)).toBe(false);
      }
    }
    expect(pickerFamilies("flat")).toContain("rectangle");
    for (const surface of MANIFOLD_ORDER) {
      expect(pickerFamilies(surface)).not.toContain("rectangle");
    }
    expect(familyRows("rectangle", "flat").map((r) => r.mode)).toEqual([...RECTANGLE_ARCH]);
  });

  it("marks only the chiral tilings chiral (snub hexagonal + floret)", () => {
    const chiral = [...UNIFORM_ARCH, ...DUAL_ARCH].filter(
      (k) => TILINGS_BY_KEY.get(k)!.chiral,
    );
    expect(new Set(chiral)).toEqual(new Set(["snubhex", "floret"]));
  });

  it("gates chiral tilings out of the mirror-needing surfaces", () => {
    for (const key of ["snubhex", "floret"]) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("mobius")!)).toBe(false);
      expect(tilingAllows(tiling, SURFACES.get("klein")!)).toBe(false);
      expect(tilingAllows(tiling, SURFACES.get("torus")!)).toBe(true);
    }
  });

  it("lists the uniform tilings in vertex-configuration order", () => {
    expect(UNIFORM_ARCH).toEqual([
      "snubhex",
      "elongated",
      "snubsquare",
      "rhombitrihex",
      "trihex",
      "trunchex",
      "trunctrihex",
      "truncsquare",
    ]);
  });

  it("carries the shaped boards on the flat Regular page only", () => {
    expect(familyRows("regular", "flat").map((r) => r.mode)).toEqual([
      "trigrid",
      "triangle",
      "hextri",
      "square",
      "hex",
      "hexhex",
    ]);
    expect(familyRows("regular", "torus").map((r) => r.mode)).toEqual([
      "torustri",
      "torus",
      "torushex",
    ]);
  });

  it("offers the aperiodic family on the plane only", () => {
    expect(pickerFamilies("flat")).toContain("aperiodic");
    expect(pickerFamilies("klein")).not.toContain("aperiodic");
  });
});

describe("menu reachability", () => {
  it("reaches every built mode through a group / picker path", () => {
    const reachable = new Set<string>();
    const add = (mode: string): void => {
      if (MODES.includes(mode)) reachable.add(mode);
    };
    for (const surfaceKey of ["flat", ...MANIFOLD_ORDER]) {
      for (const family of pickerFamilies(surfaceKey)) {
        for (const row of familyRows(family, surfaceKey)) add(row.mode);
      }
    }
    for (const m of SPHERE_MODES) add(m);
    for (const m of POLYHEDRA_MODES) add(m);
    expect(reachable).toEqual(new Set(MODES));
  });
});
