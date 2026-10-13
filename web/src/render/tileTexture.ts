import {
  BufferAttribute,
  type BufferGeometry,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";

// What a tile is *made of*: a procedural surface pattern carved into the cells
// — toy-brick studs, crystal facets, wood grain, marble veins, a linen weave,
// terrazzo chips, spun metal, crackle glaze — light patterns in relief, lit
// from the top left like toys under a desk lamp. Settings › Appearance › Tile texture; `none` is the default and
// leaves the shaders exactly as they were.
//
// Three rules shape it:
//
//   * **Nothing is fetched.** Every texture is a few lines of GLSL noise, so
//     there is no image to ship, nothing to mipmap and nothing remote — the
//     app references nothing it does not carry (web/AGENTS.md).
//   * **No UVs.** The cells have none, and a solid has no seam-free way to get
//     them. The pattern is a *solid* texture instead — sampled at the vertex's
//     own position, as if each tile had been cut from a block of the stuff —
//     so it wraps a sphere, a Möbius strip and a hyperbolic arc alike.
//   * **The hue stays the theme's.** A texture only modulates brightness (and,
//     on a lit material, roughness), so the shape colour code reads exactly as
//     before through the pattern.
//
// Each cell samples the block in its own frame: centred on the cell, scaled by
// its radius (so a tile of a fractal board carries as much grain as a tile of
// the square grid) and turned and offset by a hash of the cell's index, so no
// two neighbours are cut from the same spot — a parquet rather than a sticker.
// That frame comes from the per-cell geometry texture `motionShader.ts` already
// uploads, which is why `patchTexture` must run *before* `patchMotion`: motion's
// declarations are inserted in front of these, and its pose is applied to
// `transformed` while this samples the rest `position`, so a tile that hops
// carries its grain with it.

/** The tile textures, in the order the picker lists them. `none` first. */
export const TILE_TEXTURES = [
  "none",
  "studs",
  "crystal",
  "wood",
  "marble",
  "linen",
  "terrazzo",
  "spun",
  "crackle",
] as const;

export type TileTexture = (typeof TILE_TEXTURES)[number];

export const DEFAULT_TEXTURE: TileTexture = "none";

/** Labels for the picker. */
export const TILE_TEXTURE_LABELS: Record<TileTexture, string> = {
  none: "None",
  studs: "Studs",
  crystal: "Crystal",
  wood: "Wood",
  marble: "Marble",
  linen: "Linen",
  terrazzo: "Terrazzo",
  spun: "Spun metal",
  crackle: "Crackle glaze",
};

/** One line under each label on the picker page. */
export const TILE_TEXTURE_HINTS: Record<TileTexture, string> = {
  none: "Plain tiles",
  studs: "Toy-brick bumps that catch the light",
  crystal: "Faint facets, like a cut gem",
  wood: "Grain and growth rings, every tile its own plank",
  marble: "Soft clouds crossed by veins",
  linen: "A fine canvas weave",
  terrazzo: "Chips of stone set in a plain binder",
  spun: "Turned metal rings with a bow-tie of light",
  crackle: "A glaze crazed by a net of fine lines",
};

export function resolveTexture(key: string | null | undefined): TileTexture {
  return key != null && (TILE_TEXTURES as readonly string[]).includes(key)
    ? (key as TileTexture)
    : DEFAULT_TEXTURE;
}

const VERT_HEAD = /* glsl */ `
attribute float aTexOpen;
varying vec3 vTexP;
varying vec2 vTexL;
varying float vTexOpen;
`;

/** The cell's own frame: centred, radius-scaled, turned about its axis by a
 * per-cell angle and pushed to a per-cell spot in the block. */
const VERT_BODY = /* glsl */ `
{
  int tci = int(aCell + 0.5);
  vec4 tga = texelFetch(uCellGeo, motionTexel(tci * 2), 0);
  vec4 tgb = texelFetch(uCellGeo, motionTexel(tci * 2 + 1), 0);
  vec3 td = (position - tga.xyz) / max(tga.w, 1e-6);
  vec3 tu = abs(tgb.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 t1 = normalize(cross(tu, tgb.xyz));
  vTexL = vec2(dot(td, t1), dot(td, cross(tgb.xyz, t1)));
  float th = fract(sin(float(tci) * 12.9898 + 78.233) * 43758.5453);
  float ta = th * 6.2831853;
  vec3 tax = tgb.xyz;
  float tc = cos(ta);
  float ts = sin(ta);
  td = td * tc + cross(tax, td) * ts + tax * dot(tax, td) * (1.0 - tc);
  vTexP = td + vec3(th * 37.0, fract(th * 7.13) * 29.0, fract(th * 3.71) * 23.0);
  vTexOpen = aTexOpen;
}
`;

const NOISE = /* glsl */ `
varying vec3 vTexP;
varying vec2 vTexL;
varying float vTexOpen;
float txHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float txNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(txHash(i + vec3(0, 0, 0)), txHash(i + vec3(1, 0, 0)), f.x),
                 mix(txHash(i + vec3(0, 1, 0)), txHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(txHash(i + vec3(0, 0, 1)), txHash(i + vec3(1, 0, 1)), f.x),
                 mix(txHash(i + vec3(0, 1, 1)), txHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float txFbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * txNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return s;
}
// How much of a feature of this many periods per unit survives at this pixel:
// 1 while it is several pixels wide, fading to 0 as it nears the pixel grid,
// so a fine weave greys out on a small tile instead of shimmering.
float txKeep(float freq) {
  float w = length(fwidth(vTexP)) * freq;
  return 1.0 - smoothstep(0.25, 0.6, w);
}
// The Voronoi feature nearest p: distance to it, the gap to the second
// nearest, and a random value for the chip it belongs to.
vec3 txCells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(txHash(i + g), txHash(i + g + 19.1), txHash(i + g + 47.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = txHash(i + g + 7.7); }
    else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2 - d1, id);
}
`;

/** One texture's sample, as `(brightness, height, roughness delta)`.
 * Brightness multiplies the colour (1 = unchanged), height drives the bump,
 * the roughness delta is added to the material's. */
// Each sampler answers `(brightness, height, roughness delta)` at a point of
// the block. Brightness is kept *light* — a few percent either way — because
// most of what a texture says is said by its height, which `patchTexture`
// lights from the top left like a toy under a desk lamp: the side of a raised
// feature facing the lamp catches a highlight, the far side turns dark, and a
// soft shadow falls down and to the right of it.
const SAMPLERS: Record<Exclude<TileTexture, "none">, string> = {
  // Toy-brick studs: a two-by-two cluster of round bumps on every tile, each
  // with a little dome on top, laid square to the board.
  studs: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  vec2 q = abs(l) - vec2(0.27);
  float d = length(q);
  float r = 0.17;
  float body = 1.0 - smoothstep(r - 0.025, r, d);
  float dome = body * (1.0 - (d / r) * (d / r));
  return vec3(1.0 + 0.1 * dome, body * 0.8 + dome * 0.35, -0.05 * body);
}`,
  // A cut gem: the face broken into flat facets, each tipped a little toward or
  // away from the lamp, so it reads as faint triangular light and shade.
  crystal: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  vec3 c = txCells(p * 1.1);
  float tone = (c.z - 0.5) * 0.2;
  return vec3(1.04 + tone, c.z * 0.6, -0.2);
}`,
  // Growth rings seen along the plank: soft latewood grooves across the tile,
  // wandering on a low-frequency warp, over fibres drawn along the grain.
  wood: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  float warp = txFbm(p * vec3(0.5, 1.6, 1.6));
  float g = (p.y * 0.8 + p.z * 0.5 + warp * 1.1) * 3.0;
  float ring = pow(0.5 + 0.5 * cos(6.2831853 * g), 3.0);
  float fibre = mix(0.5, txNoise(p * vec3(1.0, 16.0, 16.0)), txKeep(16.0));
  float figure = txFbm(p * vec3(0.8, 4.0, 4.0));
  float b = 1.04 - 0.1 * ring - 0.06 * (fibre - 0.5) - 0.08 * (figure - 0.5);
  return vec3(b, 0.5 - ring * 0.5 + fibre * 0.12, 0.06);
}`,
  // A cloudy light ground crossed by soft, slightly sunken veins.
  marble: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  float t = txFbm(p * 0.9);
  float v = abs(sin((p.x * 0.8 + p.y * 0.5) * 3.2 + t * 6.0));
  float vein = 1.0 - smoothstep(0.0, 0.5, v);
  vein *= vein;
  float cloud = txFbm(p * 1.8 + 7.0);
  float b = 1.06 - 0.12 * vein - 0.12 * (cloud - 0.5);
  return vec3(b, 0.4 - vein * 0.4 + cloud * 0.15, -0.25);
}`,
  // A canvas weave: two sets of rounded threads, the pair seen as a grid of
  // soft ridges. Only drawn where wide enough to see.
  linen: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  float n = 6.0;
  vec2 q = p.xy * n;
  float k = txKeep(n);
  float warpT = 0.5 + 0.5 * cos(6.2831853 * q.x);
  float weftT = 0.5 + 0.5 * cos(6.2831853 * q.y);
  float over = sin(3.1415927 * q.x) * sin(3.1415927 * q.y);
  float th = mix(weftT, warpT, 0.5 + 0.5 * over);
  float mott = txFbm(p * 1.4);
  float b = 1.0 + k * 0.05 * (th - 0.5) - 0.05 * (mott - 0.5);
  return vec3(b, k * th * 0.5, 0.15);
}`,
  // Chips of stone set a hair proud of a plain binder, big ones and small.
  terrazzo: /* glsl */ `
