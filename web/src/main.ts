import { Vector2, Vector3 } from "three";
import "./ui/styles.css";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  loadProgress,
  measureOf,
  recordWin,
  unlockedAt,
  wonModes,
  type Achievement,
} from "./achievements";
import { setAnalyticsEnabled, trackGame } from "./analytics";
import {
  setSoundPreset,
  setSoundVolume,
  soundChoice,
  soundVolume,
  unlockAudio,
} from "./audio/sound";
import { isBoard3D, type CellId, type SymmetryId } from "./boards/core";
import { fairnessOf } from "./boards/fairness";
import { randomMode } from "./boards/randomBoard";
import { setHapticsEnabled } from "./haptics";
import { boardLinkQuery, parseBoardLink } from "./link";
import { GameSession } from "./session";
import { shareBoard } from "./share";
import { attachControls, blockBrowserZoom } from "./input/controls";
import {
  BoardRenderer,
  initialOrientation,
  KEY_ROTATE_STEP,
} from "./render/renderer";
import { bestTimes, recordTime, type ScoreEntry } from "./leaderboard";
import { boardFacts } from "./ui/boardFacts";
import { BoardInfo } from "./ui/boardInfo";
import { openInfoDialog } from "./ui/infoDialog";
import { symmetryPictures } from "./ui/symmetryIcon";
import { boardConditions, Hud } from "./ui/hud";
import { Menu } from "./ui/menu";
import type { ModalHandle } from "./ui/modal";
import { openScoreDialog } from "./ui/scoreDialog";
import type { SettingsHost } from "./ui/settings";
import { cellStyle } from "./render/cellStyle";
import { applyTheme, onSchemeChange, themeCellStyle, type SchemePref } from "./ui/theme";
import {
  animationsEnabled,
  loadSettings,
  saveSettings,
  subscribeSettings,
  type Settings,
} from "./settings";
import { installTestHook } from "./testHook";

/** Zoom step for one press of the +/- keys. */
const ZOOM_KEY_STEP = 1.3;

/** How long the record dialog waits after a win, so the board's win wave and
 * the flags cascading in are seen before a card covers them. Skipped when
 * animations are off — there is then nothing to wait for, and e2e runs with
 * them off. */
const RECORD_DIALOG_DELAY_MS = 1100;

