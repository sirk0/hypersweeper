import { afterEach, describe, expect, it, vi } from "vitest";

// Every browser builds the same levels. The geometry is exact, but floats
// still draw it, order it and solve for lattice points — and Math.sin and
// Math.cos are not the same function everywhere: Safari's (the system libm)
// and Chrome's (V8's own) can differ in the last bit. Wherever a float
// decides something (the shortest of six equally long translations, the
// nearest of two equally near centres), that last bit can tip it one way in
// one browser and the other way in another — and then a painting written
// down in one basis means another colouring, and the level throws on an
// iPhone that built fine here. So every level is built again with sin and
// cos one ulp off, up, down and by turns, and must come out exactly as it
// does with the real ones: the same cells, the same marks.

/** `x` moved one unit in the last place, up or down. */
function ulp(x: number, up: boolean): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  // a float's bits order as its magnitude does
  view.setBigUint64(0, view.getBigUint64(0) + (x > 0 === up ? 1n : -1n));
  return view.getFloat64(0);
}

const { sin, cos } = Math;

/** Every first board, as keys of its cells (marks included), built afresh
 * with sin and cos as `nudge` leaves them. */
async function everyLevel(nudge?: "up" | "down" | "alternate"): Promise<Map<string, string>> {
  if (nudge) {
    let n = 0;
    const up = (): boolean => (nudge === "alternate" ? n++ % 2 === 0 : nudge === "up");
    // (sin 0 and cos 0 are exact in every engine)
    Math.sin = (x) => (x === 0 ? 0 : ulp(sin(x), up()));
    Math.cos = (x) => (x === 0 ? 1 : ulp(cos(x), up()));
  }
  // a fresh copy of every module: the rings' float bases are cached
  vi.resetModules();
  const { LEVELS } = await import("../../src/levels");
  const { spotKey } = await import("../../src/geometry/shape");
  const built = new Map<string, string>();
  for (const level of LEVELS) {
    let key: string;
    try {
      key = level.cells.map((cell) => spotKey(level.ring, cell)).join("/");
    } catch (error) {
      key = `throws: ${(error as Error).message}`;
    }
    built.set(level.key, key);
  }
  return built;
}

describe("every browser's floats", () => {
  afterEach(() => {
    Math.sin = sin;
    Math.cos = cos;
  });

  it.each(["up", "down", "alternate"] as const)(
    "build every level the same with sin and cos one ulp %s",
    async (nudge) => {
      const real = await everyLevel();
      Math.sin = sin;
      Math.cos = cos;
      const nudged = await everyLevel(nudge);
      const differ = [...real].filter(([key, cells]) => nudged.get(key) !== cells);
      expect(
        differ.map(([key]) => `${key}: ${nudged.get(key)?.slice(0, 80)}`),
        "levels a last-bit difference in sin or cos changes",
      ).toEqual([]);
    },
    120_000,
  );
});
