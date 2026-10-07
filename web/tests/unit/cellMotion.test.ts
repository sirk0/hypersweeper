import { describe, expect, it } from "vitest";
import {
  approach,
  CellMotion,
  easeOutBack,
  IDENTITY,
  MOTION_CHANNELS,
  MOTION_MS,
  trackPose,
  waveDelays,
  type MotionKind,
  type Pose,
} from "../../src/render/cellMotion";
import { roundCorners } from "../../src/render/boardMesh";
import { capableDevice, effectsOn, resolveQuality } from "../../src/render/quality";

const KINDS = Object.keys(MOTION_MS) as MotionKind[];

function pose(kind: MotionKind, t: number, amount = 0.3): Pose {
  const out = { ...IDENTITY };
  trackPose({ kind, start: 0, amount }, t, out);
  return out;
}

function near(p: Pose, q: Readonly<Pose>, eps = 1e-3): boolean {
  return (
    Math.abs(p.lift - q.lift) < eps &&
    Math.abs(p.scale - q.scale) < eps &&
    Math.abs(p.glyph - q.glyph) < eps &&
    Math.abs(p.twist - q.twist) < eps
  );
}

describe("motion curves", () => {
  it("every kind ends exactly where the board was built", () => {
    for (const kind of KINDS) {
      expect(near(pose(kind, MOTION_MS[kind]), IDENTITY), kind).toBe(true);
    }
  });

  it("an opened cell starts at its button's height with its number hidden", () => {
    const p = pose("open", 0, 0.33);
    expect(p.lift).toBeCloseTo(0.33);
    expect(p.glyph).toBe(0);
    // ...and waits there, number hidden, until its turn in the flood.
    const early = { ...IDENTITY };
    trackPose({ kind: "open", start: 100, amount: 0.33 }, 50, early);
    expect(early.lift).toBeCloseTo(0.33);
    expect(early.glyph).toBe(0);
  });

  it("an opened cell overshoots into its recess before settling", () => {
    let lowest = Infinity;
    for (let t = 0; t <= MOTION_MS.open; t += 5) lowest = Math.min(lowest, pose("open", t, 0.33).lift);
    expect(lowest).toBeLessThan(0);
  });

  it("a mine the loss uncovers is hidden until its turn, then springs in", () => {
    const waiting = { ...IDENTITY };
    trackPose({ kind: "reveal", start: 200, amount: 0 }, 100, waiting);
    expect(waiting.glyph).toBe(0);
    expect(pose("reveal", MOTION_MS.reveal).glyph).toBeCloseTo(1);
  });

  it("a new board starts at nothing and assembles", () => {
    expect(pose("build", 0).scale).toBe(0);
    expect(pose("build", MOTION_MS.build).scale).toBeCloseTo(1);
  });

  it("a chord that opens nothing turns its cells, and one that opens dips them", () => {
    let twist = 0;
    let dip = 0;
    for (let t = 0; t <= 400; t += 10) {
      twist = Math.max(twist, Math.abs(pose("wiggle", t).twist));
      dip = Math.min(dip, pose("dip", t).lift);
    }
    expect(twist).toBeGreaterThan(0.05);
    expect(dip).toBeLessThan(-0.05);
  });

  it("easeOutBack runs 0 to 1 through an overshoot", () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...[0.6, 0.7, 0.8].map((p) => easeOutBack(p)))).toBeGreaterThan(1);
  });

  it("approach is frame-rate independent and lands exactly on its target", () => {
    const oneStep = approach(0, 1, 32, 50);
    const twoSteps = approach(approach(0, 1, 16, 50), 1, 16, 50);
    expect(oneStep).toBeCloseTo(twoSteps, 6);
    expect(approach(0.9995, 1, 16, 50)).toBe(1);
  });
});

