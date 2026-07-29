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
  boundaryComponents: number | null;
  tilt: number | null;
  tilings: string[] | null;
}

export interface TilingSpec {
  key: string;
  label: string;
  chiral: boolean;
  modeOverrides: Record<string, string>;
  /** The plane only: no wrap builders or preset windows for this tiling yet
   * (the isogonal and rectangle families — see FLAT_ONLY_ARCH_FAMILIES). */
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
// gates it out of the orientation-reversing Möbius / Klein surfaces.
// The ARCH_TILINGS families that live on the plane only: no wrap builders and
// no per-surface preset windows for them yet.
const FLAT_ONLY_ARCH_FAMILIES = new Set(["isogonal", "rectangle"]);

export const ARCH_TILING_SPECS: TilingSpec[] = ARCH_TILINGS.map((t) => ({
  key: t.key,
  label: t.label,
  chiral: archTemplate(t.key).mirror === null,
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
 * mirror-needing surface (Möbius/Klein) rejects chiral tilings, and a surface
 * may restrict itself to an explicit tiling allow-list. */
export function tilingAllows(tiling: TilingSpec, surface: SurfaceSpec): boolean {
  if (tiling.flatOnly && surface.key !== "flat") return false;
  if (surface.needsMirror && tiling.chiral) return false;
  if (surface.tilings && !surface.tilings.includes(tiling.key)) return false;
  return true;
}

// mode -> the SurfaceSpec it wraps (regular + Archimedean/Laves tilings across
// every surface they allow). Mirrors catalog.py's _MODE_SURFACE.
const MODE_SURFACE = new Map<string, SurfaceSpec>();
for (const tiling of TILING_SPECS) {
  for (const surface of SURFACE_SPECS) {
    if (tilingAllows(tiling, surface)) {
      MODE_SURFACE.set(modeFor(tiling.key, surface.key), surface);
    }
  }
}

/** The SurfaceSpec a periodic (tiling × surface) mode lives on, or null for a
 * one-off solid/aperiodic/shaped mode. */
export function surfaceOf(mode: string): SurfaceSpec | null {
  return MODE_SURFACE.get(mode) ?? null;
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

// Menu groupings for the 3D one-off boards (Sphere and Polyhedra).
export const SPHERE_MODES = MENU.sphereModes as string[];
export const POLYHEDRA_MODES = MENU.polyhedraModes as string[];
// The shaped flat boards, by the regular tiling they are made of: the same
// tiling as the plain rectangular board, cut to a triangular or hexagonal
// outline. They exist on the plane only, so the flat picker's Regular page
// carries them under their tiling and no other picker shows them.
export const SHAPED_MODES = MENU.shapedModes as Record<string, string[]>;

/** The regular tilings the picker offers, in order (MENU.pickerRegular). */
export const PICKER_REGULAR = MENU.pickerRegular as string[];
/** The picker's family rows; "isogonal", "rectangle" and "aperiodic" are added
 * on the plane only — the isogonal tilings and the rectangle bonds have no wrap
 * builders yet, and the aperiodic ones no periodic domain to glue a seam
 * with. */
export const PICKER_FAMILIES = ["regular", "uniform", "dual"];
export const FLAT_ONLY_FAMILIES = ["isogonal", "rectangle", "aperiodic"];
export const APERIODIC_MODES = MENU.aperiodic as string[];

const FAMILY_MEMBERS: Record<string, string[]> = {
  regular: PICKER_REGULAR,
  uniform: UNIFORM_ARCH,
  dual: DUAL_ARCH,
  isogonal: ISOGONAL_ARCH,
  rectangle: RECTANGLE_ARCH,
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
  if (family === "aperiodic") {
    return APERIODIC_MODES.map((mode) => ({
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

/** The family rows a surface's picker offers, in order. */
export function pickerFamilies(surfaceKey: string): string[] {
  return surfaceKey === "flat" ? [...PICKER_FAMILIES, ...FLAT_ONLY_FAMILIES] : PICKER_FAMILIES;
}
