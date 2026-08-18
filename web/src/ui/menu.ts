import { screens } from "../config/screens";
import {
  MENU,
  MENU_FAMILY_HINTS,
  MENU_FAMILY_LABELS,
  MODE_LABELS,
  SOLID_GROUPS,
  SURFACES,
  flatMenuModes,
  menuFamilies,
  menuFamilyRows,
  menuTilingRows,
  threeDMenuModes,
} from "../boards/catalog";
import {
  blockedExplanation,
  fairnessHint,
  modeFairness,
  pickWeighted,
} from "../boards/fairness";
import { hasMode } from "../boards/presets";
import { clearBestTimes } from "../leaderboard";
import { renderBestTimes } from "./bestTimes";
import { HELP_ICON, renderHelp } from "./help";
import { menuIcon } from "./icons";
import {
  GEAR_ICON,
  renderSchemePicker,
  renderSettings,
  renderSoundPicker,
  renderThemePicker,
  type SettingsHost,
} from "./settings";

// Play-first menu. The home page is Classic (flat squares, launched straight
// away), Flat and 3D — one tap each for a random board from that half of the
// catalogue — and Custom, which opens the geometry-first tree the pygame
// MenuScreen (gui.py) shows at its root: Flat, Flat manifolds, Sphere,
// Polyhedra. The plane and every flat manifold (cylinder, Möbius, Klein,
// torus) open the same tiling picker: the three regular tilings promoted to
// the top, then the Uniform, Laves, Isogonal, Congruent-rectangles and
// (plane-only) Aperiodic and Fractals families as submenus. On the plane one
// more submenu holds the shaped boards — the same regular tilings cut to a
// triangular or hexagonal outline instead of the default rectangle. Sphere and
// Polyhedra list their finished boards. Title, difficulty row and theme come
// from the shared UI-screen config; the header's gear and ? open the settings
// and how-to-play pages.

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

/** The tiling picker for a surface: the regular tilings it carries, promoted
 * to rows of their own, then the families (uniform, dual and, on the plane,
 * the shaped boards, aperiodic and fractals) with any built modes on it. */
interface Picker {
  tilings: ModeEntry[];
  families: Family[];
}

/** The one-line description of a surface's picker: what is on its page — the
 * promoted tilings and then the families — so the hint reflects everything
 * reachable through it. */
function pickerHint(surfaceKey: string): string {
  const picker = pickerFor(surfaceKey);
  const labels = [...picker.tilings, ...picker.families].map((r) => r.label);
  return labels.join(" · ");
}

/** Family rows whose icon is not their own key. The `regular` family no longer
 * holds the regular tilings (they are promoted to rows of their own), so the
 * pygame Regular page's tri/square/hex trio would misname it — and that trio
 * is the home page's Custom glyph. It shows a shaped board instead: what it
 * actually holds. */
const FAMILY_ICONS: Record<string, string> = {
  regular: "hexhex",
};

/** What each solid page holds, in a line. Listing the boards instead (which is
 * what `groupHint` does for a mode group) runs to thirteen names on the Catalan
 * page and reads as a wall rather than a description. */
const SOLID_GROUP_HINTS: Record<string, string> = {
  sphere: "Tilings of the sphere itself",
  platonic: "The five regular solids",
  catalan: "The thirteen duals of the Archimedean solids",
  polyhedra: "Hollow frames, and pyramids stitched into terraces",
};

/** Rows of a picker, dropping the modes this build has not got. */
function builtRows(rows: readonly ModeEntry[]): ModeEntry[] {
  return rows.filter((r) => hasMode(r.mode));
}

function pickerFor(surfaceKey: string): Picker {
  const families: Family[] = [];
  for (const key of menuFamilies(surfaceKey)) {
    const modes = builtRows(menuFamilyRows(key, surfaceKey));
    if (modes.length > 0) {
      families.push({ key, label: MENU_FAMILY_LABELS[key] ?? key, modes });
    }
  }
  return { tilings: builtRows(menuTilingRows(surfaceKey)), families };
}

