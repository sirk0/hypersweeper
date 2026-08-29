import { describe, expect, it } from "vitest";
import {
  CellAnimations,
  dropSize,
  RIPPLE_PER_CELL,
  rippleEntries,
  WIN_PER_CELL,
} from "../../src/render/animations";

// The animation clock is pure timing (the meshes own the buffers), so it tests
// without a browser: drive it with explicit `now` values and read back the
// lightness / pop-scale / shake-offset it reports, plus the enabled gate the
// reduced-motion affordance and the window.__ms.animations seam flip.

describe("CellAnimations reveal flash", () => {
  it("stays dark until its staggered start, then peaks and settles to 0", () => {
    const a = new CellAnimations();
    a.startReveals([{ index: 0, delay: 100 }], 0);
    expect(a.lightness(0, 50)).toBe(0); // before its turn in the ripple
    expect(a.lightness(0, 100)).toBe(0); // exactly at start
    // Sample across the flash and take the brightest reading — a clear boost.
    const peak = Math.max(...[110, 130, 150, 170].map((t) => a.lightness(0, t)));
    expect(peak).toBeGreaterThan(0.15);
    expect(a.lightness(0, 100_000)).toBe(0); // long settled -> back to base
  });

  it("prunes a finished flash so step() redraws it exactly once at the end", () => {
    const a = new CellAnimations();
    a.startReveals([{ index: 3, delay: 0 }], 0);
    expect(a.step(10).recolor).toContain(3); // mid-flash: redraw
    expect(a.pending()).toBe(true);
    const settle = a.step(1000); // well past the flash
    expect(settle.recolor).toContain(3); // final redraw back to base
    expect(settle.active).toBe(false);
    expect(a.step(1001).recolor).not.toContain(3); // gone; nothing to draw
  });
});

describe("CellAnimations flag pop", () => {
  it("springs from 0 through an overshoot back to 1", () => {
    const a = new CellAnimations();
    expect(a.popScale(0, 0)).toBe(1); // no pop -> neutral scale
    a.startPop(0, 0);
    expect(a.popScale(0, 0)).toBeCloseTo(0, 1); // starts small
    const mid = a.popScale(0, 200);
    expect(mid).toBeGreaterThan(1); // overshoots past full size
    expect(a.popScale(0, 240)).toBe(1); // settled at the pop duration
    a.step(240); // prunes the finished pop
    expect(a.pending()).toBe(false);
  });

  it("keeps a delayed pop hidden until its turn, then springs", () => {
    const a = new CellAnimations();
    a.startPop(0, 0, 300); // rides a win wave that reaches this cell late
    expect(a.popScale(0, 100)).toBe(0); // no glyph yet
    expect(a.popScale(0, 300)).toBe(0); // exactly at its turn
    expect(a.popScale(0, 500)).toBeGreaterThan(1); // overshoots once running
    expect(a.popScale(0, 540)).toBe(1); // settled a POP_MS after its start
    a.step(540);
    expect(a.pending()).toBe(false);
  });
});

describe("CellAnimations flag drop", () => {
  it("runs from released to home over the drop, then reports nothing", () => {
    const a = new CellAnimations();
    expect(a.dropIndex()).toBeNull();
    expect(a.dropProgress(0)).toBeNull(); // nothing dropping -> nothing to draw
    a.startDrop(7, 0, 400);
    expect(a.dropIndex()).toBe(7);
    expect(a.dropProgress(0)).toBe(0); // at its largest...
    expect(a.dropProgress(140)).toBe(0); // ...and held there long enough to read
    const mid = a.dropProgress(280)!;
    expect(mid).toBeGreaterThan(0); // then under way
    expect(mid).toBeLessThan(1);
    expect(a.dropProgress(400)).toBeNull(); // home; the settled glyph takes over
    expect(a.pending()).toBe(true); // until the step that prunes it
    const done = a.step(400);
    expect(done.glyphsDirty).toBe(true); // one last rebuild, without the drop
    expect(a.pending()).toBe(false);
    expect(a.dropIndex()).toBeNull();
  });

  it("takes as long as the press that placed it", () => {
    // The drop's length is the hold-to-flag setting (src/input/hold.ts), so a
    // hair-trigger press lands a hair-trigger flag rather than spending most of
    // its time waiting out a fixed animation — every point on that slider gets
    // the same shape of landing, held at full size for the same *share* of it.
    for (const ms of [100, 300, 500]) {
      const a = new CellAnimations();
      a.startDrop(0, 0, ms);
      expect(a.dropProgress(ms * 0.34), `${ms}ms: still held`).toBe(0);
      expect(a.dropProgress(ms * 0.7)!, `${ms}ms: under way`).toBeGreaterThan(0);
      expect(a.dropProgress(ms), `${ms}ms: home`).toBeNull();
    }
  });

  it("keeps only the newest drop — one finger, one flag", () => {
    const a = new CellAnimations();
    a.startDrop(1, 0);
    a.startDrop(2, 100);
    expect(a.dropIndex()).toBe(2);
    expect(a.dropProgress(100)).toBe(0); // restarted, not carried over
  });
});