float txChips(vec3 q, float scale, float density, float keep, inout float tone) {
  vec3 c = txCells(q * scale);
  float r = 0.16 + 0.2 * fract(c.z * 7.3);
  float chip = (1.0 - smoothstep(r - 0.05, r, c.x)) * step(1.0 - density, c.z) * keep;
  float t = fract(c.z * 13.7);
  float shade = t < 0.4 ? 0.84 : (t < 0.75 ? 0.94 : 1.1);
  tone = mix(tone, shade, chip);
  return chip;
}
vec3 txSample(vec3 p, vec2 l) {
  vec3 q = p + 0.12 * vec3(txNoise(p * 3.0), txNoise(p * 3.0 + 5.0), txNoise(p * 3.0 + 9.0));
  float tone = 1.03;
  float big = txChips(q, 2.0, 0.7, 1.0, tone);
  float small = txChips(q + 11.0, 5.0, 0.6, txKeep(5.0), tone);
  return vec3(tone, (big + small) * 0.6, -0.15 * (big + small));
}`,
  // Spun metal: fine concentric turning grooves round the tile's middle, and
  // the bow-tie of light a turned disc throws back, always the same way up.
  spun: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  float r = length(l);
  float a = atan(l.y, l.x);
  float groove = 0.5 + 0.5 * cos(r * 36.0 + txNoise(vec3(r * 4.0, 0.0, 2.0)) * 3.0);
  groove = mix(0.5, groove, txKeep(6.0));
  float bow = pow(abs(cos(a - 0.6)), 6.0) * smoothstep(0.05, 0.4, r);
  float b = 0.97 + 0.03 * (groove - 0.5) + 0.12 * bow;
  return vec3(b, groove * 0.25, -0.3);
}`,
  // A crackle glaze: a glossy ceramic ground crazed by a net of fine sunken
  // lines, each plate of glaze a hair different in tone.
  crackle: /* glsl */ `
vec3 txSample(vec3 p, vec2 l) {
  float k = txKeep(4.5);
  vec3 c = txCells(p * 4.5 + 0.35 * txFbm(p * 2.0));
  float line = 1.0 - smoothstep(0.0, 0.06, c.y);
  float b = 1.02 - k * 0.08 * line + k * 0.03 * (c.z - 0.5);
  return vec3(b, 0.5 - k * line * 0.5, -0.3);
}`,
};

