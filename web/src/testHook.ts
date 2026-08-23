import type { CellId, SymmetryId } from "./boards/core";

// The typed test seam Playwright drives. A canvas has no per-cell DOM, so e2e
// tests translate a cell id to current screen coordinates via `cellScreenXY`
// and read a state summary. `startBoard` accepts an explicit mine layout for
// deterministic win/lose flows. Kept small and always installed.

export interface MsState {
  screen: "menu" | "game";
  mode: string | null;
  difficulty: string | null;
  status: "playing" | "won" | "lost";
  minesRemaining: number;
  revealed: number;
  cellCount: number;
  is3d: boolean;
  /** The cell style the board on screen was *built* with — not the stored
   * preference, which a board opened before the change does not follow. The one
   * way to assert from outside that picking a style reached the mesh. */
  cellStyle: string;
  /** The sound choice the audio engine is actually on (a preset key, or
   * `"off"`) — the one way to assert from outside that picking a preset
   * reached it, since a synthesised sound leaves nothing in the DOM. */
  sound: string;
  /** The level the audio engine is scaled to, 0..1 — the same story as `sound`
   * for the volume slider, which likewise leaves nothing in the DOM. */
  volume: number;
  /** How brightly the Realistic markers are lit right now: the swell, the
   * detonation flash, and the ember under both (`render/markerGlow.ts`). Null
   * on a board with no markers to light.
   *
   * The light lives in a shader uniform, so like a synthesised sound it leaves
   * nothing in the DOM — and unlike the ripple it is over in about half a
   * second, which is quicker than a screenshot round trip under SwiftShader.
   * Reading the numbers is the only way to assert it from outside. */
  glow: { amount: number; blast: number; base: number } | null;
}

export interface MsHook {
  ready(): boolean;
  cells(): CellId[];
  cellScreenXY(cell: CellId): { x: number; y: number } | null;
  /** The game cell shown at a point in client (CSS) coordinates — the inverse
   * of `cellScreenXY`, resolved by the same raycast a tap uses, so a test can
   * assert which cell a gesture actually lands on. */
  cellAtScreenXY(x: number, y: number): CellId | null;
  state(): MsState;
  startBoard(
    mode: string,
    difficulty: string,
    opts?: { seed?: number; mines?: CellId[] },
  ): void;
  reveal(cell: CellId): void;
  flag(cell: CellId): void;
  chord(cell: CellId): void;
  /** Rotate a 3D board as a drag of (dx, dy) CSS pixels would; no-op on
   * flat boards. */
  rotate(dxPx: number, dyPx: number): void;
  /** Step the board's contents one move along one of its symmetries (+1
   * forward, -1 back), defaulting to the ring; no-op on a board without it. */
  scroll(direction: number, id?: SymmetryId): void;
  /** A cell's game state — lets a test assert *which* cell a click hit. */
  cellState(cell: CellId): "hidden" | "revealed" | "flagged" | null;
  /** The board's current zoom (1 = framed to the viewport). */
  zoom(): number;
  /** Multiply the zoom by `factor`, about a point in canvas CSS pixels (the
   * centre of the view by default); clamped like the pinch gesture. */
  zoomBy(factor: number, x?: number, y?: number): void;
  /** Enable or disable board animations (reveal ripple, flag pop, lose shake).
   * e2e tests disable them so a screenshot captures the settled frame. */
  animations(enabled: boolean): void;
  /** The stored best times for a board, fastest first — so a test can assert
   * what a win filed without reaching into the storage record's shape. */
  bestTimes(mode: string, difficulty: string): { ms: number; at: number }[];
}

declare global {
  interface Window {
    __ms?: MsHook;
  }
}

export function installTestHook(hook: MsHook): void {
  window.__ms = hook;
}
