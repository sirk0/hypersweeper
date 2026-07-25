import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import type { Board, CellId, Vertex } from "../boards/core";
import {
  baseColorFor,
  glyphFor,
  isOpened,
  polygonInradius,
  WIN_GLOW,
  WIN_TINT,
  type BoardMesh,
  type BoardView,
  type CellAnchor,
  type CellVisual,
} from "./boardMesh";
import { makeGlyphAtlas, type GlyphAtlas } from "./glyphAtlas";
import { CellAnimations, rippleEntries, WIN_PER_CELL } from "./animations";
import { cellPalette, classifyShapes, type CellPalette } from "./shapePalette";

// Renders an arbitrary flat polygon board (square / triangle / hex / ...) as
// one merged beveled geometry: each convex cell becomes a top face
// (fan-triangulated) ringed by bevel quads — raised while the cell is closed,
// re-cut as a recess once it is opened. Both the geometry and the colour of a
// cell are ranged updates into the shared buffers; a single glyph-atlas mesh
// batches the number/flag/mine quads. The 3D SolidBoard lays the same
// construction out on a solid's surface.

const SHRINK = 0.04; // pull the whole cell in from shared edges -> visible gaps
const BEVEL = 0.16; // extra inset of the raised top face
const HEIGHT_FRAC = 0.24; // bevel height as a fraction of the cell's "radius"
// An opened cell is cut the other way round: a thin rim (so the sunken face
// still reads full-size) dropping to a floor *below* the board plane. Under
// the fixed key light that inverts the button's highlight and shadow — the
// lit edge moves from the top of the tile to the bottom — which is what makes
// open and closed cells tell apart at a glance. Colour alone could not: a flat
// board is lit head-on, so every top face shades identically and only the
// albedo step (COLORS) survives. The 3D boards get this same raised/sunken
// distinction from SolidBoard's FLAT_FRAC.
const SUNK_BEVEL = 0.07; // inset of the sunken floor (a narrow rim)
const SUNK_FRAC = -0.09; // recess depth, as a fraction of the cell's "radius"

interface CellGeom {
  start: number; // first vertex index in the position/color buffers
  count: number; // vertex count for this cell
  poly: Vertex[]; // the cell's polygon in render space (centred, y up)
  center: Vertex; // render-space centroid (x, y)
  radius: number; // mean distance centroid -> vertices (bevel height)
  inradius: number; // distance centroid -> nearest edge (glyph sizing)
  palette: CellPalette; // hidden/opened tones for this cell's shape
}

export class PolygonBoard extends Group implements BoardMesh {
  readonly view: BoardView;
  private readonly order: CellId[];
  private readonly cellIndex = new Map<CellId, number>();
  private readonly geom: CellGeom[] = [];
  private readonly faceCell: Int32Array;
  private readonly positionAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  private readonly glyphGeometry = new BufferGeometry();
  private readonly atlas: GlyphAtlas;
  private readonly states: CellVisual[];
  private hovered = -1;
  // The renderer turns a landscape board a quarter-turn on a portrait
  // viewport; the digits/flags are counter-rotated so they stay upright.
  private quarterTurn = false;
  private readonly anim = new CellAnimations();
  private meanRadius = 1;

