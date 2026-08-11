import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Sphere,
  Vector3,
} from "three";
import {
  cross,
  newellNormal,
  normalize,
  type Board3D,
  type CellId,
  type Vec3,
} from "../boards/core";
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
import { clipTriangles, fanTriangles, triangleCentroid, type Tri } from "./clip";
import { makeGlyphAtlas, type Glyph, type GlyphAtlas } from "./glyphAtlas";
import {
  markerDrop,
  markerVertexCount,
  MARKER_REACH,
  writeMarker,
  type Marker,
  type MarkerSink,
} from "./markers3d";
import {
  CellAnimations,
  dropOpacity,
  dropRise,
  dropSize,
  rippleEntries,
  WIN_PER_CELL,
} from "./animations";
import { cellPalette, classifyShapes, type CellPalette } from "./shapePalette";
import {
  cellStyle,
  cellStyleLoops,
  cellVertexCount,
  vertexShade,
  type CellProfile,
  type CellStyle,
} from "./cellStyle";

// The 3D counterpart of PolygonBoard: a Board3D's outward-wound surface
// polygons become one merged geometry. On a closed surface each cell is an
// inset top face raised along its outward normal, ringed by the walls of the
// cell style's loops (render/cellStyle.ts — the same profile the flat renderer
// cuts, at the lower relief a curved surface needs, since cells there tilt
// against each other and a tall plateau shingles over its neighbours at the
// silhouette); revealed cells drop their plateau to a sunken face (the classic
// minesweeper raised/flat distinction — colour alone is ambiguous under 3D
// lighting), and back faces are culled. On an open or non-orientable surface (M3's cylinder /
// Möbius strip / Klein bottle) each cell is instead a flat DoubleSide tile on
// the surface, lit and coloured identically from both faces, so it reads and
// plays the same from inside or out; grout under the tile gaps keeps them from
// becoming holes. Glyphs are billboards rebuilt from the current board rotation
// (`orient`) so numbers stay screen-upright like the pygame renderer, and are
// depth-tested so geometry in front of a cell hides its number (a nearer wall,
// a nearer frame bar) instead of letting it bleed through.

// The two triangles of a billboard quad, in billboard-plane units.
const QUAD_CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1], [1, -1], [1, 1],
  [-1, -1], [1, 1], [-1, 1],
];
const BASE_COLOR = "#8e8e8e"; // grout surface showing through the tile gaps

const _inv = /* @__PURE__ */ new Matrix4(); // scratch for the world→local map

/** A geometry whose attributes are rewritten *in full* on every rebuild — the
 * glyph billboards and the standing markers, whose contents change with the
 * board's state or its rotation rather than cell by cell.
 *
 * The arrays are **grow-only**: a rebuild that fits in what is already there
 * writes into it and flags `needsUpdate`, and only one that needs more room
 * allocates. The alternative, and what this replaces, is
 * `setAttribute(new BufferAttribute(new Float32Array(pushedNumbers)))` per
 * rebuild — a fresh allocation, a fresh attribute and a fresh GPU upload every
 * time, on a path that runs on every frame of a drag.
 *
 * `setDrawRange` is what makes a grow-only buffer safe: the tail left over from
 * a larger previous rebuild stays in the array but is not drawn. The bounding
 * sphere has to respect the same range — `computeBoundingSphere` would measure
 * the stale tail — so it is computed here over the live vertices only. */
class DynGeometry {
  readonly geometry = new BufferGeometry();
  /** One Float32Array per attribute, in the order given to the constructor. */
  readonly arrays: Float32Array[] = [];
  private capacity = 0;

  constructor(private readonly spec: readonly (readonly [string, number])[]) {
    for (const _ of spec) this.arrays.push(new Float32Array(0));
  }

  /** Make room for `verts` vertices, allocating only when it has to grow. */
  reserve(verts: number): void {
    if (verts <= this.capacity) return;
    // Grow in steps rather than exactly: the marked-cell count creeps up one
    // flag at a time, and resizing on each would be the allocation churn this
    // exists to avoid.
    this.capacity = Math.max(verts, Math.ceil(this.capacity * 1.5), 64);
    this.spec.forEach(([name, items], i) => {
      this.arrays[i] = new Float32Array(this.capacity * items);
      this.geometry.setAttribute(
        name,
        new BufferAttribute(this.arrays[i]!, items),
      );
    });
  }

  /** Publish a rebuild that wrote `verts` vertices. */
  commit(verts: number): void {
    for (const [name] of this.spec) {
      const attr = this.geometry.getAttribute(name) as BufferAttribute | undefined;
      if (attr) attr.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, verts);
    this.setBounds(verts);
  }

