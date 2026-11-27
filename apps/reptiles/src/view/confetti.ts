// The confetti of a win: Hypersweeper's (`ParticleField.confetti` in its
// `src/render/particles.ts`), drawn here in 2D — Hypersweeper's lives in its
// three.js scene, which this game has none of. The same six colours, the same
// two fountains low on either side of the screen and a burst from the last
// tile laid, the same speeds, gravity, drag and lives, worked out in screen
// pixels where Hypersweeper's are world units across a board as wide as 90%
// of the screen.
//
// One canvas over the whole screen, over the win card too (which opens at
// once here, where Hypersweeper's waits for its confetti), taking no pointer
// events; it removes itself once the last strip is gone. Nothing is thrown
// where the device asks for reduced motion.

/** Hypersweeper's confetti colours: festive, and none of the tiles' own. */
export const CONFETTI = ["#ff5d73", "#ffc233", "#3ddc97", "#4cc9f0", "#9b7bff", "#ff8c42"];
/** How many strips one win throws. */
export const CONFETTI_COUNT = 220;

interface Strip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pixels per ms², down the screen. */
  gravity: number;
  /** Fraction of velocity kept per ms. */
  drag: number;
  size: number;
  colour: string;
  life: number;
  /** Ms since launch; under 0 while waiting to go. */
  age: number;
  spin: number;
  spinRate: number;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** The strips one win throws, in screen pixels and ms: two fountains low on
 * either side of `centre`, and a burst from `at` (the last tile laid). Pure
 * but for its randomness, so a test can count and place them. */
export function confettiStrips(
  at: readonly [number, number],
  centre: readonly [number, number],
  width: number,
): Strip[] {
  const strips: Strip[] = [];
  for (let k = 0; k < CONFETTI_COUNT; k++) {
    const fountain = k % 3;
    const sx = fountain === 0 ? -0.45 : fountain === 1 ? 0.45 : 0;
    const base = fountain === 2 ? at : centre;
    const drop = fountain === 2 ? 0 : width * 0.55;
    const spread = fountain === 2 ? rand(-1, 1) : -Math.sign(sx) * rand(0.1, 0.8);
    const speed = width * rand(0.0013, 0.0021) * (fountain === 2 ? 0.7 : 1);
    strips.push({
      x: base[0] + width * sx,
      // down the screen is +y: the fountains start below the middle
      y: base[1] + drop,
      vx: spread * speed * 0.6,
      vy: -speed * rand(0.7, 1.05),
      gravity: width * 0.0000021,
      drag: 0.9985,
      size: Math.max(12, width * 0.022) * rand(0.7, 1.15),
      colour: CONFETTI[k % CONFETTI.length]!,
      life: rand(1500, 2300),
      // launched over a few hundred ms rather than in one clump
      age: -rand(0, fountain === 2 ? 120 : 520),
      spin: rand(0, Math.PI * 2),
      spinRate: rand(-0.012, 0.012),
    });
  }
  return strips;
}

/** Throw a win's confetti from `at`, a point on the screen (client pixels),
 * over the room `room` (the screen under the header). Returns the canvas, or
 * null where motion is to be reduced or there is no 2D canvas. */
export function throwConfetti(
  at: readonly [number, number],
  room: DOMRect,
): HTMLCanvasElement | null {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  document.querySelector(".confetti")?.remove();
  document.body.appendChild(canvas);
  let dpr = 1;
  const fit = (): void => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  };
  fit();
  window.addEventListener("resize", fit);
  const width = window.innerWidth * 0.9;
  const centre: [number, number] = [room.left + room.width / 2, room.top + room.height / 2];
  let strips = confettiStrips(at, centre, width);
  let last: number | null = null;
  const done = (): void => {
    window.removeEventListener("resize", fit);
    canvas.remove();
  };
  const step = (now: number): void => {
    if (!canvas.isConnected) return done();
    const dt = last === null ? 16 : Math.min(50, now - last);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    strips = strips.filter((s) => (s.age += dt) < s.life);
    for (const s of strips) {
      if (s.age < 0) continue;
      const keep = Math.pow(s.drag, dt);
      s.vx *= keep;
      s.vy = s.vy * keep + s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.spin += s.spinRate * dt;
      const t = s.age / s.life;
      // in fast, out over the last third
      ctx.globalAlpha = 0.95 * Math.min(1, t * 12) * (t > 0.66 ? (1 - t) / 0.34 : 1);
      ctx.fillStyle = s.colour;
      // a strip turned by its spin, its width breathing as it tumbles
      const half = s.size / 2;
      const w = (0.28 + 0.6 * Math.abs(Math.cos(s.spin * 1.7))) * half * 0.9;
      const h = 0.5 * half * 0.9;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(-s.spin);
      ctx.fillRect(-w, -h, 2 * w, 2 * h);
      ctx.restore();
    }
    if (strips.length > 0) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
  return canvas;
}
