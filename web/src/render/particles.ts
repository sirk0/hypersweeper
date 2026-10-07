import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  OrthographicCamera,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Vector3,
  type Camera,
} from "three";

// Particles drawn over the board: the puff a flag kicks up, the sparks and
// smoke of a mine going off, and the confetti of a win. One `Points` mesh in
// the renderer's scene (world space, so confetti falls down the *screen*
// whatever a solid is turned to), simulated on the CPU — a few hundred points
// at most — and drawn as point sprites shaped in the fragment shader.
//
// Normal (not additive) blending throughout: the canvas is transparent, and an
// additive glow over a light page is white on white. A soft disc of warm colour
// reads as light on every theme.
//
// Point sizes are given in world units and turned into pixels per camera each
// frame (`onBeforeRender`), so an effect is the same size relative to the board
// at any zoom.

export type ParticleShape = 0 | 1 | 2; // soft disc, confetti strip, hot glow

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** World units per ms², down the screen (positive falls). */
  gravity: number;
  /** Fraction of velocity kept per ms. */
  drag: number;
  size: number;
  grow: number; // size multiplier reached at the end of life
  r: number;
  g: number;
  b: number;
  life: number; // ms
  age: number; // ms
  spin: number;
  spinRate: number; // rad per ms
  shape: ParticleShape;
}

const CAPACITY = 900;

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute vec2 aSpin; // angle, shape
uniform float uPx;      // pixels per world unit at unit depth (persp) or flat (ortho)
uniform float uPersp;
varying vec4 vColor;
varying vec2 vSpin;
void main() {
  vColor = aColor;
  vSpin = aSpin;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (uPersp > 0.5 ? uPx / max(0.001, -mv.z) : uPx);
}
`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec2 vSpin;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vSpin.y > 1.5) {
    // hot glow: a tight core in a wide falloff
    float r2 = dot(p, p);
    a = exp(-r2 * 3.5);
  } else if (vSpin.y > 0.5) {
    // confetti: a strip turned by its spin, its width breathing as it tumbles
    float c = cos(vSpin.x);
    float s = sin(vSpin.x);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float w = 0.28 + 0.6 * abs(cos(vSpin.x * 1.7));
    float edge = max(abs(q.x) / w, abs(q.y) / 0.5);
    a = 1.0 - smoothstep(0.8, 1.0, edge);
  } else {
    float r = length(p);
    a = 1.0 - smoothstep(0.35, 1.0, r);
  }
  if (a * vColor.a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, a * vColor.a);
}
`;

