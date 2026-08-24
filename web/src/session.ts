import { playSound, soundEnabled, type CellSound } from "./audio/sound";
import { buildBoard } from "./boards/presets";
import {
  invertCycle,
  isBoard3D,
  type AnyBoard,
  type BoardSymmetry,
  type CellId,
  type SymmetryId,
} from "./boards/core";
import { Game } from "./game";
import { haptic } from "./haptics";
import { mulberry32, type Rng } from "./rng";
import type { BoardMesh, CellVisual } from "./render/boardMesh";
import { cellStyle } from "./render/cellStyle";
import { PolygonBoard } from "./render/polygonBoard";
import { shapeMetrics } from "./render/shapePalette";
import { SolidBoard } from "./render/solidBoard";

// GameSession mediates between the pure Game (rules), the board mesh (flat
// PolygonBoard or 3D SolidBoard), and the HUD. Each move syncs only the
// changed cells into the mesh and reports HUD state.

export interface HudSnapshot {
  minesRemaining: number;
  elapsedSeconds: number;
  status: "playing" | "won" | "lost";
}

export class GameSession {
  readonly board: AnyBoard;
  readonly mesh: BoardMesh;
  readonly game: Game;
  readonly mode: string;
  readonly difficulty: string;
  /** The cell style this board's mesh was cut with (see render/cellStyle.ts). */
  readonly cellStyle: string;
  /** The seed this board's mines were dealt from, when it was dealt from one.
   * `null` for a board built from an explicit mine layout (the test seam),
   * which no seed reproduces. It is what makes a board shareable — see
   * `share.ts` — so it is carried here rather than only in the address bar. */
  readonly seed: number | null;

  private exploded: CellId | null = null;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;

  // View-layer motion along the board's own symmetries (see boards/core.ts
  // BoardSymmetry): each is a graph automorphism, and applying one walks a
  // permutation between geometric faces and the game cells painted on them, so
  // cells hidden behind the Klein bottle's neck or down the inside of a donut
  // come into view without the geometry moving and without the game noticing.
  // `remap` sends each geometric face -> the game cell shown on it (identity
  // until the board is moved); `remapInv` is its inverse.
  private readonly moves = new Map<SymmetryId, [Map<CellId, CellId>, Map<CellId, CellId>]>();
  private remap = new Map<CellId, CellId>();
  private remapInv = new Map<CellId, CellId>();

  /** Where a cell is across the stereo field, supplied by the renderer (which
   * is the only thing that knows where the board currently *looks* like it is
   * — see `BoardRenderer.panFor`). Without one, sound falls back to the cell's
   * position in the mesh, which is the same answer for an unrotated flat
   * board. */
  private readonly panOf: ((geomCell: CellId) => number | null) | null;
  /** Side count per cell, for the shape a sound is pitched by. Built on the
   * first sound this board plays and never at all when sound is off — it is a
   * pass over every cell's polygon, and a silenced game must not pay for it. */
  private sides: Map<CellId, number> | null = null;

  constructor(
    mode: string,
    difficulty: string,
    opts: {
      seed?: number;
      minePositions?: CellId[];
      cellStyle?: string;
      panOf?: (geomCell: CellId) => number | null;
    } = {},
  ) {
    this.mode = mode;
    this.difficulty = difficulty;
    this.board = buildBoard(mode, difficulty);
    // The cell style is baked into the mesh: a profile's loop count fixes the
    // vertex count per cell, so it is chosen here, once, and a change takes
    // effect on the next board (it can only be changed from the menu, where no
    // game is in progress).
    const style = cellStyle(opts.cellStyle);
    this.cellStyle = style.key;
    this.mesh = isBoard3D(this.board)
      ? new SolidBoard(this.board, style)
      : new PolygonBoard(this.board, style);
    // An explicit mine layout is not reproducible from a seed, so a board
    // built from one claims none even if a seed was passed alongside it.
    this.seed = opts.minePositions ? null : (opts.seed ?? null);
    const rng: Rng | undefined =
      opts.seed !== undefined ? mulberry32(opts.seed >>> 0) : undefined;
    this.game = new Game(this.board.adjacency, {
      mineCount: this.board.mineCount,
      ...(opts.minePositions ? { minePositions: opts.minePositions } : {}),
      ...(rng ? { rng } : {}),
    });
    this.panOf = opts.panOf ?? null;
    for (const symmetry of this.board.symmetries) {
      this.moves.set(symmetry.id, [symmetry.cycle, invertCycle(symmetry.cycle)]);
    }
    for (const cell of this.board.polygons.keys()) {
      this.remap.set(cell, cell);
      this.remapInv.set(cell, cell);
    }
  }

