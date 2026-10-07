import {
  BufferAttribute,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type BufferGeometry,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import {
  BUILD_SPREAD_MS,
  CellMotion,
  MINE_PER_CELL,
  MINE_SPREAD_MS,
  MOTION_CHANNELS,
  RIPPLE_PER_CELL,
  SHOCK_PER_CELL,
  waveDelays,
} from "./cellMotion";
import { WIN_PER_CELL } from "./animations";

/** How long a loss takes to fade the board, and how grey it goes. */
const FADE_MS = 650;
const FADE_TO = 0.6;

// The GPU half of `CellMotion`: two float textures and the vertex-stage patch
// that reads them.
//
//   * `uMotion` — one texel per cell, the four motion channels (lift, scale,
//     glyph, twist). Rewritten while anything moves.
//   * `uCellGeo` — two texels per cell, written once when the board is built:
//     the pivot the cell scales and twists about with its radius (lift is in
//     radii), and the outward axis it lifts along with one spare float — the
//     cell's exemption from the board-wide fade a loss puts on (`uDesat`), so
//     the mine that went off stays red while everything else goes grey.
//
// Every patched vertex carries `aCell`, the index of the cell it belongs to.
// Three things wear the patch: the tiles, the glyph quads (scaled by `glyph`
// on top of `scale`), and the standing markers on a style that has them (as
// glyphs — a pin is a flag).

/** Texels per row. Wide enough that a hard Klein bottle fits in a few rows,
 * narrow enough for any WebGL2 texture limit. */
const ROW = 256;

export type MotionRole = "tile" | "glyph";

export interface MotionUniforms {
  uMotion: { value: DataTexture };
  uCellGeo: { value: DataTexture };
  /** 1 on a two-sided surface: lift moves each face of the lens outward on its
   * own side (a button thickening or flattening) rather than the whole lens
   * one way, which from the far side would read backwards. */
  uLens: { value: number };
  /** How much a lift also grows the tile, per cell radius of lift. A flat
   * board is seen head-on through an orthographic camera, where moving a tile
   * toward the viewer changes *nothing* on screen — so there a lift is shown
   * as the tile growing, the way a thing coming closer does. A solid sees its
   * lift as parallax and needs only a little of this. */
  uLiftScale: { value: number };
  /** 0..1, how far the board has gone grey (a loss). */
  uDesat: { value: number };
  /** Strength of the rim light a solid's tiles catch at their silhouette. */
  uRim: { value: number };
}

function texture(texels: number): { tex: DataTexture; data: Float32Array } {
  const rows = Math.max(1, Math.ceil(texels / ROW));
  const data = new Float32Array(ROW * rows * 4);
  const tex = new DataTexture(data, ROW, rows, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, data };
}

/** A board's motion state: the clock, its texture, and the static per-cell
 * geometry the shader moves cells about. */
export class BoardMotion {
  readonly motion: CellMotion;
  readonly uniforms: MotionUniforms;
  private readonly motionTex: DataTexture;
  private readonly geoTex: DataTexture;
  private readonly geo: Float32Array;
  /** Each cell's centre, for the waves' distances, and the cell width they
   * are measured in. */
  private readonly centers: number[][] = [];
  private unit = 1;
  private fadeStart: number | null = null;

  constructor(count: number, lens: boolean, liftScale: number) {
    const m = texture(count);
    this.motionTex = m.tex;
    this.motion = new CellMotion(count, m.data);
    const g = texture(count * 2);
    this.geoTex = g.tex;
    this.geo = g.data;
    this.uniforms = {
      uMotion: { value: this.motionTex },
      uCellGeo: { value: this.geoTex },
      uLens: { value: lens ? 1 : 0 },
      uLiftScale: { value: liftScale },
      uDesat: { value: 0 },
      uRim: { value: 0 },
    };
  }

  /** Where cell `i` pivots, which way is out, and its radius. */
  setCell(
    i: number,
    pivot: readonly number[],
    axis: readonly number[],
    radius: number,
  ): void {
    const k = i * 8;
    this.geo[k] = pivot[0] ?? 0;
    this.geo[k + 1] = pivot[1] ?? 0;
    this.geo[k + 2] = pivot[2] ?? 0;
    this.geo[k + 3] = radius;
    this.geo[k + 4] = axis[0] ?? 0;
    this.geo[k + 5] = axis[1] ?? 0;
    this.geo[k + 6] = axis[2] ?? 1;
    this.geoTex.needsUpdate = true;
    this.centers[i] = [pivot[0] ?? 0, pivot[1] ?? 0, pivot[2] ?? 0];
  }

  /** The width the waves are paced in — the board's mean cell radius. */
  setUnit(unit: number): void {
    this.unit = unit > 0 ? unit : 1;
  }

  get enabled(): boolean {
    return this.motion.enabled;
  }

  set enabled(on: boolean) {
    this.motion.enabled = on;
    if (!on) this.reset();
  }

  private wave(
    indices: readonly number[],
    origin: number | null,
    perCell: number,
    cap = Infinity,
  ): { index: number; delay: number; distance: number }[] {
    const o = origin != null ? (this.centers[origin] ?? null) : null;
    return waveDelays(
      indices.map((index) => ({ index, center: this.centers[index] ?? [0, 0, 0] })),
      o,
      this.unit,
      perCell,
      cap,
    );
  }

  private all(): number[] {
    return Array.from({ length: this.motion.count }, (_, i) => i);
  }

  /** Freshly opened cells drop from `height` (cell radii) into their recesses,
   * staggered out from `origin` at the reveal ripple's pace. */
  opened(indices: readonly number[], origin: number | null, height: number, now: number): void {
    this.motion.start(
      "open",
      this.wave(indices, origin, RIPPLE_PER_CELL).map((e) => ({ ...e, amount: height })),
      now,
    );
  }

  bounce(index: number, now: number): void {
    this.motion.start("bounce", [{ index }], now);
  }

  /** A chord's reach: dip in turn, or shake the chorded cell when it could not
   * open anything. */
  chord(index: number, reach: readonly number[], ok: boolean, now: number): void {
    if (ok) {
      this.motion.start("dip", this.wave(reach, index, 40), now);
    } else {
      this.motion.start("wiggle", [{ index }, ...reach.map((i) => ({ index: i }))], now);
    }
  }

  /** A loss: the blast front knocks the tiles up on its way out, the other
   * mines pop in one after another, and the board fades to grey round the one
   * that went off. */
  detonate(origin: number | null, mines: readonly number[], now: number): void {
    if (!this.motion.enabled) return;
    const shock = this.wave(this.all(), origin, SHOCK_PER_CELL).map((e) => ({
      ...e,
      amount: 0.55 * Math.exp(-e.distance / 5),
    }));
    this.motion.start("shock", shock.filter((e) => e.amount > 0.02), now);
    this.motion.start(
      "reveal",
      this.wave(mines.filter((i) => i !== origin), origin, MINE_PER_CELL, MINE_SPREAD_MS).map(
        (e) => ({ ...e, delay: e.delay + 120 }),
      ),
      now,
    );
    if (origin != null) this.setExempt(origin, true);
    this.fadeStart = now;
  }

  /** The win wave's hop, on the colour wave's own stagger. */
  hop(origin: number | null, now: number): void {
    this.motion.start("hop", this.wave(this.all(), origin, WIN_PER_CELL), now);
  }

  /** A new board assembling from its middle out. */
  assemble(now: number): void {
    if (!this.motion.enabled || this.motion.count === 0) return;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const c of this.centers) {
      cx += c[0]!;
      cy += c[1]!;
      cz += c[2]!;
    }
    const n = this.centers.length || 1;
    const mid = [cx / n, cy / n, cz / n];
    const nearest = this.centers.reduce(
      (best, c, i) =>
        Math.hypot(c[0]! - mid[0]!, c[1]! - mid[1]!, c[2]! - mid[2]!) <
        Math.hypot(
          this.centers[best]![0]! - mid[0]!,
          this.centers[best]![1]! - mid[1]!,
          this.centers[best]![2]! - mid[2]!,
        )
          ? i
          : best,
      0,
    );
    this.motion.start("build", this.wave(this.all(), nearest, 18, BUILD_SPREAD_MS), now);
  }

  /** Keep cell `i` in colour when the board fades (the mine that went off). */
  setExempt(i: number, on: boolean): void {
    this.geo[i * 8 + 7] = on ? 1 : 0;
    this.geoTex.needsUpdate = true;
  }

  /** Advance the clock; re-upload the texture when it changed. Returns whether
   * this frame needs drawing. */
  step(now: number): boolean {
    // A step that changed anything wants that frame drawn — including the one
    // that writes a finished cell back to rest. Reporting only what is still
    // pending would leave the board on its second-to-last frame.
    const moved = this.motion.step(now);
    if (moved) this.motionTex.needsUpdate = true;
    const fading = this.fadeStart != null;
    if (this.fadeStart != null) {
      const p = Math.min(1, (now - this.fadeStart) / FADE_MS);
      this.uniforms.uDesat.value = FADE_TO * (1 - (1 - p) * (1 - p));
      if (p >= 1) this.fadeStart = null;
    }
    return moved || fading || this.motion.pending();
  }

  reset(): void {
    this.motion.reset();
    this.fadeStart = null;
    this.uniforms.uDesat.value = 0;
    for (let i = 7; i < this.geo.length; i += 8) this.geo[i] = 0;
    this.geoTex.needsUpdate = true;
    this.motionTex.needsUpdate = true;
  }
}