/** A seedable-enough random for effects (no gameplay depends on it). */
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export class ParticleField extends Points {
  private readonly parts: Particle[] = [];
  private readonly posAttr: BufferAttribute;
  private readonly colorAttr: BufferAttribute;
  private readonly sizeAttr: BufferAttribute;
  private readonly spinAttr: BufferAttribute;
  private readonly mat: ShaderMaterial;
  private last: number | null = null;
  /** Pixel height of the drawing buffer, set by the renderer on resize. */
  bufferHeight = 1;

  constructor() {
    const geometry = new BufferGeometry();
    const pos = new BufferAttribute(new Float32Array(CAPACITY * 3), 3);
    const col = new BufferAttribute(new Float32Array(CAPACITY * 4), 4);
    const size = new BufferAttribute(new Float32Array(CAPACITY), 1);
    const spin = new BufferAttribute(new Float32Array(CAPACITY * 2), 2);
    geometry.setAttribute("position", pos);
    geometry.setAttribute("aColor", col);
    geometry.setAttribute("aSize", size);
    geometry.setAttribute("aSpin", spin);
    geometry.setDrawRange(0, 0);
    const mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uPx: { value: 1 }, uPersp: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: NormalBlending,
    });
    super(geometry, mat);
    this.posAttr = pos;
    this.colorAttr = col;
    this.sizeAttr = size;
    this.spinAttr = spin;
    this.mat = mat;
    this.frustumCulled = false;
    this.renderOrder = 10;
    this.name = "particles";
  }

  /** Whether anything is still alive. */
  get active(): boolean {
    return this.parts.length > 0;
  }

  reset(): void {
    this.parts.length = 0;
    this.geometry.setDrawRange(0, 0);
    this.last = null;
  }

  private spawn(p: Particle): void {
    if (this.parts.length >= CAPACITY) this.parts.shift();
    this.parts.push(p);
  }

  /** A small ring of dust off a tile a flag went into (or out of), `unit` the
   * cell radius in world units and `up` the screen's up in world space. */
  puff(at: Vector3, unit: number, color: Color, up: Vector3, right: Vector3): void {
    const n = 9;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const speed = unit * rand(0.0022, 0.0034);
      const dx = Math.cos(a) * speed;
      const dy = Math.sin(a) * speed;
      this.spawn({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: right.x * dx + up.x * dy,
        vy: right.y * dx + up.y * dy,
        vz: right.z * dx + up.z * dy,
        gravity: 0,
        drag: 0.994,
        size: unit * rand(0.28, 0.4),
        grow: 0.3,
        r: color.r,
        g: color.g,
        b: color.b,
        life: rand(300, 420),
        age: 0,
        spin: 0,
        spinRate: 0,
        shape: 0,
      });
    }
  }

  /** A mine going off: a hot flash, sparks thrown wide, and a little smoke. */
  blast(at: Vector3, unit: number, up: Vector3, right: Vector3, out: Vector3): void {
    this.spawn({
      x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 1,
      size: unit * 7, grow: 1.6, r: 1, g: 0.86, b: 0.55,
      life: 360, age: 0, spin: 0, spinRate: 0, shape: 2,
    });
    for (let k = 0; k < 46; k++) {
      const a = rand(0, Math.PI * 2);
      const speed = unit * rand(0.004, 0.013);
      const lift = rand(0, 0.6);
      const dx = Math.cos(a) * speed;
      const dy = Math.sin(a) * speed;
      const hot = Math.random();
      this.spawn({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: right.x * dx + up.x * dy + out.x * speed * lift,
        vy: right.y * dx + up.y * dy + out.y * speed * lift,
        vz: right.z * dx + up.z * dy + out.z * speed * lift,
        gravity: unit * 0.000012,
        drag: 0.996,
        size: unit * rand(0.18, 0.42),
        grow: 0.2,
        r: 1,
        g: 0.55 + 0.4 * hot,
        b: 0.15 + 0.3 * hot,
        life: rand(420, 820),
        age: 0,
        spin: 0,
        spinRate: 0,
        shape: 2,
      });
    }
    for (let k = 0; k < 7; k++) {
      const a = rand(0, Math.PI * 2);
      const speed = unit * rand(0.0008, 0.0018);
      this.spawn({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: (right.x * Math.cos(a) + up.x * Math.sin(a)) * speed,
        vy: (right.y * Math.cos(a) + up.y * Math.sin(a)) * speed,
        vz: (right.z * Math.cos(a) + up.z * Math.sin(a)) * speed,
        gravity: -unit * 0.0000015,
        drag: 0.998,
        size: unit * rand(0.55, 0.85),
        grow: 1.9,
        r: 0.58,
        g: 0.55,
        b: 0.52,
        life: rand(800, 1200),
        age: 0,
        spin: 0,
        spinRate: 0,
        shape: 0,
      });
    }
  }

  /** Confetti thrown up from `at` and falling down the screen. `width` is the
   * board's width in world units, so a big board gets a wide spray. */
  confetti(
    at: Vector3,
    center: Vector3,
    width: number,
    unit: number,
    colors: readonly Color[],
    up: Vector3,
    right: Vector3,
  ): void {
    const n = 220;
    for (let k = 0; k < n; k++) {
      const c = colors[k % colors.length]!;
      // Two fountains low on either side of the board, plus a burst from the
      // winning cell.
      const fountain = k % 3;
      const sx = fountain === 0 ? -0.45 : fountain === 1 ? 0.45 : 0;
      const base = fountain === 2 ? at : center;
      const drop = fountain === 2 ? 0 : width * 0.55;
      const ox = base.x + right.x * width * sx - up.x * drop;
      const oy = base.y + right.y * width * sx - up.y * drop;
      const oz = base.z + right.z * width * sx - up.z * drop;
      const spread = fountain === 2 ? rand(-1, 1) : -Math.sign(sx) * rand(0.1, 0.8);
      const speed = width * rand(0.0013, 0.0021) * (fountain === 2 ? 0.7 : 1);
      const dx = spread * speed * 0.6;
      const dy = speed * rand(0.7, 1.05);
      this.spawn({
        x: ox,
        y: oy,
        z: oz,
        vx: right.x * dx + up.x * dy,
        vy: right.y * dx + up.y * dy,
        vz: right.z * dx + up.z * dy,
        gravity: width * 0.0000021,
        drag: 0.9985,
        size: Math.max(unit * 0.5, width * 0.022) * rand(0.7, 1.15),
        grow: 1,
        r: c.r,
        g: c.g,
        b: c.b,
        life: rand(1500, 2300),
        // Launched over a few hundred ms rather than in one clump.
        age: -rand(0, fountain === 2 ? 120 : 520),
        spin: rand(0, Math.PI * 2),
        spinRate: rand(-0.012, 0.012),
        shape: 1,
      });
    }
  }

  /** The direction gravity pulls in, world space: down the screen. */
  private readonly down = new Vector3(0, -1, 0);

  /** Advance to `now`; returns whether anything is still alive. */
  step(now: number, down: Vector3): boolean {
    this.down.copy(down);
    const dt = this.last == null ? 16 : Math.min(50, now - this.last);
    this.last = now;
    let w = 0;
    for (let k = 0; k < this.parts.length; k++) {
      const p = this.parts[k]!;
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.age < 0) {
        this.parts[w++] = p; // still waiting to launch
        continue;
      }
      const keep = Math.pow(p.drag, dt);
      p.vx = p.vx * keep + this.down.x * p.gravity * dt;
      p.vy = p.vy * keep + this.down.y * p.gravity * dt;
      p.vz = p.vz * keep + this.down.z * p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.spin += p.spinRate * dt;
      this.parts[w++] = p;
    }
    this.parts.length = w;
    for (let k = 0; k < w; k++) {
      const p = this.parts[k]!;
      const t = Math.max(0, p.age) / p.life;
      this.posAttr.setXYZ(k, p.x, p.y, p.z);
      // Fade in fast, out over the last third; nothing before launch.
      const alpha = p.age < 0 ? 0 : Math.min(1, t * 12) * (t > 0.66 ? (1 - t) / 0.34 : 1);
      this.colorAttr.setXYZW(k, p.r, p.g, p.b, alpha * (p.shape === 0 ? 0.4 : 0.95));
      this.sizeAttr.setX(k, p.size * (1 + (p.grow - 1) * t));
      this.spinAttr.setXY(k, p.spin, p.shape);
    }
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.spinAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, w);
    if (w === 0) this.last = null;
    return w > 0;
  }

  /** Point sizes are world units; turn them into pixels for this camera. */
  override onBeforeRender = (_r: unknown, _s: unknown, camera: Camera): void => {
    const u = this.mat.uniforms;
    if (camera instanceof PerspectiveCamera) {
      u["uPersp"]!.value = 1;
      u["uPx"]!.value =
        (this.bufferHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))) * camera.zoom;
    } else if (camera instanceof OrthographicCamera) {
      u["uPersp"]!.value = 0;
      u["uPx"]!.value = this.bufferHeight / ((camera.top - camera.bottom) / camera.zoom);
    }
  };
}
