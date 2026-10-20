import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/boards/presets";
import type { Board } from "../../src/boards/core";
import {
  DISC_IDENTITY,
  GRAB_LIMIT,
  discDrag,
  discMap,
  discScale,
  discUnmap,
  type Cx,
  type DiscView,
} from "../../src/render/disc";

const close = (a: Cx, b: Cx, digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

/** Hyperbolic distance between two points of the disc. */
const dist = (a: Cx, b: Cx): number => {
  const d2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const s = (1 - (a[0] ** 2 + a[1] ** 2)) * (1 - (b[0] ** 2 + b[1] ** 2));
  return Math.acosh(1 + (2 * d2) / s);
};

const SAMPLES: Cx[] = [
  [0, 0],
  [0.3, -0.2],
  [-0.7, 0.1],
  [0.05, 0.9],
  [-0.6, -0.6],
];

// A view reached by an arbitrary chain of drags, so the turn is not trivial.
function wanderedView(): DiscView {
  let v = DISC_IDENTITY;
  v = discDrag(v, [0.4, 0.1], [-0.2, 0.3], 0.99);
  v = discDrag(v, [-0.5, -0.4], [0.1, 0.2], 0.99);
  v = discDrag(v, [0.0, 0.6], [0.3, -0.1], 0.99);
  return v;
}

describe("the disc view", () => {
  it("is the board as built at the identity", () => {
    for (const z of SAMPLES) close(discMap(DISC_IDENTITY, z), z);
    expect(discScale(DISC_IDENTITY, [0.5, 0.2])).toBeCloseTo(1, 12);
  });

  it("is an isometry: every distance is kept", () => {
    const v = wanderedView();
    expect(Math.hypot(v.rot[0], v.rot[1])).toBeCloseTo(1, 12);
    for (const a of SAMPLES) {
      for (const b of SAMPLES) {
        if (a === b) continue;
        expect(dist(discMap(v, a), discMap(v, b))).toBeCloseTo(dist(a, b), 8);
      }
    }
  });

  it("unmaps what it maps", () => {
    const v = wanderedView();
    for (const z of SAMPLES) close(discUnmap(v, discMap(v, z)), z);
  });

  it("shows its centre point in the middle", () => {
    const v = wanderedView();
    close(discMap(v, v.c), [0, 0]);
  });

  it("measures the magnification it draws at", () => {
    const v = wanderedView();
    const z: Cx = [0.2, -0.5];
    const h = 1e-6;
    const w = discMap(v, z);
    const w2 = discMap(v, [z[0] + h, z[1]]);
    const numeric = Math.hypot(w2[0] - w[0], w2[1] - w[1]) / h;
    expect(discScale(v, z)).toBeCloseTo(numeric, 5);
  });
});

describe("a drag", () => {
  it("carries the point under the finger with it", () => {
    const v = wanderedView();
    const from: Cx = [0.35, -0.25];
    const to: Cx = [-0.1, 0.4];
    const board = discUnmap(v, from);
    close(discMap(discDrag(v, from, to, 0.99), board), to);
  });

  it("does not turn along a line through the centre", () => {
    // A translation along a diameter fixes that diameter's direction: a point
    // on it stays on it, and nothing rotates at the centre's image.
    const v = discDrag(DISC_IDENTITY, [-0.2, 0], [0.3, 0], 0.99);
    expect(v.c[1]).toBeCloseTo(0, 12);
    expect(v.rot[1]).toBeCloseTo(0, 12);
    expect(discMap(v, [0, 0.5])[0]).toBeGreaterThan(0);
  });

  it("is undone by the drag back", () => {
    const v = wanderedView();
    const back = discDrag(discDrag(v, [0.1, 0.2], [0.5, -0.3], 0.99), [0.5, -0.3], [0.1, 0.2], 0.99);
    close(back.c, v.c);
    close(back.rot, v.rot);
  });

  it("brings a rim cell to the centre at the size of the central one", () => {
    const z: Cx = [0.8, 0.3];
    let v = DISC_IDENTITY;
    // Drag it in small steps, as a finger would, from where it is drawn.
    for (let s = 0; s < 40; s++) {
      const at = discMap(v, z);
      v = discDrag(v, at, [at[0] * 0.8, at[1] * 0.8], 0.99);
    }
    const at = discMap(v, z);
    expect(Math.hypot(at[0], at[1])).toBeLessThan(1e-3);
    // Magnified by exactly what the disc had shrunk it by: 1 - |z|^2 at z.
    expect(discScale(v, z)).toBeCloseTo(1 / (1 - (0.64 + 0.09)), 2);
  });

  it("never carries the board past its reach", () => {
    let v = DISC_IDENTITY;
    for (let s = 0; s < 200; s++) v = discDrag(v, [0.5, 0], [-0.5, 0], 0.6);
    expect(Math.hypot(v.c[0], v.c[1])).toBeLessThanOrEqual(0.6 + 1e-12);
  });

  it("takes a finger past the grab limit as being at it", () => {
    const outside = discDrag(DISC_IDENTITY, [1.4, 0], [0.5, 0], 0.99);
    const atLimit = discDrag(DISC_IDENTITY, [GRAB_LIMIT, 0], [0.5, 0], 0.99);
    close(outside.c, atLimit.c);
    expect(Number.isFinite(outside.c[0])).toBe(true);
  });
});

describe("the hyperbolic boards' disc", () => {
  it("is the unit circle the cells were placed in, with every centre in reach", () => {
    for (const mode of ["hyperbolic73", "hyperbolic54", "hyperbolic45"]) {
      const board = buildBoard(mode, "hard") as Board;
      const disc = board.disc!;
      expect(disc).toBeDefined();
      let far = 0;
      for (const poly of board.polygons.values()) {
        for (const [x, y] of poly) {
          far = Math.max(far, Math.hypot(x - disc.cx, y - disc.cy) / disc.radius);
        }
      }
      expect(far).toBeLessThan(1);
      expect(disc.reach).toBeGreaterThan(0.9);
      expect(disc.reach).toBeLessThan(far);
    }
  });

  it("is on no other flat board", () => {
    expect((buildBoard("square", "easy") as Board).disc).toBeUndefined();
  });
});