  get status() {
    return this.game.state;
  }

  get is3d(): boolean {
    return isBoard3D(this.board);
  }

  /** The symmetries this board can be moved along, in `SYMMETRY_IDS` order.
   * Drives which board-bar controls are shown, and the wheel/gesture input. */
  get symmetries(): readonly BoardSymmetry[] {
    return this.board.symmetries;
  }

  /** Whether the board carries this symmetry at all. */
  has(id: SymmetryId): boolean {
    return this.moves.has(id);
  }

  /** The geometric face a game cell's contents are currently painted on
   * (identity until the board is scrolled). The test seam maps a cell's screen
   * position through this. */
  geomFor(gameCell: CellId): CellId {
    return this.remapInv.get(gameCell) ?? gameCell;
  }

  /** The game cell whose contents are currently painted on a geometric face —
   * the inverse of `geomFor`, and what every move below acts on. Public
   * because the face id is what picking hands back: anything that asks the
   * *game* about a face (its state, its number) has to come through here. */
  gameFor(geomCell: CellId): CellId {
    return this.remap.get(geomCell) ?? geomCell;
  }

  /** The primary action on a tapped face: chord an already-open cell, reveal a
   * closed one. The choice belongs here rather than in the caller because it
   * has to be made on the *game* cell the face shows: on a scrolled Klein
   * board the face's own id is some other cell, and deciding from that one
   * chose the wrong move for the cell under the finger — a chord on a closed
   * cell, or a reveal on an open one, both of which the rules ignore, so the
   * tap silently did nothing while a flag on the same cell worked. */
  tap(geomCell: CellId): void {
    if (this.game.cellState(this.gameFor(geomCell)) === "revealed") {
      this.chord(geomCell);
    } else {
      this.reveal(geomCell);
    }
  }

  /** Move the cell contents one step along one of the board's symmetries:
   * `direction` > 0 forward, < 0 backward (the inverse permutation — the same
   * step for a reflection, which is its own inverse). No-op when the board does
   * not have that symmetry. Returns whether it moved. */
  move(id: SymmetryId, direction: number): boolean {
    const pair = this.moves.get(id);
    if (!pair) return false;
    const cyc = direction > 0 ? pair[0] : pair[1];
    const next = new Map<CellId, CellId>();
    for (const [geom, game] of this.remap) next.set(geom, cyc.get(game) ?? game);
    this.remap = next;
    this.remapInv = invertCycle(next);
    for (const geom of this.board.polygons.keys()) {
      this.mesh.setVisual(geom, this.visualFor(this.gameFor(geom)));
    }
    // The two directions sound like each other reversed (audio/sound.ts), so
    // the arrows are told apart by ear as well as by which one was pressed.
    if (soundEnabled()) playSound({ kind: "scroll", direction });
    return true;
  }

  hud(): HudSnapshot {
    return {
      minesRemaining: this.game.flagsRemaining,
      elapsedSeconds: this.elapsed(),
      status: this.game.state,
    };
  }

  private elapsed(): number {
    return Math.floor(this.elapsedMs() / 1000);
  }

  /** Time on the clock in milliseconds — the timer stops with the game, so
   * after a win this is the finishing time. The HUD shows whole seconds; the
   * leaderboard ranks on this, so two wins the counter both read as 41 still
   * order by which was actually faster. */
  elapsedMs(): number {
    if (this.startedAt == null) return 0;
    const end = this.stoppedAt ?? performance.now();
    return Math.max(0, end - this.startedAt);
  }

  reveal(cell: CellId): void {
    if (this.status !== "playing") return;
    this.startTimer();
    const gameCell = this.gameFor(cell);
    const changed = this.game.reveal(gameCell);
    if (this.game.state === "lost") this.exploded = gameCell;
    this.apply(changed);
    const opened = this.openedFrom(changed);
    this.reactToReveal(opened, gameCell, false);
    this.checkStop(gameCell, changed);
  }

