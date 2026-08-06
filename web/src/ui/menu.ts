import { screens } from "../config/screens";
import {
  FAMILY_LABELS,
  MENU,
  MODE_LABELS,
  POLYHEDRA_MODES,
  SPHERE_MODES,
  SURFACES,
  familyRows,
  pickerFamilies,
} from "../boards/catalog";
import { MODES } from "../boards/presets";
import { clearBestTimes } from "../leaderboard";
import { renderBestTimes } from "./bestTimes";
import { menuIcon } from "./icons";
import {
  GEAR_ICON,
  renderCellStylePicker,
  renderSettings,
  renderSoundPicker,
  renderThemePicker,
  type SettingsHost,
} from "./settings";

// Geometry-first menu, mirroring the pygame MenuScreen (gui.py). The home page
// lists Classic, Flat, Flat manifolds, Sphere, Polyhedra. Classic launches flat
// squares straight away; Flat and every flat manifold (cylinder, Möbius, Klein,
// torus) open the same tiling picker — the Regular, Uniform, Laves and
// (plane-only) Aperiodic families as submenus, then a Random entry. The plane
// is reached through Flat rather than repeated in the manifolds list; its
// Regular page also carries the shaped boards (a triangular or hexagonal
// outline instead of the default rectangle). Sphere and Polyhedra list their
// finished boards. Title, difficulty row and theme come from the shared
// UI-screen config.

export interface MenuSelection {
  mode: string;
  difficulty: string;
}

const ROOT_LABELS = MENU.rootLabels as Record<string, string>;
const MANIFOLD_ORDER = MENU.manifoldOrder as string[];
const MANIFOLD_LABELS = MENU.manifoldLabels as Record<string, string>;

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

/** The tiling picker for a surface: the families (regular, uniform, dual and,
 * on the plane, aperiodic) that have any built modes on that surface. */
interface Picker {
  families: Family[];
}

/** Every mode reachable through a surface's picker — the pool the Random entry
 * draws from (mirrors catalog.py picker_modes). */
function pickerModes(picker: Picker): string[] {
  return picker.families.flatMap((f) => f.modes.map((m) => m.mode));
}

/** The one-line description of a surface's picker: the families available on
 * it, so the hint reflects everything reachable through it. */
function pickerHint(surfaceKey: string): string {
  return pickerFor(surfaceKey)
    .families.map((f) => f.label)
    .join(" · ");
}

