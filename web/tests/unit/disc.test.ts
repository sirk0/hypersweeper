import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/boards/presets";
import type { Board } from "../../src/boards/core";
import { HYPERBOLIC_MODES } from "../../src/boards/catalog";
import {
  DISC_IDENTITY,
  DRAG_SPEED,
  EDGE_HOLD,
  GRAB_LIMIT,
  discDrag,
  discMap,
  discReach,
  discScale,
  discUnmap,
  dragShift,
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

/** A finger's drag from `from` to `to`, as the pointer streams it: many small
 * steps, each re-aimed from where the last one left the finger. */
function stroke(v: DiscView, from: Cx, to: Cx, reach = 0.99, steps = 400): DiscView {
  let at = from;
  for (let i = 1; i <= steps; i++) {
    const next: Cx = [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps];
    v = discDrag(v, at, next, reach);
    at = next;
  }
  return v;
}

/** How a step moves the point under the finger: where `discDrag` draws the
 * board point that was drawn at `from`, less `from`. */
function grabbedMove(from: Cx, to: Cx): Cx {
  const v = discDrag(DISC_IDENTITY, from, to, 0.99);
  const w = discMap(v, from);
  return [w[0] - from[0], w[1] - from[1]];
}

describe("a drag", () => {
  it("carries the point under the finger with it", () => {
    const v = wanderedView();
    const from: Cx = [0.35, -0.25];
    const to: Cx = [-0.1, 0.4];
    const board = discUnmap(v, from);
    close(discMap(stroke(v, from, to), board), to, 3);
  });

  it("moves the grabbed point by the finger's step, to first order", () => {
    for (const from of [[0, 0], [0.3, -0.4], [-0.5, 0.45]] as Cx[]) {
      const d: Cx = [2e-4, -1e-4];
      const [mx, my] = grabbedMove(from, [from[0] + d[0], from[1] + d[1]]);
      expect(mx).toBeCloseTo(d[0], 6);
      expect(my).toBeCloseTo(d[1], 6);
    }
  });

  it("does not turn along a line through the centre", () => {
    // A translation along a diameter fixes that diameter's direction: a point
    // on it stays on it, and nothing rotates at the centre's image.
    const v = stroke(DISC_IDENTITY, [-0.2, 0], [0.3, 0]);
    expect(v.c[1]).toBeCloseTo(0, 12);
    expect(v.rot[1]).toBeCloseTo(0, 12);
    expect(discMap(v, [0, 0.5])[0]).toBeGreaterThan(0);
  });

  it("is undone by the drag back", () => {
    const v = wanderedView();
    const back = stroke(stroke(v, [0.1, 0.2], [0.5, -0.3]), [0.5, -0.3], [0.1, 0.2]);
    // to the error first-order steps leave, which shrinks with the step
    close(back.c, v.c, 2);
    close(back.rot, v.rot, 2);
  });

  it("brings a rim cell to the centre at the size of the central one", () => {
    const z: Cx = [0.8, 0.3];
    let v = DISC_IDENTITY;
    // Drag it in, as a finger would, from wherever it is drawn.
    for (let s = 0; s < 10; s++) {
      const at = discMap(v, z);
      v = stroke(v, at, [0, 0], 0.99, 100);
    }
    const at = discMap(v, z);
    expect(Math.hypot(at[0], at[1])).toBeLessThan(1e-3);
    // Magnified by exactly what the disc had shrunk it by: 1 - |z|^2 at z.
    expect(discScale(v, z)).toBeCloseTo(1 / (1 - (0.64 + 0.09)), 2);
  });

  it("never carries the board past its reach", () => {
    let v = DISC_IDENTITY;
    for (let s = 0; s < 20; s++) v = stroke(v, [0.5, 0], [-0.5, 0], 0.6, 50);
    expect(Math.hypot(v.c[0], v.c[1])).toBeLessThanOrEqual(0.6 + 1e-12);
  });

  it("follows the finger exactly away from the rim", () => {
    // Out to sqrt(1 - 1/DRAG_SPEED) the speed cap never bites.
    const edge = Math.sqrt(1 - 1 / DRAG_SPEED) - 0.01;
    for (const dir of [[1, 0], [0, 1], [0.6, 0.8]] as Cx[]) {
      const from: Cx = [edge * dir[0], edge * dir[1]];
      const d: Cx = [-1e-4, 1e-4];
      const [mx, my] = grabbedMove(from, [from[0] + d[0], from[1] + d[1]]);
      expect(mx).toBeCloseTo(d[0], 6);
      expect(my).toBeCloseTo(d[1], 6);
    }
  });

  it("never moves the board more than DRAG_SPEED times a drag through the centre", () => {
    // On the rim and off the disc altogether included, and in every direction:
    // the centre of the view travels at most DRAG_SPEED times as far,
    // hyperbolically, as a drag through it would carry it.
    const step = 1e-3;
    for (let r = 0; r < 1.5; r += 0.01) {
      for (const along of [[1, 0], [-1, 0], [0, 1], [0.6, -0.8]] as Cx[]) {
        const p = dragShift([r * 0.8, r * 0.6], [r * 0.8 + along[0] * step, r * 0.6 + along[1] * step]);
        expect(dist([0, 0], p), `at ${r}`).toBeLessThanOrEqual(DRAG_SPEED * 2 * step * (1 + 1e-6));
      }
    }
  });

  it("moves the grabbed point the way the finger goes, wherever it is", () => {
    // What the exact translation through the finger's two positions got wrong
    // near the rim: it kept the grabbed point but swung the rest of the board,
    // so a sideways drag at the edge carried the board up or down.
    // (past GRAB_LIMIT the grabbed point is the one at the limit)
    for (const r of [0.8, 0.9, GRAB_LIMIT]) {
      for (const along of [[-1, 0], [0, 1], [-0.6, 0.8]] as Cx[]) {
        const from: Cx = [r * 0.8, r * 0.6];
        const [mx, my] = grabbedMove(from, [from[0] + along[0] * 1e-4, from[1] + along[1] * 1e-4]);
        const n = Math.hypot(mx, my);
        expect(mx / n, `at ${r}`).toBeCloseTo(along[0], 3);
        expect(my / n, `at ${r}`).toBeCloseTo(along[1], 3);
      }
    }
  });

  it("does not swing the board's centre off sideways at the rim", () => {
    // A sideways drag along the bottom rim carries the middle of the view
    // sideways too — not up, as it did.
    const p = dragShift([0, -0.97], [-0.01, -0.97]);
    expect(p[0]).toBeLessThan(0);
    expect(Math.abs(p[1])).toBeLessThan(1e-12);
  });

  it("takes a finger off the disc as being at the grab limit", () => {
    close(dragShift([1.4, 0], [1.3, 0]), dragShift([GRAB_LIMIT, 0], [GRAB_LIMIT - 0.1, 0]));
    expect(Number.isFinite(discDrag(DISC_IDENTITY, [1.4, 0], [1.3, 0], 0.99).c[0])).toBe(true);
  });
});

describe("the reach", () => {
  it("stops the board's rim at EDGE_HOLD from the centre of the view", () => {
    for (const rim of [0.9, 0.95, 0.98]) {
      const reach = discReach(rim);
      const view: DiscView = { c: [reach, 0], rot: [1, 0] };
      // the rim point nearest the view's centre is the one behind it
      const [x, y] = discMap(view, [rim, 0]);
      expect(Math.hypot(x, y)).toBeCloseTo(EDGE_HOLD, 9);
    }
  });

  it("does not pan a board that already sits inside the hold", () => {
    expect(discReach(EDGE_HOLD)).toBe(0);
    expect(discReach(0.5)).toBe(0);
  });
});

describe("the hyperbolic boards' disc", () => {
  it("is the unit circle the cells were placed in, whole out to its rim", () => {
    for (const mode of HYPERBOLIC_MODES) {
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
      // the outer shell is ragged, so the rim is well inside the farthest point
      expect(disc.rim).toBeLessThan(far);
      // (0.97 to 0.99 on the {p,q} boards; the uniform ones' tiles cover less
      // of the plane, so the same cell count fills less of the disc -- the
      // point of them -- and 3.4.7.4's rim, carved by the near-twin drop, is
      // whole to 0.89)
      expect(disc.rim, mode).toBeGreaterThan(0.85);
      // ...and the board covers everything inside it: probe a ring just
      // inside the rim, every point in some cell's outline
      const polys = [...board.polygons.values()];
      const inside = (x: number, y: number) =>
        polys.some((poly) => {
          let hit = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i]!;
            const [xj, yj] = poly[j]!;
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
          }
          return hit;
        });
      const r = (disc.rim - 0.005) * disc.radius;
      for (let k = 0; k < 360; k++) {
        const t = (k * Math.PI) / 180;
        expect(inside(disc.cx + r * Math.cos(t), disc.cy + r * Math.sin(t)), `${mode} at ${k}°`).toBe(true);
      }
    }
  });

  it("is on no other flat board", () => {
    expect((buildBoard("square", "easy") as Board).disc).toBeUndefined();
  });
});
