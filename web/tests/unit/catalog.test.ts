import { describe, expect, it } from "vitest";
import {
  DUAL_ARCH,
  ISOGONAL_ARCH,
  MENU,
  RECTANGLE_ARCH,
  SOLID_MODES,
  SURFACES,
  SURFACE_SPECS,
  TILINGS_BY_KEY,
  TILING_SPECS,
  UNIFORM_ARCH,
  familyRows,
  modeFor,
  pickerFamilies,
  tilingAllows,
  tilingOf,
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

  it("wraps the isogonal tilings onto every surface their symmetry allows", () => {
    // All six wrap the torus; all but three-scale triangular wrap the cylinder,
    // whose two rims have to be the same curve and whose tiling therefore has
    // to reverse y somewhere (p3 never does). Only the two with a template
    // mirror (offset square, staggered triangular) also wrap the Mobius
    // strip / Klein bottle, exactly like the uniform/dual families.
    const mirrored = new Set(["offsetsquare", "staggeredtri"]);
    for (const key of ISOGONAL_ARCH) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("flat")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("torus")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("cylinder")!)).toBe(
        key !== "threescaletri",
      );
      const wantMirror = mirrored.has(key);
      expect(tilingAllows(tiling, SURFACES.get("mobius")!)).toBe(wantMirror);
      expect(tilingAllows(tiling, SURFACES.get("klein")!)).toBe(wantMirror);
    }
    // ...and it is offered on every one of them: the windows were re-measured
    // against the same shape metric the rest of the zoo uses, once that metric
    // stopped counting a T-vertex as a corner.
    for (const surface of ["flat", "cylinder", "torus", "mobius", "klein"]) {
      expect(pickerFamilies(surface)).toContain("isogonal");
    }
    expect(familyRows("isogonal", "flat").map((r) => r.mode)).toEqual([...ISOGONAL_ARCH]);
  });

  it("wraps the congruent-rectangle bonds onto every surface their chirality allows", () => {
    // All five wrap the torus and cylinder; every bond but herringbone
    // (glide-only, no mirror) also wraps the Mobius strip / Klein bottle.
    const mirrored = new Set(["stackedbond", "runningbond", "basketweave", "basketweave3"]);
    for (const key of RECTANGLE_ARCH) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("flat")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("torus")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("cylinder")!)).toBe(true);
      const wantMirror = mirrored.has(key);
      expect(tilingAllows(tiling, SURFACES.get("mobius")!)).toBe(wantMirror);
      expect(tilingAllows(tiling, SURFACES.get("klein")!)).toBe(wantMirror);
    }
    // ...and, since the windows were re-measured against the bond's own
    // brick rather than against a regular polygon, on the menu of every one.
    for (const surface of ["flat", "cylinder", "torus", "mobius", "klein"]) {
      expect(pickerFamilies(surface)).toContain("rectangle");
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
      "squarediamond",
      "hex",
      "hexhex",
      "hextriangle",
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

  it("offers the fractal family, with its self-similar boards, on the plane only", () => {
    expect(pickerFamilies("flat")).toContain("fractal");
    expect(pickerFamilies("torus")).not.toContain("fractal");
    expect(familyRows("fractal", "flat").map((r) => r.mode)).toEqual([
      "sphinx",
      "chair",
      "carpet",
      "pentaflake",
      "gosper",
    ]);
    // a one-off family's rows are modes, so each carries its own icon
    expect(familyRows("fractal", "flat").map((r) => r.icon)).toEqual([
      "sphinx",
      "chair",
      "carpet",
      "pentaflake",
      "gosper",
    ]);
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
    for (const m of SOLID_MODES) add(m);
    // no gaps: every mode this build knows is reachable from the menu
    expect(reachable).toEqual(new Set(MODES));
  });
});

describe("mode -> tiling", () => {
  it("inverts the tiling x surface product, collision-free", () => {
    // `tilingOf` is `surfaceOf`'s twin: between them they name the two halves a
    // periodic mode is built from. It cannot be a prefix strip — `torustri`,
    // `torustriakis` and `torustrihex` are three tilings on one surface — so
    // what it needs to be is exactly the inverse of `modeFor`.
    let pairs = 0;
    for (const tiling of TILING_SPECS) {
      for (const surface of SURFACE_SPECS) {
        if (!tilingAllows(tiling, surface)) continue;
        expect(tilingOf(modeFor(tiling.key, surface.key))).toBe(tiling.key);
        pairs++;
      }
    }
    expect(pairs).toBe(135);
  });

  it("has no tiling for the one-off boards", () => {
    // The solids, the aperiodic and fractal patches and the shaped flats are
    // not products of the catalogue, so they answer null — as they do for
    // `surfaceOf`.
    for (const mode of [...SOLID_MODES, "penrose", "sphinx", "hexhex", "squarediamond"]) {
      expect(tilingOf(mode)).toBe(null);
    }
    expect(tilingOf("nosuchboard")).toBe(null);
  });
});