/** A home-page random pool, filtered to the modes this build has got. */
function randomPool(modes: string[]): string[] {
  return modes.filter(hasMode);
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
      // The four solid pages -- Sphere, Platonic solids, Catalan solids and
      // Polyhedra -- are one flat board list each, so they all come off the
      // shared table rather than being spelled out here. (The shaped flat
      // boards live under Flat › Non-square boards.)
      ...SOLID_GROUPS.map((g): Group => ({
        key: g.key,
        label: g.label,
        kind: "modes",
        modes: [...g.modes],
      })),
    ];
    this.groups = groups.filter((g) => {
      if (g.kind === "modes") return (g.modes = g.modes.filter(hasMode)).length > 0;
      if (g.kind === "manifolds") return g.surfaces.length > 0;
      const picker = pickerFor(g.surfaceKey);
      return picker.tilings.length > 0 || picker.families.length > 0;
    });

    this.root = document.createElement("section");
    this.root.className = "menu";

    this.body = document.createElement("div");
    this.body.className = "menu-body";

    this.root.append(this.header(), this.body, this.difficultyRow());
    this.showRoot();
  }

  /** The title row: the how-to-play ? at the left edge, the title, the settings
   * gear at the right edge. One button per side rather than both on the right —
   * two buttons stacked on one side cost the title twice the width, and on a
   * narrow phone "Hypersweeper" is a single unbreakable word that then does not
   * fit on one line. Split, the two sides balance each other, so the title stays
   * centred on the screen with the most room a header row can give it. */
  private header(): HTMLElement {
    const header = document.createElement("div");
    header.className = "menu-header";

    const title = document.createElement("h1");
    title.className = "menu-title";
    title.textContent = screens.menu.title;

    const lead = document.createElement("div");
    lead.className = "menu-header-actions menu-header-lead";
    lead.append(this.headerButton("help", "How to play", HELP_ICON, () => this.showHelp()));

    const actions = document.createElement("div");
    actions.className = "menu-header-actions";
    actions.append(
      this.headerButton("settings", "Settings", GEAR_ICON, () => this.showSettings()),
    );

    header.append(lead, title, actions);
    return header;
  }

  private headerButton(
    action: string,
    label: string,
    icon: string,
    onClick: () => void,
  ): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "menu-header-btn";
    btn.dataset["action"] = action;
    btn.setAttribute("aria-label", label);
    btn.innerHTML = icon;
    btn.addEventListener("click", onClick);
    return btn;
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
    this.render();
  }
  hide(): void {
    this.root.hidden = true;
  }

  /** Repaint the current page from the store — used when the settings change
   * from outside the menu (another tab writing them). */
  refresh(): void {
    this.syncDifficultyRow();
    if (!this.root.hidden) this.render();
  }

  /** Paint the current page.
   *
   * `settings-open` (which hides the difficulty block, since those pages select
   * no board) is cleared here and re-added by each page that wants it, so it is
   * re-derived on *every* render rather than only on navigation. It used to be
   * cleared in `go` alone, which left it stale on any path that renders without
   * navigating: opening how-to-play over a live board sets it outside `go`, and
   * the next `show()` then painted the home page with no difficulty row. */
  private render(): void {
    this.root.classList.remove("settings-open");
    this.view();
  }

  /** Render `view` and remember it as the page to restore on `show()`. */
  private go(view: () => void): void {
    this.view = view;
    this.render();
  }

  private showRoot(): void {
    this.go(() => this.renderRoot());
  }

  /** The settings page — one more menu page rather than a modal, so it reuses
   * the back row, the card rows and the scrolling body. */
  private showSettings(): void {
    this.go(() => this.renderSettingsPage());
  }

  /** The how-to-play page — a page off the home row, built like settings. */
  private showHelp(): void {
    this.go(() => this.renderHelpPage());
  }

  /** The same page, opened over a live board by the header's help button.
   *
   * Deliberately *not* through `go()`: `view` is the page to restore when the
   * board is finally left, and that must stay the picker the game was launched
   * from rather than becoming this. `onBack` returns to the board instead of to
   * the home page, so the game survives a look at the rules. */
  showHelpOverGame(onBack: () => void): void {
    this.root.hidden = false;
    this.root.classList.add("settings-open");
    this.body.replaceChildren(this.backRow("How to play", onBack), renderHelp());
  }

  /** The page a blocked board's row opens instead of a game.
   *
   * It is a page rather than a dead row or a hidden one: a row that does
   * nothing when tapped reads as a bug, and dropping the board from the menu
   * would make the catalogue lie about which tilings are built. Saying why is
   * the only honest option, and the why is interesting. */
  private showBlocked(mode: string, label: string): void {
    const back = this.view;
    this.root.classList.add("settings-open");
    const heading = document.createElement("h2");
    heading.className = "menu-difficulty-heading";
    heading.textContent = `${label} — not playable`;
    const body = document.createElement("p");
    body.className = "menu-blocked-body";
    body.textContent = blockedExplanation(mode, this.settings.difficulty);
    const wrap = document.createElement("div");
    wrap.className = "menu-blocked";
    wrap.dataset.mode = mode;
    wrap.append(heading, body);
    this.body.replaceChildren(
      this.backRow(label, () => {
        this.view = back;
        this.render();
      }),
      wrap,
    );
  }

  private renderHelpPage(): void {
    // Static text: the difficulty row means nothing here either.
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("How to play", () => this.showRoot()),
      renderHelp(),
    );
  }

  /** A settings-page view of the preferences that re-renders `page` after any
   * change, so the tick, the switch and the Theme row's subtitle always show
   * the current value. */
  private settingsPageHost(page: () => void): SettingsHost {
    return {
      theme: this.settings.theme,
      scheme: this.settings.scheme,
      difficulty: this.settings.difficulty,
      animations: this.settings.animations,
      sound: this.settings.sound,
      volume: this.settings.volume,
      haptics: this.settings.haptics,
      backgrounds: this.settings.backgrounds,
      analytics: this.settings.analytics,
      setTheme: (key) => {
        this.settings.setTheme(key);
        page();
      },
      setScheme: (pref) => {
        this.settings.setScheme(pref);
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
      setBackgrounds: (on) => {
        this.settings.setBackgrounds(on);
        page();
      },
      setSound: (key) => {
        this.settings.setSound(key);
        page();
      },
      // No re-render: this arrives from a slider the player is still holding,
      // and rebuilding the page would pull it out from under them.
      setVolume: (level) => {
        this.settings.setVolume(level);
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
        () => this.showSchemePicker(),
        () => this.showBestTimes(),
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

  /** The colour scheme page — the theme picker's twin, one level below
   * settings in the same way. */
  private showSchemePicker(): void {
    this.go(() => this.renderSchemePage());
  }

  private renderSchemePage(): void {
    const host = this.settingsPageHost(() => this.renderSchemePage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Colour scheme", () => this.showSettings()),
      renderSchemePicker(host),
    );
  }

  /** The home page: Classic, one random board from each half of the
   * catalogue, and Custom for the whole tree. */
  private renderRoot(): void {
    const list = document.createElement("ul");
    list.className = "menu-list";
    // Classic — flat squares, launched straight away (gui.py MenuScreen).
    if (hasMode("square")) {
      list.append(
        this.launchRow(
          "square",
          ROOT_LABELS["classic"] ?? "Classic",
          "Flat squares — the original.",
          "classic",
        ),
      );
    }
    const flat = randomPool(flatMenuModes());
    if (flat.length > 0) {
      list.append(
        this.randomRow(
          "flat",
          flat,
          ROOT_LABELS["flat"] ?? "Flat",
          "A random flat tiling.",
          // the same hexagon the old Flat entry showed
          "hex",
        ),
      );
    }
    const threeD = randomPool(threeDMenuModes());
    if (threeD.length > 0) {
      list.append(
        this.randomRow("3d", threeD, "3D", "A random manifold, sphere or polyhedron.", "3d"),
      );
    }
    if (this.groups.length > 0) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "menu-entry";
      btn.dataset.group = "custom";
      btn.append(
        iconEl("custom"),
        textBlock("Custom", this.groups.map((g) => g.label).join(" · ")),
      );
      btn.addEventListener("click", () => this.showCustom());
      li.append(btn);
      list.append(li);
    }
    this.body.replaceChildren(list);
  }

  private showCustom(): void {
    this.go(() => this.renderCustom());
  }

  /** The Custom page: pick a geometry — the plane, a flat manifold, the
   * sphere or a polyhedron — and drill down from there. */
  private renderCustom(): void {
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const group of this.groups) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "menu-entry";
      btn.dataset.group = group.key;
      // The "Flat" entry (which opens the tiling picker) shows a hexagon; the
      // flat-plane surface keeps its square icon in the manifolds list.
      btn.append(
        iconEl(group.key === "flat" ? "hex" : group.key),
        textBlock(group.label, this.groupHint(group)),
      );
      btn.addEventListener("click", () => this.showGroup(group));
      li.append(btn);
      list.append(li);
    }
    this.body.replaceChildren(this.backRow("Custom", () => this.showRoot()), list);
  }

  private groupHint(group: Group): string {
    if (group.kind === "modes") {
      return SOLID_GROUP_HINTS[group.key] ?? group.modes.map((m) => MODE_LABELS[m] ?? m).join(" · ");
    }
    if (group.kind === "manifolds") return group.surfaces.map((s) => s.label).join(" · ");
    return pickerHint(group.surfaceKey);
  }

  private showGroup(group: Group): void {
    if (group.kind === "picker") {
      this.showPicker(group.label, group.surfaceKey, () => this.showCustom());
      return;
    }
    this.go(() => this.renderGroup(group));
  }

  private renderGroup(group: Group): void {
    if (group.kind === "picker") {
      this.showPicker(group.label, group.surfaceKey, () => this.showCustom());
      return;
    }
    const back = this.backRow(group.label, () => this.showCustom());
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
   * the three regular tilings as rows of their own, then the Uniform / Laves /
   * Isogonal / Congruent-rectangles (and, on the plane, Non-square boards,
   * Aperiodic and Fractals) families as submenus. */
  private showPicker(label: string, surfaceKey: string, onBack: () => void): void {
    this.go(() => this.renderPicker(label, surfaceKey, onBack));
  }

  private renderPicker(label: string, surfaceKey: string, onBack: () => void): void {
    const picker = pickerFor(surfaceKey);
    const back = this.backRow(label, onBack);
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const tiling of picker.tilings) {
      list.append(this.entryRow(tiling.mode, tiling.label, tiling.icon));
    }
    for (const family of picker.families) {
      list.append(
        this.submenuRow(family.label, family.key, () =>
          this.showFamily(family, () => this.showPicker(label, surfaceKey, onBack)),
        ),
      );
    }
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
  private submenuRow(
    label: string,
    key: string,
    onClick: () => void,
    hint: string | undefined = MENU_FAMILY_HINTS[key],
  ): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    // menu-submenu lays the label and the › chevron out on one row.
    btn.className = "menu-entry menu-submenu";
    btn.dataset.submenu = key;
    const chevron = document.createElement("span");
    chevron.className = "menu-entry-chevron";
    chevron.textContent = "›";
    // "Laves" and "Isogonal" name a classification, not a look — the hint is
    // what tells a player choosing a board what they would be playing on.
    // Defaults to the tiling-family hint by key; the Polyhedra groups pass
    // their own (`MENU_FAMILY_HINTS` knows nothing about them).
    btn.append(iconEl(FAMILY_ICONS[key] ?? key), textBlock(label, hint), chevron);
    btn.addEventListener("click", onClick);
    li.append(btn);
    return li;
  }

  private entryRow(mode: string, label: string, icon = mode): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.mode = mode;
    // A board the tiling is against is graded here rather than left to feel
    // like bad luck at the table. The mark goes on the row because the
    // difficulty pills are at the foot of the page: by the time one is chosen
    // the board is already picked. A blocked board keeps its row -- the tiling
    // is still worth looking at, and hiding it would only make the catalogue
    // lie about what it holds -- but the row opens the explanation instead of
    // a game.
    const level = modeFairness(mode);
    const hint = fairnessHint(level);
    btn.append(iconEl(icon), textBlock(label, hint));
    if (level !== "ok") {
      btn.dataset.fairness = level;
      const warn = document.createElement("span");
      warn.className = "menu-entry-warning";
      warn.textContent = level === "blocked" ? "⛔" : "⚠";
      warn.setAttribute("aria-label", hint ?? "");
      btn.append(warn);
    }
    if (level === "blocked") {
      // Deliberately *not* `aria-disabled`: the row is a working control that
      // opens the explanation, and claiming it is disabled would both lie to a
      // screen reader and tell every actionability check not to click it.
      btn.addEventListener("click", () => this.showBlocked(mode, label));
    } else {
      btn.addEventListener("click", () =>
        this.onSelect({ mode, difficulty: this.settings.difficulty }),
      );
    }
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

  /** A home-page random entry (Flat, 3D) — resolves to a random mode from its
   * pool at click time, so it is a different board every tap (mirrors gui.py's
   * random choice). */
  private randomRow(
    key: string,
    pool: string[],
    label: string,
    hint: string,
    icon: string,
  ): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.random = key;
    btn.append(iconEl(icon), textBlock(label, hint));
    btn.addEventListener("click", () => {
      // Weighted, not uniform: the boards whose tiling forces guesses are
      // still in the pool -- they are real boards and some players like them
      // -- but a tap meant to produce a nice surprise should not land on one
      // as often as on a board that can actually be solved.
      const mode = pickWeighted(pool);
      if (mode) this.onSelect({ mode, difficulty: this.settings.difficulty });
    });
    li.append(btn);
    return li;
  }

  /** The difficulty pills. The choice is persisted (settings.ts), so it is
   * read from the store rather than held here, and `syncDifficultyRow` repaints
   * the pills when it changes — from a click here, or from another tab. */
  /** The persistent difficulty picker: a heading and the three pills.
   *
   * The heading is not decoration — without it the home page ends in three bare
   * words with nothing saying what they select, which is the first thing a new
   * player sees. It deliberately carries no board sizes: `data/presets.json`
   * takes positional arguments per builder (`square` easy is `[9, 9, 10, 32]`,
   * `triangle` easy is `[8, 10, 60]`), so there is no mine count to read out
   * that would be right for more than one of the boards this row applies to. */
  private difficultyRow(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "menu-difficulty-block";
    const heading = document.createElement("h2");
    // Its own class rather than `settings-heading`: that one is the settings
    // page's section heading, and sharing it would make `.settings-heading` an
    // ambiguous selector on every page (the difficulty row is always mounted).
    heading.className = "menu-difficulty-heading";
    heading.textContent = "Difficulty";

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
    wrap.append(heading, row);
    return wrap;
  }

  private syncDifficultyRow(): void {
    const active = this.settings.difficulty;
    for (const b of this.difficultyRowEl?.querySelectorAll(".difficulty-btn") ?? []) {
      b.classList.toggle("active", (b as HTMLElement).dataset["key"] === active);
    }
  }
}