// App bootstrap: menu launches a ported board; deep links start one directly;
// input drives reveal/flag/chord (and, on 3D boards, drag/arrow-key rotation)
// through the GameSession; the HUD and menu render from the shared UI-screen
// config; the test seam is exposed.
class App {
  private readonly renderer: BoardRenderer;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private readonly boardInfo: BoardInfo;
  private session: GameSession | null = null;
  private screen: "menu" | "game" = "menu";
  private flagMode = false;
  private hovered: CellId | null = null;
  /** The record window, while it is up. */
  private scoreDialog: ModalHandle | null = null;
  /** The info window (what this board is), while it is up. */
  private infoDialog: ModalHandle | null = null;
  /** Its pending open (the delay that lets the win animation play), so a
   * restart or a walk back to the menu during that window cancels it rather
   * than popping a card over the next board. */
  private scoreDialogTimer = 0;
  /** Whether this game's outcome has been through the leaderboard. One win is
   * one record: `afterMove` runs on every move, and the timer tick and any
   * further clicks on a finished board must not file it again. */
  private scored = false;
  /** Whether this game's ending has been reported (analytics.ts). Its own
   * guard rather than `scored`: that one is the leaderboard's and a *loss*
   * must not consume it — a loss is reported here and files no record. */
  private tracked = false;
  /** Whether this game's win has been through the achievements record. Its own
   * guard for the same reason `tracked` is: one game earns its unlocks once,
   * whatever else clicks or ticks afterwards. */
  private counted = false;
  /** What the win that is being reported just unlocked, for the card
   * `checkRecord` puts up a moment later. */
  private unlocked: Achievement[] = [];
  /** Stored preferences (theme, difficulty, animations, cell style) — the
   * app's only persisted state. */
  private settings: Settings = loadSettings();
  // Board animations honour the OS reduced-motion setting unless the settings
  // screen overrides it; the `window.__ms.animations(false)` test seam overrides
  // both for deterministic e2e.
  private animationsEnabled = animationsEnabled(this.settings.animations);
  /** An offscreen element kept at the height of the top safe-area inset
   * (`--safe-top`), the one CSS length `resolveHeight` has to read back. */
  private readonly insetProbe: HTMLElement;
  /** True for a home-screen/standalone launch, the only place the status-bar
   * shortfall `resolveHeight` corrects can happen. An ordinary browser tab is
   * left alone: there a viewport shorter than the screen is just the toolbar,
   * genuinely covering that strip — `tests/e2e/layout.spec.ts` pins the board
   * sitting above it. */
  private readonly standalone: boolean =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ui: HTMLElement,
  ) {
    this.paintTheme(); // before anything measures or paints
    setSoundPreset(this.settings.sound);
    setSoundVolume(this.settings.volume);
    setHapticsEnabled(this.settings.haptics);
    setAnalyticsEnabled(this.settings.analytics);
    // A browser will not let audio start outside a user gesture, so the
    // context is built on the player's first click or key — whatever it is.
    unlockAudio();
    this.insetProbe = document.createElement("div");
    this.insetProbe.setAttribute(
      "style",
      "position:fixed; top:0; left:0; width:0; height:var(--safe-top); " +
        "visibility:hidden; pointer-events:none;",
    );
    document.body.append(this.insetProbe);
    this.syncViewport(); // size the layout box before anything measures it
    this.renderer = new BoardRenderer(canvas);
    this.hud = new Hud((action) => this.onAction(action));
    this.menu = new Menu(
      (sel) => this.startGame(sel.mode, sel.difficulty),
      this.settingsHost(),
    );
    this.boardInfo = new BoardInfo((action) => this.onAction(action));
    // Caption after the header in the flex column (it reads as part of the
    // header block, and the board is framed below both); the hint is positioned
    // over the board, so its place in the column does not matter.
    ui.append(this.hud.root, this.boardInfo.caption, this.menu.root, this.boardInfo.hint);
    // The board's name goes *behind* the canvas rather than in the `#ui`
    // column: both are fixed layers with no z-index, so tree order decides, and
    // the canvas is transparent. That is the whole mechanism — a board zoomed
    // over the name simply covers it, and the name costs the board no height.
    canvas.before(this.boardInfo.nameLayer);
    this.hud.root.hidden = true;

    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("orientationchange", () => this.onResize());
    // A mobile browser grows and shrinks its own chrome without ever resizing
    // the window; the visual viewport is what reports it (see syncViewport).
    window.visualViewport?.addEventListener("resize", () => this.onResize());
    window.addEventListener("keydown", (e) => this.onKey(e));
    attachControls(canvas, {
      pick: (ndc) => this.renderer.pick(ndc),
      onTap: (cell) => this.onTap(cell),
      // A long press is only ever armed for a touch or a pen (see
      // controls.ts), so this is the one flag the player cannot see land.
      onLongPress: (cell) => this.flag(cell, true),
      onSecondary: (cell) => this.flag(cell),
      onHover: (cell) => this.hover(cell),
      rotates: () => this.screen === "game" && (this.session?.is3d ?? false),
      onRotate: (dx, dy) => this.rotate(dx, dy),
      // A zoomed-in flat board is dragged around; a 3D one is rotated instead
      // (two fingers still pan it).
      pans: () =>
        this.screen === "game" &&
        !(this.session?.is3d ?? false) &&
        this.renderer.zoom > 1,
      onPan: (dx, dy) => this.pan(dx, dy),
      onZoom: (factor, x, y) => this.zoom(factor, x, y),
      // The wheel walks the ring; with shift held it rolls round the tube, on
      // the boards that have one.
      scrolls: (id) => this.screen === "game" && (this.session?.has(id) ?? false),
      onScroll: (id, direction) => this.move(id, direction),
    });
    // The board has its own bounded zoom, so the browser's page zoom is only
    // ever a trap here (see blockBrowserZoom).
    blockBrowserZoom();
    subscribeSettings((s) => this.adoptSettings(s));
    // The colour scheme may be the device's rather than a stored choice, and a
    // phone switches itself at dusk. Nothing else notices, so the page would sit
    // on the wrong palette until the next reload.
    onSchemeChange(() => {
      if (this.settings.scheme === "auto") this.paintTheme();
    });
    this.renderer.start();
    window.setInterval(() => this.tickTimer(), 250);

    this.installSeam();
    if (!this.startFromDeepLink()) this.showMenu();
    requestAnimationFrame(() => document.body.setAttribute("data-ready", "1"));
  }

  // -- settings --------------------------------------------------------------

  /** The live view of the preferences the settings page reads and writes.
   * Getters rather than a snapshot, so a page re-render after a change sees the
   * new value. */
  private settingsHost(): SettingsHost {
    const app = this;
    return {
      get theme() {
        return app.settings.theme;
      },
      get scheme() {
        return app.settings.scheme;
      },
      get difficulty() {
        return app.settings.difficulty;
      },
      get animations() {
        return app.settings.animations;
      },
      get sound() {
        return app.settings.sound;
      },
      get volume() {
        return app.settings.volume;
      },
      get haptics() {
        return app.settings.haptics;
      },
      get backgrounds() {
        return app.settings.backgrounds;
      },
      get analytics() {
        return app.settings.analytics;
      },
      setTheme: (key) => this.setTheme(key),
      setScheme: (pref) => this.setScheme(pref),
      setDifficulty: (key) => this.setDifficulty(key),
      setAnimations: (pref) => this.setAnimations(pref),
      setSound: (key) => this.setSound(key),
      setVolume: (level) => this.setVolume(level),
      setHaptics: (on) => this.setHaptics(on),
      setBackgrounds: (on) => this.setBackgrounds(on),
      setAnalytics: (on) => this.setAnalytics(on),
    };
  }

  /** Paint the theme for what is on screen. The chrome half is the theme alone;
   * the page half also depends on the board, since on Realistic the page
   * follows that board's own tiling (ui/backgroundPattern.ts). Everything that
   * repaints the theme goes through here so the mode is never forgotten — a
   * theme switch or a change synced from another tab has to keep the pattern of
   * the board still on screen. */
  private paintTheme(): void {
    // The pattern is opt-in, so what the setting withholds is the *mode*: with
    // no board named there is nothing for the page to follow, which is the
    // same state the menu is in.
    const following = this.settings.backgrounds && this.screen === "game";
    applyTheme(
      this.settings.theme,
      this.settings.scheme,
      following ? (this.session?.mode ?? null) : null,
    );
  }

  private setTheme(key: string): void {
    this.settings = { ...this.settings, theme: key };
    saveSettings(this.settings);
    // The canvas is transparent, so CSS repaints the field too. The board half
    // of a theme (its cell style) is baked into a mesh, so it takes effect on
    // the next board — which is every board from here, since the theme picker
    // is only reachable from the menu.
    this.paintTheme();
  }

  /** Unlike a theme this lands whole and at once: a scheme is the chrome
   * palette and the page, and the board is not cut differently for it. */
  private setScheme(pref: SchemePref): void {
    this.settings = { ...this.settings, scheme: pref };
    saveSettings(this.settings);
    this.paintTheme();
  }

  private setDifficulty(key: string): void {
    this.settings = { ...this.settings, difficulty: key };
    saveSettings(this.settings);
  }

  /** Pick what the game sounds like (a preset, or off). Unlike the cell style
   * this needs no new board: every event reads the preset when it plays, so a
   * change is audible on the very next click. */
  private setSound(key: string): void {
    this.settings = { ...this.settings, sound: key };
    saveSettings(this.settings);
    setSoundPreset(key);
  }

  /** Set how loud the game plays. Like the preset, this reaches the graph
   * already running, so the slider is audible while it is dragged; unlike it,
   * the engine has usually been told already (the slider feeds it live) and
   * this call is what makes the level survive a reload. */
  private setVolume(level: number): void {
    setSoundVolume(level);
    this.settings = { ...this.settings, volume: soundVolume() };
    saveSettings(this.settings);
  }

  /** Turn tactile feedback on or off. Like the sound preset and unlike the
   * cell style, this needs no new board: `haptic()` reads the flag on every
   * event, so it applies to the game already in progress. */
  private setHaptics(on: boolean): void {
    this.settings = { ...this.settings, haptics: on };
    saveSettings(this.settings);
    setHapticsEnabled(on);
  }

  /** Turn the board's own tiling behind the page on or off. Like the sound
   * preset and unlike the cell style it needs no new board — the page is CSS,
   * so it repaints at once, over the game in progress. */
  private setBackgrounds(on: boolean): void {
    this.settings = { ...this.settings, backgrounds: on };
    saveSettings(this.settings);
    this.paintTheme();
  }

  /** Turn anonymous play counts on or off. Read on every event like the two
   * above, so switching it off mid-board suppresses that board's ending too. */
  private setAnalytics(on: boolean): void {
    this.settings = { ...this.settings, analytics: on };
    saveSettings(this.settings);
    setAnalyticsEnabled(on);
  }

  /** Adopt settings written by another tab. The theme's chrome is applied at
   * once; its board half (the tile relief) and the difficulty are picked up by
   * the next board. A game already in progress keeps the difficulty and the
   * tile relief it was started with. */
  private adoptSettings(settings: Settings): void {
    this.settings = settings;
    this.paintTheme();
    setSoundPreset(settings.sound);
    setSoundVolume(settings.volume);
    setHapticsEnabled(settings.haptics);
    setAnalyticsEnabled(settings.analytics);
    this.animationsEnabled = animationsEnabled(settings.animations);
    this.session?.mesh.setAnimationsEnabled(this.animationsEnabled);
    this.menu.refresh();
  }

  private setAnimations(pref: boolean | null): void {
    this.settings = { ...this.settings, animations: pref };
    saveSettings(this.settings);
    this.animationsEnabled = animationsEnabled(pref);
    this.session?.mesh.setAnimationsEnabled(this.animationsEnabled);
  }

  // -- navigation ------------------------------------------------------------

  /** Open the board a shared link names, if it names one this build has.
   * Every parameter is validated on its own (link.ts), so a link naming a
   * board that does not exist here still contributes its difficulty. */
  private startFromDeepLink(): boolean {
    const link = parseBoardLink(window.location.search);
    // A link's difficulty applies for this session but is never persisted —
    // opening someone else's link must not rewrite your own preference.
    if (link.difficulty !== null) {
      this.settings = { ...this.settings, difficulty: link.difficulty };
    }
    if (link.mode === null) return false;
    // A link can name a board that is in the catalogue but not playable -- the
    // triakis tilings, whose cells all come in indistinguishable pairs. Fall
    // through to the menu rather than opening one; the row there explains why.
    if (fairnessOf(link.mode, this.settings.difficulty) === "blocked") return false;
    this.startGame(link.mode, this.settings.difficulty, {
      ...(link.seed !== null ? { seed: link.seed } : {}),
    });
    return true;
  }

  /** Keep the address bar on the link that reopens what is on screen, so
   * copying it is all sharing takes. `replaceState`, not `pushState`: this
   * mirrors the current view rather than adding history entries the back
   * button would then have to unwind. */
  private syncLocation(query: string): void {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${query}`);
    } catch {
      /* a sandboxed frame may refuse; the app is unaffected */
    }
  }

  private startGame(
    mode: string,
    difficulty: string,
    opts: { seed?: number; mines?: CellId[] } = {},
  ): void {
    this.dismissDialogs();
    this.scored = false;
    this.tracked = false;
    this.counted = false;
    this.unlocked = [];
    // Every ordinary game is dealt from a seed, generated here when the caller
    // has none, so that the board is a thing you can hand to someone else: the
    // address bar and the share button both name *this* layout rather than
    // "another board of this kind". Re-rolling is the smiley (or Play again),
    // which comes back through here with no seed and so deals a new one.
    const seed =
      opts.mines ? undefined : (opts.seed ?? (Math.random() * 2 ** 32) >>> 0);
    this.session = new GameSession(mode, difficulty, {
      ...(seed !== undefined ? { seed } : {}),
      ...(opts.mines ? { minePositions: opts.mines } : {}),
      cellStyle: themeCellStyle(this.settings.theme),
      // Sound is panned by where a cell is *on screen*, which only the
      // renderer knows (it holds the camera, the zoom and the board's
      // rotation).
      panOf: (cell) => this.renderer.panFor(cell),
    });
    // A board built from an explicit mine layout (the test seam) is not
    // reproducible from a link, so it does not claim one.
    if (!opts.mines) this.syncLocation(boardLinkQuery(mode, difficulty, seed));
    this.renderer.setBoard(this.session.mesh);
    this.session.mesh.setAnimationsEnabled(this.animationsEnabled);
    if (this.session.is3d) this.renderer.setOrientation(initialOrientation(mode));
    this.screen = "game";
    this.paintTheme(); // the page picks up this board's tiling
    this.menu.hide();
    this.hud.root.hidden = false;
    this.boardInfo.setBoard(
      mode,
      difficulty,
      boardConditions(this.session.symmetries),
      symmetryPictures(this.session.board, mode, this.renderer.quarterTurned),
    );
    // The first board this browser ever opens gets the gesture hint, once. It
    // is stored before it is shown, so a reload mid-hint does not re-earn it.
    this.boardInfo.dismissHint();
    if (!this.settings.seenHint) {
      this.settings = { ...this.settings, seenHint: true };
      saveSettings(this.settings);
      this.boardInfo.showHint();
    }
    this.hovered = null;
    this.flagMode = false;
    this.syncHud();
    this.onResize();
    // Last, so a mode `buildBoard` rejects throws before it is counted as a
    // play. A HUD restart comes back through here, so it counts as a new one —
    // "boards opened" is the measure, not "distinct players".
    trackGame({ kind: "start", mode, difficulty });
  }

  private showMenu(): void {
    this.dismissDialogs();
    this.syncLocation(""); // the menu is not a board; drop the board's link
    this.screen = "menu";
    this.session = null;
    this.paintTheme(); // no board, so the page goes back to the plain field
    this.hud.root.hidden = true;
    this.boardInfo.hide();
    this.renderer.clearBoard();
    this.menu.show();
    this.onResize();
  }

  /** Lay the app out in the viewport the user can actually see. iOS Safari's
   * `100vh` is the *large* viewport — the toolbars retracted — so a full-height
   * fixed layer extends underneath the bottom toolbar: the canvas is taller
   * than the visible window and a board centred in it is pushed down, cramped
   * against the toolbar with all the slack above it. `visualViewport.height`
   * is the on-screen height (what the pygame web presenter reads for the same
   * reason); CSS falls back to `100dvh` before this first runs. */
  private syncViewport(): void {
    const vv = window.visualViewport;
    // While the page is pinch-zoomed (scale > 1) the visual viewport is a
    // window onto the layout viewport, so reading its height directly would
    // shrink the app to the zoomed slice and re-frame the board under the
    // player's fingers. Undo the scale to recover the layout height and hold
    // the layout still. Nothing here should reach a phone any more — the app
    // blocks browser zoom (controls.ts, styles.css) — but a stray zoom (iOS
    // accessibility, a desktop ctrl-+) must not scramble the board.
    const h = vv ? vv.height * (vv.scale || 1) : window.innerHeight;
    document.documentElement.style.setProperty(
      "--app-h",
      `${Math.round(this.resolveHeight(h))}px`,
    );
  }

  /** The measured viewport height `h`, corrected for the iOS standalone
   * status-bar shortfall.
   *
   * A home-screen launch runs `black-translucent` (index.html), so the page is
   * drawn from the very top of the screen, under the status bar — but WebKit
   * sizes the viewport as if the page started *below* it. `visualViewport`,
   * `innerHeight` and `100dvh` alike then come back short by exactly the top
   * safe-area inset (62px of an iPhone 16 Pro's 874), the app stops that far
   * above the bottom of the screen, and WebKit fills the strip below it with
   * the web view's own white — the band the player sees, in every theme.
   *
   * That gives the bug an exact signature: a standalone launch whose shortfall
   * against the screen *is* the top inset. Match on it and lay out in the full
   * screen height; leave every other case on the measured height, since a
   * shortfall generally means something really is covering that strip (a
   * browser toolbar, an iPad PWA sharing the screen in Split View).
   * styles.css grows `html` by the same inset so the strip gets painted. */
  private resolveHeight(h: number): number {
    if (!this.standalone) return h;
    const inset = this.insetProbe.getBoundingClientRect().height;
    if (inset <= 0) return h;
    // Whether `screen` swaps its axes on rotation differs by browser and
    // version, so take the one that matches the orientation we are in.
    const { width, height } = window.screen;
    const screenH =
      window.innerHeight >= window.innerWidth
        ? Math.max(width, height)
        : Math.min(width, height);
    return Math.abs(screenH - h - inset) <= 1 ? screenH : h;
  }

  /** Re-frame the board on viewport changes, reserving the current header
   * height at the top so the board sits below it (0 in the menu). */
  private onResize(): void {
    this.syncViewport();
    // The header *and* the caption of board controls under it: both sit in the
    // `#ui` column above the board, so the board is framed below the pair.
    // Measured off the caption's bottom rather than summed, so the column's own
    // spacing counts. The board's *name* is not in that column at all — it is
    // drawn behind the board, and reserves nothing.
    const header =
      this.screen === "game" && !this.hud.root.hidden ? this.hud.root : null;
    const inset = !header
      ? 0
      : this.boardInfo.caption.hidden
        ? header.getBoundingClientRect().height
        : this.boardInfo.caption.getBoundingClientRect().bottom;
    this.renderer.setTopInset(inset);
    // The name sits on the line the board is framed from — the top of the play
    // field, so a board that fills it covers the name and a smaller one leaves
    // it showing above. It is not in the column, so nothing else measures it.
    document.documentElement.style.setProperty("--board-name-top", `${Math.round(inset)}px`);
    this.renderer.resize();
    // A landscape flat board turns a quarter on a portrait viewport, and the
    // mirror line a control draws turns with it (see ui/symmetryIcon.ts).
    if (this.screen === "game") this.boardInfo.drawIcons(this.symmetryPictures());
  }

  /** What each of this board's controls does, as the view has it. */
  private symmetryPictures() {
    if (!this.session) return new Map();
    return symmetryPictures(
      this.session.board,
      this.session.mode,
      this.renderer.quarterTurned,
    );
  }

  private onAction(action: string): void {
    if (action === "menu") this.showMenu();
    else if (action === "toggle-flag-mode") {
      this.flagMode = !this.flagMode;
      this.hud.setState({ flagMode: this.flagMode });
    } else if (action === "restart" && this.session) {
      this.startGame(this.session.mode, this.session.difficulty);
    } else if (action.startsWith("symmetry:")) {
      // `symmetry:<id>:<direction>` — one step along one of the board's own
      // symmetries; see data/ui/screens.json boardBar.
      const [, id, direction] = action.split(":");
      this.move(id as SymmetryId, Number(direction));
    } else if (action === "info") {
      this.showBoardInfo();
    } else if (action === "random") {
      this.startRandomBoard();
    }
  }

  /** Deal another board at random, from the half of the catalogue the one on
   * screen came from — flat deals flat, anything off the plane deals another
   * manifold, sphere or polyhedron — at the difficulty being played. The record
   * window's "New board" is the same move (boards/randomBoard.ts, the home
   * page's own pools and fairness weighting); this is it without having to win
   * first, which is what makes the catalogue something to wander through. Like
   * the smiley, it abandons the board in progress without asking. */
  private startRandomBoard(): void {
    const session = this.session;
    if (!session || this.screen !== "game") return;
    const mode = randomMode(session.is3d ? "3d" : "flat");
    if (mode) this.startGame(mode, session.difficulty);
  }

  /** What the board on screen is: its family, its surface, its size and what
   * its tiles are (ui/boardFacts.ts). The board stays live behind it — this is
   * a window over the game, not a page instead of it, so a player can open it
   * mid-game and go straight back to the move they were on. */
  private showBoardInfo(): void {
    const session = this.session;
    if (!session || this.screen !== "game") return;
    if (this.infoDialog) {
      this.infoDialog.close();
      return;
    }
    this.infoDialog = openInfoDialog(this.ui, {
      facts: boardFacts(
        session.mode,
        session.difficulty,
        session.board,
        session.game.mineCount,
      ),
      // A Classic board is gray whatever its tiles are, so it gets no swatches.
      coloured: !cellStyle(session.cellStyle).monochrome,
      animate: this.animationsEnabled,
      onClose: () => {
        this.infoDialog = null;
      },
    });
  }

  // -- gameplay --------------------------------------------------------------

  /** A tap carries the *geometric* face picking hit, not a game cell; the
   * session owns the mapping between the two, so the reveal-or-chord choice is
   * made there. */
  private onTap(cell: CellId): void {
    if (!this.session || this.screen !== "game") return;
    if (this.flagMode) this.session.flag(cell);
    else this.session.tap(cell);
    this.afterMove();
  }

  private flag(cell: CellId, held = false): void {
    if (!this.session || this.screen !== "game") return;
    this.session.flag(cell, held);
    this.afterMove();
  }

  private hover(cell: CellId | null): void {
    if (!this.session || this.screen !== "game") return;
    if (cell === this.hovered) return;
    this.hovered = cell;
    this.session.hover(cell);
    this.renderer.markDirty();
  }

  private rotate(dxPx: number, dyPx: number): void {
    if (!this.session?.is3d || this.screen !== "game") return;
    this.renderer.rotateBy(dxPx, dyPx);
  }

  /** Magnify the board about a point in canvas CSS pixels (a pinch midpoint,
   * the mouse under the wheel). Bounded by the renderer's zoom clamp. */
  private zoom(factor: number, x?: number, y?: number): void {
    if (this.screen !== "game") return;
    this.renderer.zoomBy(factor, x, y);
  }

  /** Drag the zoomed board by (dx, dy) CSS pixels. */
  private pan(dxPx: number, dyPx: number): void {
    if (this.screen !== "game") return;
    this.renderer.panBy(dxPx, dyPx);
  }

  /** Move the board's contents one step along one of its symmetries (a
   * view-layer permutation); no-op on boards without that one. */
  private move(id: SymmetryId, direction: number): void {
    if (this.screen !== "game") return;
    if (this.session?.move(id, direction)) {
      this.renderer.markDirty();
    }
  }

  /** The keys that step a board along one of its symmetries. Three pairs, one
   * per motion that has a direction; the two mirrors are on the board bar only,
   * since there is no key left that reads as one. */
  private static readonly SYMMETRY_KEYS: Record<string, [SymmetryId, number]> = {
    "[": ["ring", -1],
    "]": ["ring", 1],
    ",": ["tube", -1],
    ".": ["tube", 1],
    ";": ["turn", -1],
    "'": ["turn", 1],
  };

  private onKey(e: KeyboardEvent): void {
    if (this.screen !== "game") return;
    // Zoom from the keyboard on every board: +/- step, 0 frames it again.
    if (e.key === "+" || e.key === "=") this.zoom(ZOOM_KEY_STEP);
    else if (e.key === "-" || e.key === "_") this.zoom(1 / ZOOM_KEY_STEP);
    else if (e.key === "0") this.renderer.resetView();
    else if (Object.hasOwn(App.SYMMETRY_KEYS, e.key)) {
      // On every board, not only a 3D one: a flat board has no ring to walk
      // but it does have its own turn and mirrors.
      const [id, direction] = App.SYMMETRY_KEYS[e.key]!;
      this.move(id, direction);
    } else if (!this.session?.is3d) return;
    else {
      this.onKey3d(e);
      return;
    }
    e.preventDefault();
  }

  private onKey3d(e: KeyboardEvent): void {
    // Arrow keys rotate the board (the symmetry keys are handled above).
    const step = KEY_ROTATE_STEP;
    if (e.key === "ArrowLeft") this.rotate(-step, 0);
    else if (e.key === "ArrowRight") this.rotate(step, 0);
    else if (e.key === "ArrowUp") this.rotate(0, -step);
    else if (e.key === "ArrowDown") this.rotate(0, step);
    else return;
    e.preventDefault();
  }

  private afterMove(): void {
    // The hint has done its job the moment the player makes a move.
    this.boardInfo.dismissHint();
    this.syncHud();
    this.renderer.markDirty();
    // Before the leaderboard: `checkRecord` can open the record window
    // synchronously (animations off), and nothing here should depend on
    // whether it did.
    this.trackFinish();
    // Before `checkRecord`, which is what puts the card up: the unlocks are
    // half of what the card says, and on a win that sets no record they are the
    // whole reason it opens at all.
    this.countWin();
    this.checkRecord();
  }

  /** File a win with the achievements record, and keep what it unlocked for the
   * card. Like `checkRecord` this runs from `afterMove`, the funnel every move
   * goes through, and its own guard makes one game one entry. A loss counts
   * nothing — there is no achievement for losing. */
  private countWin(): void {
    const session = this.session;
    if (!session || this.counted || session.status !== "won") return;
    this.counted = true;
    const ids = recordWin({
      mode: session.mode,
      difficulty: session.difficulty,
      ms: session.elapsedMs(),
      flagless: session.flagless,
      sides: session.sideCounts(),
    });
    this.unlocked = ids
      .map((id) => ACHIEVEMENTS_BY_ID.get(id))
      .filter((a): a is Achievement => a !== undefined);
  }

  /** Report how a game ended, once. Every move funnels through `afterMove`, so
   * this — like `checkRecord` — is the one place a finished game is noticed,
   * however it finished. Unlike `checkRecord` it also sees a **loss**, which
   * the leaderboard never does, and a loss is half of what a success rate is
   * made of. `tickTimer` calls `syncHud` alone, so no clock tick can reach
   * this and no finished board is counted twice. */
  private trackFinish(): void {
    const session = this.session;
    if (!session || this.tracked) return;
    const status = session.status;
    if (status !== "won" && status !== "lost") return;
    this.tracked = true;
    trackGame({
      kind: "end",
      mode: session.mode,
      difficulty: session.difficulty,
      outcome: status,
      ms: session.elapsedMs(),
    });
  }

  // -- best times ------------------------------------------------------------

  /** File a win with the leaderboard, and put the win card up when it made the
   * board's top three *or* unlocked an achievement. Every move funnels through
   * `afterMove`, so this is the one place a finished game is noticed — however
   * it finished (tap, chord, right-click, the test seam). A loss records
   * nothing. */
  private checkRecord(): void {
    const session = this.session;
    if (!session || this.scored || session.status !== "won") return;
    this.scored = true;
    const placed = recordTime(session.mode, session.difficulty, session.elapsedMs());
    // A time that did not place used to end the win in silence. It still does
    // when nothing was unlocked; when something was, that is worth a card of
    // its own — see the note at the top of ui/scoreDialog.ts.
    if (!placed && this.unlocked.length === 0) return;
    const open = (): void => {
      this.scoreDialogTimer = 0;
      // The board can have been left or restarted during the delay.
      if (this.screen !== "game" || this.session !== session) return;
      this.showScoreDialog(session, placed?.rank ?? null, placed?.entries ?? []);
    };
    if (this.animationsEnabled) {
      this.scoreDialogTimer = window.setTimeout(open, RECORD_DIALOG_DELAY_MS);
    } else {
      open();
    }
  }

  private showScoreDialog(
    session: GameSession,
    rank: number | null,
    entries: ScoreEntry[],
  ): void {
    this.dismissDialogs();
    this.scoreDialog = openScoreDialog(this.ui, {
      mode: session.mode,
      difficulty: session.difficulty,
      rank,
      entries,
      unlocked: this.unlocked,
      animate: this.animationsEnabled,
      onPlayAgain: () => this.startGame(session.mode, session.difficulty),
      // The same move the header's die makes, from the card that is up when a
      // board is finished rather than from the row over one being played.
      onNewBoard: () => this.startRandomBoard(),
      onMenu: () => this.showMenu(),
      // The win's time goes with the link — the card is about the time, so the
      // message someone receives should say it too. A board with no seed (the
      // test seam) has no link, and gets no button.
      ...(session.seed !== null
        ? {
            onShare: () =>
              shareBoard({
                mode: session.mode,
                difficulty: session.difficulty,
                seed: session.seed,
                elapsedMs: session.elapsedMs(),
              }),
          }
        : {}),
      onClose: () => {
        this.scoreDialog = null;
      },
    });
  }

  /** Take both windows down, and cancel a record window still waiting on the
   * win animation. Called on restart and on the way back to the menu, so
   * neither card outlives the board it is about. */
  private dismissDialogs(): void {
    if (this.scoreDialogTimer) {
      window.clearTimeout(this.scoreDialogTimer);
      this.scoreDialogTimer = 0;
    }
    this.scoreDialog?.close();
    this.scoreDialog = null;
    this.infoDialog?.close();
    this.infoDialog = null;
  }

  private tickTimer(): void {
    if (this.session && this.session.status === "playing") this.syncHud();
  }

  private syncHud(): void {
    if (!this.session) return;
    const s = this.session.hud();
    this.hud.setState({
      minesRemaining: s.minesRemaining,
      elapsedSeconds: s.elapsedSeconds,
      status: s.status,
      flagMode: this.flagMode,
      conditions: boardConditions(this.session.symmetries),
    });
  }

  // -- test seam -------------------------------------------------------------

  /** Screen coords of a cell's centre, or null when the cell currently faces
   * away from the camera (3D boards) — tests pick a visible cell instead. */
  private cellScreenXY(cell: CellId): { x: number; y: number } | null {
    if (!this.session) return null;
    const mesh = this.session.mesh;
    // A game cell's contents are painted on its (possibly moved) geometric
    // face; anchor there so the reported position follows the symmetry
    // controls.
    const anchor = mesh.cellAnchor(this.session.geomFor(cell));
    if (!anchor) return null;
    mesh.updateWorldMatrix(true, false);
    const world = new Vector3(...anchor.center).applyMatrix4(mesh.matrixWorld);
    const camera = this.renderer.camera;
    const board = this.session.board;
    // A closed solid hides a cell that faces away; a two-sided surface shows
    // its cells from both faces, so it is never culled here.
    if (this.session.is3d && !(isBoard3D(board) && board.twoSided)) {
      const normal = new Vector3(...anchor.normal).transformDirection(mesh.matrixWorld);
      const toCamera = camera.position.clone().sub(world);
      if (normal.dot(toCamera) <= 1e-6) return null; // back-facing
    }
    const ndc = world.project(camera);
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + ((ndc.x + 1) / 2) * r.width,
      y: r.top + ((1 - ndc.y) / 2) * r.height,
    };
  }

  /** The game cell shown at a point in client coordinates: the same raycast a
   * tap runs, then the face -> game cell mapping the symmetry controls
   * permute. */
  private cellAtScreenXY(x: number, y: number): CellId | null {
    if (!this.session) return null;
    const r = this.canvas.getBoundingClientRect();
    const geom = this.renderer.pick(
      new Vector2(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)),
    );
    return geom == null ? null : this.session.gameFor(geom);
  }

  private installSeam(): void {
    installTestHook({
      ready: () => true,
      cells: () => (this.session ? this.session.game.cells : []),
      cellScreenXY: (cell) => this.cellScreenXY(cell),
      cellAtScreenXY: (x, y) => this.cellAtScreenXY(x, y),
      startBoard: (mode, difficulty, opts) => {
        this.startGame(mode, difficulty, opts ?? {});
      },
      reveal: (cell) => {
        this.session?.reveal(cell);
        this.afterMove();
      },
      flag: (cell) => this.flag(cell),
      chord: (cell) => {
        this.session?.chord(cell);
        this.afterMove();
      },
      rotate: (dxPx, dyPx) => this.rotate(dxPx, dyPx),
      cellState: (cell) => this.session?.game.cellState(cell) ?? null,
      zoom: () => this.renderer.zoom,
      zoomBy: (factor, x, y) => this.zoom(factor, x, y),
      scroll: (direction, id) => this.move(id ?? "ring", direction),
      animations: (enabled) => {
        this.animationsEnabled = enabled;
        this.session?.mesh.setAnimationsEnabled(enabled);
      },
      bestTimes: (mode, difficulty) => bestTimes(mode, difficulty),
      achievements: () => {
        const progress = loadProgress();
        const won = wonModes(progress);
        const stamps = unlockedAt();
        return ACHIEVEMENTS.map((a) => ({
          id: a.id,
          unlockedAt: stamps[a.id] ?? null,
          ...measureOf(a, progress, won),
        }));
      },
      state: () => {
        const s = this.session;
        return {
          screen: this.screen,
          mode: s?.mode ?? null,
          difficulty: s?.difficulty ?? null,
          status: s?.status ?? "playing",
          minesRemaining: s ? s.hud().minesRemaining : 0,
          revealed: s ? s.game.revealed : 0,
          cellCount: s ? s.game.cells.length : 0,
          is3d: s?.is3d ?? false,
          cellStyle: s?.cellStyle ?? themeCellStyle(this.settings.theme),
          sound: soundChoice(),
          volume: soundVolume(),
          glow: s?.mesh.markerGlowLevel?.() ?? null,
        };
      },
    });
  }
}

const canvas = document.getElementById("board") as HTMLCanvasElement;
const ui = document.getElementById("ui") as HTMLElement;

// Preload the bundled fonts (Rubik for UI + board digits, DSEG7 for counters)
// before constructing the app, so the glyph atlas bakes with Rubik ready
// instead of silently falling back to sans-serif. Bounded so a slow/failed
// font load never blocks boot.
async function boot(): Promise<void> {
  if (document.fonts?.load) {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('700 16px "Rubik"'),
          document.fonts.load('700 16px "DSEG7 Classic"'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      /* fall back to system fonts */
    }
  }
  new App(canvas, ui);
}
void boot();
