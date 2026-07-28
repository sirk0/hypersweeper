import { screens } from "../config/screens";
import {
  DUAL_ARCH,
  FAMILY_LABELS,
  MENU,
  MODE_LABELS,
  OTHER_MODES,
  SHAPED_MODES,
  SPHERE_MODES,
  SURFACES,
  TILINGS_BY_KEY,
  UNIFORM_ARCH,
  modeFor,
  tilingAllows,
} from "../boards/catalog";
import { MODES } from "../boards/presets";
import { menuIcon } from "./icons";
import { GEAR_ICON, renderSettings, type SettingsHost } from "./settings";

// Geometry-first menu, mirroring the pygame MenuScreen (gui.py). The home page
// lists Classic, Flat, Flat manifolds, Sphere, Other. Classic launches flat
// squares straight away; Flat and every flat manifold (plane, cylinder, Möbius,
// Klein, torus) open the same tiling picker — the regular tilings directly, the
// Uniform / Dual-uniform / (plane-only) Aperiodic families as submenus, then a
// Random tiling entry. Sphere and Other list their finished boards (Other also
// carries the shaped flat boards). Title, difficulty row and theme come from the
// shared UI-screen config.

export interface MenuSelection {
  mode: string;
  difficulty: string;
}

const ROOT_LABELS = MENU.rootLabels as Record<string, string>;
const MANIFOLD_ORDER = MENU.manifoldOrder as string[];
const MANIFOLD_LABELS = MENU.manifoldLabels as Record<string, string>;

// The regular tilings shown directly in every picker.
const PICKER_REGULAR = MENU.pickerRegular as string[];
// The aperiodic tilings exist on the plane only; the flat picker carries them
// as one more family submenu after the uniform / dual ones (M5).
const APERIODIC = MENU.aperiodic as string[];

interface ModeEntry {
  mode: string;
  label: string;
  /** The menu-icon key for the row: the tiling key for a wrapped tiling (so
   * e.g. hexagons look the same on every surface), the mode itself
   * otherwise. Matches the icon keys the pygame menu draws. */
  icon: string;
}

interface Family {
  key: string;
  label: string;
  modes: ModeEntry[];
}

/** The tiling picker for a surface: the regular tilings shown directly, then
 * the uniform and dual families (and, on the plane, aperiodic) that have any
 * built modes on that surface. */
interface Picker {
  direct: ModeEntry[];
  families: Family[];
}

/** Every mode reachable through a surface's picker — the pool the Random entry
 * draws from (mirrors catalog.py picker_modes). */
function pickerModes(picker: Picker): string[] {
  return [
    ...picker.direct.map((e) => e.mode),
    ...picker.families.flatMap((f) => f.modes.map((m) => m.mode)),
  ];
}

/** The one-line description of a surface's picker: the regular tilings shown
 * directly, then each family (uniform / dual / aperiodic) available on it — so
 * the hint reflects everything reachable, not just the three basic tilings. */
function pickerHint(surfaceKey: string): string {
  const picker = pickerFor(surfaceKey);
  return [
    ...picker.direct.map((e) => e.label),
    ...picker.families.map((f) => f.label),
  ].join(" · ");
}

/** The built modes for a set of tiling keys on a surface, in the given order. */
function tilingModes(keys: string[], surfaceKey: string): ModeEntry[] {
  const surface = SURFACES.get(surfaceKey);
  if (!surface) return [];
  const out: ModeEntry[] = [];
  for (const key of keys) {
    const tiling = TILINGS_BY_KEY.get(key);
    if (!tiling || !tilingAllows(tiling, surface)) continue;
    const mode = modeFor(key, surfaceKey);
    if (MODES.includes(mode)) out.push({ mode, label: tiling.label, icon: key });
  }
  return out;
}

function pickerFor(surfaceKey: string): Picker {
  const direct = tilingModes(PICKER_REGULAR, surfaceKey);
  const families: Family[] = [];
  for (const [key, keys] of [
    ["uniform", UNIFORM_ARCH],
    ["dual", DUAL_ARCH],
  ] as const) {
    const modes = tilingModes(keys, surfaceKey);
    if (modes.length > 0) {
      families.push({ key, label: FAMILY_LABELS[key] ?? key, modes });
    }
  }
  if (surfaceKey === "flat") {
    const modes = APERIODIC.filter((m) => MODES.includes(m)).map((mode) => ({
      mode,
      label: MODE_LABELS[mode] ?? mode,
      icon: mode,
    }));
    if (modes.length > 0) {
      families.push({ key: "aperiodic", label: FAMILY_LABELS["aperiodic"] ?? "Aperiodic", modes });
    }
  }
  return { direct, families };
}

