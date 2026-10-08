import { Color, type Group, type Quaternion, type Texture, type Vector3 } from "three";
import type { CellId, Vec3 } from "../boards/core";
import { MAX_DIGIT_GLYPH, type Glyph } from "./glyphAtlas";
import type { GlowCell } from "./markerGlow";
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
    return Math.min(visual.mines, MAX_DIGIT_GLYPH) as Glyph;
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
  | { kind: "flat"; width: number; height: number; mode: string }
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

type Pt = readonly [number, number];

const signedArea = (points: readonly Pt[]): number => {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    twice += ax * by - bx * ay;
  }
  return twice / 2;
};

/** Whether every edge of `points` faces `center` — the polygon is star-shaped
 * about it, so a fan from `center` covers it exactly and pulling each corner
 * toward `center` keeps every inset loop inside. True of every convex cell and
 * of every concave tile this game drew before Klaassen's heptagon, whose bent
 * strip has no such point at all. */
export function starShapedAbout(points: readonly Pt[], center: Pt): boolean {
  const sign = Math.sign(signedArea(points));
  const eps = 1e-9 * Math.max(1, Math.abs(signedArea(points)));
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    const cross = (bx - ax) * (center[1] - ay) - (by - ay) * (center[0] - ax);
    if (cross * sign < -eps) return false;
  }
  return true;
}

function insidePolygon(points: readonly Pt[], [x, y]: Pt): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The interior point farthest from the polygon's boundary (its pole of
 * inaccessibility), found by a grid search refined three times — the centre of
 * the biggest circle the cell holds, and so where a glyph fits best when the
 * vertex mean is not even inside the cell. Deterministic. */
export function labelPoint(points: readonly Pt[]): [number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const STEPS = 24;
  let best: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestDist = -Infinity;
  let [x0, y0, w, h] = [minX, minY, maxX - minX, maxY - minY];
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const p: [number, number] = [x0 + (w * i) / STEPS, y0 + (h * j) / STEPS];
        if (!insidePolygon(points, p)) continue;
        const d = polygonInradius(points, p);
        if (d > bestDist) [best, bestDist] = [p, d];
      }
    }
    [w, h] = [(w * 4) / STEPS, (h * 4) / STEPS];
    [x0, y0] = [best[0] - w / 2, best[1] - h / 2];
  }
  return best;
}

/** Per corner, the vector that moves it inward by one unit off *both* of its
 * edges — the mitre of an inset loop. `corner + mitre[i] * d` is the polygon
 * offset inward by `d`, which, unlike pulling every corner toward one centre,
 * stays inside a polygon that is not star-shaped. */
export function insetMitres(points: readonly Pt[]): [number, number][] {
  const n = points.length;
  const sign = Math.sign(signedArea(points));
  const normal = (a: Pt, b: Pt): [number, number] => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(dx, dy) || 1;
    // the inward side: left of the edge on a counter-clockwise polygon
    return [(-dy / len) * sign, (dx / len) * sign];
  };
  return points.map((p, i) => {
    const n1 = normal(points[(i + n - 1) % n]!, p);
    const n2 = normal(p, points[(i + 1) % n]!);
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return k < 1e-9 ? n1 : [(n1[0] + n2[0]) / k, (n1[1] + n2[1]) / k];
  });
}

/** `points` with every corner rounded off: each corner is replaced by three
 * points on a quadratic curve from a little way back along its incoming edge,
 * through near the corner, to the same share of its outgoing one. Works on 2D
 * and 3D polygons alike (a solid's cells are not quite planar, and a curve
 * through three points of the polygon stays on it).
 *
 * `edgeFrac` is that share — how much of **each edge** the curve takes at
 * either end — capped under half so two corners never cross. A share of the
 * edge rather than a distance, so every shape keeps the same proportion of its
 * edges straight: a distance measured off the cell's size takes 30% of a
 * hexagon's edge where it takes 17% of a triangle's, and the hexagons of a
 * mixed tiling went round long before its triangles did. This is a geometry
 * game; the shapes have to stay legible.
 *
 * A straight "corner" (a T-vertex) comes out as three points on the straight
 * edge, which is harmless. The count is always `3 * points.length`, so a
 * cell's vertex count stays a function of its side count — which is what lets
 * a cell be re-cut in place (see cellStyle.ts). */
