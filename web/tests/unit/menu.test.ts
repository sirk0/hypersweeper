import { describe, expect, it } from "vitest";
import {
  MENU,
  MENU_FAMILY_HINTS,
  MENU_FAMILY_LABELS,
  SOLID_MODES,
  flatMenuModes,
  menuFamilies,
  menuFamilyRows,
  hyperbolicMenuModes,
  menuGroupFamilies,
  menuSubfamilies,
  menuSubfamilyRows,
  menuTilingRows,
  threeDMenuModes,
} from "../../src/boards/catalog";
import { MODES, hasMode } from "../../src/boards/presets";
import { boardGroups, quickPlayEntries } from "../../src/ui/boardTree";

// The web menu's own shape over the shared catalog (catalog.ts, "the web
// menu"): the three regular tilings promoted to the top of every picker page,
// the Regular family left holding the shaped boards alone, the Hyperbolic
// family lifted out into a group of its own, and the home page's random pools
// that replaced the per-picker Random entry. The pygame
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
      "squarediamond",
      "hexhex",
      "hextriangle",
    ]);
    expect(MENU_FAMILY_LABELS["regular"]).toBe("Shaped boards");
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
      // a family lifted into a group of its own carries the group's hint, and
      // so does each submenu its page is split into
      for (const family of menuGroupFamilies(surface)) {
        families.add(family);
        for (const sub of menuSubfamilies(family)) families.add(sub);
      }
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
      "2-uniform",
      "isogonal",
      "rectangle",
      "other",
      "aperiodic",
      "spiral",
      "fractal",
    ]);
    // the Klein bottle carries four families: only the plane has shaped
    // boards to fill a Regular page, and aperiodic/spiral/fractal boards
    expect(menuFamilies("klein")).toEqual(["uniform", "dual", "isogonal", "rectangle"]);
    // ...and the cylinder, Möbius strip and torus, which the 2-uniform tilings
    // wrap too
    for (const surface of ["cylinder", "mobius", "torus"]) {
      expect(menuFamilies(surface)).toEqual(["uniform", "dual", "2-uniform", "isogonal", "rectangle"]);
    }
  });

  it("gives every 2-uniform row its vertex-type symbol, and no other row one", () => {
    // The 2-uniform labels are words; the symbol the literature uses goes on
    // the line under them (menu.ts entryRow), straight from data/catalog.json.
    const twoUniform = menuFamilyRows("2-uniform", "flat");
    expect(twoUniform).toHaveLength(20);
    for (const row of twoUniform) expect(row.notation, row.mode).toMatch(/^\[.+; .+\][₁₂]?$/);
    expect(twoUniform.find((r) => r.mode === "snubelongated2")?.notation).toBe("[3³.4²; 3².4.3.4]₁");
    for (const family of menuFamilies("flat").filter((f) => f !== "2-uniform")) {
      for (const row of menuFamilyRows(family, "flat")) expect(row.notation, row.mode).toBeUndefined();
    }
  });

  it("offers no Random row: the pools are the home page's", () => {
    for (const surface of ["flat", ...MANIFOLD_ORDER]) {
      expect(menuFamilies(surface)).not.toContain("random");
    }
  });
});

const REGULAR = [
  "hyperbolic83",
  "hyperbolic73",
  "hyperbolic64",
  "hyperbolic54",
  "hyperbolic55",
  "hyperbolic45",
  "hyperbolic46",
  "hyperbolic37",
  "hyperbolic38",
];
const UNIFORM = ["hyperbolic667", "hyperbolic3737", "hyperbolic3474", "hyperbolic4614"];