interface SurfaceEntry {
  key: string;
  label: string;
}

interface PickerGroup {
  key: string;
  label: string;
  kind: "picker";
  surfaceKey: string;
}

interface ManifoldGroup {
  key: string;
  label: string;
  kind: "manifolds";
  surfaces: SurfaceEntry[];
}

interface ModeGroup {
  key: string;
  label: string;
  kind: "modes";
  modes: string[];
}

type Group = PickerGroup | ManifoldGroup | ModeGroup;

/** A menu row's icon (the same glyph the pygame menu draws for that key). */
function iconEl(key: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "menu-entry-icon";
  el.innerHTML = menuIcon(key);
  return el;
}

/** A row's label with its optional one-line hint underneath. */
function textBlock(label: string, hint?: string): HTMLElement {
  const box = document.createElement("span");
  box.className = "menu-entry-text";
  const labelEl = document.createElement("span");
  labelEl.className = "menu-entry-label";
  labelEl.textContent = label;
  box.append(labelEl);
  if (hint !== undefined) {
    const hintEl = document.createElement("span");
    hintEl.className = "menu-entry-hint";
    hintEl.textContent = hint;
    box.append(hintEl);
  }
  return box;
}

export class Menu {
  readonly root: HTMLElement;
  private difficulty = screens.defaultDifficulty;
  private readonly groups: Group[];
  private readonly body: HTMLElement;
  /** The page currently on screen, re-runnable so returning from a board
   * restores it (see `show`). */
  private view: () => void = () => this.renderRoot();

  constructor(
    private readonly onSelect: (sel: MenuSelection) => void,
    private readonly settings: SettingsHost,
  ) {
    const groups: Group[] = [
      { key: "flat", label: ROOT_LABELS["flat"] ?? "Flat", kind: "picker", surfaceKey: "flat" },
      {
        key: "manifolds",
        label: ROOT_LABELS["manifolds"] ?? "Flat manifolds",
        kind: "manifolds",
        surfaces: this.manifoldSurfaces(),
      },
      { key: "sphere", label: ROOT_LABELS["sphere"] ?? "Sphere", kind: "modes", modes: [...SPHERE_MODES] },
      // Other: the solids and, at the end, the shaped flat boards (triangle of
      // triangles, hexagon of hexagons) — matching Python's OTHER_MODES + SHAPED_MODES.
      {
        key: "other",
        label: ROOT_LABELS["other"] ?? "Other",
        kind: "modes",
        modes: [...OTHER_MODES, ...SHAPED_MODES],
      },
    ];
    this.groups = groups.filter((g) => {
      if (g.kind === "modes") return (g.modes = g.modes.filter((m) => MODES.includes(m))).length > 0;
      if (g.kind === "manifolds") return g.surfaces.length > 0;
      const picker = pickerFor(g.surfaceKey);
      return picker.direct.length + picker.families.length > 0;
    });

    this.root = document.createElement("section");
    this.root.className = "menu";

    this.body = document.createElement("div");
    this.body.className = "menu-body";

    this.root.append(this.header(), this.body, this.difficultyRow());
    this.showRoot();
  }

  /** The title row: the title, and the settings gear at its right edge. The
   * CSS balances the gear with an empty box of the same width on the left, so
   * the title stays centred on the screen. */
  private header(): HTMLElement {
    const header = document.createElement("div");
    header.className = "menu-header";

    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = screens.menu.title;

    const gear = document.createElement("button");
    gear.className = "menu-settings-btn";
    gear.dataset["action"] = "settings";
    gear.setAttribute("aria-label", "Settings");
    gear.innerHTML = GEAR_ICON;
    gear.addEventListener("click", () => this.showSettings());

    header.append(title, gear);
    return header;
  }

  /** Coming back from a board reopens the page the game was launched from
   * (the tiling picker, a family submenu, …) rather than resetting to the
   * home page — `view` re-renders whatever page is current. */
  show(): void {
    this.root.hidden = false;
    this.view();
  }
  hide(): void {
    this.root.hidden = true;
  }