  /** Toggle the flag on a cell. `held` says the flag came from a touch held on
   * that cell — the one input that hides what it is doing behind a fingertip,
   * and so the only one that gets the flag drop. A mouse (right-click) and a
   * tap in flag mode both leave the cell in plain sight; animating those would
   * be decoration, not feedback. */
  flag(cell: CellId, held = false): void {
    this.startTimer();
    const gameCell = this.gameFor(cell);
    const wasFlagged = this.game.cellState(gameCell) === "flagged";
    this.apply(this.game.toggleFlag(gameCell));
    const isFlagged = this.game.cellState(gameCell) === "flagged";
    // Only a flag that lands drops one in; clearing one still buzzes, because
    // the finger that held the cell is covering the change either way.
    if (held && isFlagged && !wasFlagged) {
      this.mesh.dropFlag(this.geomFor(gameCell));
    }
    if (isFlagged !== wasFlagged) {
      haptic("flag");
      if (soundEnabled()) {
        playSound({
          kind: "flag",
          on: isFlagged,
          sides: this.sidesOf(gameCell),
          pan: this.panFor(gameCell),
        });
      }
    }
  }

  chord(cell: CellId): void {
    if (this.status !== "playing") return;
    this.startTimer();
    const chorded = this.gameFor(cell);
    const changed = this.game.chord(chorded);
    if (this.game.state === "lost") {
      // the mine that ended the chord is whichever revealed mine exists
      for (const c of changed) if (this.game.isMine(c)) this.exploded = c;
    }
    this.apply(changed);
    const opened = this.openedFrom(changed);
    this.reactToReveal(opened, chorded, true);
    this.checkStop(chorded, changed);
  }

  /** The cells a move actually opened — what both the reveal ripple and the
   * cascade of sound are built from. */
  private openedFrom(changed: CellId[]): CellId[] {
    return changed.filter(
      (c) => this.game.cellState(c) === "revealed" && !this.game.isMine(c),
    );
  }

  /** Everything a move's opened cells set off, measured once.
   *
   * Three readings of one event, and they must agree, so they are built from
   * one walk rather than three. The tiles **flash**, rippling out from the
   * click. The Realistic board's pins **glow**, a front of light spreading at
   * the same pace. And each opened cell **sounds**, pitched and timbred by its
   * own shape and panned by where it is on screen (audio/sound.ts).
   *
   * The shared measurements are the flood's rings (how far out from the click
   * each cell was opened) and each cell's side count. Both used to be computed
   * inside the sound path and paid for only when the sound was on; the glow
   * needs them too and plays in silence, so they moved out here — but only when
   * something is actually going to use them, which is what keeps a klein/hard
   * flood as cheap as it was. `panFor` stays behind the sound gate: it projects
   * a cell through the camera, and only the stereo field needs that. */
  private reactToReveal(opened: CellId[], origin: CellId, chord: boolean): void {
    if (opened.length === 0) return;
    this.mesh.pulseReveal(
      opened.map((c) => this.geomFor(c)),
      this.geomFor(origin),
    );
    const glowing = this.mesh.wantsMarkerGlow === true;
    const sounding = soundEnabled();
    if (!glowing && !sounding) return;
    const rings = this.ringsFrom(origin, opened);
    if (glowing) {
      this.mesh.glowMarkers?.(
        opened.map((cell) => ({
          sides: this.sidesOf(cell),
          ring: rings.get(cell) ?? 0,
        })),
        this.geomFor(origin),
      );
    }
    if (sounding) {
      const cells: CellSound[] = opened.map((cell) => ({
        sides: this.sidesOf(cell),
        pan: this.panFor(cell),
        ring: rings.get(cell) ?? 0,
      }));
      playSound({ kind: "open", cells, chord });
    }
  }

