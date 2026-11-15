import { describe, expect, it } from "vitest";
import { posed, turnsOntoPieces, type Piece } from "../../src/geometry/shape";
import { HintSolver, runToEnd, type Hint, type Laid } from "../../src/hint";
import { levelByKey, type Level } from "../../src/levels";
import { Puzzle } from "../../src/puzzle";

const level = (key: string): Level => {
  const out = levelByKey(key);
  if (!out) throw new Error(`no level ${key}`);
  return out;
};

/** Whether the tray can hold a tile of `kind` so that it lands on `spot`: a
 * turn it reaches (a multiple of the level's step), mirrored only where the
 * level flips. */
function holdable(lv: Level, kind: number, spot: Piece[]): boolean {
  const { ring, tiles, turn, mirror } = lv;
  return (mirror ? [false, true] : [false]).some((flip) =>
    turnsOntoPieces(
      { ring, pieces: posed(tiles[kind]!, { rot: 0, flip, t: ring.zero }) },
      spot,
    ).some((k) => (turn === 0 ? k === 0 : k % turn === 0)),
  );
}

/** Take hints until the board is finished: every tile to lay must fit and be
 * one the tray can hold that way, every tile to take off one that is down. */
function followHints(lv: Level, laid: Laid[], limit = 4 * lv.cells.length): Laid[] {
  const solver = new HintSolver(lv);
  let id = 10_000;
  for (let i = 0; i < limit; i++) {
    const hint = runToEnd(solver.hint(laid));
    if (!hint) return laid;
    if ("place" in hint) {
      const { kind, spot } = hint.place;
      expect(solver.frontierOf(laid).fits(spot)).toBe(true);
      expect(holdable(lv, kind, spot)).toBe(true);
      laid = [...laid, { id: id++, kind, pieces: spot }];
    } else {
      expect(laid.some((t) => t.id === hint.remove)).toBe(true);
      laid = laid.filter((t) => t.id !== hint.remove);
    }
  }
  throw new Error(`not finished within ${limit} hints`);
}

/** Tiles that fit somewhere on the empty board but are not its own, each
 * with whether the board can still be finished round it. */
function strays(lv: Level): { laid: Laid; fine: boolean }[] {
  const solver = new HintSolver(lv);
  const empty = solver.frontierOf([]);
  const out: { laid: Laid; fine: boolean }[] = [];
  for (const at of solver.convexCorners(empty))
    for (const o of solver.optionsAt(empty, at)) {
      if (o.own) continue;
      const fine = runToEnd(solver.cover(empty.cover(o.spot))) !== null;
      out.push({ laid: { id: 1 + out.length, kind: o.kind, pieces: o.spot }, fine });
    }
  return out;
}

const hintFor = (lv: Level, laid: Laid[]): Hint => runToEnd(new HintSolver(lv).hint(laid));

describe("the hint", () => {
  it.each(["squares", "trihex", "rhombitrihex", "cairo", "squares.lines", "hat"])(
    "on an empty %s board lays its own tiles, one hint a tile, to the finish",
    (key) => {
      const lv = level(key);
      const done = followHints(lv, [], lv.cells.length + 1);
      expect(done).toHaveLength(lv.cells.length);
      const solver = new HintSolver(lv);
      for (const t of done) expect(solver.isOwn(t.pieces)).toBe(true);
      expect(solver.frontierOf(done).empty).toBe(true);
    },
  );

  it("has nothing to say on a finished board", () => {
    const lv = level("squares");
    const laid = lv.cells.map((pieces, i) => ({ id: i + 1, kind: 0, pieces }));
    expect(hintFor(lv, laid)).toBeNull();
  });

  it("takes off a tile the board cannot be finished round, and only that one", () => {
    const lv = level("rhombitrihex");
    const dead = strays(lv).filter((s) => !s.fine);
    expect(dead.length).toBeGreaterThan(0);
    const solver = new HintSolver(lv);
    for (const { laid } of dead.slice(0, 4)) {
      // the stray tile among some of the board's own, laid round it where
      // they still fit
      const own: Laid[] = [];
      let f = solver.frontierOf([laid]);
      for (const cell of lv.cells.slice(0, 6))
        if (f.fits(cell)) {
          own.push({ id: 100 + own.length, kind: 0, pieces: cell });
          f = f.cover(cell);
        }
      expect(hintFor(lv, [laid, ...own])).toEqual({ remove: laid.id });
    }
  });

  it("lets a stray tile stay where the board can still be finished round it", () => {
    const lv = level("dissectedtrunchex2");
    const all = strays(lv);
    const fine = all.filter((s) => s.fine);
    expect(fine.length).toBeGreaterThan(0);
    for (const { laid } of fine.slice(0, 2)) {
      const hint = hintFor(lv, [laid]);
      expect(hint && "place" in hint).toBe(true);
      // and following the hints from there finishes it, the stray tile kept
      const done = followHints(lv, [laid]);
      expect(done.some((t) => t.id === laid.id)).toBe(true);
    }
  });

  it("finishes a board from a muddle of stray tiles, taking off what it must", () => {
    const lv = level("dissectedtrunchex2");
    const solver = new HintSolver(lv);
    // stray tiles laid wherever they still fit, a few of them
    let f = solver.frontierOf([]);
    const laid: Laid[] = [];
    for (const { laid: t } of strays(lv)) {
      if (laid.length >= 4) break;
      if (!f.fits(t.pieces)) continue;
      laid.push(t);
      f = f.cover(t.pieces);
    }
    expect(laid.length).toBeGreaterThan(1);
    const done = followHints(lv, laid);
    expect(solver.frontierOf(done).empty).toBe(true);
  });

  it("is a tile the game itself would let land, as the tray holds it", () => {
    const lv = level("rhombitrihex");
    const hint = hintFor(lv, []);
    if (!hint || !("place" in hint)) throw new Error("expected a tile to lay");
    const p = new Puzzle(lv);
    const { kind, spot } = hint.place;
    const shape = {
      ring: lv.ring,
      pieces: posed(lv.tiles[kind]!, { rot: 0, flip: false, t: lv.ring.zero }),
    };
    const [rot] = turnsOntoPieces(shape, spot);
    expect(rot).toBeDefined();
    p.place(kind, spot, rot!);
    expect(p.tiles).toHaveLength(1);
  });
});