  /** Render `view` and remember it as the page to restore on `show()`. Every
   * page but settings shows the difficulty row, so it is cleared here and the
   * settings page re-sets it. */
  private go(view: () => void): void {
    this.view = view;
    this.root.classList.remove("settings-open");
    view();
  }

  private showRoot(): void {
    this.go(() => this.renderRoot());
  }

  /** The settings page — one more menu page rather than a modal, so it reuses
   * the back row, the card rows and the scrolling body. */
  private showSettings(): void {
    this.go(() => this.renderSettingsPage());
  }

  private renderSettingsPage(): void {
    // Choosing a theme or flipping a toggle re-runs this page, so the tick and
    // the switch reflect the change immediately.
    const host: SettingsHost = {
      theme: this.settings.theme,
      animations: this.settings.animations,
      setTheme: (key) => {
        this.settings.setTheme(key);
        this.renderSettingsPage();
      },
      setAnimations: (pref) => {
        this.settings.setAnimations(pref);
        this.renderSettingsPage();
      },
    };
    // The difficulty row means nothing here; hide it and let the page have the
    // whole height.
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Settings", () => this.showRoot()),
      renderSettings(host),
    );
  }

  private renderRoot(): void {
    const list = document.createElement("ul");
    list.className = "menu-list";
    // Classic — flat squares, launched straight away (gui.py MenuScreen).
    if (MODES.includes("square")) {
      list.append(
        this.launchRow(
          "square",
          ROOT_LABELS["classic"] ?? "Classic",
          "Flat squares — the original.",
          "classic",
        ),
      );
    }
    for (const group of this.groups) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "menu-entry";
      btn.dataset.group = group.key;
      // The home "Flat" entry (which opens the tiling picker) shows a hexagon;
      // the flat-plane surface keeps its square icon in the manifolds list.
      btn.append(
        iconEl(group.key === "flat" ? "hex" : group.key),
        textBlock(group.label, this.groupHint(group)),
      );
      btn.addEventListener("click", () => this.showGroup(group));
      li.append(btn);
      list.append(li);
    }
    this.body.replaceChildren(list);
  }

  private groupHint(group: Group): string {
    if (group.kind === "modes") return group.modes.map((m) => MODE_LABELS[m] ?? m).join(" · ");
    if (group.kind === "manifolds") return group.surfaces.map((s) => s.label).join(" · ");
    return pickerHint(group.surfaceKey);
  }

  private showGroup(group: Group): void {
    if (group.kind === "picker") {
      this.showPicker(group.label, group.surfaceKey, () => this.showRoot());
      return;
    }
    this.go(() => this.renderGroup(group));
  }

  private renderGroup(group: Group): void {
    if (group.kind === "picker") {
      this.showPicker(group.label, group.surfaceKey, () => this.showRoot());
      return;
    }
    const back = this.backRow(group.label, () => this.showRoot());
    const list = document.createElement("ul");
    list.className = "menu-list";
    if (group.kind === "modes") {
      for (const mode of group.modes) list.append(this.entryRow(mode, MODE_LABELS[mode] ?? mode));
    } else {
      for (const surface of group.surfaces) list.append(this.surfaceRow(group, surface));
    }
    this.body.replaceChildren(back, list);
  }

  /** The shared tiling picker for a surface (the plane or a flat manifold):
   * regular tilings directly, then the uniform / dual (and, on the plane,
   * aperiodic) families as submenus, then a Random tiling entry. */
  private showPicker(label: string, surfaceKey: string, onBack: () => void): void {
    this.go(() => this.renderPicker(label, surfaceKey, onBack));
  }

  private renderPicker(label: string, surfaceKey: string, onBack: () => void): void {
    const picker = pickerFor(surfaceKey);
    const back = this.backRow(label, onBack);
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const entry of picker.direct) {
      list.append(this.entryRow(entry.mode, entry.label, entry.icon));
    }
    for (const family of picker.families) {
      list.append(
        this.submenuRow(family.label, family.key, () =>
          this.showFamily(family, () => this.showPicker(label, surfaceKey, onBack)),
        ),
      );
    }
    const pool = pickerModes(picker);
    if (pool.length > 0) list.append(this.randomRow(pool));
    this.body.replaceChildren(back, list);
  }

  private showFamily(family: Family, onBack: () => void): void {
    this.go(() => this.renderFamily(family, onBack));
  }

  private renderFamily(family: Family, onBack: () => void): void {
    const back = this.backRow(family.label, onBack);
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const entry of family.modes) {
      list.append(this.entryRow(entry.mode, entry.label, entry.icon));
    }
    this.body.replaceChildren(back, list);
  }

  private showSurface(group: ManifoldGroup, surface: SurfaceEntry): void {
    this.showPicker(surface.label, surface.key, () => this.showGroup(group));
  }

  /** The surfaces that have any built tiling, in the shared manifold order.
   * Matches Python's MANIFOLD_ORDER, which includes the plane ("Plain") ahead
   * of the wrapped surfaces. */
  private manifoldSurfaces(): SurfaceEntry[] {
    const entries: SurfaceEntry[] = [];
    for (const key of MANIFOLD_ORDER) {
      const surface = SURFACES.get(key);
      if (!surface) continue;
      const picker = pickerFor(key);
      if (picker.direct.length + picker.families.length > 0) {
        entries.push({ key, label: MANIFOLD_LABELS[key] ?? surface.label });
      }
    }
    return entries;
  }

  private backRow(label: string, onClick: () => void): HTMLElement {
    const back = document.createElement("button");
    back.className = "menu-entry menu-back";
    back.dataset.action = "back";
    const backLabel = document.createElement("span");
    backLabel.className = "menu-entry-label";
    backLabel.textContent = `‹ ${label}`;
    back.append(backLabel);
    back.addEventListener("click", onClick);
    return back;
  }

  private surfaceRow(group: ManifoldGroup, surface: SurfaceEntry): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.surface = surface.key;
    btn.append(iconEl(surface.key), textBlock(surface.label, pickerHint(surface.key)));
    btn.addEventListener("click", () => this.showSurface(group, surface));
    li.append(btn);
    return li;
  }

  private submenuRow(label: string, icon: string, onClick: () => void): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    // menu-submenu lays the label and the › chevron out on one row.
    btn.className = "menu-entry menu-submenu";
    btn.dataset.submenu = label;
    const chevron = document.createElement("span");
    chevron.className = "menu-entry-chevron";
    chevron.textContent = "›";
    btn.append(iconEl(icon), textBlock(label), chevron);
    btn.addEventListener("click", onClick);
    li.append(btn);
    return li;
  }

  private entryRow(mode: string, label: string, icon = mode): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.mode = mode;
    btn.append(iconEl(icon), textBlock(label));
    btn.addEventListener("click", () =>
      this.onSelect({ mode, difficulty: this.difficulty }),
    );
    li.append(btn);
    return li;
  }

  /** A root launch entry with a hint (e.g. Classic) — launches its mode on
   * click like entryRow, but shows a subtitle like a group row. */
  private launchRow(mode: string, label: string, hint: string, icon: string): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.mode = mode;
    btn.append(iconEl(icon), textBlock(label, hint));
    btn.addEventListener("click", () =>
      this.onSelect({ mode, difficulty: this.difficulty }),
    );
    li.append(btn);
    return li;
  }

  /** The "Random tiling" picker entry — resolves to a random mode from the
   * surface's picker pool at click time (mirrors gui.py's random choice). */
  private randomRow(pool: string[]): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.random = "tiling";
    btn.append(iconEl("random"), textBlock("Random tiling"));
    btn.addEventListener("click", () => {
      const mode = pool[Math.floor(Math.random() * pool.length)];
      if (mode) this.onSelect({ mode, difficulty: this.difficulty });
    });
    li.append(btn);
    return li;
  }

  private difficultyRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "menu-difficulty";
    for (const d of screens.difficulties) {
      const btn = document.createElement("button");
      btn.className = "difficulty-btn";
      btn.dataset.key = d.key;
      btn.textContent = d.label;
      btn.classList.toggle("active", d.key === this.difficulty);
      btn.addEventListener("click", () => {
        this.difficulty = d.key;
        for (const b of row.querySelectorAll(".difficulty-btn")) {
          b.classList.toggle("active", (b as HTMLElement).dataset.key === d.key);
        }
      });
      row.append(btn);
    }
    return row;
  }
}
