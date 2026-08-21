// Port of the data-driven parts of minesweeper/boards/catalog.py, reading the
// same data/catalog.json. M1 needs the flat regular modes; the derivations
// mirror the Python and grow as later milestones port more of the catalog.
import catalog from "@data/catalog.json";
import { ARCH_TILINGS, archTemplate } from "./tilings";

export interface SurfaceSpec {
  key: string;
  label: string;
  prefix: string;
  is3d: boolean;
  needsMirror: boolean;
  needsFlip: boolean;
  boundaryComponents: number | null;
  tilt: number | null;
  tilings: string[] | null;
}

export interface TilingSpec {
  key: string;
  label: string;
  chiral: boolean;
  /** Some horizontal mirror or half turn maps the tiling onto itself with y
   * reversed, so a strip of it can end in two rims that are the same curve — a
   * cylinder. p3 (three-scale triangular) has neither; see ArchTemplate.flips.
   * The regular tilings in data/catalog.json omit it, and all three do. */
  reversesY?: boolean;
  modeOverrides: Record<string, string>;
  /** The plane only: no wrap builders or preset windows for this tiling
   * (currently no ARCH_TILINGS family — see FLAT_ONLY_ARCH_FAMILIES — but a
   * future one-off tiling could set it). */
  flatOnly?: boolean;
}

export const DIFFICULTIES = catalog.difficulties as string[];
export const SURFACE_SPECS = catalog.surfaces as SurfaceSpec[];
export const SURFACES = new Map(SURFACE_SPECS.map((s) => [s.key, s]));
export const REGULAR_TILINGS = catalog.regularTilings as TilingSpec[];
export const SOLO_LABELS = catalog.soloLabels as Record<string, string>;
export const MENU = catalog.menu;

// The Archimedean (uniform) tilings and their Laves duals are lifted from the
// tilings.ts ARCH_TILINGS registry — the one place they are declared — exactly
// as catalog.py lifts them from ARCH_TILINGS. A tiling whose fundamental-domain
// template has no mirror is chiral (snub hexagonal, floret pentagonal), which
// gates it out of the orientation-reversing Möbius / Klein surfaces; one whose
// template never reverses y at all (three-scale triangular, p3) is gated out of
// the cylinder, whose two rims have to be the same curve.
// The ARCH_TILINGS families that live on the plane only: no wrap builders and
// no per-surface preset windows for them yet. Empty today -- isogonal and
// rectangle both wrap every surface their member tilings' chirality allows.
const FLAT_ONLY_ARCH_FAMILIES = new Set<string>([]);

export const ARCH_TILING_SPECS: TilingSpec[] = ARCH_TILINGS.map((t) => ({
  key: t.key,
  label: t.label,
  chiral: archTemplate(t.key).mirror === null,
  reversesY: archTemplate(t.key).flips.length > 0,
  modeOverrides: {},
  flatOnly: FLAT_ONLY_ARCH_FAMILIES.has(t.family),
}));

// Every periodic tiling as the menu sees it: the three regular tilings first,
// then the uniform and dual-uniform families.
export const TILING_SPECS: TilingSpec[] = [...REGULAR_TILINGS, ...ARCH_TILING_SPECS];
export const TILINGS_BY_KEY = new Map(TILING_SPECS.map((t) => [t.key, t]));

// The picker families — exactly the ARCH_TILINGS rows of each family: the
// vertex-transitive uniform ones, their (face-transitive) Laves duals, the
// isogonal ones that are not edge to edge, and the bonds of congruent
// rectangles.
const familyKeys = (family: string): string[] =>
  ARCH_TILINGS.filter((t) => t.family === family).map((t) => t.key);
export const UNIFORM_ARCH = familyKeys("uniform");
export const DUAL_ARCH = familyKeys("dual");
export const ISOGONAL_ARCH = familyKeys("isogonal");
export const RECTANGLE_ARCH = familyKeys("rectangle");
export const FAMILY_LABELS = MENU.familyLabels as Record<string, string>;

