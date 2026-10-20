import { screens } from "../config/screens";
import { MENU_FAMILY_HINTS, MODE_LABELS, surfaceOf } from "../boards/catalog";
import {
  blockedExplanation,
  fairnessHint,
  modeFairness,
  type Fairness,
} from "../boards/fairness";
import { distortedDifficulties, distortionHint, isDistorted } from "../boards/distortion";
import { randomMode, type RandomKind } from "../boards/randomBoard";
import { clearAchievements, loadProgress, type Progress } from "../achievements";
import { clearBestTimes } from "../leaderboard";
import { clearCloudRecord, syncCloudRecord } from "../cloudRecord";
import { favourites, isFavourite, toggleFavourite } from "../favourites";
import { renderAchievements } from "./achievements";
import { renderBestTimes } from "./bestTimes";
import {
  boardGroups,
  menuEntryFor,
  pickerFor,
  quickPlayEntries,
  type Family,
  type Group,
  type ManifoldGroup,
  type SurfaceEntry,
} from "./boardTree";
import { HELP_ICON, renderHelp } from "./help";
import { menuIcon, previewIcon } from "./icons";
import {
  GEAR_ICON,
  renderAppIconPicker,
  renderSchemePicker,
  renderShapePicker,
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
// (plane-only) Aperiodic, Spirals and Fractals families as submenus. On the plane one
// more submenu holds the shaped boards — the same regular tilings cut to a
// triangular or hexagonal outline instead of the default rectangle. Sphere and
// Polyhedra list their finished boards. Title, difficulty row and theme come
// from the shared UI-screen config; the header's gear and ? open the settings
// and how-to-play pages.

export interface MenuSelection {
  mode: string;
  difficulty: string;
  /** Whether the board was *dealt* rather than picked — the home page's Flat
   * and 3D rows, which resolve to a mode at click time. Every other row names
   * its board, so it is left off. Two things read it: the win window highlights
   * a different action for a dealt board (ui/scoreDialog.ts), and the metrics
   * event records it as the start trigger (docs/agents/metrics.md). */
  random?: boolean;
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
  archimedean: "Regular polygons of two or three kinds, every corner alike",
  catalan: "The thirteen duals of the Archimedean solids",
  polyhedra: "Hollow frames, terraced pyramids and cubes laid in brick",
  volume: "A solid cube of cells — 26 neighbours, laid out slice by slice",
};

/** The sidebar key of the Quick start page — the desktop menu's own page, with
 * no phone equivalent (the phone lists these three as its home rows). */
const QUICK_START = "quickstart";

/** The favourite star: outlined when off, filled (`.menu-fav[aria-pressed]` in
 * styles.css) when on. Drawn rather than a ☆/★ character, whose two glyphs
 * differ in size and weight from one system font to the next. */
const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.36l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93z"/></svg>';

/** "Easy", "Easy and Hard", "Easy, Medium and Hard". */
function listWords(words: string[]): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

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
  /** The `.menu-difficulty-block` itself — a phone-width sibling of `.menu`,
   * or reparented into the current page's pane header on desktop (see
   * `paneHeader`). One element, moved rather than cloned, so every
   * `.difficulty-btn` selector in the e2e suite still finds exactly one. */
  private difficultyWrapperEl!: HTMLElement;
  /** The sidebar's own How to play / Settings buttons are the *same* elements
   * `header()` builds for the phone title row, moved between the two homes by
   * `placeHeaderButtons` rather than duplicated — so `data-action="help"` /
   * `"settings"` still resolves to one button at any width. */
  private helpBtn!: HTMLElement;
  private settingsBtn!: HTMLElement;
  private headerLeadEl!: HTMLElement;
  private headerActionsEl!: HTMLElement;
  private sidebarEl!: HTMLElement;
  private sidebarFooterEl!: HTMLElement;
  /** The sidebar key of the page on screen at desktop width, so its row can
   * be painted active and restored — derived, not persisted. */
  private selectedPage: string | null = null;
  /** The desktop two-pane branch (see `design_handoff_desktop_menu/README.md`):
   * a sidebar replaces the back stack and the content pane shows a card grid.
   * Below this width the phone column is untouched.
   *
   * The second clause is a tablet held upright (an iPad in portrait is 744 to
   * 834 wide): too narrow for the desktop rule, but with a screen's worth of
   * height that the 520px phone column left empty on either side. The height
   * floor keeps a phone on its side (844x390 and the like) on the phone column.
   *
   * The first clause's height floor does the same for the widest phones: a Pro
   * Max on its side is 932x430, wide enough for the desktop, but its cards are
   * taller than half the screen. Every phone on its side gets the phone
   * navigation instead, laid out as a rail beside the list (the
   * `max-height: 500px` landscape block in styles.css).
   * Must stay in step with the two `@media` rules in styles.css. */
  private readonly wideQuery = matchMedia(
    "(min-width: 900px) and (min-height: 501px), (min-width: 720px) and (min-height: 800px)",
  );
  /** The page currently on screen, re-runnable so returning from a board
   * restores it (see `show`). */
  private view: () => void = () => this.renderRoot();
  /** The win record, read once per render for the completion marks. */
  private progress: Progress | null = null;
  /** Whether the page on screen is the one carrying the Favourites section —
   * the phone home page or the desktop Quick start — so unstarring a board
   * there takes its row away at once. Set by those two pages per render. */
  private favouritesOnScreen = false;

  constructor(
    private readonly onSelect: (sel: MenuSelection) => void,
    private readonly settings: SettingsHost,
  ) {
    this.groups = boardGroups();

    this.root = document.createElement("section");
    this.root.className = "menu";

    this.body = document.createElement("div");
    this.body.className = "menu-body";

    this.sidebarEl = this.buildSidebar();
    this.root.append(this.header(), this.sidebarEl, this.body, this.difficultyRow());
    this.placeHeaderButtons();
    this.wideQuery.addEventListener("change", () => {
      this.placeHeaderButtons();
      this.render();
    });
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

    this.helpBtn = this.headerButton("help", "How to play", HELP_ICON, () => this.showHelp());
    this.settingsBtn = this.headerButton("settings", "Settings", GEAR_ICON, () =>
      this.showSettings(),
    );

    this.headerLeadEl = document.createElement("div");
    this.headerLeadEl.className = "menu-header-actions menu-header-lead";

    this.headerActionsEl = document.createElement("div");
    this.headerActionsEl.className = "menu-header-actions";

    header.append(this.headerLeadEl, title, this.headerActionsEl);
    return header;
  }

  /** Moves (never clones) the how-to-play / settings buttons between the
   * phone header and the desktop sidebar footer, so `data-action="help"` /
   * `"settings"` always resolves to exactly one element. Called once at
   * construction and again whenever the desktop breakpoint is crossed. */
  private placeHeaderButtons(): void {
    if (this.wideQuery.matches) {
      this.sidebarFooterEl.append(this.helpBtn, this.settingsBtn);
    } else {
      this.headerLeadEl.append(this.helpBtn);
      this.headerActionsEl.append(this.settingsBtn);
    }
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
    // Hidden at phone width (the header shows the icon alone); revealed by
    // `.menu-sidebar-footer .menu-header-btn-label` once this button is
    // moved into the desktop sidebar footer, which needs a visible label.
    const labelEl = document.createElement("span");
    labelEl.className = "menu-header-btn-label";
    labelEl.textContent = label;
    btn.append(labelEl);
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
   * from outside the menu (another tab writing them), and by `App.setTheme`,
   * which is what makes a theme switch repaint the rows behind the picker. */
  refresh(): void {
    this.rebuildSidebar();
    this.syncDifficultyRow();
    if (!this.root.hidden) this.render();
  }

  /** Rebuild the desktop sidebar in the icon palette now in force.
   *
   * It is the one part of the menu a re-render does not repaint: it is built
   * once and outlives every page, since only the pane content and the active
   * row change between them. But its rows carry menu glyphs, and a glyph is a
   * *string of SVG* with its colours already baked in (`ui/icons.ts`) — so
   * switching Classic to Sand left the whole geometry list in Classic's grey
   * while the cards beside it repainted.
   *
   * Two things live in the sidebar rather than being rebuilt with it, and both
   * are put back: the How to play / Settings buttons, which are *moved* into
   * its footer rather than cloned (`placeHeaderButtons`), and which row is
   * active (`syncSidebarActive`, off `selectedPage`). */
  private rebuildSidebar(): void {
    const next = this.buildSidebar();
    this.sidebarEl.replaceWith(next);
    this.sidebarEl = next;
    this.placeHeaderButtons();
    this.syncSidebarActive();
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
    // Same rule as `settings-open`, one level down: cleared on every render and
    // re-added by `paneHeader`, so the pane's own scroll layout is derived from
    // the page actually on screen rather than left over from the last one.
    this.body.classList.remove("paned");
    this.favouritesOnScreen = false;
    // Read once here rather than per row: a page lists up to thirty boards,
    // and the record changes only with a win, which is never while the menu is
    // up. `show()` comes back through here after one.
    this.progress = loadProgress();
    this.view();
    // On the phone width no page reparents the difficulty block into itself
    // (that only happens inside `paneHeader`, on desktop), so it can drift
    // off `.menu` if the window was ever wide since the last narrow render —
    // put it back rather than leaving it detached.
    if (!this.isWide()) this.root.append(this.difficultyWrapperEl);
  }

  /** Render `view` and remember it as the page to restore on `show()`. */
  private go(view: () => void): void {
    this.view = view;
    this.render();
    // A new page opens at its top. The body is one element for every page, so
    // its scroll otherwise carried over: on a phone on its side, a row tapped
    // low on one page opened the next one already scrolled past its back row.
    this.body.scrollTop = 0;
    this.riseIn();
  }

  /** Let a page the player just navigated to rise into place, row by row (the
   * `.menu-enter` rule in styles.css). Only on navigation: a page repainted for
   * a toggle on it stays put. Each row is told its place in the stagger. */
  private riseIn(): void {
    this.body.classList.remove("menu-enter");
    const rows = this.body.querySelectorAll<HTMLElement>(
      ".menu-list > li",
    );
    rows.forEach((row, i) => row.style.setProperty("--i", String(Math.min(i, 14))));
    void this.body.offsetWidth;
    this.body.classList.add("menu-enter");
  }

  /** Whether the desktop two-pane branch is active. */
  private isWide(): boolean {
    return this.wideQuery.matches;
  }

  private showRoot(): void {
    // On desktop the sidebar replaces the root list, and Quick start is what
    // the phone's home rows become: the page the menu opens on.
    if (this.isWide()) {
      this.showQuickStart();
      return;
    }
    this.go(() => this.renderRoot());
  }

  /** The desktop landing page: the three quick-play entries as cards. */
  private showQuickStart(): void {
    this.selectedPage = QUICK_START;
    this.go(() => this.renderQuickStart());
    this.syncSidebarActive();
  }

  /** The phone has no sidebar, so Quick start is a page it can never navigate
   * to — but it can be *left on* one, by a rotate or a resize that crosses the
   * breakpoint while it is open. Without this the player is stranded: the three
   * quick-play cards, no Custom row, no back row, and the whole geometry tree
   * behind a sidebar that is `display: none`. The mirror of the guards
   * `renderRoot` and `renderCustom` carry for the other direction. */
  private renderQuickStart(): void {
    if (!this.isWide()) {
      this.selectedPage = null;
      this.showRoot();
      return;
    }
    this.favouritesOnScreen = true;
    const list = document.createElement("ul");
    list.className = "menu-list menu-card-grid";
    list.append(...this.quickPlayCards());
    const header = this.paneHeader(
      "Quick start",
      "Straight into a board, or a surprise from half the catalogue.",
    );
    const faves = this.favouriteRows();
    if (faves.length === 0) {
      this.body.replaceChildren(header, list);
      return;
    }
    // Two grids and a heading under one pane header: they share one scroller
    // (`.menu-pane-scroll`), which takes the place the single grid has on every
    // other page (`.menu-body.paned > .menu-list` in styles.css).
    const favList = document.createElement("ul");
    favList.className = "menu-list menu-card-grid menu-fav-list";
    favList.append(...faves);
    const scroll = document.createElement("div");
    scroll.className = "menu-pane-scroll";
    scroll.append(list, this.sectionHeading("Favourites"), favList);
    this.body.replaceChildren(header, scroll);
  }

  /** A row for each starred board, in the order they were starred — the
   * Favourites section of the home page (phone) or Quick start (desktop). The
   * same `entryRow` every board page builds, star included, so a favourite is
   * unstarred where it is listed. Named by its row's own label plus its
   * surface, as `fullModeLabel` names a board for the best-times list:
   * "Squares" alone does not say plane or torus once the page it was reached
   * through is gone. (Not `fullModeLabel` itself — its tiling half is the
   * catalogue's name, which is not always the row's: the plane's triangles are
   * "Triangle grid" there.) A board the menu cannot reach, or one that cannot
   * be played, is left out. */
  private favouriteRows(): HTMLElement[] {
    const rows: HTMLElement[] = [];
    for (const mode of favourites()) {
      const entry = menuEntryFor(mode);
      if (!entry || modeFairness(mode) === "blocked") continue;
      const surface = surfaceOf(mode);
      const label =
        surface && surface.key !== "flat" ? `${entry.label} · ${surface.label}` : entry.label;
      rows.push(this.entryRow(mode, label, entry.icon, entry.notation));
    }
    return rows;
  }

  private sectionHeading(text: string): HTMLElement {
    const heading = document.createElement("h2");
    heading.className = "menu-section-heading";
    heading.textContent = text;
    return heading;
  }

  /** Open the settings or how-to-play page from outside the menu (the Mac
   * menu bar, via main.ts). */
  openPage(page: "settings" | "help"): void {
    if (page === "settings") this.showSettings();
    else this.showHelp();
  }

  /** A blocked board's explanation page, for a pick that did not come through
   * its row (the native menu bar's board items, main.ts `onCommand`). */
  openBlocked(mode: string): void {
    this.showBlocked(mode, MODE_LABELS[mode] ?? mode);
  }

  /** Repaint the difficulty pills after a change made somewhere other than
   * the pills themselves (the native menu bar's Easy / Medium / Hard). */
  syncDifficulty(): void {
    this.syncDifficultyRow();
  }

  /** The settings page — one more menu page rather than a modal, so it reuses
   * the back row, the card rows and the scrolling body. Clears the sidebar's
   * active row on desktop: settings is not one of the geometry pages. */
  private showSettings(): void {
    this.selectedPage = null;
    this.syncSidebarActive();
    this.go(() => this.renderSettingsPage());
  }

  /** The how-to-play page — a page off the home row, built like settings. */
  private showHelp(): void {
    this.selectedPage = null;
    this.syncSidebarActive();
    this.go(() => this.renderHelpPage());
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
      shape: this.settings.shape,
      scheme: this.settings.scheme,
      difficulty: this.settings.difficulty,
      animations: this.settings.animations,
      sound: this.settings.sound,
      volume: this.settings.volume,
      haptics: this.settings.haptics,
      holdToFlagMs: this.settings.holdToFlagMs,
      backgrounds: this.settings.backgrounds,
      gloss: this.settings.gloss,
      pins: this.settings.pins,
      extraControls: this.settings.extraControls,
      analytics: this.settings.analytics,
      quality: this.settings.quality,
      qualityAuto: this.settings.qualityAuto,
      appIcon: this.settings.appIcon,
      setAppIcon: (key) => this.settings.setAppIcon(key).then(page),
      setTheme: (key) => {
        this.settings.setTheme(key);
        page();
      },
      setShape: (key) => {
        this.settings.setShape(key);
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
      setGloss: (on) => {
        this.settings.setGloss(on);
        page();
      },
      setPins: (on) => {
        this.settings.setPins(on);
        page();
      },
      setExtraControls: (on) => {
        this.settings.setExtraControls(on);
        page();
      },
      setSound: (key) => {
        this.settings.setSound(key);
        page();
      },
      // No re-render: these arrive from a slider the player is still holding,
      // and rebuilding the page would pull it out from under them.
      setVolume: (level) => {
        this.settings.setVolume(level);
      },
      setHoldToFlag: (ms) => {
        this.settings.setHoldToFlag(ms);
      },
      setHaptics: (on) => {
        this.settings.setHaptics(on);
        page();
      },
      setQuality: (pref) => {
        this.settings.setQuality(pref);
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
      renderSettings(host, {
        openThemes: () => this.showThemePicker(),
        openShapes: () => this.showShapePicker(),
        openSchemes: () => this.showSchemePicker(),
        openAppIcons: () => this.showAppIconPicker(),
        openBestTimes: () => this.showBestTimes(),
        openSounds: () => this.showSoundPicker(),
        openAchievements: () => this.openAchievements(),
      }),
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
        clearCloudRecord("scores"); // …on every device, where iCloud keeps them
        this.renderBestTimesPage(); // now the empty state
      }),
    );
  }

  /** The achievements page — a page below settings, like the best-times one.
   *
   * Public, unlike its neighbours: the win card links straight to it, so
   * something outside the menu has to be able to name this page. `go` remembers
   * it the same way, so coming back from wherever the player goes next lands
   * here again. */
  openAchievements(): void {
    this.go(() => this.renderAchievementsPage());
  }

  private renderAchievementsPage(): void {
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Achievements", () => this.showSettings()),
      renderAchievements(() => {
        clearAchievements();
        this.renderAchievementsPage(); // now everything locked again
        // …on every device, where iCloud keeps the record. After the render,
        // which re-seeds the record from the best times: that is what this
        // device then counts as its own.
        clearCloudRecord("achievements"); // now everything locked again
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

  /** The board shape page — the theme picker's twin, one level below settings
   * in the same way. */
  private showShapePicker(): void {
    this.go(() => this.renderShapePage());
  }

  private renderShapePage(): void {
    const host = this.settingsPageHost(() => this.renderShapePage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("Board shape", () => this.showSettings()),
      renderShapePicker(host),
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

  /** The app icon page — one level below settings, like the scheme picker. */
  private showAppIconPicker(): void {
    this.go(() => this.renderAppIconPage());
  }

  private renderAppIconPage(): void {
    const host = this.settingsPageHost(() => this.renderAppIconPage());
    this.root.classList.add("settings-open");
    this.body.replaceChildren(
      this.backRow("App icon", () => this.showSettings()),
      renderAppIconPicker(host),
    );
  }

  /** The phone home page's three quick-play rows. */
  private quickPlayRows(): HTMLElement[] {
    return quickPlayEntries().map((e) =>
      e.kind === "mode"
        ? this.launchRow(e.key, e.label, e.hint, e.icon)
        : this.randomRow(e.key as RandomKind, e.label, e.hint, e.icon),
    );
  }

  /** The desktop Quick start page: the same three entries as cards.
   *
   * The hint rides along as a caption line rather than being dropped as it is
   * on a sidebar row — on the two random entries it is the only thing saying
   * that the card deals a board rather than opening a named one. */
  private quickPlayCards(): HTMLElement[] {
    return quickPlayEntries().map((e) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "menu-entry menu-board-card";
      if (e.kind === "mode") {
        btn.dataset.mode = e.key;
        btn.addEventListener("click", () =>
          this.onSelect({ mode: e.key, difficulty: this.settings.difficulty }),
        );
      } else {
        btn.dataset.random = e.key;
        btn.addEventListener("click", () => {
          const mode = randomMode(e.key as RandomKind, this.settings.difficulty);
          if (mode) this.onSelect({ mode, difficulty: this.settings.difficulty, random: true });
        });
      }
      btn.append(this.previewEl(e.icon), this.cardCaption(e.label, { hint: e.hint }));
      if (e.kind === "mode") this.addDoneMark(btn, e.key);
      li.append(btn);
      return li;
    });
  }

  /** The icon a group's own row shows: the "Flat" entry (which opens the
   * tiling picker) shows a hexagon, since the flat-plane surface keeps its
   * square icon in the manifolds list. */
  private groupIcon(group: Group): string {
    return group.key === "flat" ? "hex" : group.key;
  }

  /** The home page: the board that opens straight away (Classic), one
   * random board from each half of the catalogue, and Custom
   * for the whole tree. On desktop the sidebar covers this ground instead —
   * see `showRoot`, which only reaches here below the breakpoint (or once
   * the breakpoint is crossed while this page happens to be on screen). */
  private renderRoot(): void {
    if (this.isWide()) {
      this.showRoot();
      return;
    }
    const list = document.createElement("ul");
    list.className = "menu-list";
    list.append(...this.quickPlayRows());
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
    this.favouritesOnScreen = true;
    const faves = this.favouriteRows();
    if (faves.length === 0) {
      this.body.replaceChildren(list);
      return;
    }
    // The two lists are centred as one block: the first gives up its bottom
    // auto margin, the second its top one (styles.css, `.menu-list-lead`).
    list.classList.add("menu-list-lead");
    const favList = document.createElement("ul");
    favList.className = "menu-list menu-fav-list";
    favList.append(...faves);
    this.body.replaceChildren(list, this.sectionHeading("Favourites"), favList);
  }

  private showCustom(): void {
    this.go(() => this.renderCustom());
  }

  /** The Custom page: pick a geometry — the plane, a flat manifold, the
   * sphere or a polyhedron — and drill down from there. On desktop the
   * sidebar's geometry group lists every page directly (see `buildSidebar`),
   * so this page has no desktop equivalent — reached only below the
   * breakpoint, or transiently if the breakpoint is crossed while it is on
   * screen. */
  private renderCustom(): void {
    if (this.isWide()) {
      this.showRoot();
      return;
    }
    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const group of this.groups) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "menu-entry";
      btn.dataset.group = group.key;
      btn.append(iconEl(this.groupIcon(group)), textBlock(group.label, this.groupHint(group)));
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

  /** Selects a sidebar geometry row on desktop: paints its page in the pane
   * and marks the row active. The phone reaches the same pages through
   * `showGroup`/`showCustom` instead — this is `showGroup` plus the sidebar
   * bookkeeping `showCustom`'s back stack does not need. */
  private selectPage(group: Group): void {
    this.selectedPage = group.key;
    this.showGroup(group);
    this.syncSidebarActive();
  }

  private syncSidebarActive(): void {
    for (const row of this.sidebarEl.querySelectorAll<HTMLElement>(".menu-entry[data-group]")) {
      row.classList.toggle("active", row.dataset["group"] === this.selectedPage);
    }
  }

  private renderGroup(group: Group): void {
    if (group.kind === "picker") {
      this.showPicker(group.label, group.surfaceKey, () => this.showCustom());
      return;
    }
    const list = document.createElement("ul");
    if (group.kind === "modes") {
      for (const mode of group.modes) list.append(this.entryRow(mode, MODE_LABELS[mode] ?? mode));
    } else {
      for (const surface of group.surfaces) list.append(this.surfaceRow(group, surface));
    }
    if (this.isWide()) {
      list.className = "menu-list menu-card-grid";
      this.body.replaceChildren(this.paneHeader(group.label, this.groupHint(group)), list);
    } else {
      list.className = "menu-list";
      this.body.replaceChildren(this.backRow(group.label, () => this.showCustom()), list);
    }
  }

  /** The shared tiling picker for a surface (the plane or a flat manifold):
   * the three regular tilings as rows of their own, then the Uniform / Laves /
   * Isogonal / Congruent-rectangles (and, on the plane, Shaped boards,
   * Aperiodic, Spirals and Fractals) families as submenus. */
  private showPicker(label: string, surfaceKey: string, onBack: () => void): void {
    this.go(() => this.renderPicker(label, surfaceKey, onBack));
  }

  private renderPicker(label: string, surfaceKey: string, onBack: () => void): void {
    const picker = pickerFor(surfaceKey);
    const list = document.createElement("ul");
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
    if (this.isWide()) {
      list.className = "menu-list menu-card-grid";
      this.body.replaceChildren(this.paneHeader(label, pickerHint(surfaceKey)), list);
    } else {
      list.className = "menu-list";
      this.body.replaceChildren(this.backRow(label, onBack), list);
    }
  }

  private showFamily(family: Family, onBack: () => void): void {
    this.go(() => this.renderFamily(family, onBack));
  }

  private renderFamily(family: Family, onBack: () => void): void {
    const list = document.createElement("ul");
    for (const entry of family.modes) {
      list.append(this.entryRow(entry.mode, entry.label, entry.icon, entry.notation));
    }
    const back = this.backRow(family.label, onBack);
    if (this.isWide()) {
      list.className = "menu-list menu-card-grid";
      // The family's boards still get a back row — clicking a family card
      // does not touch the sidebar — plus the pane header, so the difficulty
      // pills stay reachable one level down from the group page.
      this.body.replaceChildren(
        back,
        this.paneHeader(family.label, MENU_FAMILY_HINTS[family.key] ?? ""),
        list,
      );
    } else {
      list.className = "menu-list";
      this.body.replaceChildren(back, list);
    }
  }

  private showSurface(group: ManifoldGroup, surface: SurfaceEntry): void {
    this.showPicker(surface.label, surface.key, () => this.showGroup(group));
  }

  /** The desktop sidebar: Quick start, then every geometry group, then the
   * how-to-play / settings footer. Built in the constructor and again on
   * `refresh` — it does not change between pages, only the pane content and
   * the active row do, but its glyphs are baked in the theme's icon palette
   * (see `rebuildSidebar`).
   *
   * The three quick-play entries are a *page* here rather than three rows of
   * their own: as rows they competed with the geometry list for the same
   * glance, and they are what a player opening the menu wants first, which is
   * what a landing page is for. */
  private buildSidebar(): HTMLElement {
    const sidebar = document.createElement("div");
    sidebar.className = "menu-sidebar";

    const title = document.createElement("h1");
    title.className = "menu-title menu-sidebar-title";
    title.textContent = screens.menu.title;
    sidebar.append(title);

    const quick = document.createElement("ul");
    quick.className = "menu-list";
    // A star, not the `start` glyph the random rows use: that one is a question
    // mark, and the sidebar already ends in a question mark — the How to play
    // button — so the two read as the same row at a glance.
    quick.append(
      this.sidebarRow(QUICK_START, "Quick start", "star", () => this.showQuickStart()),
    );
    sidebar.append(quick);

    if (this.groups.length > 0) {
      const section = document.createElement("p");
      section.className = "menu-nav-section";
      section.textContent = "Geometry";
      const list = document.createElement("ul");
      list.className = "menu-list";
      for (const group of this.groups) list.append(this.sidebarGroupRow(group));
      sidebar.append(section, list);
    }

    this.sidebarFooterEl = document.createElement("div");
    this.sidebarFooterEl.className = "menu-sidebar-footer";
    sidebar.append(this.sidebarFooterEl);

    return sidebar;
  }

  /** A sidebar row for one of `this.groups` — the same `data-group` and click
   * target as the phone Custom page's rows (`renderCustom`), styled compactly
   * as a nav row instead of a card (see `.menu-sidebar .menu-entry` in
   * styles.css) and always visible rather than reached through a back stack. */
  private sidebarGroupRow(group: Group): HTMLElement {
    return this.sidebarRow(group.key, group.label, this.groupIcon(group), () =>
      this.selectPage(group),
    );
  }

  /** One sidebar nav row. `key` is its `data-group` — the handle both
   * `syncSidebarActive` and the e2e suite know it by. */
  private sidebarRow(
    key: string,
    label: string,
    icon: string,
    onClick: () => void,
  ): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.group = key;
    btn.append(iconEl(icon), textBlock(label));
    btn.addEventListener("click", onClick);
    li.append(btn);
    return li;
  }

  /** The content pane's header on desktop: the page title, its hint (the
   * same one the phone's back row would imply — `groupHint`/`pickerHint`/
   * `MENU_FAMILY_HINTS`), and the difficulty pills, reparented here from
   * wherever they last were (see `difficultyWrapperEl`). */
  private paneHeader(title: string, hint: string): HTMLElement {
    const header = document.createElement("div");
    header.className = "menu-pane-header";

    const heading = document.createElement("div");
    heading.className = "menu-pane-heading";
    const titleEl = document.createElement("h1");
    titleEl.className = "menu-title menu-pane-title";
    titleEl.textContent = title;
    const hintEl = document.createElement("p");
    hintEl.className = "menu-pane-hint";
    hintEl.textContent = hint;
    heading.append(titleEl, hintEl);

    header.append(heading, this.difficultyWrapperEl);
    // The pane header is the page's own chrome — its title, its breadcrumb and
    // the difficulty pills — so it must not scroll away under the cards. This
    // hands the scrolling to the card grid instead (styles.css, `.menu-body.paned`).
    this.body.classList.add("paned");
    return header;
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
    btn.dataset.surface = surface.key;
    if (this.isWide()) {
      btn.className = "menu-entry menu-board-card";
      btn.append(this.previewEl(surface.key), this.cardCaption(surface.label));
    } else {
      btn.className = "menu-entry";
      btn.append(iconEl(surface.key), textBlock(surface.label, pickerHint(surface.key)));
    }
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
    btn.dataset.submenu = key;
    const iconKey = FAMILY_ICONS[key] ?? key;
    if (this.isWide()) {
      btn.className = "menu-entry menu-submenu menu-board-card";
      btn.append(this.previewEl(iconKey), this.cardCaption(label, { trailing: this.chevronEl() }));
    } else {
      // menu-submenu lays the label and the › chevron out on one row.
      btn.className = "menu-entry menu-submenu";
      // "Laves" and "Isogonal" name a classification, not a look — the hint is
      // what tells a player choosing a board what they would be playing on.
      // Defaults to the tiling-family hint by key; the Polyhedra groups pass
      // their own (`MENU_FAMILY_HINTS` knows nothing about them).
      btn.append(iconEl(iconKey), textBlock(label, hint), this.chevronEl());
    }
    btn.addEventListener("click", onClick);
    li.append(btn);
    return li;
  }

  /** A board row. `notation`, a 2-uniform tiling's vertex-type symbol, is
   * the row's subtitle — unless the board is graded, when the fairness hint
   * takes the line, since that is what a player needs before choosing it. */
  private entryRow(mode: string, label: string, icon = mode, notation?: string): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.dataset.mode = mode;
    // A board the tiling is against is graded here rather than left to feel
    // like bad luck at the table. A blocked board keeps its row -- the tiling
    // is still worth looking at, and hiding it would only make the catalogue
    // lie about what it holds -- but the row opens the explanation instead of
    // a game.
    const level = modeFairness(mode);
    const hint = fairnessHint(level) ?? notation;
    if (level !== "ok") btn.dataset.fairness = level;
    if (this.isWide()) {
      btn.className = "menu-entry menu-board-card";
      btn.append(
        this.previewEl(icon),
        this.cardCaption(
          label,
          level !== "ok"
            ? { trailing: this.fairnessPill(level, hint) }
            : notation !== undefined
              ? { hint: notation }
              : {},
        ),
      );
    } else {
      btn.className = "menu-entry";
      btn.append(iconEl(icon), textBlock(label, hint));
      if (level !== "ok") {
        const warn = document.createElement("span");
        warn.className = "menu-entry-warning";
        warn.textContent = level === "blocked" ? "⛔" : "⚠";
        warn.setAttribute("aria-label", hint ?? "");
        btn.append(warn);
      }
    }
    if (level !== "blocked" && distortedDifficulties(mode).length > 0) {
      this.addDistortionMark(btn, mode, level === "ok");
    }
    this.addDoneMark(btn, mode);
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
    // A blocked board cannot be played, so there is nothing to come back to.
    if (level !== "blocked") {
      btn.classList.add("has-fav");
      li.append(this.favButton(mode, label));
    }
    return li;
  }

  /** The star in a board row's top-right corner. A sibling of the row's own
   * button, not inside it — a button cannot hold a button — laid over the
   * row's corner by `.menu-fav` in styles.css; so the row still launches the
   * board and the star only stars it. `data-fav` is the e2e suite's handle. */
  private favButton(mode: string, label: string): HTMLElement {
    const btn = document.createElement("button");
    btn.className = "menu-fav";
    btn.dataset.fav = mode;
    btn.innerHTML = STAR_ICON;
    this.paintFav(btn, label, isFavourite(mode));
    btn.addEventListener("click", () => {
      const on = toggleFavourite(mode);
      // The section lists only starred boards, so on its page a re-render
      // takes an unstarred board out of it. Elsewhere the row stays put and
      // repaints its star, and any other star on the page for the same board.
      if (this.favouritesOnScreen) this.render();
      else {
        for (const other of this.root.querySelectorAll<HTMLElement>(".menu-fav")) {
          if (other.dataset["fav"] === mode) this.paintFav(other, label, on);
        }
      }
      syncCloudRecord(); // …and to the player's other devices, in the app
    });
    return btn;
  }

  private paintFav(btn: HTMLElement, label: string, on: boolean): void {
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? `Remove ${label} from favourites` : `Add ${label} to favourites`);
    btn.title = on ? "Remove from favourites" : "Add to favourites";
  }

  /** The completion mark: three bars rising Easy, Medium, Hard, each filled
   * once the board has been won at that difficulty. Deliberately not stars —
   * the star is the favourite — and only on a board won at least once, so the
   * catalogue's untouched rows stay as they were. Read from the achievement
   * record's win counts (`Progress.wins`), the one record of every win. On a
   * phone row it follows the board's name; on a desktop card it sits at the
   * caption's right, before any pill or chevron. */
  private addDoneMark(btn: HTMLElement, mode: string): void {
    const wins = this.progress?.wins[mode] ?? {};
    const won = screens.difficulties.filter((d) => (wins[d.key] ?? 0) > 0);
    if (won.length === 0) return;
    const mark = document.createElement("span");
    mark.className = "menu-done";
    mark.dataset.won = won.map((d) => d.key).join(" ");
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", `Won on ${listWords(won.map((d) => d.label))}`);
    mark.title = mark.getAttribute("aria-label") ?? "";
    for (const d of screens.difficulties) {
      const bar = document.createElement("span");
      bar.className = won.includes(d) ? "menu-done-bar won" : "menu-done-bar";
      mark.append(bar);
    }
    if (btn.classList.contains("menu-board-card")) {
      btn.querySelector(".menu-board-card-caption .menu-entry-text")?.after(mark);
    } else {
      btn.querySelector(".menu-entry-label")?.append(mark);
    }
  }

  /** The mark on a board its surface draws out of shape (boards/distortion.ts):
   * a "Distorted" pill on the desktop card, a hint line and — unless the
   * fairness mark already holds the corner — a ⚠ on the phone row. Unlike the
   * fairness mark it is per difficulty, since most of these boards are fine
   * on medium and hard, so it is built once and shown or hidden by
   * `paintDistortion` whenever the difficulty pills change. */
  private addDistortionMark(btn: HTMLElement, mode: string, glyph: boolean): void {
    btn.dataset.distortion = mode;
    const hint = distortionHint(mode, distortedDifficulties(mode)[0] ?? "") ?? "";
    if (this.isWide()) {
      const pill = document.createElement("span");
      pill.className = "menu-fairness-pill menu-distortion-mark";
      pill.textContent = "Distorted";
      pill.title = hint;
      pill.setAttribute("aria-label", hint);
      btn.querySelector(".menu-board-card-caption")?.append(pill);
    } else {
      const line = document.createElement("span");
      line.className = "menu-entry-hint menu-distortion-mark";
      line.textContent = hint;
      btn.querySelector(".menu-entry-text")?.append(line);
      if (glyph) {
        const warn = document.createElement("span");
        warn.className = "menu-entry-warning menu-distortion-mark";
        warn.textContent = "⚠";
        warn.setAttribute("aria-label", hint);
        btn.append(warn);
      }
    }
    this.paintDistortion(btn);
  }

  /** Show a row's distortion mark at the selected difficulty, hide it at the
   * others. `data-distorted` is the hook the e2e suite reads. */
  private paintDistortion(btn: HTMLElement): void {
    const mode = btn.dataset["distortion"];
    if (mode === undefined) return;
    const on = isDistorted(mode, this.settings.difficulty);
    if (on) btn.dataset.distorted = "";
    else delete btn.dataset.distorted;
    for (const el of btn.querySelectorAll<HTMLElement>(".menu-distortion-mark")) el.hidden = !on;
  }

  /** The large board preview a desktop card shows instead of the phone's 38px
   * glyph (icons.ts `previewIcon`): a tiling wallpapered to the card's edges,
   * or — for a solid, a surface or a shaped board, where the silhouette is the
   * picture — a centred figure with air around it, which `is-tiled` tells the
   * card's padding apart. */
  private previewEl(key: string): HTMLElement {
    const el = document.createElement("div");
    const preview = previewIcon(key);
    el.className = preview.tiled
      ? "menu-board-card-preview is-tiled"
      : "menu-board-card-preview";
    el.innerHTML = preview.svg;
    return el;
  }

  /** A desktop card's caption: the board/family name, an optional hint line
   * under it, and an optional trailing element (a fairness pill, or a family's
   * chevron). */
  private cardCaption(
    label: string,
    opts: { hint?: string; trailing?: HTMLElement } = {},
  ): HTMLElement {
    const caption = document.createElement("span");
    caption.className = "menu-board-card-caption";
    caption.append(textBlock(label, opts.hint));
    if (opts.trailing) caption.append(opts.trailing);
    return caption;
  }

  private chevronEl(): HTMLElement {
    const chevron = document.createElement("span");
    chevron.className = "menu-entry-chevron";
    chevron.textContent = "›";
    return chevron;
  }

  /** The desktop card's fairness mark: the phone's corner glyph becomes a
   * labelled pill, since a card has room to say *why* rather than just that. */
  private fairnessPill(level: Fairness, hint: string | undefined): HTMLElement {
    const pill = document.createElement("span");
    pill.className = "menu-fairness-pill";
    pill.textContent = level === "blocked" ? "Blocked" : "Guesses";
    if (hint) pill.setAttribute("aria-label", hint);
    return pill;
  }

  /** A root launch entry with a hint (e.g. Classic) — launches its mode on
   * click like entryRow, but shows a subtitle like a group row. */
  private launchRow(mode: string, label: string, hint: string, icon: string): HTMLElement {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "menu-entry";
    btn.dataset.mode = mode;
    btn.append(iconEl(icon), textBlock(label, hint));
    this.addDoneMark(btn, mode);
    btn.addEventListener("click", () =>
      this.onSelect({ mode, difficulty: this.settings.difficulty }),
    );
    li.append(btn);
    return li;
  }

  /** A home-page random entry (Flat, 3D) — resolves to a random mode from its
   * half of the catalogue at click time, so it is a different board every tap
   * (mirrors gui.py's random choice). */
  private randomRow(
    key: RandomKind,
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
      // as often as on a board that can actually be solved
      // (boards/randomBoard.ts, shared with the record window's New board).
      const mode = randomMode(key, this.settings.difficulty);
      if (mode) this.onSelect({ mode, difficulty: this.settings.difficulty, random: true });
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
    this.difficultyWrapperEl = wrap;
    return wrap;
  }

  private syncDifficultyRow(): void {
    const active = this.settings.difficulty;
    for (const b of this.difficultyRowEl?.querySelectorAll(".difficulty-btn") ?? []) {
      b.classList.toggle("active", (b as HTMLElement).dataset["key"] === active);
    }
    // The rows already on the page carry a per-difficulty mark.
    for (const btn of this.root.querySelectorAll<HTMLElement>("[data-distortion]")) {
      this.paintDistortion(btn);
    }
  }
}