  /** The bounding sphere of the first `verts` positions. Three's own
   * `computeBoundingSphere` reads the whole attribute, which on a grow-only
   * buffer includes whatever a bigger earlier rebuild left behind — that would
   * both oversize the sphere and, once the leftovers are stale coordinates,
   * misplace it. */
  private setBounds(verts: number): void {
    const pos = this.arrays[0]!;
    const sphere = (this.geometry.boundingSphere ??= new Sphere());
    if (verts === 0) {
      sphere.center.set(0, 0, 0);
      sphere.radius = 0;
      return;
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let j = 0, end = verts * 3; j < end; j += 3) {
      const x = pos[j]!, y = pos[j + 1]!, z = pos[j + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    let r2 = 0;
    for (let j = 0, end = verts * 3; j < end; j += 3) {
      const dx = pos[j]! - cx, dy = pos[j + 1]! - cy, dz = pos[j + 2]! - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) r2 = d2;
    }
    sphere.center.set(cx, cy, cz);
    sphere.radius = Math.sqrt(r2);
  }
}

interface CellGeom {
  start: number; // first vertex index in the position/normal/color buffers
  count: number; // vertex count for this cell (3 per triangle)
  poly: Vec3[]; // the cell's surface polygon, outward wound
  centroid: Vec3;
  normal: Vec3; // outward unit normal
  radius: number; // mean distance centroid -> vertices
  // The cell's **inradius** in its own plane: the distance from the centroid to
  // the nearest *edge*, not to the vertices. That is the width a thing standing
  // on the cell has to fit inside, and on a stretched tiling it is nothing like
  // `radius` — the immersions bend cells into long thin slivers whose mean
  // vertex distance is set by the long axis, so a marker sized off `radius`
  // there is several times wider than the tile it sits on. The billboards have
  // always been sized this way (`polygonInradius` in `rebuildGlyphs`, measured
  // per frame in the *billboard* plane); this is the same measurement taken once
  // in the cell's own plane, so a model can use it without depending on where
  // the camera is.
  fit: number;
  center: Vec3; // centre of the (currently raised or sunken) top face
  palette: CellPalette; // hidden/opened tones for this cell's shape
  // Two-sided boards only: the flat tile's triangles, built once (they never
  // re-extrude) and already cut against the surface clip.
  tile: Tri[] | null;
  // ...and, on a style with a gradient, how far each of that tile's vertices
  // sits from the cell's centre, 1 at the centroid and 0 out at the edge. A
  // two-sided cell has no loop stack for `vertexShade` to ramp over, so its
  // gradient is measured off the geometry instead — see `radialFalloff`. The
  // *falloff* is stored rather than the finished factor because which gradient
  // it is applied to depends on the cell's state, which changes in play.
  tileFalloff: Float32Array | null;
}

/** Where each vertex of a **two-sided** cell's (already clipped) triangles sits
 * across the tile: 1 at the centroid, 0 out at its edge. That is the axis a
 * style's gradient is applied along, and it is measured once here because the
 * geometry never moves — only which gradient rides on it changes, when the cell
 * opens.
 *
 * Every other cell gets its gradient from the profile: those vertices arrive in
 * a known order, ring by ring, so `vertexShade` can ramp `rim` to `center` over
 * the loops without looking at a coordinate. A two-sided cell has no loops at
 * all — it is a flat tile on the surface, fan-triangulated and then cut by the
 * Klein clip, which can leave any number of vertices anywhere in it — so the
 * same ramp has nothing to hang on, and the tiles used to come out flat colour
 * whatever the style asked for. Distance from the centre gives the same bead and
 * survives the clip: a cut vertex lands wherever it truly is. */
function radialFalloff(tile: Tri[], centroid: Vec3, radius: number): Float32Array {
  const out = new Float32Array(tile.length * 3);
  let i = 0;
  for (const tri of tile) {
    for (const p of tri) {
      const d = Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]);
      out[i++] = radius > 0 ? Math.max(0, Math.min(1, 1 - d / radius)) : 1;
    }
  }
  return out;
}

export class SolidBoard extends Group implements BoardMesh {
  readonly view: BoardView;
  // Open / non-orientable surfaces (cylinder, Möbius strip, Klein bottle) are
  // drawn identically from both sides: flat tiles at the surface (no raised
  // bevel, which would read as a recess from the inside), grout showing in the
  // gaps from either face, and glyphs on whichever side faces the camera.
  readonly twoSided: boolean;
  private readonly order: CellId[];
  private readonly cellIndex = new Map<CellId, number>();
  private readonly geom: CellGeom[] = [];
  private readonly faceCell: Int32Array;
  private readonly positionAttr: BufferAttribute;
  private readonly normalAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  private readonly glyphGeometry = new DynGeometry([
    ["position", 3],
    ["uv", 2],
  ]);
  // The dropping flag is a mesh of its own rather than one more quad in the
  // glyph buffer: it is drawn many times cell-size, so depth-testing it
  // against the very solid it is landing on would slice it in half, and being
  // its own material is what lets it fade in as it shrinks.
  private readonly dropGeometry = new DynGeometry([
    ["position", 3],
    ["uv", 2],
  ]);
  private readonly dropMaterial: MeshBasicMaterial;
  // A style that stands real models on its flagged and mined cells
  // (CellStyle.solidMarkers) builds them into this one merged buffer, the way
  // the glyph quads are built: the set of marked cells changes on nearly every
  // move, so the whole thing is rewritten rather than edited, and the board's
  // markers stay one draw call. False on every other style.
  private readonly solidMarkers: boolean;
  private readonly markerGeometry = new DynGeometry([
    ["position", 3],
    ["normal", 3],
    ["color", 3],
  ]);
  // ...and the one pin currently being planted by a held cell, which is a mesh
  // of its own for the same reason the 2D drop is: it is drawn many times
  // cell-size, so depth-testing it against the very solid it is landing on
  // would bury it, and being its own material is what lets it fade in as it
  // shrinks. Null on a style without markers, where the 2D drop does this job.
  private readonly markerDropGeometry = new DynGeometry([
    ["position", 3],
    ["normal", 3],
    ["color", 3],
  ]);
  private markerDropMaterial: MeshStandardMaterial | null = null;
  /** Whether the glyph billboards / the standing markers need regenerating
   * before the next frame is drawn.
   *
   * Both rebuilds are whole-board passes, and the callers that matter change
   * many cells at once: a loss turns over every mine (`revealEndState`), a
   * Klein scroll rewrites *every* cell's contents (`GameSession.scroll`), and a
   * flood fill opens a wide patch. Rebuilding inside `setVisual` made each of
   * those quadratic — 476 full marker rebuilds for one press of a scroll arrow
   * — for no benefit at all, since nothing is drawn between the calls. So
   * `setVisual` marks, and `tickAnimations` flushes once, on the frame that is
   * about to be rendered anyway.
   *
   * This is the same rule `rebuildMarkers` already documents for the camera:
   * regenerate on the input that actually changed, not on every call that could
   * have changed it. */
  private glyphsDirty = false;
  private markersDirty = false;
  private readonly atlas: GlyphAtlas;
  private readonly states: CellVisual[];
  private hovered = -1;
  private readonly anim = new CellAnimations();
  private meanRadius = 1;
  // Billboard basis in board-local coordinates: screen-right and screen-up,
  // updated from the current rotation. `cameraLocal` is the camera position
  // mapped into the same board-local frame, so a cell's visibility can be
  // tested per-cell against the true (perspective) viewing direction.
  private viewRight: Vec3 = [1, 0, 0];
  private viewUp: Vec3 = [0, 1, 0];
  private cameraLocal: Vec3 = [0, 0, 1];
  /** The relief every cell is cut with (the player's cell style, at its 3D
   * profile). A two-sided board draws flat tiles whatever the style, so only
   * `gap` reaches those. */
  private readonly profile: CellProfile;
  /** How far the win wave's crest is overdriven past the gold tint (see
   * CellStyle.winGlow). A 3D board is always lit — `CellStyle.unlit` is a flat
   * board's business — so an unlit style's reduced glow does not apply here:
   * there is shading to bring the overdrive back down. */
  private readonly winGlow: number;
  /** The style's across-the-tile brightness gradients — one per cell state, so
   * an opened cell can be a different *material* from a closed one (see
   * CellStyle.openShade) — and the loop count they are ramped over. */
  private readonly shade: CellStyle["shade"];
  private readonly openShade: CellStyle["shade"];
  private readonly loops: number;
  /** Multiplier on every tile colour: a 3D board is always lit, so a style that
   * pays back what the shading takes does so on every board here (see
   * CellStyle.albedo). */
  private readonly albedo: number;

