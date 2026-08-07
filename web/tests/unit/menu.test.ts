import { describe, expect, it } from "vitest";
import {
  ISOGONAL_ARCH,
  MENU,
  MENU_FAMILY_HINTS,
  MENU_FAMILY_LABELS,
  MODE_LABELS,
  POLYHEDRA_MODES,
  RECTANGLE_ARCH,
  SPHERE_MODES,
  flatMenuModes,
  menuFamilies,
  menuFamilyRows,
  menuTilingRows,
  modeFor,
  threeDMenuModes,
} from "../../src/boards/catalog";
import { MODES, hasMode } from "../../src/boards/presets";

// The web menu's own shape over the shared catalog (catalog.ts, "the web
// menu"): the three regular tilings promoted to the top of every picker page,
// the Regular family left holding the shaped boards alone, and the two home
// page random pools that replaced the per-picker Random entry. The pygame
// menu's shape is the one catalog.test.ts pins; this is where the two differ.

const MANIFOLD_ORDER = MENU.manifoldOrder as string[];

describe("picker pages", () => {
  it("promotes the three regular tilings on the plane", () => {
    expect(menuTilingRows("flat").map((r) => r.mode)).toEqual(["trigrid", "square", "hex"]);
    // the icon is the tiling key, so hexagons look the same on every surface
    expect(menuTilingRows("flat").map((r) => r.icon)).toEqual(["tri", "square", "hex"]);
  });

  it("promotes them on every flat manifold too", () => {
    expect(menuTilingRows("cylinder").map((r) => r.mode)).toEqual([
      "cyltri",
      "cylinder",
      "cylhex",
    ]);
    expect(menuTilingRows("torus").map((r) => r.mode)).toEqual(["torustri", "torus", "torushex"]);
    expect(menuTilingRows("klein").map((r) => r.mode)).toEqual(["kleintri", "klein", "kleinhex"]);
  });

  it("leaves the shaped boards behind as their own family, on the plane only", () => {
    expect(menuFamilyRows("regular", "flat").map((r) => r.mode)).toEqual([
      "triangle",
      "hextri",
      "hexhex",
      "hextriangle",
    ]);
    expect(MENU_FAMILY_LABELS["regular"]).toBe("Non-square boards");
    for (const surface of MANIFOLD_ORDER) {
      expect(menuFamilyRows("regular", surface)).toEqual([]);
    }
  });

  it("gives every family row a hint, keyed by the family's own key", () => {
    // "Laves" and "Isogonal" name a classification rather than a look, so the
    // hint is what a player choosing a board actually reads. The trap this
    // pins: the label is "Laves" but the *key* is `dual`, and a hint filed
    // under the label simply never appears.
    const families = new Set<string>();
    for (const surface of ["flat", ...MANIFOLD_ORDER]) {
      for (const family of menuFamilies(surface)) families.add(family);
    }
    expect(families.size).toBeGreaterThan(0);
    for (const family of families) {
      expect(MENU_FAMILY_HINTS[family], family).toBeTruthy();
    }
    // And no hint filed under a key no family has.
    for (const key of Object.keys(MENU_FAMILY_HINTS)) {
      expect(families.has(key), key).toBe(true);
    }
  });

  it("keeps the shaped-board family on the plane and drops it off it", () => {
    expect(menuFamilies("flat")).toEqual([
      "regular",
      "uniform",
      "dual",
      "isogonal",
      "rectangle",
      "aperiodic",
      "fractal",
    ]);
    expect(menuFamilies("cylinder")).toEqual(["uniform", "dual", "isogonal", "rectangle"]);
    // the torus, Möbius strip and Klein bottle still drop isogonal and the
    // congruent rectangles (MANIFOLD_EXCLUDED_FAMILIES)
    for (const surface of ["torus", "mobius", "klein"]) {
      expect(menuFamilies(surface)).toEqual(["uniform", "dual"]);
    }
  });

  it("offers no Random row: the pools are the home page's", () => {
    for (const surface of ["flat", ...MANIFOLD_ORDER]) {
      expect(menuFamilies(surface)).not.toContain("random");
    }
  });
});

describe("home page pools", () => {
  const flat = flatMenuModes().filter(hasMode);
  const threeD = threeDMenuModes().filter(hasMode);

  it("draws the flat pool from the plane alone", () => {
    expect(flat).toContain("trigrid");
    expect(flat).toContain("penrose");
    expect(flat).toContain("hexhex");
    expect(flat).not.toContain("torus");
    expect(flat).not.toContain("sphere");
  });

  it("draws the 3D pool from the manifolds, the spheres and the polyhedra", () => {
    expect(threeD).toContain("cylhex");
    expect(threeD).toContain("kleintriakis");
    for (const mode of [...SPHERE_MODES, ...POLYHEDRA_MODES]) expect(threeD).toContain(mode);
    expect(threeD).not.toContain("square");
    expect(threeD).not.toContain("penrose");
  });

  it("keeps the two pools disjoint, and every mode in them built", () => {
    expect(flat.filter((m) => threeD.includes(m))).toEqual([]);
    for (const mode of [...flat, ...threeD]) expect(hasMode(mode)).toBe(true);
  });
});

describe("menu reachability", () => {
  it("reaches every built mode through the home rows or Custom", () => {
    const reachable = new Set<string>();
    const add = (mode: string): void => {
      if (hasMode(mode)) reachable.add(mode);
    };
    add("square"); // Classic
    for (const mode of flatMenuModes()) add(mode); // the Flat pool, and Custom › Flat
    for (const mode of threeDMenuModes()) add(mode); // the 3D pool, and the rest of Custom

    // isogonal and rectangle still build and have labels on torus/mobius/
    // klein, but menuFamilies keeps them off the menu there for now (see
    // MANIFOLD_EXCLUDED_FAMILIES) — the one deliberate gap in reachability.
    const offMenu = new Set<string>();
    for (const surface of ["torus", "mobius", "klein"]) {
      for (const key of [...ISOGONAL_ARCH, ...RECTANGLE_ARCH]) {
        const mode = modeFor(key, surface);
        if (mode in MODE_LABELS) offMenu.add(mode);
      }
    }
    expect(reachable).toEqual(new Set(MODES.filter((m) => !offMenu.has(m))));
  });
});
