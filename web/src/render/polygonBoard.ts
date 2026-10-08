import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShapeUtils,
  Vector2,
  type Texture,
} from "three";
import type { Board, CellId, Vertex } from "../boards/core";
import {
  baseColorFor,
  glyphFor,
  isOpened,
  insetMitres,
  labelPoint,
  polygonInradius,
  roundCorners,
  starShapedAbout,
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
import { BoardMotion, cellAttribute, patchMotion } from "./motionShader";
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

/** A lift shows on the plane as growth (see `MotionUniforms.uLiftScale`). */
const FLAT_LIFT_SCALE = 0.4;

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
  // Set only for a cell that is not star-shaped about its centroid (Klaassen's
  // bent heptagon): its loops are mitred insets rather than pulls toward one
  // centre, by `inset` times these vectors, and its top face is the polygon's
  // own triangulation rather than a fan. Null for every other board.
  bent: { mitres: Vertex[]; inset: number; triangles: number[] } | null;
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
  /** The tiles' own motion — sinking, dipping, hopping (render/cellMotion.ts),
   * applied in the vertex shader from a per-cell texture. */
  private readonly motion: BoardMotion;
  private meanRadius = 1;
  private openDrop = 0;
  private pressed = -1;
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
  /** The cut's tile shadow, and the buffers it is drawn from (flat boards). */
  private readonly shadow: CellStyle["shadow"] | null;
  private shadowPos: BufferAttribute | null = null;
  private shadowColor: BufferAttribute | null = null;
  private shadowStart: number[] = [];

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
    this.atlas = makeGlyphAtlas(undefined, style);
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
      // A cell with no point that sees all of it -- none before Klaassen's
      // heptagon, whose vertex mean is not even inside it -- centres on the
      // middle of the biggest circle it holds and is cut differently below.
      const star = starShapedAbout(shape, centroid);
      const center: Vertex = star ? centroid : labelPoint(shape);
      const anchor = board.glyphAnchor?.get(cell);
      const glyphCenter: Vertex = anchor ? [anchor[0] - cx, cy - anchor[1]] : center;
      const bent = star
        ? null
        : {
            mitres: insetMitres(poly),
            inset: polygonInradius(shape, center),
            triangles: ShapeUtils.triangulateShape(
              poly.map(([x, y]) => new Vector2(x, y)),
              [],
            ).flat(),
          };
      // A cut with rounded corners draws the rounded outline; everything that
      // *measures* the cell above still read its true corners.
      const drawn =
        style.round && !bent ? roundCorners(poly, style.round) : poly;
      const n = drawn.length;
      // n fan triangles for the top face, 2n for each ring of walls under it
      const count = cellVertexCount(n, this.profile);
      for (let t = 0; t < count / 3; t++) faceCell.push(ci);
      this.geom.push({
        start: vertexCount,
        count,
        poly: drawn,
        center,
        radius,
        glyphCenter,
        glyphInradius: polygonInradius(shape, glyphCenter),
        palette: cellPalette(tones.get(cell)!, "flat", style.monochrome, style.boardTint),
        bent,
      });
      vertexCount += count;
    });

    this.faceCell = Int32Array.from(faceCell);
    const geometry = new BufferGeometry();
    this.positionAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute("position", this.positionAttr);
    this.motion = new BoardMotion(this.order.length, false, FLAT_LIFT_SCALE);
    cellAttribute(geometry, vertexCount, this.geom);
    this.geom.forEach((g, i) => this.motion.setCell(i, [g.center[0], g.center[1], 0], [0, 0, 1], g.radius));
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
    // Cell polygons come from the board builders with per-board winding, so
    // some top faces point away from the camera. DoubleSide keeps them lit
    // and, crucially, raycast-pickable regardless of winding.
    const cellMaterial = style.unlit
      ? new MeshBasicMaterial({ vertexColors: true, side: DoubleSide, ...translucent })
      : new MeshStandardMaterial({
          vertexColors: true,
          ...style.material,
          flatShading: true,
          side: DoubleSide,
          ...translucent,
        });
    patchMotion(cellMaterial, this.motion.uniforms, "tile", !style.unlit);
    const cells = new Mesh(geometry, cellMaterial);
    cells.name = "cells";
    this.add(cells);

    // The soft shadow under each closed tile, on a cut that casts one: a fan
    // of the tile's outline at full shadow strength, ringed by the same outline
    // pushed outward and faded to nothing. Drawn after the tiles and depth
    // tested, so a raised tile hides the shadow under itself and a sunken
    // neighbour catches it.
    this.shadow = style.shadow ?? null;
    if (this.shadow) {
      const shadowVerts = this.geom.reduce((sum, g) => sum + 9 * g.poly.length, 0);
      this.shadowPos = new BufferAttribute(new Float32Array(shadowVerts * 3), 3);
      this.shadowColor = new BufferAttribute(new Float32Array(shadowVerts * 4), 4);
      const sg = new BufferGeometry();
      sg.setAttribute("position", this.shadowPos);
      sg.setAttribute("color", this.shadowColor);
      let at = 0;
      this.shadowStart = this.geom.map((g) => {
        const start = at;
        at += 9 * g.poly.length;
        return start;
      });
      cellAttribute(
        sg,
        shadowVerts,
        this.geom.map((g, i) => ({ start: this.shadowStart[i]!, count: 9 * g.poly.length })),
      );
      const shadowMaterial = new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      patchMotion(shadowMaterial, this.motion.uniforms, "tile", false);
      const shadowMesh = new Mesh(sg, shadowMaterial);
      shadowMesh.name = "shadows";
      shadowMesh.renderOrder = 0.5;
      this.add(shadowMesh);
    }

    const glyphMaterial = new MeshBasicMaterial({
      map: this.atlas.texture,
      transparent: true,
      alphaTest: 0.4,
      side: DoubleSide,
      depthWrite: false,
    });
    patchMotion(glyphMaterial, this.motion.uniforms, "glyph", false);
    const glyphMesh = new Mesh(this.glyphGeometry, glyphMaterial);
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
    this.motion.setUnit(this.meanRadius);
    // How far an opened cell starts above its recess: the closed crown's height
    // over the open floor's, so it drops from where its button stood.
    this.openDrop =
      this.profile.closed[this.profile.closed.length - 1]!.height -
      this.profile.open[this.profile.open.length - 1]!.height;

    for (let i = 0; i < this.order.length; i++) {
      this.writeGeometry(i);
      this.writeColor(i);
      this.writeShadow(i);
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
    if (isOpened(visual) !== wasOpen) {
      this.writeGeometry(i);
      this.writeShadowAlpha(i);
    }
    this.writeColor(i);
    if (visual.kind !== "hidden") this.motion.motion.setHover(i, false);
    if (isOpened(visual)) this.motion.motion.setPress(i, false);
    this.rebuildGlyphs();
  }

  setHover(cell: CellId | null): void {
    const i = cell == null ? -1 : (this.cellIndex.get(cell) ?? -1);
    if (i === this.hovered) return;
    const prev = this.hovered;
    this.hovered = i;
    if (prev >= 0) this.writeColor(prev);
    if (i >= 0) this.writeColor(i);
    if (prev >= 0) this.motion.motion.setHover(prev, false);
    if (i >= 0 && this.states[i]!.kind === "hidden") this.motion.motion.setHover(i, true);
  }

  get cellRadius(): number {
    return this.meanRadius;
  }

  press(cell: CellId | null): void {
    const i = cell == null ? -1 : (this.cellIndex.get(cell) ?? -1);
    if (i === this.pressed) return;
    if (this.pressed >= 0) this.motion.motion.setPress(this.pressed, false);
    this.pressed = i;
    if (i >= 0 && !isOpened(this.states[i]!)) this.motion.motion.setPress(i, true);
  }

  bounce(cell: CellId): void {
    const i = this.cellIndex.get(cell);
    if (i != null) this.motion.bounce(i, performance.now());
  }

  chordFeedback(cell: CellId, reach: CellId[], ok: boolean): void {
    const i = this.cellIndex.get(cell);
    if (i == null) return;
    this.motion.chord(i, this.indicesOf(reach), ok, performance.now());
  }

  detonate(cell: CellId | null, mines: CellId[]): void {
    const i = cell != null ? (this.cellIndex.get(cell) ?? null) : null;
    this.motion.detonate(i, this.indicesOf(mines), performance.now());
  }

  assemble(): void {
    this.motion.assemble(performance.now());
  }

  /** Nothing to do on the plane: it is lit head-on, so a reflection map has no
   * angle to show at and would only wash the calibrated colours out, and it
   * has no silhouette for a rim light. */
  setEffects(_env: Texture | null): void {}

  private indicesOf(cells: readonly CellId[]): number[] {
    const out: number[] = [];
    for (const c of cells) {
      const i = this.cellIndex.get(c);
      if (i != null) out.push(i);
    }
    return out;
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
    const bent = g.bent;
    const rings = loops.map((loop) => {
      const t = this.profile.gap + loop.inset;
      return {
        points: bent
          ? g.poly.map((p, k): Vertex => [
              p[0] + bent.mitres[k]![0] * t * bent.inset,
              p[1] + bent.mitres[k]![1] * t * bent.inset,
            ])
          : g.poly.map((p) => lerp(p, g.center, t)),
        z: g.radius * loop.height,
      };
    });

    let v = g.start;
    const put = (p: Vertex, z: number) => this.positionAttr.setXYZ(v++, p[0], p[1], z);
    const top = rings[rings.length - 1]!;
    if (bent) {
      // top face: the polygon's own n - 2 triangles, then two degenerate ones
      // so the cell fills the same n-triangle slice a fan would have
      for (const k of bent.triangles) put(top.points[k]!, top.z);
      for (let k = bent.triangles.length; k < 3 * n; k++) put(top.points[0]!, top.z);
    } else {
      // top face: fan from the centroid over the innermost loop
      for (let e = 0; e < n; e++) {
        put(g.center, top.z);
        put(top.points[e]!, top.z);
        put(top.points[(e + 1) % n]!, top.z);
      }
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

  /** Lay cell `i`'s shadow: offset down the *screen* (which on a board shown
   * turned a quarter is +x in the board's own frame), at the shadow plane just
   * under the tiles. */
  private writeShadow(i: number): void {
    const pos = this.shadowPos;
    const sh = this.shadow;
    if (!pos || !sh) return;
    const g = this.geom[i]!;
    const n = g.poly.length;
    const off = g.radius * sh.offset;
    const [dx, dy] = this.quarterTurn ? [off, 0] : [0, -off];
    const z = -0.02 * g.radius;
    const c: Vertex = [g.center[0] + dx, g.center[1] + dy];
    const inner = g.poly.map((p) => lerp(p, g.center, this.profile.gap + sh.spread * 0.4));
    const outer = g.poly.map((p) => lerp(p, g.center, this.profile.gap - sh.spread));
    let v = this.shadowStart[i]!;
    const put = (p: Vertex) => pos.setXYZ(v++, p[0] + dx, p[1] + dy, z);
    for (let e = 0; e < n; e++) {
      const b = (e + 1) % n;
      pos.setXYZ(v++, c[0], c[1], z);
      put(inner[e]!);
      put(inner[b]!);
    }
    for (let e = 0; e < n; e++) {
      const b = (e + 1) % n;
      put(inner[e]!);
      put(outer[e]!);
      put(outer[b]!);
      put(inner[e]!);
      put(outer[b]!);
      put(inner[b]!);
    }
    pos.needsUpdate = true;
    this.writeShadowAlpha(i);
  }

  /** A closed tile casts its shadow; an opened one, sunk into the board, none. */
  private writeShadowAlpha(i: number): void {
    const col = this.shadowColor;
    const sh = this.shadow;
    if (!col || !sh) return;
    const g = this.geom[i]!;
    const n = g.poly.length;
    const a = isOpened(this.states[i]!) ? 0 : sh.opacity;
    let v = this.shadowStart[i]!;
    for (let k = 0; k < 3 * n; k++) col.setXYZW(v++, 0, 0, 0, a);
    for (let e = 0; e < n; e++) {
      // inner, outer, outer, inner, outer, inner
      for (const inner of [true, false, false, true, false, true]) {
        col.setXYZW(v++, 0, 0, 0, inner ? a : 0);
      }
    }
    col.needsUpdate = true;
  }

  /** Draw the glyphs counter-rotated (the board is being shown turned). */
  setQuarterTurn(on: boolean): void {
    if (on === this.quarterTurn) return;
    this.quarterTurn = on;
    this.rebuildGlyphs();
    for (let i = 0; i < this.order.length; i++) this.writeShadow(i);
  }

  private rebuildGlyphs(): void {
    const pos: number[] = [];
    const uvs: number[] = [];
    const owners: number[] = [];
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
        owners.push(i, i, i, i, i, i);
      }
    }
    this.glyphGeometry.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    this.glyphGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    this.glyphGeometry.setAttribute("aCell", new BufferAttribute(Float32Array.from(owners), 1));
    this.glyphGeometry.computeBoundingSphere();
    this.dropGeometry.setAttribute("position", new BufferAttribute(new Float32Array(dropPos), 3));
    this.dropGeometry.setAttribute("uv", new BufferAttribute(new Float32Array(dropUvs), 2));
    this.dropGeometry.computeBoundingSphere();
    this.dropMaterial.opacity = dropOpacity(dropAt ?? 1);
  }

  // -- animations ------------------------------------------------------------

  setAnimationsEnabled(on: boolean): void {
    this.anim.enabled = on;
    this.motion.enabled = on;
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
    const now = performance.now();
    this.anim.startReveals(rippleEntries(list, oc, this.meanRadius), now);
    this.motion.opened(
      list.map((e) => e.index),
      oi ?? null,
      this.openDrop,
      now,
    );
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
    this.motion.hop(oi ?? null, now);
    // The mines the win auto-flagged pop in on the same stagger, so the flags
    // appear in the wake of the wave rather than all at once.
    for (const cell of flagged) {
      const i = this.cellIndex.get(cell);
      if (i != null) this.anim.startPop(i, now, entries[i]?.delay ?? 0);
    }
  }

  tickAnimations(now: number): boolean {
    const moving = this.motion.step(now);
    if (!this.anim.pending()) return moving;
    const step = this.anim.step(now);
    for (const i of step.recolor) this.writeColor(i);
    if (step.glyphsDirty) this.rebuildGlyphs();
    this.position.set(step.offset[0], step.offset[1], 0);
    // The frame a flash or a pop settles on has to be drawn too.
    return step.active || moving || step.recolor.length > 0 || step.glyphsDirty;
  }
}

function lerp(p: Vertex, q: Vertex, t: number): Vertex {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}