  /** How many steps out from `origin` each opened cell is, walked over the
   * game's own adjacency and through opened cells only — which is exactly the
   * order the flood fill reached them in, so the cascade spreads the way the
   * opening did. A chord can open cells the walk cannot reach (its neighbours
   * are not all adjacent to each other); those sit one ring past the farthest
   * it did reach, so they arrive at the end of the wave rather than on top of
   * the click. */
  private ringsFrom(origin: CellId, opened: CellId[]): Map<CellId, number> {
    const inSet = new Set(opened);
    const rings = new Map<CellId, number>();
    const queue: CellId[] = [];
    if (inSet.has(origin)) {
      rings.set(origin, 0);
      queue.push(origin);
    } else {
      // A chord starts from an already-open cell, so the walk starts at the
      // neighbours it opened.
      for (const n of this.game.neighbors(origin)) {
        if (inSet.has(n) && !rings.has(n)) {
          rings.set(n, 1);
          queue.push(n);
        }
      }
    }
    let far = 0;
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i]!;
      const ring = rings.get(cell)!;
      if (ring > far) far = ring;
      for (const n of this.game.neighbors(cell)) {
        if (inSet.has(n) && !rings.has(n)) {
          rings.set(n, ring + 1);
          queue.push(n);
        }
      }
    }
    for (const cell of opened) if (!rings.has(cell)) rings.set(cell, far + 1);
    return rings;
  }

  /** The side count of a cell's tile, the shape its voice is built from.
   * Measured the way the shape *colours* are (`shapeMetrics`, collinear
   * T-vertices dropped), so a tile that looks like a pentagon sounds like
   * one. */
  private sidesOf(cell: CellId): number {
    if (!this.sides) {
      this.sides = new Map();
      const masks = isBoard3D(this.board) ? this.board.cornerMask : null;
      for (const [id, polygon] of this.board.polygons) {
        this.sides.set(id, shapeMetrics(polygon, masks?.get(id)).sides);
      }
    }
    return this.sides.get(cell) ?? 4;
  }

  /** Where a cell is across the stereo field, -1 (left) .. +1 (right). The
   * renderer answers for what is on screen; the fallback is the cell's place
   * in the mesh, which agrees with it on an unrotated, unzoomed flat board. */
  private panFor(gameCell: CellId): number {
    const geom = this.geomFor(gameCell);
    const projected = this.panOf?.(geom);
    if (projected != null) return projected;
    const anchor = this.mesh.cellAnchor(geom);
    if (!anchor) return 0;
    const view = this.mesh.view;
    const half = view.kind === "flat" ? view.width / 2 : view.radius;
    if (!(half > 0)) return 0;
    return Math.max(-1, Math.min(1, anchor.center[0] / half));
  }

  hover(cell: CellId | null): void {
    this.mesh.setHover(cell);
  }

  private startTimer(): void {
    if (this.startedAt == null) this.startedAt = performance.now();
  }

  /** React to a move that ended the game: stop the clock, then celebrate or
   * mourn. `origin` is the cell the move acted on (where a win wave starts) and
   * `changed` the cells it touched — on a win those include the mines the game
   * auto-flagged, which is exactly the set whose flags cascade in. */
  private checkStop(origin: CellId, changed: CellId[]): void {
    if (this.game.state !== "playing" && this.stoppedAt == null) {
      this.stoppedAt = performance.now();
      if (this.game.state === "lost") {
        this.revealEndState();
        this.mesh.shake();
        // At the mine, not at the click, for the same reason the blast is heard
        // there: a chord detonates a neighbour, and the light belongs where it
        // went off.
        this.mesh.blastMarkers?.(this.geomFor(this.exploded ?? origin));
        haptic("lose");
        // At the mine, not at the click: a chord detonates a neighbour, and
        // the blast belongs where it went off.
        if (soundEnabled()) {
          playSound({ kind: "lose", pan: this.panFor(this.exploded ?? origin) });
        }
      } else if (this.game.state === "won") {
        const autoFlagged = changed.filter(
          (c) => this.game.isMine(c) && this.game.cellState(c) === "flagged",
        );
        this.mesh.celebrateWin(
          this.geomFor(origin),
          autoFlagged.map((c) => this.geomFor(c)),
        );
        haptic("win");
        if (soundEnabled()) playSound({ kind: "win", pan: this.panFor(origin) });
      }
    }
  }

  private apply(changed: CellId[]): void {
    for (const cell of changed) {
      this.mesh.setVisual(this.geomFor(cell), this.visualFor(cell));
    }
  }

  /** On loss, reveal every unflagged mine and cross out every flag that was on
   * a safe cell (a misplaced flag). Correctly flagged mines keep their flag. */
  private revealEndState(): void {
    for (const cell of this.game.cells) {
      const flagged = this.game.cellState(cell) === "flagged";
      const mine = this.game.isMine(cell);
      if ((mine && !flagged) || (!mine && flagged)) {
        this.mesh.setVisual(this.geomFor(cell), this.visualFor(cell));
      }
    }
  }

  private visualFor(cell: CellId): CellVisual {
    const state = this.game.cellState(cell);
    if (state === "flagged") {
      if (this.game.state === "lost" && !this.game.isMine(cell)) {
        return { kind: "wrongFlag" };
      }
      return { kind: "flagged" };
    }
    if (state === "revealed") {
      if (this.game.isMine(cell)) {
        return cell === this.exploded ? { kind: "exploded" } : { kind: "mine" };
      }
      return { kind: "revealed", mines: this.game.adjacentMines(cell) };
    }
    if (this.game.state === "lost" && this.game.isMine(cell)) {
      return { kind: "mine" };
    }
    return { kind: "hidden" };
  }
}