/** Fill `geometry`'s `aCell` attribute from a per-cell vertex range. */
export function cellAttribute(
  geometry: BufferGeometry,
  vertexCount: number,
  ranges: readonly { start: number; count: number }[],
): BufferAttribute {
  const cells = new Float32Array(vertexCount);
  ranges.forEach((r, i) => cells.fill(i, r.start, r.start + r.count));
  const attr = new BufferAttribute(cells, 1);
  geometry.setAttribute("aCell", attr);
  return attr;
}

const VERT_HEAD = /* glsl */ `
attribute float aCell;
uniform sampler2D uMotion;
uniform sampler2D uCellGeo;
uniform float uLens;
uniform float uLiftScale;
varying float vExempt;
ivec2 motionTexel(int i) { return ivec2(i % ${ROW}, i / ${ROW}); }
`;

/** Move the vertex by its cell's pose. `GLYPH` scales by the glyph channel on
 * top of the tile's. Twist is a Rodrigues turn about the axis. */
const vertBody = (role: MotionRole): string => /* glsl */ `
{
  int ci = int(aCell + 0.5);
  vec4 mo = texelFetch(uMotion, motionTexel(ci), 0);
  vec4 ga = texelFetch(uCellGeo, motionTexel(ci * 2), 0);
  vec4 gb = texelFetch(uCellGeo, motionTexel(ci * 2 + 1), 0);
  vExempt = 1.0 - gb.w;
  vec3 ax = gb.xyz;
  vec3 d = transformed - ga.xyz;
  float side = uLens > 0.5 ? sign(dot(d, ax)) : 1.0;
  float c = cos(mo.w);
  float s = sin(mo.w);
  d = d * c + cross(ax, d) * s + ax * dot(ax, d) * (1.0 - c);
  float sc = mo.y${role === "glyph" ? " * mo.z" : ""} * max(0.2, 1.0 + mo.x * uLiftScale);
  transformed = ga.xyz + d * sc + ax * (mo.x * ga.w * side);
}
`;

const FRAG_HEAD = /* glsl */ `
uniform float uDesat;
uniform float uRim;
varying float vExempt;
`;

/** The loss fade, after the vertex colour is applied. */
const FRAG_COLOR = /* glsl */ `
{
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 0.92, uDesat * vExempt);
}
`;

/** A cool rim light at grazing angles — a lit material only. */
const FRAG_RIM = /* glsl */ `
{
  float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
  totalEmissiveRadiance += uRim * pow(1.0 - facing, 3.0) * vec3(0.85, 0.92, 1.0);
}
`;

/** Teach `material` to move with its cells. Chains after any patch it already
 * has (the marker glow), and keys the program cache on the role, so two
 * materials patched differently never share a compiled program. */
export function patchMotion(
  material: Material,
  uniforms: MotionUniforms,
  role: MotionRole,
  lit: boolean,
): void {
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${vertBody(role)}`);
    let frag = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>\n${FRAG_HEAD}`,
    );
    if (role === "tile") {
      frag = frag.replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`);
      if (lit) {
        frag = frag.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>\n${FRAG_RIM}`,
        );
      }
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `${prevKey()}|motion:${role}:${lit ? 1 : 0}`;
}

export { MOTION_CHANNELS };