/** How hard each texture's relief is lit: `emboss` scales the lamp-side
 * highlight and far-side shade, `shadow` the shadow a raised feature casts, and `open` overrides how much of
 * the whole an opened cell keeps (`OPEN_STRENGTH`). */
const RELIEF: Record<
  Exclude<TileTexture, "none">,
  { emboss: number; shadow: number; open?: number }
> = {
  // An opened brick is a flat floor: the digit is the thing on it.
  studs: { emboss: 1.2, shadow: 1.0, open: 0.12 },
  crystal: { emboss: 1.0, shadow: 0.0 },
  wood: { emboss: 0.6, shadow: 0.35 },
  marble: { emboss: 0.5, shadow: 0.25 },
  linen: { emboss: 0.45, shadow: 0.2 },
  terrazzo: { emboss: 0.8, shadow: 0.6 },
  spun: { emboss: 0.6, shadow: 0.0 },
  crackle: { emboss: 0.5, shadow: 0.3 },
};

/** Where the lamp is, in texture space: the screen's top left carried into the
 * block by the pattern's own screen derivatives, so it stays top left however
 * the tile was turned and however far the board is zoomed. `EMBOSS_STEP` and
 * `SHADOW_STEP` are how far toward it the relief is probed, in tile radii. */
const EMBOSS_STEP = 0.03;
const SHADOW_STEP = 0.08;