export function roundCorners<P extends readonly number[]>(
  points: readonly P[],
  edgeFrac: number,
): P[] {
  const frac = Math.max(0, Math.min(edgeFrac, 0.45));
  const n = points.length;
  const out: P[] = [];
  const dim = points[0]?.length ?? 2;
  const at = (a: P, b: P, t: number): P =>
    Array.from({ length: dim }, (_, k) => a[k]! + (b[k]! - a[k]!) * t) as unknown as P;
  const len = (a: P, b: P): number => {
    let s = 0;
    for (let k = 0; k < dim; k++) s += (b[k]! - a[k]!) ** 2;
    return Math.sqrt(s);
  };
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const u0 = len(cur, prev) > 0 ? frac : 0;
    const u1 = len(cur, next) > 0 ? frac : 0;
    const a = at(cur, prev, u0);
    const b = at(cur, next, u1);
    // The curve's midpoint: (a + 2 cur + b) / 4.
    const mid = Array.from(
      { length: dim },
      (_, k) => (a[k]! + 2 * cur[k]! + b[k]!) / 4,
    ) as unknown as P;
    out.push(a, mid, b);
  }
  return out;
}

/** The named meshes a pick ray is cast against, nearest hit wins (see
 * `Renderer.pick`). `"cells"` is the drawn tiles; `"base"` is the grout a solid
 * lays under them, over the *whole* of every cell polygon. The grout has to be
 * picked as well as drawn: a cell's tile is shrunk by the cell style's gap, and
 * a ray aimed at a gap misses the tile it looks like it hit. On a flat board
 * that only makes the click do nothing, but on a two-sided surface (cylinder,
 * Möbius strip, Klein bottle) both faces are drawn, so the ray carried on
 * through the tube and came out on a cell of the *far* sheet — a click on the
 * grout line between two tiles opened, or detonated, a cell on the other side
 * of the board. */
export type PickLayer = "cells" | "base";
export const PICK_LAYERS: readonly PickLayer[] = ["cells", "base"];

export interface BoardMesh extends Group {
  readonly view: BoardView;
  /** The cell a pick ray hit: the face index within the layer's mesh, and
   * which layer that was (a mesh with no grout may ignore it). */
  cellForFace(faceIndex: number, layer?: PickLayer): CellId | null;
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
  /** Land a flag placed by holding the cell: an oversized flag shrinks into
   * it. The finger doing the holding is covering that cell, so the flag has to
   * start outside the fingertip to be seen at all. Only that gesture calls
   * this — see `GameSession.flag` — and `ms` is that gesture's own length (the
   * hold that placed the flag), so the landing never outlasts the press. */
  dropFlag(cell: CellId, ms?: number): void;
  /** Jitter the whole board and settle it (a detonated mine). */
  shake(): void;
  /** Celebrate a cleared board: a gold wave sweeping out from the winning cell
   * over every tile, with `flagged` (the mines the win auto-flagged) popping
   * their flags in as the wave reaches them. */
  celebrateWin(origin: CellId | null, flagged: CellId[]): void;
  /** Advance animations to `now`; returns whether another frame is needed. The
   * renderer calls this every frame and keeps rendering while it is true. */
  tickAnimations(now: number): boolean;

  // -- tile motion (see render/cellMotion.ts) --------------------------------
  /** A closed cell is being pressed (null: nothing is). It sinks a little
   * until the press ends, so the input answers before the finger lifts. */
  press(cell: CellId | null): void;
  /** A flag went in or came out: the tile is pushed and springs back. */
  bounce(cell: CellId): void;
  /** A chord on `cell` reached `reach`: they dip in turn, or — when the chord
   * could not open anything — shake. */
  chordFeedback(cell: CellId, reach: CellId[], ok: boolean): void;
  /** A mine went off on `cell`: the blast front, the other mines popping in by
   * distance, and the board fading to grey around the one that went off. */
  detonate(cell: CellId | null, mines: CellId[]): void;
  /** A new board assembles from its middle out. */
  assemble(): void;
  /** The board's mean cell radius, in mesh-local units — the scale an effect
   * drawn over the board (a burst, confetti) is sized by. */
  readonly cellRadius: number;
  /** Turn the look-only effects on (with the scene's reflection map) or off
   * (null) — see render/quality.ts. */
  setEffects(env: Texture | null): void;

  // -- the Realistic marker glow (see render/markerGlow.ts) -------------------
  // Only a board that stands real pins and bombs has anything to light, so all
  // three are optional and the flat board implements none of them.

  /** Whether a move is worth measuring for the marker glow — true only on a
   * board with markers whose glow is live. `GameSession` asks first, so a board
   * with animations off never pays for the walk. */
  readonly wantsMarkerGlow?: boolean;
  /** Light the markers for the cells a move just opened, as a front spreading
   * from `origin` at the reveal ripple's pace. How bright follows how many
   * cells opened, and what colour follows what shape they were — the same two
   * facts the sound cascade is built from. */
  glowMarkers?(cells: GlowCell[], origin: CellId | null): void;
  /** Set the markers alight: a mine went off on `cell`. */
  blastMarkers?(cell: CellId | null): void;
  /** How lit the markers are at this instant — the test seam's only window on
   * an effect that lives entirely in a shader uniform. Null when there is
   * nothing to light. */
  markerGlowLevel?(): { amount: number; blast: number; base: number } | null;
}
