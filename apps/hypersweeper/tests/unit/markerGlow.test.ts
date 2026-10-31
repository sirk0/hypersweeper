import { describe, expect, it } from "vitest";
import { RIPPLE_PER_CELL } from "../../src/render/animations";
import { MarkerGlow, type GlowCell } from "../../src/render/markerGlow";

// The light the Realistic theme's pins and bombs carry. Like the animation
// clock it is pure timing — the board owns the uniforms — so it tests without a
// browser: drive it with explicit `now` values and read back the state it
// reports. These tests are the specification of what a lit board does, in the
// same way `sound.test.ts` is the specification of what one sounds like.

/** `n` cells of `sides` sides, one per ring out from the click. */
function flood(n: number, sides = 6): GlowCell[] {
  return Array.from({ length: n }, (_, i) => ({ sides, ring: i }));
}

/** The brightest the swell gets over a whole wave, sampled finely. */
function peakOf(glow: MarkerGlow, cells: GlowCell[]): number {
  glow.reveal(cells, 0);
  let peak = 0;
  for (let t = 0; t <= 4000; t += 5) peak = Math.max(peak, glow.sample(t).amount);
  return peak;
}

describe("marker glow", () => {
  it("travels at the reveal ripple's own pace", () => {
    // The front, the tile flash and the sound grain are one wave arriving
    // together — that is the whole reason this shares `RIPPLE_PER_CELL` with
    // `CellAnimations` rather than carrying a pace of its own.
    const glow = new MarkerGlow();
    glow.reveal(flood(8), 0);
    expect(glow.sample(RIPPLE_PER_CELL).front).toBeCloseTo(1, 6);
    expect(glow.sample(RIPPLE_PER_CELL * 5).front).toBeCloseTo(5, 6);
  });

  it("swells with how many cells the move opened, but sub-linearly", () => {
    const one = peakOf(new MarkerGlow(), flood(1));
    const twenty = peakOf(new MarkerGlow(), flood(20));
    const twoHundred = peakOf(new MarkerGlow(), flood(200));
    expect(one).toBeGreaterThan(0);
    expect(twenty).toBeGreaterThan(one);
    expect(twoHundred).toBeGreaterThan(twenty);
    expect(twoHundred).toBeLessThanOrEqual(1);
    // A flood is a bigger event than a click, not a hundred times bigger: most
    // of the range is spent between one cell and twenty.
    expect(twenty - one).toBeGreaterThan(twoHundred - twenty);
  });

  it("takes its colour from the shape, the way the pitch does", () => {
    // `noteFor` indexes the preset's scale by `sides - 3`, so more sides sound
    // lower; here more sides glow warmer. A board of one tiling reads as one
    // colour, which is the point — a hexagonal board glows unlike a triangular
    // one.
    const tone = (sides: number) => {
      const glow = new MarkerGlow();
      glow.reveal(flood(6, sides), 0);
      return glow.sample(100).tone;
    };
    expect(tone(3)).toBe(0);
    expect(tone(6)).toBeGreaterThan(tone(3));
    expect(tone(12)).toBeGreaterThan(tone(6));
    expect(tone(13)).toBe(1); // the Spectre's 13-gon, clamped at the warm end
  });

  it("goes back to the resting ember once the flood has finished opening", () => {
    // The requirement in one test: a wave stops when the cells it was opening
    // are open, and what is left is the low light a pin always carries.
    const glow = new MarkerGlow();
    const cells = flood(12);
    glow.reveal(cells, 0);
    const mid = glow.sample(11 * RIPPLE_PER_CELL);
    expect(mid.amount).toBeGreaterThan(0);
    expect(glow.pending()).toBe(true);

    const after = glow.sample(11 * RIPPLE_PER_CELL + 80 + 320 + 1);
    expect(after.amount).toBe(0);
    expect(after.base).toBeGreaterThan(0); // the ember, not darkness
    expect(after.base).toBeLessThan(0.2); // ...and only just alight
    expect(glow.pending()).toBe(false);
  });

  it("holds the swell only while the front is still inside the flood", () => {
    // A one-cell open is a tick and a wide one glows for as long as it spreads,
    // which is what makes the light track the opening rather than the click.
    const brief = new MarkerGlow();
    brief.reveal(flood(1), 0);
    const wide = new MarkerGlow();
    wide.reveal(flood(60), 0);
    const t = 30 * RIPPLE_PER_CELL;
    expect(brief.sample(t).amount).toBe(0);
    expect(wide.sample(t).amount).toBeGreaterThan(0);
  });

  it("blows up hot, races out ahead of a reveal, and leaves embers", () => {
    const glow = new MarkerGlow();
    glow.detonate(0);
    const early = glow.sample(40);
    expect(early.blast).toBeCloseTo(1, 5);
    // The shockwave outruns a flood — a detonation is not a flood fill.
    expect(early.blastFront).toBeGreaterThan(40 / RIPPLE_PER_CELL);
    expect(glow.sample(400).blast).toBeLessThan(early.blast);

    const settled = glow.sample(40 + 700 + 1);
    expect(settled.blast).toBe(0);
    expect(glow.pending()).toBe(false);
    // ...and the board stays warm and faintly lit for the rest of the loss.
    expect(settled.tone).toBe(1);
    expect(settled.base).toBeGreaterThan(new MarkerGlow().sample(0).base);
  });

  it("drops a reveal in flight when a mine goes off", () => {
    // A chord can open cells and detonate in the same move. The two waves share
    // an origin, so the blast takes it: the board has stopped being opened.
    const glow = new MarkerGlow();
    glow.reveal(flood(40), 0);
    glow.detonate(10);
    expect(glow.sample(20).amount).toBe(0);
    expect(glow.sample(20).blast).toBeGreaterThan(0);
  });

  it("keeps the ember but loses the wave while disabled", () => {
    // Reduced motion turns off motion. A resting ember does not move, so it is
    // part of what the Realistic markers *are* rather than something they do.
    const glow = new MarkerGlow();
    glow.enabled = false;
    glow.reveal(flood(50), 0);
    glow.detonate(0);
    const s = glow.sample(100);
    expect(s.amount).toBe(0);
    expect(s.blast).toBe(0);
    expect(glow.pending()).toBe(false);
    expect(s.base).toBeGreaterThan(0);
    // A mine still went off, so the ember is still the warm one.
    expect(s.tone).toBe(1);
  });

  it("ignores an empty move and forgets everything on reset", () => {
    const glow = new MarkerGlow();
    glow.reveal([], 0);
    expect(glow.pending()).toBe(false);
    glow.detonate(0);
    glow.reset();
    const s = glow.sample(1);
    expect(glow.pending()).toBe(false);
    expect(s.blast).toBe(0);
    expect(s.tone).toBeLessThan(1);
  });

  it("reports finite, sane numbers throughout every event", () => {
    const glow = new MarkerGlow();
    glow.reveal(flood(120, 4), 0);
    for (let t = -50; t <= 4000; t += 17) {
      const s = glow.sample(t);
      for (const v of [s.amount, s.front, s.width, s.tone, s.base, s.blast, s.blastFront]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(s.amount).toBeLessThanOrEqual(1);
      expect(s.tone).toBeLessThanOrEqual(1);
      expect(s.width).toBeGreaterThan(0); // the shader divides by it
    }
  });
});
