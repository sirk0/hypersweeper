import {
  BufferAttribute,
  type BufferGeometry,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";

// What a tile is *made of*: a procedural surface pattern carved into the cells
// — wood grain, marble veins, a linen weave, terrazzo chips, spun metal,
// crackle glaze — so a board reads as a set of real pieces rather than as coloured
// plastic. Settings › Appearance › Tile texture; `none` is the default and
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
//     on a lit material, the surface normal and roughness), so the shape colour
//     code reads exactly as before through the grain.
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
const SAMPLERS: Record<Exclude<TileTexture, "none">, string> = {
  // Growth rings seen along the plank: soft dark latewood lines across the
  // tile, wandering on a low-frequency warp, over fibres drawn along the grain.
  wood: /* glsl */ `
vec3 txSample(vec3 p) {
  float warp = txFbm(p * vec3(0.5, 1.6, 1.6));
  float g = (p.y * 0.8 + p.z * 0.5 + warp * 1.1) * 3.6;
  float ring = pow(0.5 + 0.5 * cos(6.2831853 * g), 3.0);
  float fibre = mix(0.5, txNoise(p * vec3(1.0, 16.0, 16.0)), txKeep(16.0));
  float figure = txFbm(p * vec3(0.8, 4.0, 4.0));
  float b = 1.08 - 0.3 * ring - 0.2 * (fibre - 0.5) - 0.16 * (figure - 0.5);
  return vec3(b, -ring * 0.6 + fibre * 0.2, 0.06);
}`,
  // A cloudy light ground crossed by a soft main vein and a few fine ones.
  marble: /* glsl */ `
vec3 txSample(vec3 p) {
  float t = txFbm(p * 0.9);
  float v = abs(sin((p.x * 0.8 + p.y * 0.5) * 3.2 + t * 6.0));
  float vein = 1.0 - smoothstep(0.0, 0.5, v);
  vein *= vein;
  float v2 = abs(sin((p.x - p.y * 0.7) * 3.5 + txFbm(p * 1.7 + 3.0) * 8.0));
  float fine = (1.0 - smoothstep(0.0, 0.05, v2)) * txKeep(6.0);
  float cloud = txFbm(p * 1.8 + 7.0);
  float b = 1.16 - 0.3 * vein - 0.06 * fine - 0.26 * (cloud - 0.5);
  return vec3(b, -vein * 0.2, -0.25);
}`,
  // A canvas weave: two sets of rounded threads, each a little slubby, the
  // pair seen as a grid of soft ridges. Only drawn where wide enough to see.
  linen: /* glsl */ `
vec3 txSample(vec3 p) {
  float n = 7.0;
  vec2 q = p.xy * n;
  float k = txKeep(n);
  float sx = txNoise(vec3(floor(q.x) * 0.71, p.y * 2.0, 1.0));
  float sy = txNoise(vec3(p.x * 2.0, floor(q.y) * 0.71, 4.0));
  float warpT = pow(0.5 + 0.5 * cos(6.2831853 * q.x), 0.7) * (0.75 + 0.5 * sx);
  float weftT = pow(0.5 + 0.5 * cos(6.2831853 * q.y), 0.7) * (0.75 + 0.5 * sy);
  float over = sin(3.1415927 * q.x) * sin(3.1415927 * q.y);
  float th = mix(weftT, warpT, 0.5 + 0.5 * over);
  float mott = txFbm(p * 1.4);
  float b = 1.0 + k * 0.3 * (th - 0.5) - 0.08 * (mott - 0.5);
  return vec3(b, k * th * 0.8, 0.15);
}`,
  // Chips of stone scattered through a plain binder: big ones and small ones,
  // each its own tone, with a fine speckle over everything.
  terrazzo: /* glsl */ `
float txChips(vec3 q, float scale, float density, float keep, inout float tone) {
  vec3 c = txCells(q * scale);
  float r = 0.16 + 0.2 * fract(c.z * 7.3);
  float chip = (1.0 - smoothstep(r - 0.05, r, c.x)) * step(1.0 - density, c.z) * keep;
  float t = fract(c.z * 13.7);
  float shade = t < 0.4 ? 0.58 : (t < 0.75 ? 0.82 : 1.22);
  tone = mix(tone, shade, chip);
  return chip;
}
vec3 txSample(vec3 p) {
  vec3 q = p + 0.12 * vec3(txNoise(p * 3.0), txNoise(p * 3.0 + 5.0), txNoise(p * 3.0 + 9.0));
  float tone = 1.05;
  float big = txChips(q, 2.0, 0.85, 1.0, tone);
  float small = txChips(q + 11.0, 5.0, 0.7, txKeep(5.0), tone);
  float speck = mix(0.5, txNoise(p * 30.0), txKeep(30.0));
  float b = tone - 0.08 * (speck - 0.5);
  return vec3(b, (big + small) * 0.4, -0.15 * (big + small));
}`,
  // Spun metal: fine concentric turning marks round the tile's middle, and
  // the bow-tie of light a turned disc throws back, always the same way up.
  spun: /* glsl */ `
vec3 txSample(vec3 p) {
  float r = length(vTexL);
  float a = atan(vTexL.y, vTexL.x);
  float k = txKeep(14.0);
  float turn = mix(0.5, txNoise(vec3(r * 14.0, r * 3.0, p.z)), k);
  float groove = 0.5 + 0.5 * cos(r * 40.0 + txNoise(vec3(r * 4.0, 0.0, 2.0)) * 3.0);
  groove = mix(0.5, groove, txKeep(7.0));
  float bow = pow(abs(cos(a - 0.6)), 6.0) * smoothstep(0.05, 0.4, r);
  float b = 0.9 + 0.2 * (turn - 0.5) + 0.1 * (groove - 0.5) + 0.32 * bow;
  return vec3(b, turn * 0.3 + groove * 0.2, -0.3);
}`,
  // A crackle glaze: a glossy ceramic ground crazed by a net of fine dark
  // lines, each plate of glaze a hair different in tone.
  crackle: /* glsl */ `
vec3 txSample(vec3 p) {
  float k = txKeep(4.5);
  vec3 c = txCells(p * 4.5 + 0.35 * txFbm(p * 2.0));
  float line = 1.0 - smoothstep(0.0, 0.06, c.y);
  float plate = c.z - 0.5;
  float mott = txFbm(p * 1.5);
  float b = 1.04 - k * 0.22 * line + k * 0.06 * plate - 0.1 * (mott - 0.5);
  return vec3(b, -k * line * 0.6, -0.3);
}`,
};

/** How hard each texture's height bends the normal on a lit material. */
const BUMP: Record<Exclude<TileTexture, "none">, number> = {
  wood: 0.35,
  marble: 0.15,
  linen: 0.6,
  terrazzo: 0.3,
  spun: 0.3,
  crackle: 0.4,
};

/** Bend `n` by the screen-space gradient of a height — three's
 * `perturbNormalArb`, renamed so it cannot collide with a bump map's. */
const PERTURB = /* glsl */ `
vec3 txPerturb(vec3 surf, vec3 n, vec2 dh, float face) {
  vec3 sx = normalize(dFdx(surf));
  vec3 sy = normalize(dFdy(surf));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

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

/** Carve `texture` into a tile material. `lit` materials also take the bump
 * and the roughness change; an unlit one only the brightness. A no-op for
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
      .replace("#include <common>", `#include <common>\n${NOISE}\n${SAMPLERS[key]}\n${PERTURB}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\nvec3 txS = txSample(vTexP);\n` +
          `float txK = mix(1.0, ${OPEN_STRENGTH.toFixed(3)}, vTexOpen);\n` +
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
          `#include <normal_fragment_maps>\nnormal = txPerturb(-vViewPosition, normal, vec2(dFdx(txS.y), dFdy(txS.y)) * ${BUMP[key].toFixed(3)}, faceDirection);`,
        );
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => `${prevKey()}|texture:${key}:${lit ? 1 : 0}`;
}
