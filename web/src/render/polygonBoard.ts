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
import {
  CellAnimations,
  dropOpacity,
  dropRise,
  dropSize,
  rippleEntries,
  WIN_PER_CELL,
} from "./animations";
import { cellPalette, classifyShapes, type CellPalette, corners } from "./shapePalette";
import {
  cellStyle,
  cellStyleLoops,
  cellVertexCount,
  vertexShade,
  type CellProfile,
  type CellStyle,
} from "./cellStyle";

// Renders an arbitrary flat polygon board (square / triangle / hex / ...) as
// one merged geometry: each convex cell becomes a top face (fan-triangulated)
// ringed by the walls of its profile's loops — raised while the cell is closed,
// re-cut as a recess once it is opened. How deep, how many loops and how glossy
// is the player's `CellStyle` (render/cellStyle.ts); classic is the beveled
// button this game has always drawn. Both the geometry and the colour of a
// cell are ranged updates into the shared buffers; a single glyph-atlas mesh
// batches the number/flag/mine quads. The 3D SolidBoard lays the same
// construction out on a solid's surface.

interface CellGeom {
  start: number; // first vertex index in the position/color buffers
  count: number; // vertex count for this cell
  poly: Vertex[]; // the cell's polygon in render space (centred, y up)
  center: Vertex; // render-space centroid (x, y) — the fan/bevel/highlight anchor
  radius: number; // mean distance centroid -> vertices (bevel height)
  glyphCenter: Vertex; // where the glyph is centred — board.glyphAnchor if the
  //   board supplies one (a concave tile whose true centroid is a bad glyph
  //   spot), else the same as `center`
  glyphInradius: number; // distance glyphCenter -> nearest edge (glyph sizing)
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
  // The dropping flag is a mesh of its own rather than one more quad in the
  // glyph buffer: it is drawn many times cell-size, so it has to sit above
  // every neighbouring number instead of taking its turn in cell order, and
  // being its own material is what lets it fade in as it shrinks.
  private readonly dropGeometry = new BufferGeometry();
  private readonly dropMaterial: MeshBasicMaterial;
  private readonly atlas: GlyphAtlas;
  private readonly states: CellVisual[];
  private hovered = -1;
  // The renderer turns a landscape board a quarter-turn on a portrait
  // viewport; the digits/flags are counter-rotated so they stay upright.
  private quarterTurn = false;
  private readonly anim = new CellAnimations();
  private meanRadius = 1;
  /** The relief every cell is cut with (the player's cell style), and the
   * highest point of it — where a glyph is floated so it clears the top face of
   * a closed *and* an opened cell. */
  private readonly profile: CellProfile;
  private readonly glyphHeight: number;
  /** How far the win wave's crest is overdriven past the gold tint — the
   * style's, since an unlit board has no shading to bring the overdrive back
   * down (see CellStyle.winGlow). */
  private readonly winGlow: number;
  /** The style's across-the-tile brightness gradients — one per cell state, so
   * an opened cell can be a different *material* from a closed one (see
   * CellStyle.openShade) — and the loop count they are ramped over. */
  private readonly shade: CellStyle["shade"];
  private readonly openShade: CellStyle["shade"];
  private readonly loops: number;
  /** Multiplier on every tile colour. 1 on an unlit style, whose tiles already
   * arrive as the palette named them; a lit one may pay back what the diffuse
   * shading takes (see CellStyle.albedo). */
  private readonly albedo: number;
  /** How opaque an opened cell is drawn, or `null` on a style with no
   * translucency — which is also what decides whether the colour buffer carries
   * an alpha channel at all (see the constructor). */
  private readonly openAlpha: number | null;