/** The mode string for a (tiling, surface) pair — the one naming convention. */
export function modeFor(tilingKey: string, surfaceKey: string): string {
  const tiling = TILINGS_BY_KEY.get(tilingKey);
  const surface = SURFACES.get(surfaceKey);
  if (!tiling || !surface) throw new Error(`unknown ${tilingKey}/${surfaceKey}`);
  return tiling.modeOverrides[surfaceKey] ?? surface.prefix + tiling.key;
}

/** Whether a tiling can wrap a surface (port of TilingSpec.allows): a
 * mirror-needing surface (Möbius/Klein) rejects chiral tilings, a flip-needing
 * one (the cylinder) rejects a tiling that never reverses y, and a surface may
 * restrict itself to an explicit tiling allow-list. */
export function tilingAllows(tiling: TilingSpec, surface: SurfaceSpec): boolean {
  if (tiling.flatOnly && surface.key !== "flat") return false;
  if (surface.needsMirror && tiling.chiral) return false;
  if (surface.needsFlip && tiling.reversesY === false) return false;
  if (surface.tilings && !surface.tilings.includes(tiling.key)) return false;
  return true;
}

// mode -> the SurfaceSpec it wraps (regular + Archimedean/Laves tilings across
// every surface they allow). Mirrors catalog.py's _MODE_SURFACE.
const MODE_SURFACE = new Map<string, SurfaceSpec>();
// ...and the other half of the same product: mode -> the tiling key it is made
// of. `modeFor` is a concatenation, so this cannot be recovered by stripping a
// prefix (`torustri`, `torustriakis` and `torustrihex` are three tilings on one
// surface); inverting the product is the only honest way, and it is
// collision-free because `modeFor` is injective across the whole catalogue.
const MODE_TILING = new Map<string, string>();
for (const tiling of TILING_SPECS) {
  for (const surface of SURFACE_SPECS) {
    if (tilingAllows(tiling, surface)) {
      MODE_SURFACE.set(modeFor(tiling.key, surface.key), surface);
      MODE_TILING.set(modeFor(tiling.key, surface.key), tiling.key);
    }
  }
}

/** The SurfaceSpec a periodic (tiling × surface) mode lives on, or null for a
 * one-off solid/aperiodic/shaped mode. */
export function surfaceOf(mode: string): SurfaceSpec | null {
  return MODE_SURFACE.get(mode) ?? null;
}

/** The tiling a periodic (tiling × surface) mode is made of, or null for a
 * one-off solid/aperiodic/shaped mode. The twin of `surfaceOf`: between them
 * they name the two halves a periodic mode is built from. */
export function tilingOf(mode: string): string | null {
  return MODE_TILING.get(mode) ?? null;
}

/** The initial x-rotation (tilt) for a wrapped mode, or null when the mode is
 * flat or a one-off solid (which set their own view). */
export function viewHint(mode: string): number | null {
  const surface = surfaceOf(mode);
  return surface ? surface.tilt : null;
}

// mode -> label for the ported modes. Regular periodic modes take the
// tiling's label; the flat triangle grid keeps its historical label; the
// one-off boards (shaped flats, solids) take their solo labels.
export const MODE_LABELS: Record<string, string> = (() => {
  const labels: Record<string, string> = { ...SOLO_LABELS };
  for (const t of TILING_SPECS) {
    for (const s of SURFACE_SPECS) {
      if (tilingAllows(t, s)) labels[modeFor(t.key, s.key)] = t.label;
    }
  }
  labels["trigrid"] = "Triangle grid";
  return labels;
})();

/** A mode's label with the surface it is wrapped on, for the places that name
 * a board outside the menu's hierarchy. `MODE_LABELS` alone is the tiling, and
 * that is all the menu needs — the surface is the page the board was reached
 * through. Anywhere boards from different surfaces sit in one list (the best
 * times page, the record dialog), the tiling alone names several boards. */
export function fullModeLabel(mode: string): string {
  const label = MODE_LABELS[mode] ?? mode;
  const surface = surfaceOf(mode);
  return surface && surface.key !== "flat" ? `${label} · ${surface.label}` : label;
}

