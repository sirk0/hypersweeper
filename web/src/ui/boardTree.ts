import {
  MENU,
  MENU_FAMILY_LABELS,
  MODE_LABELS,
  SOLID_GROUPS,
  SURFACES,
  menuFamilies,
  menuFamilyRows,
  menuGroupFamilies,
  menuTilingRows,
} from "../boards/catalog";
import { randomPool } from "../boards/randomBoard";
import { hasMode } from "../boards/presets";

// How the catalogue is grouped for a player picking a board: the quick-play
// entries, then the geometry groups (Flat, Hyperbolic, Flat manifolds and the
// solid pages), each down to its boards. Two menus are drawn from it — the home page
// (ui/menu.ts) and the native menu bar of the Mac and iPad app (menuBar.ts) —
// so the two cannot group the boards differently.

export const ROOT_LABELS = MENU.rootLabels as Record<string, string>;
const MANIFOLD_ORDER = MENU.manifoldOrder as string[];
const MANIFOLD_LABELS = MENU.manifoldLabels as Record<string, string>;

export interface ModeEntry {
  mode: string;
  label: string;
  /** The menu-icon key for the row: the tiling key for a wrapped tiling (so
   * e.g. hexagons look the same on every surface), the mode itself
   * otherwise. Matches the icon keys the pygame menu draws. */
  icon: string;
  /** A 2-uniform tiling's vertex-type symbol, shown under its worded label. */
  notation?: string;
}

export interface Family {
  key: string;
  label: string;
  modes: ModeEntry[];
}

/** The tiling picker for a surface: the regular tilings it carries, promoted
 * to rows of their own, then the families (uniform, dual and, on the plane,
 * the shaped boards, aperiodic, spirals and fractals) with any built modes on
 * it. */
export interface Picker {
  tilings: ModeEntry[];
  families: Family[];
}

/** Rows of a picker, dropping the modes this build has not got. */
function builtRows(rows: readonly ModeEntry[]): ModeEntry[] {
  return rows.filter((r) => hasMode(r.mode));
}

export function pickerFor(surfaceKey: string): Picker {
  const families: Family[] = [];
  for (const key of menuFamilies(surfaceKey)) {
    const modes = builtRows(menuFamilyRows(key, surfaceKey));
    if (modes.length > 0) {
      families.push({ key, label: MENU_FAMILY_LABELS[key] ?? key, modes });
    }
  }
  return { tilings: builtRows(menuTilingRows(surfaceKey)), families };
}

export interface SurfaceEntry {
  key: string;
  label: string;
}

export interface PickerGroup {
  key: string;
  label: string;
  kind: "picker";
  surfaceKey: string;
}

export interface ManifoldGroup {
  key: string;
  label: string;
  kind: "manifolds";
  surfaces: SurfaceEntry[];
}

export interface ModeGroup {
  key: string;
  label: string;
  kind: "modes";
  modes: string[];
}

export type Group = PickerGroup | ManifoldGroup | ModeGroup;

/** One of the three quick-play entries. `mode` opens that board; `random`
 * deals one from that half of the catalogue at click time, so it is a
 * different board every time (see `randomRow`). */
export interface QuickEntry {
  kind: "mode" | "random";
  key: string;
  label: string;
  hint: string;
  icon: string;
}

/** The surfaces that have any built tiling, in the shared manifold order
 * (Python's MANIFOLD_ORDER — the wrapped surfaces only; the plane is the
 * home page's Flat entry). */
export function manifoldSurfaces(): SurfaceEntry[] {
  const entries: SurfaceEntry[] = [];
  for (const key of MANIFOLD_ORDER) {
    const surface = SURFACES.get(key);
    if (!surface) continue;
    const picker = pickerFor(key);
    // ...anything at all on its page: a family submenu, or one of the
    // regular tilings promoted to a row of its own. The double torus is the
    // first surface with only the latter -- squares are the one tiling
    // wrapped onto it so far -- and a families-only test hid it.
    if (picker.tilings.length > 0 || picker.families.length > 0) {
      entries.push({ key, label: MANIFOLD_LABELS[key] ?? surface.label });
    }
  }
  return entries;
}

/** The geometry groups — the desktop sidebar's rows and the phone's Custom
 * page — with every group this build has nothing in left out. */
