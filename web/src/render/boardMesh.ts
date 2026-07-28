import { Color, type Group, type Quaternion, type Vector3 } from "three";
import type { CellId, Vec3 } from "../boards/core";
import type { Glyph } from "./glyphAtlas";
import type { CellPalette } from "./shapePalette";

// Shared vocabulary of the two board meshes (flat PolygonBoard, 3D
// SolidBoard): per-cell visual state, the classic palette, and the interface
// the renderer/session drive. One pipeline — the meshes differ only in how
// the beveled cell geometry is laid out (z=0 plane vs the solid's surface).

export type CellVisual =
  | { kind: "hidden" }
  | { kind: "flagged" }
  | { kind: "wrongFlag" } // a flag on a safe cell, revealed on loss (crossed out)
  | { kind: "revealed"; mines: number }
  | { kind: "mine" }
  | { kind: "exploded" };

// Classic minesweeper gray palette: raised silver tiles, a much lighter flat
// face for opened cells, a red exploded cell. The hidden/opened step is wide
// on purpose. A flat board is lit head-on by a fixed light, so every top face
// shades by the same factor (~0.6) and the albedo step is *all* the contrast
// there is — a subtle one collapsed to a few percent of on-screen luminance
// and the board read as uniformly gray.
//
// These are the neutral fallback now: a mesh passes `baseColorFor` the
// shape-coded pair for the cell (render/shapePalette.ts), which tints these
// exact lightnesses by the cell's polygon. `exploded` is never shape-coded —
// a detonated mine has one meaning on every board.
export const COLORS = {
  hidden: new Color("#b4b4b4"),
  revealed: new Color("#ececec"),
  flagged: new Color("#b4b4b4"),
  mine: new Color("#ececec"),
  exploded: new Color("#e05a5a"),
};

/** The colour a cell is blended toward at the crest of the win wave, and how far
 * that blend is then overdriven. The grays are unsaturated, so mixing a
 * saturated colour in is what reads as gold — but the board's diffuse lighting
 * darkens a tile to roughly a third of its albedo, and any in-gamut gold comes
 * out of that as mud. So the crest is pushed *past* white (vertex colours are
 * plain floats, not clamped to 1) and the shading brings it back down bright:
 * the wave glows rather than staining. Both meshes light the same way, so one
 * pair of numbers serves the flat palette above and the solid's wider one. */
export const WIN_TINT = new Color("#ffc233");
export const WIN_GLOW = 1.4;

/** The settled colour of a cell in this state. `palette` is the cell's
 * shape-coded hidden/opened pair; without one the neutral grays are used. */
export function baseColorFor(visual: CellVisual, palette?: CellPalette): Color {
  switch (visual.kind) {
    case "hidden":
      return palette?.hidden ?? COLORS.hidden;
    case "flagged":
    case "wrongFlag":
      return palette?.hidden ?? COLORS.flagged;
    case "revealed":
      return palette?.revealed ?? COLORS.revealed;
    case "mine":
      return palette?.revealed ?? COLORS.mine;
    case "exploded":
      return COLORS.exploded;
  }
}

/** Whether a cell is *opened* — drawn sunken rather than as a raised button.
 * Both meshes cut their cell geometry from this. */
export function isOpened(visual: CellVisual): boolean {
  return (
    visual.kind === "revealed" ||
    visual.kind === "mine" ||
    visual.kind === "exploded"
  );
}

export function glyphFor(visual: CellVisual): Glyph | null {
  if (visual.kind === "flagged") return "flag";
  if (visual.kind === "wrongFlag") return "wrongFlag";
  if (visual.kind === "mine" || visual.kind === "exploded") return "mine";
  if (visual.kind === "revealed" && visual.mines > 0) {
    return Math.min(visual.mines, 12) as Glyph;
  }
  return null;
}

/** How the renderer should frame the mesh: a flat board is fit into an
 * orthographic frustum by extent; a solid is scaled to the unit sphere and
 * viewed with the perspective camera. `hull` carries the solid's outermost
 * drawn points (mesh-local, xyz triples) so the camera can be fit to the
 * board's real silhouette at its current orientation — the unit sphere is a
 * loose bound for the flat ones (a torus, a cylinder, the Klein bottle),
 * which would otherwise float in the middle of a phone screen. */
export type BoardView =
  | { kind: "flat"; width: number; height: number }
  | { kind: "solid"; radius: number; hull: Float32Array };

/** A cell's anchor in mesh-local coordinates: the centre of its (raised) top
 * face and the outward face normal — what picking feedback, glyph placement
 * and the `cellScreenXY` test seam need. */
export interface CellAnchor {
  center: Vec3;
  normal: Vec3;
}

/** Distance from `center` to the nearest polygon edge (port of gui.py's
 * `inradius`) — how big a glyph fits inside the cell without crossing its
 * edges. Zero/negative means the polygon is degenerate (e.g. seen edge-on). */
export function polygonInradius(
  points: readonly (readonly [number, number])[],
  center: readonly [number, number],
): number {
  let best = Infinity;
  const [px, py] = center;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}

export interface BoardMesh extends Group {
  readonly view: BoardView;
  cellForFace(faceIndex: number): CellId | null;
  cellAnchor(cell: CellId): CellAnchor | null;
  setVisual(cell: CellId, visual: CellVisual): void;
  setHover(cell: CellId | null): void;
  /** Told the current board rotation and camera position so view-dependent
   * content (billboarded glyphs, per-cell glyph culling on closed surfaces)
   * can follow; meshes without any may omit it. */
  orient?(rotation: Quaternion, cameraWorldPos: Vector3): void;
  /** Told that the renderer is drawing this board turned a quarter-turn (a
   * landscape flat board on a portrait viewport), so its glyphs can be
   * counter-rotated and stay upright. Only flat boards are ever turned. */
  setQuarterTurn?(on: boolean): void;

  // -- animations (see render/animations.ts) ---------------------------------
  /** Enable or disable this board's animations (reduced-motion / test seam).
   * Disabling drops any in-flight animation and renders the settled state. */
  setAnimationsEnabled(on: boolean): void;
  /** Flash the freshly revealed cells, rippling outward from `origin`. */
  pulseReveal(cells: CellId[], origin: CellId | null): void;
  /** Land a flag the player just placed: an oversized flag shrinks into the
   * cell. The finger that placed it by holding the cell is covering that cell,
   * so the flag has to start outside the fingertip to be seen at all. */
  dropFlag(cell: CellId): void;
  /** Jitter the whole board and settle it (a detonated mine). */
  shake(): void;
  /** Celebrate a cleared board: a gold wave sweeping out from the winning cell
   * over every tile, with `flagged` (the mines the win auto-flagged) popping
   * their flags in as the wave reaches them. */
  celebrateWin(origin: CellId | null, flagged: CellId[]): void;
  /** Advance animations to `now`; returns whether another frame is needed. The
   * renderer calls this every frame and keeps rendering while it is true. */
  tickAnimations(now: number): boolean;
}