function pickerFor(surfaceKey: string): Picker {
  const families: Family[] = [];
  for (const key of pickerFamilies(surfaceKey)) {
    const modes = familyRows(key, surfaceKey).filter((r) => MODES.includes(r.mode));
    if (modes.length > 0) {
      families.push({ key, label: FAMILY_LABELS[key] ?? key, modes });
    }
  }
  return { families };
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
  private readonly groups: Group[];
  private readonly body: HTMLElement;
  /** The difficulty pill row, kept so a change from elsewhere (the store, or
   * another tab) can repaint it without rebuilding the menu. */
  private difficultyRowEl: HTMLElement | null = null;
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
      // Polyhedra: the solids (the shaped flat boards live under Flat › Regular).
      {
        key: "polyhedra",
        label: ROOT_LABELS["polyhedra"] ?? "Polyhedra",
        kind: "modes",
        modes: [...POLYHEDRA_MODES],
      },
    ];
    this.groups = groups.filter((g) => {
      if (g.kind === "modes") return (g.modes = g.modes.filter((m) => MODES.includes(m))).length > 0;
      if (g.kind === "manifolds") return g.surfaces.length > 0;
      return pickerFor(g.surfaceKey).families.length > 0;
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
    // The stored difficulty can have moved while the menu was away — a shared
    // link naming one, or another tab — so re-read it rather than trusting the
    // pills painted when the row was built.
    this.syncDifficultyRow();
    this.view();
  }
  hide(): void {
    this.root.hidden = true;
  }

  /** Repaint the current page from the store — used when the settings change
   * from outside the menu (another tab writing them). */
  refresh(): void {
    this.syncDifficultyRow();
    if (!this.root.hidden) this.view();
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

  /** A settings-page view of the preferences that re-renders `page` after any
   * change, so the tick, the switch and the Theme row's subtitle always show
   * the current value. */
  private settingsPageHost(page: () => void): SettingsHost {
    return {
      theme: this.settings.theme,
      difficulty: this.settings.difficulty,
      animations: this.settings.animations,
      cellStyle: this.settings.cellStyle,
      sound: this.settings.sound,
      haptics: this.settings.haptics,
      analytics: this.settings.analytics,
      setTheme: (key) => {
        this.settings.setTheme(key);
        page();
      },
      setDifficulty: (key) => {
        this.settings.setDifficulty(key);
        page();
      },
      setAnimations: (pref) => {
        this.settings.setAnimations(pref);
        page();
      },
      setCellStyle: (key) => {
        this.settings.setCellStyle(key);
        page();
      },
      setSound: (key) => {
        this.settings.setSound(key);
        page();
      },
      setHaptics: (on) => {
        this.settings.setHaptics(on);
        page();
      },
      setAnalytics: (on) => {
        this.settings.setAnalytics(on);
        page();
      },
    };
  }

  private renderSettingsPage(): void {
    const host = this.settingsPageHost(() => this.renderSettingsPage());
    // The difficulty row means nothing here; hide it and let the page have the
    // whole height.
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Settings", () => this.showRoot()),
      renderSettings(
        host,
        () => this.showThemePicker(),
        () => this.showBestTimes(),
        () => this.showCellStylePicker(),
        () => this.showSoundPicker(),
      ),
    );
  }

  /** The sound page — a page below settings, like the theme picker. */
  private showSoundPicker(): void {
    this.go(() => this.renderSoundPage());
  }

  private renderSoundPage(): void {
    const host = this.settingsPageHost(() => this.renderSoundPage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Sound", () => this.showSettings()),
      renderSoundPicker(host),
    );
  }

  /** The best-times page — a page below settings, like the theme picker. */
  private showBestTimes(): void {
    this.go(() => this.renderBestTimesPage());
  }

  private renderBestTimesPage(): void {
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Best times", () => this.showSettings()),
      renderBestTimes(() => {
        clearBestTimes();
        this.renderBestTimesPage(); // now the empty state
      }),
    );
  }

  private showThemePicker(): void {
    this.go(() => this.renderThemePage());
  }

  private renderThemePage(): void {
    const host = this.settingsPageHost(() => this.renderThemePage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Theme", () => this.showSettings()),
      renderThemePicker(host),
    );
  }

  /** The cell-style page — a page below settings, like the theme picker. */
  private showCellStylePicker(): void {
    this.go(() => this.renderCellStylePage());
  }

  private renderCellStylePage(): void {
    const host = this.settingsPageHost(() => this.renderCellStylePage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Cell style", () => this.showSettings()),
      renderCellStylePicker(host),
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
   * the Regular / Uniform / Laves (and, on the plane, Aperiodic) families as
   * submenus, then a Random entry. */
  private showPicker(label: string, surfaceKey: string, onBack: () => void): void {
    this.go(() => this.renderPicker(label, surfaceKey, onBack));
  }

  private renderPicker(label: string, surfaceKey: string, onBack: () => void): void {
    const picker = pickerFor(surfaceKey);
    const back = this.backRow(label, onBack);
    const list = document.createElement("ul");
    list.className = "menu-list";
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

  /** The surfaces that have any built tiling, in the shared manifold order
   * (Python's MANIFOLD_ORDER — the wrapped surfaces only; the plane is the
   * home page's Flat entry). */
  private manifoldSurfaces(): SurfaceEntry[] {
    const entries: SurfaceEntry[] = [];
    for (const key of MANIFOLD_ORDER) {
      const surface = SURFACES.get(key);
      if (!surface) continue;
      if (pickerFor(key).families.length > 0) {
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

  /** A family row. `key` is both the icon key and the row's stable handle in
   * the DOM, so a renamed family label does not move the selector. */
  private submenuRow(label: string, key: string, onClick: () => void): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    // menu-submenu lays the label and the › chevron out on one row.
    btn.className = "menu-entry menu-submenu";
    btn.dataset.submenu = key;
    const chevron = document.createElement("span");
    chevron.className = "menu-entry-chevron";
    chevron.textContent = "›";
    btn.append(iconEl(key), textBlock(label), chevron);
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
      this.onSelect({ mode, difficulty: this.settings.difficulty }),
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
      this.onSelect({ mode, difficulty: this.settings.difficulty }),
    );
    li.append(btn);
    return li;
  }

  /** The "Random" picker entry — resolves to a random mode from the
   * surface's picker pool at click time (mirrors gui.py's random choice). */
  private randomRow(pool: string[]): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.random = "tiling";
    btn.append(iconEl("random"), textBlock("Random"));
    btn.addEventListener("click", () => {
      const mode = pool[Math.floor(Math.random() * pool.length)];
      if (mode) this.onSelect({ mode, difficulty: this.settings.difficulty });
    });
    li.append(btn);
    return li;
  }

  /** The difficulty pills. The choice is persisted (settings.ts), so it is
   * read from the store rather than held here, and `syncDifficultyRow` repaints
   * the pills when it changes — from a click here, or from another tab. */
  private difficultyRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "menu-difficulty";
    for (const d of screens.difficulties) {
      const btn = document.createElement("button");
      btn.className = "difficulty-btn";
      btn.dataset.key = d.key;
      btn.textContent = d.label;
      btn.addEventListener("click", () => {
        this.settings.setDifficulty(d.key);
        this.syncDifficultyRow();
      });
      row.append(btn);
    }
    this.difficultyRowEl = row;
    this.syncDifficultyRow();
    return row;
  }

  private syncDifficultyRow(): void {
    const active = this.settings.difficulty;
    for (const b of this.difficultyRowEl?.querySelectorAll(".difficulty-btn") ?? []) {
      b.classList.toggle("active", (b as HTMLElement).dataset["key"] === active);
    }
  }
}
