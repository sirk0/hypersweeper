import { describe, expect, it } from "vitest";
import {
  DUAL_ARCH,
  ISOGONAL_ARCH,
  MENU,
  MODE_LABELS,
  POLYHEDRA_MODES,
  RECTANGLE_ARCH,
  SPHERE_MODES,
  SURFACES,
  TILINGS_BY_KEY,
  UNIFORM_ARCH,
  familyRows,
  modeFor,
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

  it("wraps the isogonal tilings onto every surface their chirality allows", () => {
    // All six wrap the torus and cylinder; only the two with a template
    // mirror (offset square, staggered triangular) also wrap the Mobius
    // strip / Klein bottle, exactly like the uniform/dual families.
    const mirrored = new Set(["offsetsquare", "staggeredtri"]);
    for (const key of ISOGONAL_ARCH) {
      const tiling = TILINGS_BY_KEY.get(key)!;
      expect(tilingAllows(tiling, SURFACES.get("flat")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("torus")!)).toBe(true);
      expect(tilingAllows(tiling, SURFACES.get("cylinder")!)).toBe(true);
      const wantMirror = mirrored.has(key);
      expect(tilingAllows(tiling, SURFACES.get("mobius")!)).toBe(wantMirror);
      expect(tilingAllows(tiling, SURFACES.get("klein")!)).toBe(wantMirror);
    }
    // Builds fine on every manifold (checked above), but off the menu on
    // torus/mobius/klein for now — too distorted at the current preset
    // windows; the cylinder is the only manifold that still offers it.
    for (const surface of ["flat", "cylinder"]) {
      expect(pickerFamilies(surface)).toContain("isogonal");
    }
    for (const surface of ["torus", "mobius", "klein"]) {
      expect(pickerFamilies(surface)).not.toContain("isogonal");
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
    // Off the menu on torus/mobius/klein for now, same as isogonal above.
    for (const surface of ["flat", "cylinder"]) {
      expect(pickerFamilies(surface)).toContain("rectangle");
    }
    for (const surface of ["torus", "mobius", "klein"]) {
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
    ]);
    // a one-off family's rows are modes, so each carries its own icon
    expect(familyRows("fractal", "flat").map((r) => r.icon)).toEqual([
      "sphinx",
      "chair",
      "carpet",
      "pentaflake",
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
    for (const m of SPHERE_MODES) add(m);
    for (const m of POLYHEDRA_MODES) add(m);
    // isogonal and rectangle still build and have labels on torus/mobius/
    // klein, but pickerFamilies keeps them off the menu there for now (see
    // MANIFOLD_EXCLUDED_FAMILIES) — the one deliberate gap in reachability.
    const offMenu = new Set<string>();
    for (const surface of ["torus", "mobius", "klein"]) {
      for (const family of ["isogonal", "rectangle"]) {
        for (const key of family === "isogonal" ? ISOGONAL_ARCH : RECTANGLE_ARCH) {
          const mode = modeFor(key, surface);
          if (mode in MODE_LABELS) offMenu.add(mode);
        }
      }
    }
    expect(reachable).toEqual(new Set(MODES.filter((m) => !offMenu.has(m))));
  });
});