  constructor(board: Board) {
    super();
    this.atlas = makeGlyphAtlas();
    this.order = [...board.polygons.keys()];
    this.states = this.order.map(() => ({ kind: "hidden" }));
    this.order.forEach((c, i) => this.cellIndex.set(c, i));

    // Centre the board on the origin; flip y so the pixel-space board (y down)
    // renders upright (y up).
    const cx = board.width / 2;
    const cy = board.height / 2;
    this.view = { kind: "flat", width: board.width, height: board.height };

    const faceCell: number[] = [];
    let vertexCount = 0;
    // Shape colour coding: classed over the whole board at once, so a tiling
    // the surface immersion has bent stays one colour instead of a gradient.
    const tones = classifyShapes(board.polygons);

    this.order.forEach((cell, ci) => {
      const poly = board.polygons.get(cell)!.map(([x, y]) => [x - cx, cy - y] as Vertex);
      const centroid: Vertex = [
        poly.reduce((s, p) => s + p[0], 0) / poly.length,
        poly.reduce((s, p) => s + p[1], 0) / poly.length,
      ];
      const radius =
        poly.reduce((s, p) => s + Math.hypot(p[0] - centroid[0], p[1] - centroid[1]), 0) /
        poly.length;
      const n = poly.length;
      // n fan triangles for the top face, 2n for the bevel ring
      const count = 9 * n;
      for (let e = 0; e < n; e++) faceCell.push(ci);
      for (let e = 0; e < n; e++) faceCell.push(ci, ci);
      this.geom.push({
        start: vertexCount,
        count,
        poly,
        center: centroid,
        radius,
        inradius: polygonInradius(poly, centroid),
        palette: cellPalette(tones.get(cell)!, "flat"),
      });
      vertexCount += count;
    });

    this.faceCell = Int32Array.from(faceCell);
    const geometry = new BufferGeometry();
    this.positionAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute("position", this.positionAttr);
    this.colorAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute("color", this.colorAttr);
    // No normal attribute: the material shades flat, so three.js derives each
    // facet's normal in the fragment shader. That is what lets a cell's
    // geometry be re-cut (raised <-> sunken) by writing positions alone.

    const cells = new Mesh(
      geometry,
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0,
        flatShading: true,
        // Cell polygons come from the board builders with per-board winding, so
        // some top faces point away from the camera. DoubleSide keeps them lit
        // and, crucially, raycast-pickable regardless of winding.
        side: DoubleSide,
      }),
    );
    cells.name = "cells";
    this.add(cells);

    const glyphMesh = new Mesh(
      this.glyphGeometry,
      new MeshBasicMaterial({
        map: this.atlas.texture,
        transparent: true,
        alphaTest: 0.4,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    glyphMesh.name = "glyphs";
    glyphMesh.renderOrder = 1;
    this.add(glyphMesh);

    this.meanRadius =
      this.geom.reduce((s, g) => s + g.radius, 0) / (this.geom.length || 1);

    for (let i = 0; i < this.order.length; i++) {
      this.writeGeometry(i);
      this.writeColor(i);
    }
    // Cells are re-cut in place afterwards, so pad the (raised-state) bounds by
    // the deepest recess a cell can take rather than recomputing per update.
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      const maxRadius = this.geom.reduce((m, g) => Math.max(m, g.radius), 0);
      geometry.boundingSphere.radius += maxRadius * (HEIGHT_FRAC - SUNK_FRAC);
    }
    this.rebuildGlyphs();
  }

  get cellCount(): number {
    return this.order.length;
  }

  cellForFace(faceIndex: number): CellId | null {
    const ci = this.faceCell[faceIndex];
    return ci == null ? null : (this.order[ci] ?? null);
  }

  cellAnchor(cell: CellId): CellAnchor | null {
    const i = this.cellIndex.get(cell);
    if (i == null) return null;
    const g = this.geom[i]!;
    return { center: [g.center[0], g.center[1], 0], normal: [0, 0, 1] };
  }

  setVisual(cell: CellId, visual: CellVisual): void {
    const i = this.cellIndex.get(cell);
    if (i == null) return;
    const wasOpen = isOpened(this.states[i]!);
    this.states[i] = visual;
    if (isOpened(visual) !== wasOpen) this.writeGeometry(i);
    this.writeColor(i);
    this.rebuildGlyphs();
  }

  setHover(cell: CellId | null): void {
    const i = cell == null ? -1 : (this.cellIndex.get(cell) ?? -1);
    if (i === this.hovered) return;
    const prev = this.hovered;
    this.hovered = i;
    if (prev >= 0) this.writeColor(prev);
    if (i >= 0) this.writeColor(i);
  }

  /** (Re)cut one cell into the shared position buffer: a raised beveled button
   * while it is closed, a recess below the board plane once it is opened. */
  private writeGeometry(i: number): void {
    const g = this.geom[i]!;
    const open = isOpened(this.states[i]!);
    const height = g.radius * (open ? SUNK_FRAC : HEIGHT_FRAC);
    const inset = open ? SUNK_BEVEL : BEVEL;
    const n = g.poly.length;
    const outer = g.poly.map((p) => lerp(p, g.center, SHRINK));
    const top = g.poly.map((p) => lerp(p, g.center, SHRINK + inset));

    let v = g.start;
    const put = (p: Vertex, z: number) => this.positionAttr.setXYZ(v++, p[0], p[1], z);
    // top face: fan from the centroid over the inset polygon
    for (let e = 0; e < n; e++) {
      put(g.center, height);
      put(top[e]!, height);
      put(top[(e + 1) % n]!, height);
    }
    // bevel ring: outer edge (z=0) to the inset top edge (z=height) — a wall
    // sloping up and out on a closed cell, down and in on an opened one
    for (let e = 0; e < n; e++) {
      const a = e;
      const b = (e + 1) % n;
      put(outer[a]!, 0);
      put(outer[b]!, 0);
      put(top[b]!, height);
      put(outer[a]!, 0);
      put(top[b]!, height);
      put(top[a]!, height);
    }
    this.positionAttr.needsUpdate = true;
  }

  private writeColor(i: number): void {
    const col = baseColorFor(this.states[i]!, this.geom[i]!.palette).clone();
    if (i === this.hovered && this.states[i]!.kind === "hidden") {
      col.offsetHSL(0, 0, 0.08);
    }
    const now = performance.now();
    const light = this.anim.lightness(i, now);
    if (light) col.offsetHSL(0, 0, light);
    const win = this.anim.winMix(i, now);
    if (win) col.lerp(WIN_TINT, win).multiplyScalar(1 + win * WIN_GLOW);
    const g = this.geom[i]!;
    for (let v = 0; v < g.count; v++) {
      this.colorAttr.setXYZ(g.start + v, col.r, col.g, col.b);
    }
    this.colorAttr.needsUpdate = true;
  }

  /** Draw the glyphs counter-rotated (the board is being shown turned). */
  setQuarterTurn(on: boolean): void {
    if (on === this.quarterTurn) return;
    this.quarterTurn = on;
    this.rebuildGlyphs();
  }

  private rebuildGlyphs(): void {
    const pos: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < this.order.length; i++) {
      const glyph = glyphFor(this.states[i]!);
      if (glyph === null) continue;
      const uv = this.atlas.uv(glyph);
      if (!uv) continue;
      const g = this.geom[i]!;
      const [cxp, cyp] = g.center;
      // Sized by the inradius so the glyph stays inside the cell even on
      // pointy cells (triangles) where the mean vertex distance overshoots;
      // a flag pop scales this briefly for the spring-in.
      const s = g.inradius * 0.9 * this.anim.popScale(i, performance.now());
      const z = g.radius * HEIGHT_FRAC + 0.01;
      const [u0, v0, u1, v1] = uv;
      // Quad corners around the cell centre; turned a quarter-turn (with the
      // UVs left alone) when the board itself is drawn turned, so the glyph
      // lands upright on screen.
      const at = (dx: number, dy: number): [number, number, number] =>
        this.quarterTurn ? [cxp - dy, cyp + dx, z] : [cxp + dx, cyp + dy, z];
      pos.push(
        ...at(-s, -s), ...at(s, -s), ...at(s, s),
        ...at(-s, -s), ...at(s, s), ...at(-s, s),
      );
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    }
    this.glyphGeometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    this.glyphGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    this.glyphGeometry.computeBoundingSphere();
  }

  // -- animations ------------------------------------------------------------

  setAnimationsEnabled(on: boolean): void {
    this.anim.enabled = on;
    if (!on) {
      this.anim.reset();
      this.position.set(0, 0, 0);
      for (let i = 0; i < this.order.length; i++) this.writeColor(i);
      this.rebuildGlyphs();
    }
  }

  pulseReveal(cells: CellId[], origin: CellId | null): void {
    if (!this.anim.enabled) return;
    const oi = origin != null ? this.cellIndex.get(origin) : undefined;
    const oc = oi != null ? this.geom[oi]!.center : null;
    const list: { index: number; center: readonly number[] }[] = [];
    for (const cell of cells) {
      const i = this.cellIndex.get(cell);
      if (i != null) list.push({ index: i, center: this.geom[i]!.center });
    }
    this.anim.startReveals(rippleEntries(list, oc, this.meanRadius), performance.now());
  }

  popFlag(cell: CellId): void {
    const i = this.cellIndex.get(cell);
    if (i != null) this.anim.startPop(i, performance.now());
  }

  shake(): void {
    this.anim.startShake(this.view.kind === "flat" ? this.view.width * 0.02 : 0, performance.now());
  }

  celebrateWin(origin: CellId | null, flagged: CellId[]): void {
    if (!this.anim.enabled) return;
    const oi = origin != null ? this.cellIndex.get(origin) : undefined;
    const oc = oi != null ? this.geom[oi]!.center : null;
    // The wave washes over the whole board, not just the cells the winning
    // move opened, so it reads as one sweep however the game was finished.
    const entries = rippleEntries(
      this.geom.map((g, i) => ({ index: i, center: g.center })),
      oc,
      this.meanRadius,
      WIN_PER_CELL,
    );
    const now = performance.now();
    this.anim.startWin(entries, now);
    // The mines the win auto-flagged pop in on the same stagger, so the flags
    // appear in the wake of the wave rather than all at once.
    for (const cell of flagged) {
      const i = this.cellIndex.get(cell);
      if (i != null) this.anim.startPop(i, now, entries[i]?.delay ?? 0);
    }
  }

  tickAnimations(now: number): boolean {
    if (!this.anim.pending()) return false;
    const step = this.anim.step(now);
    for (const i of step.recolor) this.writeColor(i);
    if (step.glyphsDirty) this.rebuildGlyphs();
    this.position.set(step.offset[0], step.offset[1], 0);
    return step.active;
  }
}

function lerp(p: Vertex, q: Vertex, t: number): Vertex {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}