// The solid pages -- Sphere, Platonic solids, Catalan solids and Polyhedra --
// each a flat list of boards. One table declares all four, so adding a solid is
// one row in data/catalog.json and no menu code at all. SOLID_MODES is every
// board they reach, flattened, for the places (fairness weighting, the
// background pattern, the icon gallery) that just need the whole set.
export interface SolidGroup {
  key: string;
  label: string;
  modes: string[];
}
export const SOLID_GROUPS = MENU.solidGroups as SolidGroup[];
export const SOLID_MODES: string[] = SOLID_GROUPS.flatMap((g) => g.modes);
// The shaped flat boards, by the regular tiling they are made of: the same
// tiling as the plain rectangular board, cut to a triangular or hexagonal
// outline. They exist on the plane only, so the flat picker's Regular page
// carries them under their tiling and no other picker shows them.
export const SHAPED_MODES = MENU.shapedModes as Record<string, string[]>;

/** The regular tilings the picker offers, in order (MENU.pickerRegular). */
export const PICKER_REGULAR = MENU.pickerRegular as string[];
/** The picker's family rows; the flat-only families are added on the plane
 * only — an aperiodic tiling has no periodic domain to glue a seam with, and a
 * fractal board is a self-similar shape rather than a window. Isogonal and
 * rectangle wrap every surface their member tilings' chirality allows, just
 * like uniform and dual. */
export const PICKER_FAMILIES = ["regular", "uniform", "dual", "isogonal", "rectangle"];
export const FLAT_ONLY_FAMILIES = ["aperiodic", "fractal"];
export const APERIODIC_MODES = MENU.aperiodic as string[];
// The fractal family: the rep-tile boards (sphinx, chair), each a patch whose
// outline is the tile itself, scaled. One-off modes like the aperiodic ones.
export const FRACTAL_MODES = MENU.fractal as string[];

const FAMILY_MEMBERS: Record<string, string[]> = {
  regular: PICKER_REGULAR,
  uniform: UNIFORM_ARCH,
  dual: DUAL_ARCH,
  isogonal: ISOGONAL_ARCH,
  rectangle: RECTANGLE_ARCH,
  aperiodic: APERIODIC_MODES,
  fractal: FRACTAL_MODES,
};

/** One row of a picker family: the mode it launches, its label, and the
 * menu-icon key (the tiling key for a wrapped tiling, so e.g. hexagons look
 * the same on every surface, the mode itself otherwise). */
export interface FamilyRow {
  mode: string;
  label: string;
  icon: string;
}

/** The rows of one picker family on a surface (port of catalog.py
 * family_rows). Rows the surface cannot carry — a chiral tiling on a mirror
 * seam — are dropped rather than shown disabled, as elsewhere in this menu. */
export function familyRows(family: string, surfaceKey: string): FamilyRow[] {
  if (FLAT_ONLY_FAMILIES.includes(family)) {
    // a family of one-off boards: its members are modes, not tiling keys
    return (FAMILY_MEMBERS[family] ?? []).map((mode) => ({
      mode,
      label: MODE_LABELS[mode] ?? mode,
      icon: mode,
    }));
  }
  const surface = SURFACES.get(surfaceKey);
  if (!surface) return [];
  const rows: FamilyRow[] = [];
  for (const key of FAMILY_MEMBERS[family] ?? []) {
    const tiling = TILINGS_BY_KEY.get(key);
    if (!tiling || !tilingAllows(tiling, surface)) continue;
    rows.push({ mode: modeFor(key, surfaceKey), label: tiling.label, icon: key });
    if (family === "regular" && surfaceKey === "flat") {
      // the same tiling on a triangular / hexagonal outline
      for (const mode of SHAPED_MODES[key] ?? []) {
        rows.push({ mode, label: MODE_LABELS[mode] ?? mode, icon: mode });
      }
    }
  }
  return rows;
}

/** The family rows a surface's picker offers, in order. Every family is
 * offered on every surface now; what a surface drops is decided row by row in
 * `familyRows`, by whether the tiling's chirality survives that seam. */
export function pickerFamilies(surfaceKey: string): string[] {
  if (surfaceKey === "flat") return [...PICKER_FAMILIES, ...FLAT_ONLY_FAMILIES];
  return [...PICKER_FAMILIES];
}