  constructor(board: Board3D, style: CellStyle = cellStyle(null)) {
    super();
    this.profile = style.solid;
    this.albedo = style.albedo ?? 1;
    // A 3D board is always lit, so an unlit style's reduced overdrive does not
    // apply here; the albedo boost does come out of it, so the win crest peaks
    // where it always did rather than clipping to white (see PolygonBoard).
    this.winGlow = (1 + (style.unlit ? WIN_GLOW : (style.winGlow ?? WIN_GLOW))) / this.albedo - 1;
    this.shade = style.shade;
    this.openShade = style.openShade ?? style.shade;
    this.loops = cellStyleLoops(this.profile);
    this.atlas = makeGlyphAtlas();
    this.order = [...board.polygons.keys()];
    this.states = this.order.map(() => ({ kind: "hidden" }));
    this.order.forEach((c, i) => this.cellIndex.set(c, i));
    this.twoSided = board.twoSided;
    this.solidMarkers = style.solidMarkers ?? false;
    // The framing radius is measured below from the *built* geometry (the
    // raised tile tops stand proud of the board's own vertex radius), so the
    // renderer scales the real outer hull — not an inner sphere — to unit
    // size and can frame it edge to edge.
    let outerRadius = board.radius;
    // Every outermost drawn point, kept for the camera fit (see BoardView.hull).
    const hull: number[] = [];

    const basePositions: number[] = [];
    const faceCell: number[] = [];
    let vertexCount = 0;
    // Where the immersion passes through itself, the enclosed sheet is cut
    // away so the hole can be looked into (Klein bottle; see SurfaceClip).
    const clip = board.clip;
    // Shape colour coding: classed over the whole board at once, so a tiling
    // the surface immersion has bent stays one colour instead of a gradient.
    // The "solid" profile carries the wider hidden/opened split a curved,
    // self-shading surface needs.
    const tones = classifyShapes(board.polygons, board.cornerMask);

    this.order.forEach((cell, ci) => {
      const poly = board.polygons.get(cell)!;
      const n = poly.length;
      const centroid = centroidOf(poly);
      const normal = normalize(newellNormal(poly));
      const radius =
        poly.reduce(
          (s, p) =>
            s +
            Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]),
          0,
        ) / n;
      // ...and the inradius, measured in the cell's own tangent plane (see
      // CellGeom.fit). Any two perpendicular in-plane axes will do — nothing
      // downstream cares which way they point, only how far the nearest edge is.
      const ex = normalize(
        cross(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]),
      );
      const ey = cross(normal, ex);
      const fit = polygonInradius(
        poly.map((p): [number, number] => {
          const d: Vec3 = [p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]];
          return [
            d[0] * ex[0] + d[1] * ex[1] + d[2] * ex[2],
            d[0] * ey[0] + d[1] * ey[1] + d[2] * ey[2],
          ];
        }),
        [0, 0],
      );
      // The cut, if this cell is one of the few the clip reaches.
      const field = clip && clip.cells.has(cell) ? clip.field : null;
      // A closed cell is a raised button: an n-triangle top fan plus a ring of
      // n quads under it per loop gap in the profile. A two-sided cell is a
      // flat tile whose triangles are fixed at build time, so a cut one keeps
      // only what survives the clip.
      const tile = this.twoSided
        ? clipTriangles(
            fanTriangles(
              poly.map((p) => lerp3(p, centroid, this.profile.gap)),
              centroid,
            ),
            field,
          )
        : null;
      const count = tile ? 3 * tile.length : cellVertexCount(n, this.profile);
      this.geom.push({
        start: vertexCount,
        count,
        poly,
        centroid,
        normal,
        radius,
        fit,
        center: tile ? (triangleCentroid(tile) ?? centroid) : centroid,
        palette: cellPalette(tones.get(cell)!, "solid", style.monochrome),
        tileFalloff: tile && style.shade ? radialFalloff(tile, centroid, radius) : null,
        tile,
      });
      vertexCount += count;
      // How far this cell's drawn geometry reaches: a two-sided tile lies on
      // the surface, a closed one is raised by the top loop of its profile.
      for (const p of poly) hull.push(p[0], p[1], p[2]);
      if (!this.twoSided) {
        const crown = this.profile.closed[this.profile.closed.length - 1]!;
        const lift = radius * crown.height;
        for (const p of poly) {
          const top = add3(lerp3(p, centroid, this.profile.gap + crown.inset), [
            normal[0] * lift,
            normal[1] * lift,
            normal[2] * lift,
          ]);
          hull.push(top[0], top[1], top[2]);
          outerRadius = Math.max(outerRadius, Math.hypot(top[0], top[1], top[2]));
        }
      }
      // A style that stands models on its cells has to be framed with room for
      // one: the camera fit walks this hull, and a marker outside it is a marker
      // the board's rim crops in half. One point per cell, at the tip of the
      // tallest model that cell could carry — so a board is framed as if every
      // cell were flagged, and nothing pops out of frame when one is. It costs a
      // permanent zoom-out on those styles, which is the price of never cropping
      // (and why only they pay it). On a two-sided board the marker stands both
      // ways, so both tips go in.
      if (this.solidMarkers) {
        const reach = fit * MARKER_REACH;
        for (const s of this.twoSided ? [1, -1] : [1]) {
          const tip = add3(centroid, [
            normal[0] * reach * s,
            normal[1] * reach * s,
            normal[2] * reach * s,
          ]);
          hull.push(tip[0], tip[1], tip[2]);
          outerRadius = Math.max(outerRadius, Math.hypot(tip[0], tip[1], tip[2]));
        }
      }
      for (let t = 0; t < count / 3; t++) faceCell.push(ci);

      // Opaque base layer under the whole (unshrunk) polygon: the tile gaps
      // and the silhouette show this grout surface instead of seeing through
      // the hollow interior. It is cut by the same clip — grout left behind
      // would cap the hole just as the tiles did.
      for (const tri of clipTriangles(fanTriangles(poly, centroid), field)) {
        for (const p of tri) basePositions.push(p[0], p[1], p[2]);
      }
    });

    this.view = {
      kind: "solid",
      radius: outerRadius,
      hull: Float32Array.from(hull),
    };

    this.faceCell = Int32Array.from(faceCell);
    const geometry = new BufferGeometry();
    this.positionAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.normalAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.colorAttr = new BufferAttribute(new Float32Array(vertexCount * 3), 3);
    geometry.setAttribute("position", this.positionAttr);
    geometry.setAttribute("normal", this.normalAttr);
    geometry.setAttribute("color", this.colorAttr);

    const material = new MeshStandardMaterial({
      vertexColors: true,
      ...style.material,
      // Closed surfaces rely on back-face culling (winding is outward);
      // open/non-orientable ones draw both faces of their flat tiles, lit and
      // coloured identically (MeshStandardMaterial flips the normal for the
      // back face), so a cell looks and plays the same from either side.
      side: this.twoSided ? DoubleSide : FrontSide,
    });
    const cells = new Mesh(geometry, material);
    cells.name = "cells";
    this.add(cells);

    // Grout under the tile gaps on every board. On closed surfaces it sits
    // below the raised cells; on two-sided surfaces the tiles are flat and
    // coplanar with it, so the grout is pushed back in depth (polygonOffset)
    // and shown from both faces — the gaps read as grout lines, never holes.
    const baseGeometry = new BufferGeometry();
    baseGeometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(basePositions), 3),
    );
    baseGeometry.computeVertexNormals();
    const base = new Mesh(
      baseGeometry,
      new MeshStandardMaterial({
        color: BASE_COLOR,
        roughness: 0.8,
        metalness: 0,
        flatShading: true,
        side: this.twoSided ? DoubleSide : FrontSide,
        polygonOffset: this.twoSided,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 4,
      }),
    );
    base.name = "base";
    this.add(base);

    const glyphMesh = new Mesh(
      this.glyphGeometry.geometry,
      new MeshBasicMaterial({
        map: this.atlas.texture,
        transparent: true,
        alphaTest: 0.4,
        // Billboards drawn over the board, depth-tested so geometry in front of
        // a cell (a nearer wall of a two-sided surface, a nearer bar of a
        // frame) hides its number instead of letting it bleed through; a slight
        // polygon offset keeps a glyph from z-fighting its own tile.
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    );
    glyphMesh.name = "glyphs";
    glyphMesh.renderOrder = 1;
    this.add(glyphMesh);

    // depthTest off, drawn last: the dropping flag hangs in front of the solid
    // rather than lying on it, so nothing occludes it for the fraction of a
    // second it is in the air. `pick` only ever raycasts the "cells" mesh, so
    // this one can span half the board without swallowing taps.
    this.dropMaterial = new MeshBasicMaterial({
      map: this.atlas.texture,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: false,
      depthTest: false,
    });
    const dropMesh = new Mesh(this.dropGeometry.geometry, this.dropMaterial);
    dropMesh.name = "flagDrop";
    dropMesh.renderOrder = 2;
    this.add(dropMesh);

    // The standing pins and bombs, on the styles that ask for them. Ordinary
    // lit, *opaque* geometry — it takes the same hemisphere + key light the
    // tiles do, which is what makes a marker read as an object on the board
    // rather than a sticker over it, and staying opaque sidesteps the sort
    // problem a solid's overlapping cells have (see CellStyle.openAlpha).
    //
    // `flatShading` is deliberately **off**: the models write their own
    // per-vertex normals, radial on every sphere, and that is the only thing
    // making a head of a few hundred triangles read as having no edges at all.
    // Turning it on throws those away and the pins come back faceted.
    //
    // `pick` only ever raycasts the "cells" mesh, so a marker can never swallow
    // a tap meant for its tile.
    if (this.solidMarkers) {
      const markerMesh = new Mesh(
        this.markerGeometry.geometry,
        new MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.52,
          metalness: 0,
          // Every model is a closed solid, so FrontSide would do — but a marker
          // that came out inside-out from a winding slip would be invisible
          // rather than merely wrong, and these are cheap enough not to gamble.
          side: DoubleSide,
        }),
      );
      markerMesh.name = "markers";
      this.add(markerMesh);

      // The pin being planted by a held cell. Same material, but transparent and
      // out of the depth test — an oversized pin has to hang *in front of* the
      // solid for the fraction of a second it is in the air, not be swallowed by
      // it, and the whole point of drawing it oversized is that the finger doing
      // the holding is covering the cell it will land on.
      this.markerDropMaterial = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.52,
        metalness: 0,
        side: DoubleSide,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const markerDropMesh = new Mesh(
        this.markerDropGeometry.geometry,
        this.markerDropMaterial,
      );
      markerDropMesh.name = "markerDrop";
      markerDropMesh.renderOrder = 3;
      this.add(markerDropMesh);
    }

    for (let i = 0; i < this.order.length; i++) {
      this.writeGeometry(i);
      this.writeColor(i);
    }
    this.meanRadius =
      this.geom.reduce((s, g) => s + g.radius, 0) / (this.geom.length || 1);
    geometry.computeBoundingSphere();
    this.rebuildGlyphs();
    this.rebuildMarkers();
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
    return { center: g.center, normal: g.normal };
  }

  setVisual(cell: CellId, visual: CellVisual): void {
    const i = this.cellIndex.get(cell);
    if (i == null) return;
    const previous = this.states[i]!;
    const wasOpen = isOpened(previous);
    this.states[i] = visual;
    // Two-sided tiles are flat and static (state shows in colour only); closed
    // cells rise when hidden and sink when revealed, so re-extrude on that flip.
    if (!this.twoSided && isOpened(visual) !== wasOpen) this.writeGeometry(i);
    this.writeColor(i);
    this.glyphsDirty = true;
    // A marker is a function of `markerFor(state)` and nothing else the caller
    // can change here, so a state change that leaves that alone leaves the
    // whole marker buffer alone too. That is what makes a flood fill free: it
    // opens hundreds of cells and every one of them goes to `revealed`, which
    // carries no model.
    if (this.solidMarkers && markerFor(previous) !== markerFor(visual)) {
      this.markersDirty = true;
    }
  }

  /** Regenerate whatever `setVisual` marked, once, before the frame that needs
   * it. Returns whether there was anything to do — the renderer draws on the
   * back of that. */
  private flushDirty(): boolean {
    if (!this.glyphsDirty && !this.markersDirty) return false;
    if (this.glyphsDirty) this.rebuildGlyphs();
    if (this.markersDirty) this.rebuildMarkers();
    return true;
  }

  setHover(cell: CellId | null): void {
    const i = cell == null ? -1 : (this.cellIndex.get(cell) ?? -1);
    if (i === this.hovered) return;
    const prev = this.hovered;
    this.hovered = i;
    if (prev >= 0) this.writeColor(prev);
    if (i >= 0) this.writeColor(i);
  }

  /** Update the billboard basis (screen-upright glyphs) from the board's
   * current rotation, and record the camera position in board-local space so
   * `rebuildGlyphs` can cull cells that face away under perspective. Called
   * by the renderer whenever the board turns, is (re)framed, or is set. */
  orient(rotation: Quaternion, cameraWorldPos: Vector3): void {
    const inverse = rotation.clone().invert();
    const toVec3 = (v: Vector3): Vec3 => [v.x, v.y, v.z];
    this.viewRight = toVec3(new Vector3(1, 0, 0).applyQuaternion(inverse));
    this.viewUp = toVec3(new Vector3(0, 1, 0).applyQuaternion(inverse));
    this.updateWorldMatrix(true, false);
    const camLocal = cameraWorldPos
      .clone()
      .applyMatrix4(_inv.copy(this.matrixWorld).invert());
    this.cameraLocal = [camLocal.x, camLocal.y, camLocal.z];
    this.rebuildGlyphs();
  }

  /** (Re)write one cell's geometry: a flat tile at the surface for two-sided
   * boards, else the cell style's profile for its state — the loops of the
   * polygon pulled in and raised along the outward normal, innermost one filled
   * as the top face. Raised for hidden/flagged cells, sunk nearly to the base
   * layer once revealed. */
  private writeGeometry(i: number): void {
    if (this.twoSided) return this.writeFlatTile(i);
    const g = this.geom[i]!;
    const { poly, centroid, normal } = g;
    const n = poly.length;
    const loops = isOpened(this.states[i]!) ? this.profile.open : this.profile.closed;
    const rings = loops.map((loop) => {
      const height = g.radius * loop.height;
      const lift: Vec3 = [normal[0] * height, normal[1] * height, normal[2] * height];
      return {
        points: poly.map((p) => add3(lerp3(p, centroid, this.profile.gap + loop.inset), lift)),
        center: add3(centroid, lift),
      };
    });
    const top = rings[rings.length - 1]!;
    g.center = top.center;

    let v = g.start;
    const put = (p: Vec3, nrm: Vec3) => {
      this.positionAttr.setXYZ(v, p[0], p[1], p[2]);
      this.normalAttr.setXYZ(v, nrm[0], nrm[1], nrm[2]);
      v++;
    };
    // top face: fan from the raised centroid (outward winding preserved —
    // the board's polygons are counterclockwise seen from outside). The
    // whole fan carries the cell normal, so a cell on a curved surface
    // (whose polygon is not planar — e.g. the sphere's pentagons) still
    // shades as one clean facet instead of a pinwheel of fan triangles.
    for (let e = 0; e < n; e++) {
      put(top.center, normal);
      put(top.points[e]!, normal);
      put(top.points[(e + 1) % n]!, normal);
    }
    // one ring of walls per loop gap, from the outer edge up to the top edge.
    // One normal per quad keeps its two (slightly non-coplanar) triangles
    // from showing a diagonal shading crease.
    for (let r = 1; r < rings.length; r++) {
      const low = rings[r - 1]!.points;
      const high = rings[r]!.points;
      for (let e = 0; e < n; e++) {
        const a = e;
        const b = (e + 1) % n;
        const quadNormal = normalize(newellNormal([low[a]!, low[b]!, high[b]!, high[a]!]));
        put(low[a]!, quadNormal);
        put(low[b]!, quadNormal);
        put(high[b]!, quadNormal);
        put(low[a]!, quadNormal);
        put(high[b]!, quadNormal);
        put(high[a]!, quadNormal);
      }
    }
    this.positionAttr.needsUpdate = true;
    this.normalAttr.needsUpdate = true;
  }

  /** A flat, slightly-shrunk tile fanned from the cell centroid, sitting on the
   * surface (no raise). It carries the single cell normal and is drawn
   * two-sided, so it reads the same from inside or outside; the grout base
   * behind it shows in the shrink gap as a border line. The triangles were
   * built (and clipped) once in the constructor — a flat tile never moves. */
  private writeFlatTile(i: number): void {
    const g = this.geom[i]!;
    const { normal } = g;
    let v = g.start;
    for (const tri of g.tile ?? []) {
      for (const p of tri) {
        this.positionAttr.setXYZ(v, p[0], p[1], p[2]);
        this.normalAttr.setXYZ(v, normal[0], normal[1], normal[2]);
        v++;
      }
    }
    this.positionAttr.needsUpdate = true;
    this.normalAttr.needsUpdate = true;
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
    // Which of the style's two gradients this cell is wearing — an opened cell
    // may be a different material from a closed one (see CellStyle.openShade).
    const shade = isOpened(this.states[i]!) ? this.openShade : this.shade;
    for (let v = 0; v < g.count; v++) {
      // A two-sided cell rides its gradient along a falloff measured off the
      // geometry at build time (`radialFalloff`), since it has no loops; every
      // other cell ramps over its profile's loops.
      const f = !shade
        ? 1
        : g.tileFalloff
          ? shade.rim + (shade.center - shade.rim) * g.tileFalloff[v]!
          : this.twoSided
            ? 1
            : vertexShade(shade, this.loops, v, g.poly.length);
      this.colorAttr.setXYZ(g.start + v, col.r * f, col.g * f, col.b * f);
    }
    this.colorAttr.needsUpdate = true;
  }

  private rebuildGlyphs(): void {
    this.glyphsDirty = false;
    // One quad — six vertices — per cell at the very most, and the drop is a
    // single quad, so both buffers can be sized up front and written straight
    // into rather than pushed onto and copied out.
    this.glyphGeometry.reserve(this.order.length * 6);
    this.dropGeometry.reserve(6);
    const [pos, uvs] = this.glyphGeometry.arrays as [Float32Array, Float32Array];
    const [dropPos, dropUvs] = this.dropGeometry.arrays as [Float32Array, Float32Array];
    let nv = 0; // vertices written to the glyph buffer
    let dv = 0; // ...and to the drop buffer
    const now = performance.now();
    const dropIndex = this.anim.dropIndex();
    const dropAt = this.anim.dropProgress(now);
    const extent = this.view.kind === "solid" ? this.view.radius * 2 : 1;
    const { viewRight: u, viewUp: v, cameraLocal: cam } = this;
    for (let i = 0; i < this.order.length; i++) {
      // Where a model stands on the cell, the billboard steps aside: a flag and
      // a mine become the pin and the bomb, and a *wrong* flag keeps only the
      // dark X, since the gray pin under it is already the flag the crossed-out
      // glyph would be drawing again.
      const glyph = this.solidMarkers
        ? billboardBesideMarker(this.states[i]!)
        : glyphFor(this.states[i]!);
      if (glyph === null) continue;
      const uv = this.atlas.uv(glyph);
      if (!uv) continue;
      const g = this.geom[i]!;
      if (g.count === 0) continue; // wholly cut away by the surface clip
      const c = g.center;
      const toCam = normalize([cam[0] - c[0], cam[1] - c[1], cam[2] - c[2]]);
      // On a closed surface only cells whose top face the camera can see carry
      // a glyph, so the far hemisphere's numbers never billboard onto the front
      // (the per-cell camera direction makes the horizon the true perspective
      // silhouette). Two-sided tiles are visible from both faces, so they skip
      // this cull; depth-testing then hides any number a nearer wall occludes.
      if (
        !this.twoSided &&
        toCam[0] * g.normal[0] + toCam[1] * g.normal[1] + toCam[2] * g.normal[2] <=
          0.05
      ) {
        continue;
      }
      // Fit the glyph inside the cell as the viewer sees it: project the
      // cell polygon into the billboard plane and size/centre the quad by
      // the projected footprint's inradius (as the pygame renderer does per
      // frame), so a number never crosses its cell's edges however tilted
      // the cell currently is.
      const projected = g.poly.map((p): [number, number] => {
        const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
        return [
          d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
          d[0] * v[0] + d[1] * v[1] + d[2] * v[2],
        ];
      });
      const px =
        projected.reduce((a, q) => a + q[0], 0) / projected.length;
      const py =
        projected.reduce((a, q) => a + q[1], 0) / projected.length;
      const settled = polygonInradius(projected, [px, py]) * 0.9;
      const s = settled * this.anim.popScale(i, now);
      if (!(settled > 0)) continue;
      // Lift the whole billboard toward the camera by its own half-size: a
      // camera-facing quad centred on a tilted cell would otherwise dip behind
      // that cell's face on its far half and be depth-clipped (numbers/flags/
      // mines rendered "in half"). The lift (< a cell width) clears the cell's
      // own face while staying far behind any genuinely nearer wall or frame
      // bar, so occlusion still works. It is measured from the settled size,
      // not the animated one: a dropping flag is many times cell-size and
      // would otherwise be flung at the camera as it shrinks (it needs no
      // clearance anyway — its mesh does not depth-test).
      //
      // The one billboard that has to clear more than a cell face is the cross
      // over a wrongly-placed flag: there is a pin standing on that cell, and at
      // the ordinary lift the X comes out *behind* its head, which eats the
      // middle of the mark and leaves four arms reading as spikes. Lift it past
      // the tallest thing a marker style can put there instead, so the X is
      // drawn across the pin the way a cancellation should be.
      const lift =
        glyph === "cross" ? g.fit * MARKER_REACH * 1.1 : settled * 1.3;
      const cx = c[0] + toCam[0] * lift;
      const cy = c[1] + toCam[1] * lift;
      const cz = c[2] + toCam[2] * lift;
      const at = (du: number, dv: number, half: number, rise: number): Vec3 => [
        cx + u[0] * (px + half * du) + v[0] * (py + half * dv + rise),
        cy + u[1] * (px + half * du) + v[1] * (py + half * dv + rise),
        cz + u[2] * (px + half * du) + v[2] * (py + half * dv + rise),
      ];
      const [u0, v0, u1, v1] = uv;
      const quad = (
        into: Float32Array,
        uvInto: Float32Array,
        vert: number,
        half: number,
        rise = 0,
      ): void => {
        let k = vert * 3;
        for (const [du, dv] of QUAD_CORNERS) {
          const p = at(du, dv, half, rise);
          into[k++] = p[0];
          into[k++] = p[1];
          into[k++] = p[2];
        }
        uvInto.set(
          [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1],
          vert * 2,
        );
      };
      // A cell with a flag coming down draws only that flag — the drop lands
      // on exactly the settled size, so the cell's own glyph takes over on the
      // frame the drop ends and the hand-off is invisible. Drawing both would
      // stand a second, tiny flag beside the falling one.
      if (i === dropIndex && dropAt != null) {
        // The drop stays a billboard even under a marker style: it is drawn many
        // times cell-size and must not depth-test, and `rebuildMarkers` skips
        // the standing pin for exactly this cell, so the hand-off on the frame
        // the drop ends is the same invisible one it always was.
        const half = dropSize(settled, extent, dropAt);
        quad(dropPos, dropUvs, dv, half, dropRise(settled, half));
        dv += 6;
      } else if (s > 0) {
        quad(pos, uvs, nv, s);
        nv += 6;
      }
    }
    this.glyphGeometry.commit(nv);
    this.dropGeometry.commit(dv);
    this.dropMaterial.opacity = dropOpacity(dropAt ?? 1);
  }

  /** (Re)build the standing pins and bombs, on the styles that ask for them.
   *
   * Kept out of `rebuildGlyphs` on purpose. Nothing about a marker depends on
   * where the camera is — the models are rotationally symmetric about the axis
   * they stand on, and the two-sided surfaces get one on each face rather than
   * a camera-facing one — so this does *not* run from `orient()`, which fires on
   * every frame of a drag. A smooth sphere is several hundred triangles per
   * marked cell; rewriting all of them sixty times a second to produce the
   * identical buffer would be the most expensive thing on the board. Cell state
   * is the only input, so cell state is the only trigger. */
  private rebuildMarkers(): void {
    this.markersDirty = false;
    if (!this.solidMarkers) return;
    const now = performance.now();
    const dropIndex = this.anim.dropIndex();
    const dropAt = this.anim.dropProgress(now);
    // Size the buffer before writing anything: a model's vertex count is fixed
    // per kind, so one cheap pass over the states says exactly how much room
    // the whole board needs and the write below never has to grow mid-flight.
    let need = 0;
    for (let i = 0; i < this.order.length; i++) {
      const marker = markerFor(this.states[i]!);
      if (marker === null || this.geom[i]!.count === 0) continue;
      if (i === dropIndex && dropAt != null) continue; // the drop's own buffer
      need += markerVertexCount(marker);
      // A pin gets a second copy on the far face of a two-sided surface; a bomb
      // straddles the tile and does not (see below).
      if (this.twoSided && marker !== "bomb" && marker !== "bombHot") {
        need += markerVertexCount(marker);
      }
    }
    this.markerGeometry.reserve(need);
    this.markerDropGeometry.reserve(markerVertexCount("pin"));
    const [mp, mn, mc] = this.markerGeometry.arrays as [
      Float32Array,
      Float32Array,
      Float32Array,
    ];
    const [dp, dn, dc] = this.markerDropGeometry.arrays as [
      Float32Array,
      Float32Array,
      Float32Array,
    ];
    const sink: MarkerSink = { pos: mp, nrm: mn, col: mc, count: 0 };
    const dropSink: MarkerSink = { pos: dp, nrm: dn, col: dc, count: 0 };
    for (let i = 0; i < this.order.length; i++) {
      const marker = markerFor(this.states[i]!);
      if (marker === null) continue;
      const g = this.geom[i]!;
      if (g.count === 0) continue; // wholly cut away by the surface clip
      // A pin planted by *holding* the cell lands rather than appearing: it
      // comes down oversized and shrinks onto its tile. That is feedback, not
      // decoration — the finger doing the holding is covering the very cell the
      // pin is going to, so at settled size the player would see nothing happen
      // until they lifted it. The 2D flag billboard has always done this; on a
      // style with markers it is suppressed (`billboardBesideMarker` gives a
      // flagged cell no glyph at all), so the pin has to do its own, or holding
      // a cell on this theme animates nothing.
      //
      // It goes in a buffer of its own, drawn without depth testing, so the
      // oversized pin hangs in front of the solid instead of being buried in it.
      if (i === dropIndex && dropAt != null) {
        const { scale: dScale, rise } = markerDrop(dropAt, g.fit);
        // It falls down the *screen*, not down the cell's normal: on a cell
        // facing the camera the normal points at the viewer, so a pin coming in
        // along it would approach from behind the fingertip and never be seen.
        // The hand covers the cell and everything below it, so above is where
        // there is room.
        const from: Vec3 = [
          g.center[0] + this.viewUp[0] * rise,
          g.center[1] + this.viewUp[1] * rise,
          g.center[2] + this.viewUp[2] * rise,
        ];
        // ...and it stands upright on screen while it is up there, tipping into
        // the cell's own normal as it lands — a pin held over the board, then
        // pushed in. At `dropAt` 1 the axis *is* the normal, so the hand-off to
        // the standing pin is exact.
        const axis: Vec3 = [
          this.viewUp[0] + (g.normal[0] - this.viewUp[0]) * dropAt,
          this.viewUp[1] + (g.normal[1] - this.viewUp[1]) * dropAt,
          this.viewUp[2] + (g.normal[2] - this.viewUp[2]) * dropAt,
        ];
        // A cell whose normal is near enough the exact opposite of screen-up
        // leaves the blend passing through zero halfway, which `normalize`
        // turns into NaN and sprays across the buffer. Nothing to interpolate
        // there, so don't.
        const straight = Math.hypot(axis[0], axis[1], axis[2]) < 0.2;
        writeMarker(marker, from, straight ? g.normal : axis, dScale, dropSink);
        continue;
      }
      // Sized off the cell's inradius, not its mean vertex distance: a model
      // has to fit *between the edges* of the tile it stands on, and on a
      // stretched immersion those are two very different numbers (see
      // CellGeom.fit). This is the same measure the billboards use.
      const scale = g.fit * this.anim.popScale(i, now);
      writeMarker(marker, g.center, g.normal, scale, sink);
      // A two-sided cell has no consistent outward direction to stand on — the
      // Möbius strip and the Klein bottle cannot have one at all, and nothing
      // orients the cylinder — and it is drawn from both faces. A **pin** stands
      // off one of them, so it needs a second copy the other way or it is
      // missing from one side and buried under the surface from the other. A
      // **bomb** does not: its casing is centred on the tile and straddles it,
      // so the one model already pokes out both ways.
      if (this.twoSided && marker !== "bomb" && marker !== "bombHot") {
        writeMarker(
          marker,
          g.center,
          [-g.normal[0], -g.normal[1], -g.normal[2]],
          scale,
          sink,
        );
      }
    }
    this.markerGeometry.commit(sink.count);
    this.markerDropGeometry.commit(dropSink.count);
    if (this.markerDropMaterial) {
      this.markerDropMaterial.opacity = dropOpacity(dropAt ?? 1);
    }
  }

  // -- animations ------------------------------------------------------------

  setAnimationsEnabled(on: boolean): void {
    this.anim.enabled = on;
    if (!on) {
      this.anim.reset();
      this.position.set(0, 0, 0);
      for (let i = 0; i < this.order.length; i++) this.writeColor(i);
      this.rebuildGlyphs();
      this.rebuildMarkers();
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

  dropFlag(cell: CellId): void {
    const i = this.cellIndex.get(cell);
    if (i == null) return;
    this.anim.startDrop(i, performance.now());
    this.rebuildGlyphs();
    this.rebuildMarkers();
  }

  shake(): void {
    // The group is scaled to the unit sphere, so a fixed world offset reads as
    // the same fraction of the framed board on every solid.
    this.anim.startShake(0.05, performance.now());
  }

  celebrateWin(origin: CellId | null, flagged: CellId[]): void {
    if (!this.anim.enabled) return;
    const oi = origin != null ? this.cellIndex.get(origin) : undefined;
    const oc = oi != null ? this.geom[oi]!.center : null;
    // The wave washes over the whole board, not just the cells the winning
    // move opened — on a solid that means it also sweeps round the far side,
    // which the player sees on rotating the board back.
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
    // Ahead of the early-out, because a batch of `setVisual` calls with no
    // animation running still has to reach the screen. The renderer calls this
    // on every frame whether or not it means to draw, so nothing can be left
    // marked and unflushed.
    const flushed = this.flushDirty();
    if (!this.anim.pending()) return flushed;
    const step = this.anim.step(now);
    for (const i of step.recolor) this.writeColor(i);
    if (step.glyphsDirty) {
      this.rebuildGlyphs();
      this.rebuildMarkers();
    }
    this.position.set(step.offset[0], step.offset[1], 0);
    return step.active;
  }
}

/** The model that stands on a cell in this state, on a style with markers, or
 * null for the states that carry no object — a plain hidden cell, and a revealed
 * one, whose number is a number and stays a billboard. */
function markerFor(visual: CellVisual): Marker | null {
  switch (visual.kind) {
    case "flagged":
      return "pin";
    case "wrongFlag":
      return "deadPin";
    case "mine":
      return "bomb";
    case "exploded":
      return "bombHot";
    default:
      return null;
  }
}

/** The billboard a cell still needs *beside* its model. Only one state does: a
 * misplaced flag, where the pin is the flag and the dark X is the news. The
 * cells with no model at all fall through to the ordinary glyph. */
function billboardBesideMarker(visual: CellVisual): Glyph | null {
  if (visual.kind === "wrongFlag") return "cross";
  return markerFor(visual) === null ? glyphFor(visual) : null;
}

function centroidOf(points: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / points.length, c[1] / points.length, c[2] / points.length];
}

function lerp3(p: Vec3, q: Vec3, t: number): Vec3 {
  return [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
}

function add3(p: Vec3, q: Vec3): Vec3 {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
}
