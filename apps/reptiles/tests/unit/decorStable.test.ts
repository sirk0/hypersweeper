import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/levels";
import { posed } from "../../src/geometry/shape";
import { loopsOf, type Loop } from "../../src/view/curve";
import { decorParts, markUnit } from "../../src/view/decor";
import { part } from "./shard";

// A tile's marks draw the same whichever way it is held, and in every
// browser. decorParts chooses in floats (which two lined edges carry the
// line, whether a branch runs straight, whether a tile is a star), and Safari's
// sin and cos can differ from Chrome's in the last bit: where a choice hung on
// that bit, the 5-gon of V[3³.4²; 3.4.6.4] · lines II drew one line at one turn
// and another at the next on an iPhone. So every marked tray tile is drawn at
// every turn and side with its corners nudged an ulp, and must draw the same.

/** `x` moved one unit in the last place, up or down. */
function ulp(x: number, up: boolean): number {
  if (x === 0 || !Number.isFinite(x)) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + (x > 0 === up ? 1n : -1n));
  return view.getFloat64(0);
}

/** A drawing, compared as a picture: numbers to two places, subpaths in any
 * order, a straight run either way along. */
function picture(loops: readonly Loop[], unit: ReturnType<typeof markUnit>): string {
  return decorParts(loops, (p) => p, unit)
    .map((part) => {
      const d = part.d.replace(/-?\d+(\.\d+)?/g, (v) => (+v).toFixed(2)).replace(/-0\.00/g, "0.00");
      const subpaths = d
        .split("M")
        .filter(Boolean)
        .map((sp) => {
          if (!/^[^A-Z]*(L[^A-Z]*)+$/.test(sp)) return sp;
          const back = sp.split("L").reverse().join("L");
          return back < sp ? back : sp;
        });
      return `${part.class}: ${subpaths.sort().join("M")}`;
    })
    .join("\n");
}

/** Ways to nudge every coordinate: all up, all down, by turns, and a few
 * seeded mixes. */
const NUDGES = 8;
function nudged(loops: readonly Loop[], trial: number): Loop[] {
  let seed = 7919 * (trial + 1);
  const up = (): boolean => {
    if (trial === 0) return true;
    if (trial === 1) return false;
    seed = (seed * 16807) % 2147483647;
    return trial === 2 ? seed % 2 === 0 : seed > 1073741823;
  };
  return loops.map((l) => ({ ...l, xy: l.xy.map(([x, y]) => [ulp(x, up()), ulp(y, up())]) }));
}

const DRAWN = LEVELS.filter((level) => {
  const unit = markUnit(level);
  return unit?.strapwork || level.tiles.some((t) => t.pieces.some((p) => p.marks));
});

describe("a tile's marks", () => {
  it.each(part(DRAWN.map((l) => [l.key, l] as const)))(
    "%s: draw the same at every turn and side, whatever the last bit",
    (_, level) => {
      const { ring } = level;
      const unit = markUnit(level);
      const unstable: string[] = [];
      level.tiles.forEach((shape, kind) => {
        for (const flip of level.mirror ? [false, true] : [false])
          for (let rot = 0; rot < ring.n; rot++) {
            const loops = loopsOf(ring, posed(shape, { rot, flip, t: ring.zero }));
            const drawn = picture(loops, unit);
            for (let trial = 0; trial < NUDGES; trial++)
              if (picture(nudged(loops, trial), unit) !== drawn) {
                unstable.push(`kind ${kind} at ζ^${rot}${flip ? " flipped" : ""}`);
                break;
              }
          }
      });
      expect(unstable).toEqual([]);
    },
    60_000,
  );
});