describe("waveDelays", () => {
  const cells = [0, 1, 2, 3].map((i) => ({ index: i, center: [i * 2, 0, 0] }));

  it("delays each cell by its distance in cell widths", () => {
    const d = waveDelays(cells, [0, 0, 0], 2, 10);
    expect(d.map((e) => e.delay)).toEqual([0, 10, 20, 30]);
  });

  it("squeezes a wide board's wave under the cap", () => {
    const d = waveDelays(cells, [0, 0, 0], 2, 10, 15);
    expect(Math.max(...d.map((e) => e.delay))).toBeCloseTo(15);
    expect(d[1]!.delay).toBeCloseTo(5);
  });
});

describe("CellMotion", () => {
  it("writes identity for every cell at rest", () => {
    const m = new CellMotion(3);
    for (let i = 0; i < 3; i++) {
      expect([...m.data.slice(i * MOTION_CHANNELS, (i + 1) * MOTION_CHANNELS)]).toEqual([
        0, 1, 1, 0,
      ]);
    }
    expect(m.pending()).toBe(false);
  });

  it("moves a cell and writes it back to identity exactly when done", () => {
    const m = new CellMotion(2);
    m.start("bounce", [{ index: 1 }], 0);
    expect(m.step(60)).toBe(true);
    expect(m.data[1 * MOTION_CHANNELS]).not.toBe(0);
    m.step(MOTION_MS.bounce + 10);
    m.step(MOTION_MS.bounce + 30);
    expect([...m.data.slice(MOTION_CHANNELS, 2 * MOTION_CHANNELS)]).toEqual([0, 1, 1, 0]);
    expect(m.pending()).toBe(false);
  });

  it("a press holds until released, then eases home", () => {
    const m = new CellMotion(1);
    m.setPress(0, true);
    for (let t = 0; t < 500; t += 16) m.step(t);
    expect(m.data[0]).toBeLessThan(-0.1); // held down
    m.setPress(0, false);
    for (let t = 500; t < 2000; t += 16) m.step(t);
    expect(m.data[0]).toBe(0);
    expect(m.pending()).toBe(false);
  });

  it("does nothing while disabled (reduced motion)", () => {
    const m = new CellMotion(2);
    m.enabled = false;
    m.start("hop", [{ index: 0 }], 0);
    m.setPress(1, true);
    m.setHover(1, true);
    expect(m.pending()).toBe(false);
  });
});

describe("roundCorners", () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("replaces every corner with three points, inside the polygon", () => {
    const r = roundCorners(square, 2);
    expect(r).toHaveLength(12);
    for (const [x, y] of r) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    // The corner itself is cut off.
    expect(r.some(([x, y]) => x === 0 && y === 0)).toBe(false);
    expect(r[0]).toEqual([0, 2]);
    expect(r[2]).toEqual([2, 0]);
  });

  it("never lets two corners cross on a short edge", () => {
    const r = roundCorners(square, 100);
    // capped at 45% of the edge either side
    expect(r[0]).toEqual([0, 4.5]);
  });

  it("works in 3D", () => {
    const r = roundCorners(
      square.map(([x, y]) => [x, y, 1] as [number, number, number]),
      2,
    );
    expect(r).toHaveLength(12);
    expect(r.every((p) => p[2] === 1)).toBe(true);
  });
});

describe("quality", () => {
  it("auto turns effects off on a software renderer and a two-core device", () => {
    expect(capableDevice("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))", 8)).toBe(false);
    expect(capableDevice("llvmpipe (LLVM 15.0.7, 256 bits)", 8)).toBe(false);
    expect(capableDevice("Apple GPU", 2)).toBe(false);
    expect(capableDevice("Apple GPU", 8)).toBe(true);
    expect(capableDevice("", undefined)).toBe(true);
  });

  it("an explicit choice wins over the device", () => {
    expect(effectsOn("high", false)).toBe(true);
    expect(effectsOn("low", true)).toBe(false);
    expect(effectsOn("auto", true)).toBe(true);
    expect(effectsOn("auto", false)).toBe(false);
  });

  it("an unknown stored value is auto", () => {
    expect(resolveQuality("ultra")).toBe("auto");
    expect(resolveQuality(null)).toBe("auto");
    expect(resolveQuality("low")).toBe("low");
  });
});