const RELIEF_GLSL = (r: { emboss: number; shadow: number }): string => /* glsl */ `
vec3 txS;
{
  vec3 lamp = dFdx(vTexP) * -0.7071 + dFdy(vTexP) * 0.7071;
  vec2 lamp2 = dFdx(vTexL) * -0.7071 + dFdy(vTexL) * 0.7071;
  float ll = length(lamp);
  float inv = ll > 1e-8 ? 1.0 / ll : 0.0;
  lamp *= inv;
  lamp2 *= inv;
  txS = txSample(vTexP, vTexL);
  float h1 = txSample(vTexP + lamp * ${EMBOSS_STEP.toFixed(3)}, vTexL + lamp2 * ${EMBOSS_STEP.toFixed(3)}).y;
  float emb = clamp((txS.y - h1) * ${(r.emboss * 8).toFixed(3)}, -1.0, 1.0);
  float sh = 0.0;
  ${
    r.shadow > 0
      ? `float h2 = txSample(vTexP + lamp * ${SHADOW_STEP.toFixed(3)}, vTexL + lamp2 * ${SHADOW_STEP.toFixed(3)}).y;
  sh = clamp((h2 - txS.y) * 2.0, 0.0, 1.0) * ${(0.35 * r.shadow).toFixed(3)};`
      : ""
  }
  txS.x *= (1.0 + 0.3 * emb) * (1.0 - sh);
}
`;

/** The toy-lamp key on a lit tile: faces tipped toward the top left of the
 * screen come up bright, faces tipped away go dark. On a flat board that is
 * the bevel — a highlight along the top and left edges, shade along the bottom
 * and right — which a head-on rig cannot give it; on a solid it is a gentle
 * extra key from the same corner. */
const TILT = 0.4;

/** How much of the pattern an **opened** cell keeps. Its floor is where the
 * digit is read, so the grain there is turned well down: the board still reads
 * as one material, and a 1 on a knot of wood is still a 1. */
const OPEN_STRENGTH = 0.35;

/** The per-vertex "this cell is opened" flag the shader turns the pattern down
 * by. Only a textured board carries it; the renderers write it from
 * `writeColor`, which every state change already goes through. */
export class TextureOpenFlags {
  private readonly attr: BufferAttribute;

  constructor(geometry: BufferGeometry, vertexCount: number) {
    this.attr = new BufferAttribute(new Float32Array(vertexCount), 1);
    geometry.setAttribute("aTexOpen", this.attr);
  }

  set(start: number, count: number, open: boolean): void {
    const a = this.attr.array as Float32Array;
    const v = open ? 1 : 0;
    if (count === 0 || a[start] === v) return;
    a.fill(v, start, start + count);
    this.attr.needsUpdate = true;
  }
}

/** A board's open flags if its style is textured, else null. */
export function textureOpenFlags(
  texture: string | undefined,
  geometry: BufferGeometry,
  vertexCount: number,
): TextureOpenFlags | null {
  return resolveTexture(texture) === "none" ? null : new TextureOpenFlags(geometry, vertexCount);
}

/** Carve `texture` into a tile material. `lit` materials also take the
 * roughness change and the lamp's key (`TILT`); an unlit one only the
 * brightness and its relief. A no-op for
 * `none`, which is what keeps the default board's shaders byte-identical.
 *
 * Call it **before** `patchMotion` (see the header). */
export function patchTexture(material: Material, texture: string | undefined, lit: boolean): void {
  const key = resolveTexture(texture);
  if (key === "none") return;
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
    prev(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`);
    let frag = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${NOISE}\n${SAMPLERS[key]}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${RELIEF_GLSL(RELIEF[key])}` +
          `float txK = mix(1.0, ${(RELIEF[key].open ?? OPEN_STRENGTH).toFixed(3)}, vTexOpen);\n` +
          `txS = vec3(mix(1.0, txS.x, txK), txS.y * txK, txS.z * txK);\n` +
          `diffuseColor.rgb *= txS.x;`,
      );
    if (lit) {
      frag = frag
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + txS.z, 0.04, 1.0);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>\ndiffuseColor.rgb *= clamp(1.0 + ${TILT.toFixed(3)} * dot(normal.xy, vec2(-0.7071, 0.7071)), 0.55, 1.45);`,
        );
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `${prevKey()}|texture:${key}:${lit ? 1 : 0}`;
}