export function boardGroups(): Group[] {
  const groups: Group[] = [
    { key: "flat", label: ROOT_LABELS["flat"] ?? "Flat", kind: "picker", surfaceKey: "flat" },
    // The families lifted off the plane's picker (Hyperbolic), right beside it.
    ...menuGroupFamilies("flat").map(
      (key): Group => ({
        key,
        label: MENU_FAMILY_LABELS[key] ?? key,
        kind: "modes",
        modes: menuFamilyRows(key, "flat").map((r) => r.mode),
      }),
    ),
    {
      key: "manifolds",
      label: ROOT_LABELS["manifolds"] ?? "Flat manifolds",
      kind: "manifolds",
      surfaces: manifoldSurfaces(),
    },
    // The four solid pages -- Sphere, Platonic solids, Catalan solids and
    // Polyhedra -- are one flat board list each, so they all come off the
    // shared table rather than being spelled out here. (The shaped flat
    // boards live under Flat › Shaped boards.)
    ...SOLID_GROUPS.map((g): Group => ({
      key: g.key,
      label: g.label,
      kind: "modes",
      modes: [...g.modes],
    })),
  ];
  return groups.filter((g) => {
    if (g.kind === "modes") return (g.modes = g.modes.filter(hasMode)).length > 0;
    if (g.kind === "manifolds") return g.surfaces.length > 0;
    const picker = pickerFor(g.surfaceKey);
    return picker.tilings.length > 0 || picker.families.length > 0;
  });
}

/** Classic (which opens one particular board straight away) and one random
 * board from each half of the catalogue — the three entries the phone home
 * page lists as rows and the desktop shows as the Quick start page's cards.
 * Stated once here so the two cannot drift apart.
 *
 * The launch entry comes first: the row that opens a named board sits above
 * the ones that deal a surprise. Volumetric (cube3d) used to be a second
 * launch entry; it is in Custom › Volumes only until its UX is ready to be
 * promoted (see CUSTOM_ONLY in boards/randomBoard.ts). */
export function quickPlayEntries(): QuickEntry[] {
  const entries: QuickEntry[] = [];
  // Classic — flat squares, launched straight away (gui.py MenuScreen).
  if (hasMode("square")) {
    entries.push({
      kind: "mode",
      key: "square",
      label: ROOT_LABELS["classic"] ?? "Classic",
      hint: "Flat squares — the original.",
      icon: "classic",
    });
  }
  if (randomPool("flat").length > 0) {
    entries.push({
      kind: "random",
      key: "flat",
      label: ROOT_LABELS["flat"] ?? "Flat",
      hint: "A random flat tiling.",
      // the same hexagon the old Flat entry showed
      icon: "hex",
    });
  }
  if (randomPool("3d").length > 0) {
    entries.push({
      kind: "random",
      key: "3d",
      label: "3D",
      hint: "A random manifold, sphere or polyhedron.",
      icon: "3d",
    });
  }
  return entries;
}

let entries: Map<string, ModeEntry> | null = null;

/** The menu row a board has wherever the tree lists it — its icon and, for a
 * 2-uniform tiling, its notation — for the places that list boards outside
 * their page (the home page's Favourites). `null` for a board the menu does not
 * reach (a mode this build has not got, or a blocked one stored before). The
 * first page a board appears on wins; the walk is done once. */
export function menuEntryFor(mode: string): ModeEntry | null {
  if (!entries) {
    const found = new Map<string, ModeEntry>();
    const add = (e: ModeEntry): void => {
      if (!found.has(e.mode)) found.set(e.mode, e);
    };
    const addPicker = (surfaceKey: string): void => {
      const picker = pickerFor(surfaceKey);
      picker.tilings.forEach(add);
      for (const family of picker.families) family.modes.forEach(add);
    };
    for (const group of boardGroups()) {
      if (group.kind === "picker") addPicker(group.surfaceKey);
      else if (group.kind === "manifolds") group.surfaces.forEach((s) => addPicker(s.key));
      else for (const m of group.modes) add({ mode: m, label: MODE_LABELS[m] ?? m, icon: m });
    }
    entries = found;
  }
  return entries.get(mode) ?? null;
}