describe("dropSize", () => {
  const settled = 1;

  it("starts big and lands exactly on the settled glyph", () => {
    const extent = 20; // 0.32 * 20 = 6.4 settled glyphs across
    expect(dropSize(settled, extent, 0)).toBeCloseTo(6.4, 5);
    expect(dropSize(settled, extent, 1)).toBe(settled); // invisible hand-off
    const mid = dropSize(settled, extent, 0.5);
    expect(mid).toBeLessThan(6.4);
    expect(mid).toBeGreaterThan(settled);
  });

  it("stays a real gesture on a board of a few huge cells", () => {
    // A four-cell tetrahedron: a fifth of the board is barely wider than the
    // glyph already there, which would read as no drop at all.
    expect(dropSize(settled, 4, 0)).toBe(4); // floor: 4x the settled glyph
  });

  it("does not swamp the screen on a board of many tiny cells", () => {
    expect(dropSize(settled, 1000, 0)).toBe(10); // ceiling: 10x
  });
});

describe("CellAnimations win wave", () => {
  it("stays clear until its staggered turn, warms the cell, then settles", () => {
    const a = new CellAnimations();
    a.startWin([{ index: 0, delay: 200 }], 0);
    expect(a.winMix(0, 100)).toBe(0); // before its turn in the wave
    expect(a.winMix(0, 200)).toBe(0); // exactly at start
    // Sample across the wave and take the strongest reading — a clear pull
    // toward the win tint, well past halfway.
    const peak = Math.max(...[260, 320, 400, 500].map((t) => a.winMix(0, t)));
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThanOrEqual(1);
    expect(a.winMix(0, 100_000)).toBe(0); // long settled -> back to base
  });

  it("prunes a finished wave so step() redraws each cell exactly once", () => {
    const a = new CellAnimations();
    a.startWin([{ index: 5, delay: 0 }], 0);
    expect(a.step(50).recolor).toContain(5); // mid-wave: redraw
    expect(a.pending()).toBe(true);
    const settle = a.step(1000); // well past the wave
    expect(settle.recolor).toContain(5); // final redraw back to base
    expect(settle.active).toBe(false);
    expect(a.step(1001).recolor).not.toContain(5); // gone; nothing to draw
  });
});

describe("CellAnimations shake", () => {
  it("offsets the board and decays back to rest", () => {
    const a = new CellAnimations();
    a.startShake(2, 0);
    expect(a.step(0).offset).toEqual([0, 0]); // sin(0) = 0
    const mid = a.step(20).offset;
    expect(Math.abs(mid[0])).toBeGreaterThan(0);
    const done = a.step(440); // shake duration
    expect(done.offset).toEqual([0, 0]);
    expect(a.pending()).toBe(false);
  });
});

describe("CellAnimations enabled gate", () => {
  it("ignores every trigger while disabled", () => {
    const a = new CellAnimations();
    a.enabled = false;
    a.startReveals([{ index: 0, delay: 0 }], 0);
    a.startWin([{ index: 0, delay: 0 }], 0);
    a.startPop(0, 0);
    a.startDrop(0, 0);
    a.startShake(2, 0);
    expect(a.pending()).toBe(false);
    expect(a.lightness(0, 10)).toBe(0);
    expect(a.winMix(0, 10)).toBe(0);
    expect(a.popScale(0, 10)).toBe(1);
    expect(a.dropIndex()).toBeNull();
    expect(a.dropProgress(10)).toBeNull();
    expect(a.step(10).active).toBe(false);
  });
});

describe("rippleEntries", () => {
  it("delays each cell by its distance from the origin, in cell widths", () => {
    const cells = [
      { index: 0, center: [0, 0] },
      { index: 1, center: [10, 0] }, // 2 cell-widths away when unit = 5
    ];
    const entries = rippleEntries(cells, [0, 0], 5);
    expect(entries[0]!.delay).toBe(0);
    expect(entries[1]!.delay).toBeCloseTo(2 * RIPPLE_PER_CELL, 5);
  });

  it("sweeps at the pace it is given (the win wave is slower)", () => {
    const cells = [
      { index: 0, center: [0, 0] },
      { index: 1, center: [10, 0] },
    ];
    const entries = rippleEntries(cells, [0, 0], 5, WIN_PER_CELL);
    expect(entries[1]!.delay).toBeCloseTo(2 * WIN_PER_CELL, 5);
  });

  it("fires everything at once when there is no origin", () => {
    const cells = [
      { index: 0, center: [0, 0] },
      { index: 1, center: [99, 99] },
    ];
    for (const e of rippleEntries(cells, null, 5)) expect(e.delay).toBe(0);
  });
});