// -- the web menu -----------------------------------------------------------
// Everything above is the port of catalog.py, shared with the pygame menu.
// Below is the web menu's own shape, derived from it: the three regular
// tilings are promoted to the top of every picker page rather than sitting in
// a Regular submenu, which leaves that submenu holding the shaped boards
// alone (hence its own label), and the Random entry moves off the pickers on
// to the home page, where it becomes one flat pool and one 3D pool. None of
// this is filtered by what is actually built -- callers pass their own
// `hasMode`, as the menu already does for family rows.

/** The modes that are a regular tiling cut to a triangular or hexagonal
 * outline rather than the default rectangle. They exist on the plane only. */
const SHAPED_MODE_SET = new Set(Object.values(SHAPED_MODES).flat());

export function isShapedMode(mode: string): boolean {
  return SHAPED_MODE_SET.has(mode);
}

/** The rows promoted to the top of a surface's picker: the regular tilings it
 * carries (Triangles, Squares, Hexagons), without the shaped boards the
 * Regular family also holds on the plane. */
export function menuTilingRows(surfaceKey: string): FamilyRow[] {
  return familyRows("regular", surfaceKey).filter((r) => !isShapedMode(r.mode));
}

/** The shaped boards, the Regular family's remainder once its tilings are
 * promoted. Empty off the plane, which has none. */
export function menuShapedRows(surfaceKey: string): FamilyRow[] {
  return familyRows("regular", surfaceKey).filter((r) => isShapedMode(r.mode));
}

/** One family's rows as the web menu shows them: `regular` is the shaped
 * boards alone (its tilings are promoted), every other family unchanged. */
export function menuFamilyRows(family: string, surfaceKey: string): FamilyRow[] {
  return family === "regular" ? menuShapedRows(surfaceKey) : familyRows(family, surfaceKey);
}

/** The family submenus a surface's picker offers, in order: `pickerFamilies`
 * minus `regular` wherever promoting its tilings leaves nothing behind (every
 * manifold -- the shaped boards are flat-only). */
export function menuFamilies(surfaceKey: string): string[] {
  return pickerFamilies(surfaceKey).filter(
    (f) => f !== "regular" || menuShapedRows(surfaceKey).length > 0,
  );
}

/** The web menu's family labels: `regular` no longer names the regular
 * tilings (they are promoted) but the shaped boards left behind. The shared
 * FAMILY_LABELS still says "Regular" -- that is the pygame menu's page. */
export const MENU_FAMILY_LABELS: Record<string, string> = {
  ...FAMILY_LABELS,
  regular: "Non-square boards",
};

/** One line under each family row, saying what the name means.
 *
 * Every other row in the menu carries a hint; these were the only ones that did
 * not, and they are the ones that need it most -- "Laves" and "Isogonal" are
 * names from the literature, not descriptions, and a player deciding what to
 * play next has nothing to go on. Kept short enough for one line on a phone,
 * and phrased by what the *board* looks like rather than by the classification
 * it comes from. */
export const MENU_FAMILY_HINTS: Record<string, string> = {
  regular: "Triangles and hexagons, cut to shape",
  uniform: "Two or three shapes, same at every corner",
  // Keyed `dual`; "Laves" is only its label (see `menu.familyLabels`).
  dual: "Their duals — one shape throughout",
  isogonal: "A corner meets the middle of an edge",
  rectangle: "Brick bonds, one rectangle throughout",
  aperiodic: "Never repeats: Penrose, the Spectre, a spiral, brick rings",
  fractal: "One tile, grown into itself",
};

/** Every mode a surface's picker page can reach, promoted rows included. */
export function surfaceMenuModes(surfaceKey: string): string[] {
  const modes = menuTilingRows(surfaceKey).map((r) => r.mode);
  for (const family of menuFamilies(surfaceKey)) {
    for (const row of menuFamilyRows(family, surfaceKey)) modes.push(row.mode);
  }
  return modes;
}

/** The home page's Flat pool: every board the flat picker reaches. */
export function flatMenuModes(): string[] {
  return surfaceMenuModes("flat");
}

/** The home page's 3D pool: every board on a flat manifold, plus every solid --
 * everything Custom reaches that is not the plane. */
export function threeDMenuModes(): string[] {
  const modes: string[] = [];
  for (const surfaceKey of MENU.manifoldOrder as string[]) {
    modes.push(...surfaceMenuModes(surfaceKey));
  }
  modes.push(...SOLID_MODES);
  return modes;
}
