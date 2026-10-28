import {
  MENU,
  MENU_FAMILY_LABELS,
  MODE_LABELS,
  SOLID_GROUPS,
  SURFACES,
  menuFamilies,
  menuFamilyRows,
  menuGroupFamilies,
  menuSubfamilies,
  menuSubfamilyRows,
  menuTilingRows,
} from "../boards/catalog";
import { randomPool } from "../boards/randomBoard";
import { hasMode } from "../boards/presets";

// How the catalogue is grouped for a player picking a board: the quick-play
// entries, then the geometry groups (Flat, Flat manifolds, Hyperbolic, Sphere,
// Solids and Volumes), each down to its boards. Two menus are drawn from it — the home page
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

/** A group whose page is a submenu per family rather than one list of boards:
 * Hyperbolic, split into Regular and Uniform (`menuSubfamilies`). */
export interface FamiliesGroup {
  key: string;
  label: string;
  kind: "families";
  families: Family[];
}

export type Group = PickerGroup | ManifoldGroup | ModeGroup | FamiliesGroup;

/** One of the quick-play entries. `mode` opens that board; `random`
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

/** A family lifted off the plane's picker as a group of its own: one list of
 * boards, or a submenu per sub-family where it is split (`menuSubfamilies`). */
function familyGroup(key: string): Group {
  const label = MENU_FAMILY_LABELS[key] ?? key;
  const subs = menuSubfamilies(key);
  if (subs.length === 0) {
    return { key, label, kind: "modes", modes: menuFamilyRows(key, "flat").map((r) => r.mode) };
  }
  const families: Family[] = [];
  for (const sub of subs) {
    const modes = builtRows(menuSubfamilyRows(key, sub, "flat"));
    if (modes.length > 0) families.push({ key: sub, label: MENU_FAMILY_LABELS[sub] ?? sub, modes });
  }
  return { key, label, kind: "families", families };
}

/** The solid groups gathered onto the one Solids page, a submenu each. The
 * shared table (`menu.solidGroups`) keeps them as groups of their own -- an
 * achievement, a board's family in its info window -- and so does the pygame
 * menu; only this menu nests them, so the polyhedra do not take four of the
 * Custom rows. Sphere and Volumes stay rows of their own. */
const SOLIDS_PAGE = ["platonic", "archimedean", "catalan", "polyhedra"];

/** The solid groups in the shared table's order: each a flat list of boards,
 * except the `SOLIDS_PAGE` ones, which become one families group standing
 * where the first of them would. */
function solidGroups(): Group[] {
  const groups: Group[] = [];
  let solids: FamiliesGroup | null = null;
  for (const g of SOLID_GROUPS) {
    if (!SOLIDS_PAGE.includes(g.key)) {
      groups.push({ key: g.key, label: g.label, kind: "modes", modes: [...g.modes] });
      continue;
    }
    if (!solids) {
      solids = { key: "solids", label: "Solids", kind: "families", families: [] };
      groups.push(solids);
    }
    const modes = builtRows(g.modes.map((m) => ({ mode: m, label: MODE_LABELS[m] ?? m, icon: m })));
    if (modes.length > 0) solids.families.push({ key: g.key, label: g.label, modes });
  }
  return groups;
}

/** The geometry groups — the desktop sidebar's rows and the phone's Custom
 * page — with every group this build has nothing in left out. */
export function boardGroups(): Group[] {
  const groups: Group[] = [
    { key: "flat", label: ROOT_LABELS["flat"] ?? "Flat", kind: "picker", surfaceKey: "flat" },
    {
      key: "manifolds",
      label: ROOT_LABELS["manifolds"] ?? "Flat manifolds",
      kind: "manifolds",
      surfaces: manifoldSurfaces(),
    },
    // The families lifted off the plane's picker (Hyperbolic), after the
    // plane's flat relatives and before the curved solids.
    ...menuGroupFamilies("flat").map((key): Group => familyGroup(key)),
    // The solid pages come off the shared table rather than being spelled
    // out here. (The shaped flat boards live under Flat › Shaped boards.)
    ...solidGroups(),
  ];
  return groups.filter((g) => {
    if (g.kind === "modes") return (g.modes = g.modes.filter(hasMode)).length > 0;
    if (g.kind === "manifolds") return g.surfaces.length > 0;
    if (g.kind === "families") return g.families.length > 0;
    const picker = pickerFor(g.surfaceKey);
    return picker.tilings.length > 0 || picker.families.length > 0;
  });
}

/** Classic (which opens one particular board straight away) and one random
 * board from each pool — flat, 3D and hyperbolic — the entries the phone home
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
  if (randomPool("hyperbolic").length > 0) {
    entries.push({
      kind: "random",
      key: "hyperbolic",
      label: MENU_FAMILY_LABELS["hyperbolic"] ?? "Hyperbolic",
      hint: "A random tiling of the hyperbolic plane.",
      // {5,4} with seams, not the family row's {7,3} (ui/icons.ts)
      icon: "hyperbolic-home",
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
      else if (group.kind === "families") for (const f of group.families) f.modes.forEach(add);
      else for (const m of group.modes) add({ mode: m, label: MODE_LABELS[m] ?? m, icon: m });
    }
    entries = found;
  }
  return entries.get(mode) ?? null;
}