  constructor(board: Board, style: CellStyle = cellStyle(null)) {
    super();
    this.profile = style.flat;
    this.albedo = style.unlit ? 1 : (style.albedo ?? 1);
    // The albedo boost already brightens the win crest, so it comes *out* of
    // the overdrive rather than stacking on top of it: the wave peaks at the
    // brightness it always did instead of clipping to white there.
    this.winGlow = (1 + (style.winGlow ?? WIN_GLOW)) / this.albedo - 1;
    this.shade = style.shade;
    this.openShade = style.openShade ?? style.shade;
    this.loops = cellStyleLoops(this.profile);
    this.openAlpha = style.openAlpha ?? null;
    this.glyphHeight = Math.max(
      ...this.profile.closed.map((l) => l.height),
      ...this.profile.open.map((l) => l.height),
    );
    this.atlas = makeGlyphAtlas();
    this.order = [...board.polygons.keys()];
    this.states = this.order.map(() => ({ kind: "hidden" }));
    this.order.forEach((c, i) => this.cellIndex.set(c, i));

    // Centre the board on the origin; flip y so the pixel-space board (y down)
    // renders upright (y up).
    const cx = board.width / 2;
    const cy = board.height / 2;
    this.view = {
      kind: "flat",
      width: board.width,
      height: board.height,
      mode: board.mode,
    };

    const faceCell: number[] = [];
    let vertexCount = 0;
    // Shape colour coding: classed over the whole board at once, so a tiling
    // the surface immersion has bent stays one colour instead of a gradient.
    const tones = classifyShapes(board.polygons);

    this.order.forEach((cell, ci) => {
      const poly = board.polygons.get(cell)!.map(([x, y]) => [x - cx, cy - y] as Vertex);
      // Measured off the cell's **real corners** — see the note in
      // solidBoard.ts's `rebuild`. A tiling that is not edge to edge carries
      // T-vertices, and an unweighted vertex mean is dragged toward whichever
      // edge has them, which both shrinks the glyph (the inradius is a `min`
      // over the edges, so the pulled-toward edge wins) and shoves it
      // off-centre. Most of the bonds are safe by accident, their T-vertices
      // being centrally symmetric; the three-brick basket weave is not, and had
      // been drawing the numbers on its two outer bricks at two thirds size.
      // Identity for every board with no T-vertex.
      const shape = corners(poly) as Vertex[];
      const centroid: Vertex = [
        shape.reduce((s, p) => s + p[0], 0) / shape.length,
        shape.reduce((s, p) => s + p[1], 0) / shape.length,
      ];
      const radius =
        shape.reduce((s, p) => s + Math.hypot(p[0] - centroid[0], p[1] - centroid[1]), 0) /
        shape.length;
      const anchor = board.glyphAnchor?.get(cell);
      const glyphCenter: Vertex = anchor ? [anchor[0] - cx, cy - anchor[1]] : centroid;
      const n = poly.length;
      // n fan triangles for the top face, 2n for each ring of walls under it
      const count = cellVertexCount(n, this.profile);
      for (let t = 0; t < count / 3; t++) faceCell.push(ci);
      this.geom.push({
        start: vertexCount,
        count,
        poly,
        center: centroid,
        radius,
        glyphCenter,
        glyphInradius: polygonInradius(shape, glyphCenter),
        palette: cellPalette(tones.get(cell)!, "flat", style.monochrome),
      });
      vertexCount += count;
    });

    this.faceCell = Int32Array.from(faceCell);
    const geometry = new BufferGeometry();
    this.positionAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute("position", this.positionAttr);
    // RGB, or RGBA on a style whose opened cells let the page through: three.js
    // reads a per-vertex alpha only from a 4-component colour attribute, so the
    // channel is added exactly where it is used and every other style keeps the
    // buffer (and the shader) it always had.
    const channels = this.openAlpha === null ? 3 : 4;
    this.colorAttr = new BufferAttribute(new Float32Array(vertexCount * channels), channels);
    geometry.setAttribute("color", this.colorAttr);
    // No normal attribute: the material shades flat, so three.js derives each
    // facet's normal in the fragment shader. That is what lets a cell's
    // geometry be re-cut (raised <-> sunken) by writing positions alone.

    // A translucent board still writes depth: the tiles of a tiling do not
    // overlap each other on screen, so nothing behind a tile needs to survive
    // it, and keeping the depth write is what stops a cell's own walls from
    // showing through its top face.
    const translucent = this.openAlpha === null ? {} : { transparent: true };
    const cells = new Mesh(
      geometry,
      // Cell polygons come from the board builders with per-board winding, so
      // some top faces point away from the camera. DoubleSide keeps them lit
      // and, crucially, raycast-pickable regardless of winding.
      style.unlit
        ? new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, ...translucent })
        : new MeshStandardMaterial({
            vertexColors: true,
            ...style.material,
            flatShading: true,
            side: DoubleSide,
            ...translucent,
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

    // depthTest off, drawn last: the dropping flag hangs over the board rather
    // than lying on it, so nothing occludes it for the fraction of a second it is
    // in the air. `pick` only ever raycasts the "cells" mesh, so this one can
    // span half the board without swallowing taps.
    this.dropMaterial = new MeshBasicMaterial({
      map: this.atlas.texture,
      transparent: true,
      alphaTest: 0.4,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const dropMesh = new Mesh(this.dropGeometry, this.dropMaterial);
    dropMesh.name = "flagDrop";
    dropMesh.renderOrder = 2;
    this.add(dropMesh);

    this.meanRadius =
      this.geom.reduce((s, g) => s + g.radius, 0) / (this.geom.length || 1);

    for (let i = 0; i < this.order.length; i++) {
      this.writeGeometry(i);
      this.writeColor(i);
    }
    // Cells are re-cut in place afterwards, so pad the (raised-state) bounds by
    // the full relief the style can take rather than recomputing per update.
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      const maxRadius = this.geom.reduce((m, g) => Math.max(m, g.radius), 0);
      const lowest = Math.min(
        ...this.profile.closed.map((l) => l.height),
        ...this.profile.open.map((l) => l.height),
      );
      geometry.boundingSphere.radius += maxRadius * (this.glyphHeight - lowest);
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

  /** (Re)cut one cell into the shared position buffer, at the current cell
   * style's profile for its state: the loops of the cell's polygon, pulled in
   * and lifted (or sunk) in turn, with the innermost one filled as the top
   * face. The two states declare the same number of loops, so the recut lands
   * in exactly the slice of the buffer the other state wrote. */
  private writeGeometry(i: number): void {
    const g = this.geom[i]!;
    const loops = isOpened(this.states[i]!) ? this.profile.open : this.profile.closed;
    const n = g.poly.length;
    const rings = loops.map((loop) => ({
      points: g.poly.map((p) => lerp(p, g.center, this.profile.gap + loop.inset)),
      z: g.radius * loop.height,
    }));

    let v = g.start;
    const put = (p: Vertex, z: number) => this.positionAttr.setXYZ(v++, p[0], p[1], z);
    // top face: fan from the centroid over the innermost loop
    const top = rings[rings.length - 1]!;
    for (let e = 0; e < n; e++) {
      put(g.center, top.z);
      put(top.points[e]!, top.z);
      put(top.points[(e + 1) % n]!, top.z);
    }
    // one ring of walls per gap between consecutive loops — sloping up and out
    // on a closed cell, down and in on an opened one, which is what inverts the
    // highlight and shadow under the fixed key light
    for (let r = 1; r < rings.length; r++) {
      const low = rings[r - 1]!;
      const high = rings[r]!;
      for (let e = 0; e < n; e++) {
        const a = e;
        const b = (e + 1) % n;
        put(low.points[a]!, low.z);
        put(low.points[b]!, low.z);
        put(high.points[b]!, high.z);
        put(low.points[a]!, low.z);
        put(high.points[b]!, high.z);
        put(high.points[a]!, high.z);
      }
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
    if (win) col.lerp(WIN_TINT, win).multiplyScalar(1 + win * this.winGlow);
    // Last, so everything above works in the 0..1 space it expects — `offsetHSL`
    // on an already-boosted colour reads a lightness past 1 and clamps to white.
    col.multiplyScalar(this.albedo);
    const g = this.geom[i]!;
    // Opened cells go translucent on a style that asks for it; closed ones stay
    // solid, or the board would be a window rather than a field of tiles.
    const opened = isOpened(this.states[i]!);
    const alpha = this.openAlpha === null || !opened ? 1 : this.openAlpha;
    const shade = opened ? this.openShade : this.shade;
    for (let v = 0; v < g.count; v++) {
      const f = shade ? vertexShade(shade, this.loops, v, g.poly.length) : 1;
      if (this.colorAttr.itemSize === 4) {
        this.colorAttr.setXYZW(g.start + v, col.r * f, col.g * f, col.b * f, alpha);
      } else {
        this.colorAttr.setXYZ(g.start + v, col.r * f, col.g * f, col.b * f);
      }
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
    const dropPos: number[] = [];
    const dropUvs: number[] = [];
    const now = performance.now();
    const dropIndex = this.anim.dropIndex();
    const dropAt = this.anim.dropProgress(now);
    const extent =
      this.view.kind === "flat"
        ? Math.min(this.view.width, this.view.height)
        : 1;
    for (let i = 0; i < this.order.length; i++) {
      const glyph = glyphFor(this.states[i]!);
      if (glyph === null) continue;
      const uv = this.atlas.uv(glyph);
      if (!uv) continue;
      const g = this.geom[i]!;
      const [cxp, cyp] = g.glyphCenter;
      // Sized by the inradius so the glyph stays inside the cell even on
      // pointy cells (triangles) where the mean vertex distance overshoots;
      // a flag pop scales this briefly for the spring-in.
      const settled = g.glyphInradius * 0.9;
      const s = settled * this.anim.popScale(i, now);
      const z = g.radius * this.glyphHeight + 0.01;
      const [u0, v0, u1, v1] = uv;
      // Quad corners around the cell centre; turned a quarter-turn (with the
      // UVs left alone) when the board itself is drawn turned, so the glyph
      // lands upright on screen.
      const at = (dx: number, dy: number, qz: number): [number, number, number] =>
        this.quarterTurn ? [cxp - dy, cyp + dx, qz] : [cxp + dx, cyp + dy, qz];
      const quad = (
        into: number[],
        uvInto: number[],
        half: number,
        qz: number,
        rise = 0,
      ): void => {
        const lo = rise - half;
        const hi = rise + half;
        into.push(
          ...at(-half, lo, qz), ...at(half, lo, qz), ...at(half, hi, qz),
          ...at(-half, lo, qz), ...at(half, hi, qz), ...at(-half, hi, qz),
        );
        uvInto.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      };
      // A cell with a flag coming down draws only that flag — the drop lands
      // on exactly the settled size, so the cell's own glyph takes over on the
      // frame the drop ends and the hand-off is invisible. Drawing both would
      // stand a second, tiny flag beside the falling one.
      if (i === dropIndex && dropAt != null) {
        const half = dropSize(settled, extent, dropAt);
        quad(dropPos, dropUvs, half, z + 0.02, dropRise(settled, half));
      } else {
        quad(pos, uvs, s, z);
      }
    }
    this.glyphGeometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    this.glyphGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    this.glyphGeometry.computeBoundingSphere();
    this.dropGeometry.setAttribute("position", new BufferAttribute(new Float32Array(dropPos), 3));
    this.dropGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(dropUvs), 2));
    this.dropGeometry.computeBoundingSphere();
    this.dropMaterial.opacity = dropOpacity(dropAt ?? 1);
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

  dropFlag(cell: CellId, ms?: number): void {
    const i = this.cellIndex.get(cell);
    if (i == null) return;
    this.anim.startDrop(i, performance.now(), ms);
    this.rebuildGlyphs();
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