describe("geometry groups", () => {
  it("puts Hyperbolic after Flat manifolds, not inside Flat", () => {
    const groups = boardGroups();
    expect(groups.map((g) => g.key).slice(0, 4)).toEqual([
      "flat",
      "manifolds",
      "hyperbolic",
      "sphere",
    ]);
    const hyperbolic = groups[2]!;
    expect(hyperbolic.label).toBe("Hyperbolic");
    expect(menuFamilies("flat")).not.toContain("hyperbolic");
  });

  it("splits the Hyperbolic page into Regular and Uniform", () => {
    const hyperbolic = boardGroups().find((g) => g.key === "hyperbolic")!;
    expect(hyperbolic.kind).toBe("families");
    if (hyperbolic.kind !== "families") return;
    expect(hyperbolic.families.map((f) => [f.key, f.label])).toEqual([
      ["hyperbolic-regular", "Regular"],
      ["hyperbolic-uniform", "Uniform"],
    ]);
    expect(hyperbolic.families.map((f) => f.modes.map((m) => m.mode))).toEqual([
      REGULAR,
      UNIFORM,
    ]);
  });

  it("files every board of the Hyperbolic page in exactly one submenu", () => {
    // keyed by builder, so a board from a builder no submenu names would
    // silently vanish from the menu; this is what catches it
    const filed = menuSubfamilies("hyperbolic").flatMap((sub) =>
      menuSubfamilyRows("hyperbolic", sub, "flat").map((r) => r.mode),
    );
    expect([...filed].sort()).toEqual(
      menuFamilyRows("hyperbolic", "flat")
        .map((r) => r.mode)
        .sort(),
    );
    expect(new Set(filed).size).toBe(filed.length);
  });

  it("files the binary tiling under Flat › Other, not Hyperbolic", () => {
    expect(menuFamilyRows("other", "flat").map((r) => r.mode)).toContain("hyperbolicbinary");
    expect(menuFamilyRows("hyperbolic", "flat").map((r) => r.mode)).not.toContain(
      "hyperbolicbinary",
    );
    // ...and nowhere off the plane, which has no binary tiling
    for (const surface of MANIFOLD_ORDER) {
      expect(menuFamilyRows("other", surface).map((r) => r.mode)).not.toContain(
        "hyperbolicbinary",
      );
    }
  });
});

describe("home page", () => {
  it("lists Hyperbolic under Classic, Flat and 3D", () => {
    expect(quickPlayEntries().map((e) => [e.kind, e.key])).toEqual([
      ["mode", "square"],
      ["random", "flat"],
      ["random", "3d"],
      ["random", "hyperbolic"],
    ]);
  });
});

describe("home page pools", () => {
  const flat = flatMenuModes().filter(hasMode);
  const threeD = threeDMenuModes().filter(hasMode);
  const hyperbolic = hyperbolicMenuModes().filter(hasMode);

  it("draws the flat pool from the plane alone", () => {
    expect(flat).toContain("trigrid");
    expect(flat).toContain("penrose");
    expect(flat).toContain("hexhex");
    expect(flat).not.toContain("torus");
    expect(flat).not.toContain("sphere");
    // the binary tiling is dealt with the plane's boards, as the menu files it
    expect(flat).toContain("hyperbolicbinary");
  });

  it("deals the hyperbolic boards from a pool of their own", () => {
    expect(hyperbolic).toEqual([...REGULAR, ...UNIFORM]);
    expect(flat.filter((m) => hyperbolic.includes(m))).toEqual([]);
  });

  it("draws the 3D pool from the manifolds and every solid", () => {
    expect(threeD).toContain("cylhex");
    expect(threeD).toContain("kleintriakis");
    for (const mode of SOLID_MODES) expect(threeD).toContain(mode);
    expect(threeD).not.toContain("square");
    expect(threeD).not.toContain("penrose");
  });

  it("keeps the pools disjoint, and every mode in them built", () => {
    expect(flat.filter((m) => threeD.includes(m))).toEqual([]);
    expect(hyperbolic.filter((m) => threeD.includes(m))).toEqual([]);
    for (const mode of [...flat, ...threeD, ...hyperbolic]) expect(hasMode(mode)).toBe(true);
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
    for (const mode of hyperbolicMenuModes()) add(mode); // the Hyperbolic pool, and Custom › Hyperbolic

    // no gaps: every mode this build knows is reachable from the menu
    expect(reachable).toEqual(new Set(MODES));
  });
});
