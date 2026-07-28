import { Vector3 } from "three";
import "./ui/styles.css";
import { isBoard3D, type CellId } from "./boards/core";
import { hasMode } from "./boards/presets";
import { DIFFICULTIES } from "./boards/catalog";
import { screens } from "./config/screens";
import { GameSession } from "./session";
import { attachControls, blockBrowserZoom } from "./input/controls";
import {
  BoardRenderer,
  initialOrientation,
  KEY_ROTATE_STEP,
} from "./render/renderer";
import { Hud } from "./ui/hud";
import { Menu } from "./ui/menu";
import type { SettingsHost } from "./ui/settings";
import { applyTheme } from "./ui/theme";
import {
  animationsEnabled,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings";
import { installTestHook } from "./testHook";

/** Zoom step for one press of the +/- keys. */
const ZOOM_KEY_STEP = 1.3;

// App bootstrap: menu launches a ported board; deep links start one directly;
// input drives reveal/flag/chord (and, on 3D boards, drag/arrow-key rotation)
// through the GameSession; the HUD and menu render from the shared UI-screen
// config; the test seam is exposed.
class App {
  private readonly renderer: BoardRenderer;
  private readonly hud: Hud;
  private readonly menu: Menu;
  private session: GameSession | null = null;
  private screen: "menu" | "game" = "menu";
  private flagMode = false;
  private hovered: CellId | null = null;
  /** Stored preferences (theme, animations) — the app's only persisted state. */
  private settings: Settings = loadSettings();
  // Board animations honour the OS reduced-motion setting unless the settings
  // screen overrides it; the `window.__ms.animations(false)` test seam overrides
  // both for deterministic e2e.
  private animationsEnabled = animationsEnabled(this.settings.animations);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ui: HTMLElement,
  ) {
    applyTheme(this.settings.theme); // before anything measures or paints
    this.syncViewport(); // size the layout box before anything measures it
    this.renderer = new BoardRenderer(canvas);
    this.hud = new Hud((action) => this.onAction(action));
    this.menu = new Menu(
      (sel) => this.startGame(sel.mode, sel.difficulty),
      this.settingsHost(),
    );
    ui.append(this.hud.root, this.menu.root);
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
      onLongPress: (cell) => this.flag(cell),
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
      scrolls: () =>
        this.screen === "game" && (this.session?.hasCellCycle ?? false),
      onScroll: (direction) => this.scroll(direction),
    });
    // The board has its own bounded zoom, so the browser's page zoom is only
    // ever a trap here (see blockBrowserZoom).
    blockBrowserZoom();
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
      get animations() {
        return app.settings.animations;
      },
      setTheme: (key) => this.setTheme(key),
      setAnimations: (pref) => this.setAnimations(pref),
    };
  }

  private setTheme(key: string): void {
    this.settings = { ...this.settings, theme: key };
    saveSettings(this.settings);
    applyTheme(key); // the canvas is transparent, so CSS repaints the field too
  }

  private setAnimations(pref: boolean | null): void {
    this.settings = { ...this.settings, animations: pref };
    saveSettings(this.settings);
    this.animationsEnabled = animationsEnabled(pref);
    this.session?.mesh.setAnimationsEnabled(this.animationsEnabled);
  }

  // -- navigation ------------------------------------------------------------

  private startFromDeepLink(): boolean {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const difficulty = params.get("difficulty") ?? screens.defaultDifficulty;
    const seedRaw = params.get("seed");
    if (!mode || !hasMode(mode) || !DIFFICULTIES.includes(difficulty)) return false;
    const seed = seedRaw != null ? Number(seedRaw) : undefined;
    this.startGame(mode, difficulty, seed !== undefined && !Number.isNaN(seed) ? { seed } : {});
    return true;
  }

  private startGame(
    mode: string,
    difficulty: string,
    opts: { seed?: number; mines?: CellId[] } = {},
  ): void {
    this.session = new GameSession(mode, difficulty, {
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      ...(opts.mines ? { minePositions: opts.mines } : {}),
    });
    this.renderer.setBoard(this.session.mesh);
    this.session.mesh.setAnimationsEnabled(this.animationsEnabled);
    if (this.session.is3d) this.renderer.setOrientation(initialOrientation(mode));
    this.screen = "game";
    this.menu.hide();
    this.hud.root.hidden = false;
    this.hovered = null;
    this.flagMode = false;
    this.syncHud();
    this.onResize();
  }

  private showMenu(): void {
    this.screen = "menu";
    this.session = null;
    this.hud.root.hidden = true;
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
    document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
  }

  /** Re-frame the board on viewport changes, reserving the current header
   * height at the top so the board sits below it (0 in the menu). */
  private onResize(): void {
    this.syncViewport();
    const inset =
      this.screen === "game" && !this.hud.root.hidden
        ? this.hud.root.getBoundingClientRect().height
        : 0;
    this.renderer.setTopInset(inset);
    this.renderer.resize();
  }

  private onAction(action: string): void {
    if (action === "menu") this.showMenu();
    else if (action === "toggle-flag-mode") {
      this.flagMode = !this.flagMode;
      this.hud.setState({ flagMode: this.flagMode });
    } else if (action === "restart" && this.session) {
      this.startGame(this.session.mode, this.session.difficulty);
    } else if (action === "klein-scroll-back") {
      this.scroll(-1);
    } else if (action === "klein-scroll-fwd") {
      this.scroll(1);
    }
  }

  // -- gameplay --------------------------------------------------------------

  private onTap(cell: CellId): void {
    if (!this.session || this.screen !== "game") return;
    if (this.flagMode) {
      this.session.flag(cell);
    } else if (this.session.game.cellState(cell) === "revealed") {
      this.session.chord(cell);
    } else {
      this.session.reveal(cell);
    }
    this.afterMove();
  }

  private flag(cell: CellId): void {
    if (!this.session || this.screen !== "game") return;
    this.session.flag(cell);
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

  /** Walk the Klein cell cycle one step (view-layer permutation); no-op on
   * boards without one. */
  private scroll(direction: number): void {
    if (this.screen !== "game") return;
    if (this.session?.scroll(direction)) {
      this.renderer.markDirty();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen !== "game") return;
    // Zoom from the keyboard on every board: +/- step, 0 frames it again.
    if (e.key === "+" || e.key === "=") this.zoom(ZOOM_KEY_STEP);
    else if (e.key === "-" || e.key === "_") this.zoom(1 / ZOOM_KEY_STEP);
    else if (e.key === "0") this.renderer.resetView();
    else if (!this.session?.is3d) return;
    else {
      this.onKey3d(e);
      return;
    }
    e.preventDefault();
  }

  private onKey3d(e: KeyboardEvent): void {
    // Bracket keys walk the Klein cell cycle (matching the wheel / scroll
    // arrows); arrows rotate the board.
    if (e.key === "[") this.scroll(-1);
    else if (e.key === "]") this.scroll(1);
    else {
      const step = KEY_ROTATE_STEP;
      if (e.key === "ArrowLeft") this.rotate(-step, 0);
      else if (e.key === "ArrowRight") this.rotate(step, 0);
      else if (e.key === "ArrowUp") this.rotate(0, -step);
      else if (e.key === "ArrowDown") this.rotate(0, step);
      else return;
    }
    e.preventDefault();
  }

  private afterMove(): void {
    this.syncHud();
    this.renderer.markDirty();
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
      hasCellCycle: this.session.hasCellCycle,
    });
  }

  // -- test seam -------------------------------------------------------------

  /** Screen coords of a cell's centre, or null when the cell currently faces
   * away from the camera (3D boards) — tests pick a visible cell instead. */
  private cellScreenXY(cell: CellId): { x: number; y: number } | null {
    if (!this.session) return null;
    const mesh = this.session.mesh;
    // A game cell's contents are painted on its (possibly scrolled) geometric
    // face; anchor there so the reported position follows the Klein scroll.
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

  private installSeam(): void {
    installTestHook({
      ready: () => true,
      cells: () => (this.session ? this.session.game.cells : []),
      cellScreenXY: (cell) => this.cellScreenXY(cell),
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
      scroll: (direction) => this.scroll(direction),
      animations: (enabled) => {
        this.animationsEnabled = enabled;
        this.session?.mesh.setAnimationsEnabled(enabled);
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
