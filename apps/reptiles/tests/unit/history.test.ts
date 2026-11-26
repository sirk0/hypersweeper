import { afterEach, describe, expect, it, vi } from "vitest";
import { spotKey } from "../../src/geometry/shape";
import { levelByKey, type Level } from "../../src/levels";
import { Puzzle, type LaidTile } from "../../src/puzzle";

// Undo and redo (`Puzzle.commit`, `undo`, `redo`), and a board in play kept
// and laid back (src/saved.ts, `Puzzle.resume`).

function level(key: string): Level {
  const out = levelByKey(key);
  if (!out) throw new Error(`no level ${key}`);
  return out;
}

/** The tiles down, exactly and in no order. */
const layoutOf = (p: Puzzle, tiles: readonly LaidTile[] = p.tiles): string[] =>
  tiles.map((t) => `${t.kind}|${t.rot}|${t.flip}|${spotKey(p.level.ring, t.pieces)}`).sort();

describe("undo and redo", () => {
  it("step back and forth through finished moves", () => {
    const p = new Puzzle(level("squares"));
    expect(p.canUndo).toBe(false);
    expect(p.canRedo).toBe(false);
    p.layOwn(1);
    expect(p.commit()).toBe(true);
    const one = layoutOf(p);
    p.layOwn(2);
    expect(p.commit()).toBe(true);
    const three = layoutOf(p);
    expect(three).toHaveLength(3);

    expect(p.undo()).toBe(true);
    expect(layoutOf(p)).toEqual(one);
    expect(layoutOf(p, p.layout)).toEqual(one);
    expect(p.undo()).toBe(true);
    expect(p.tiles).toHaveLength(0);
    expect(p.canUndo).toBe(false);
    expect(p.undo()).toBe(false);

    expect(p.redo()).toBe(true);
    expect(p.redo()).toBe(true);
    expect(layoutOf(p)).toEqual(three);
    expect(p.canRedo).toBe(false);
    expect(p.redo()).toBe(false);
  });

  it("a tile lifted and put back is no move; taking one off is", () => {
    const p = new Puzzle(level("squares"));
    p.layOwn(2);
    p.commit();
    const [tile] = p.tiles;
    p.lift(tile!.id);
    p.place(tile!.kind, tile!.pieces, tile!.rot, tile!.flip);
    expect(p.commit()).toBe(false);
    p.lift(999); // no such tile: nothing changes
    expect(p.commit()).toBe(false);
    p.lift(p.tiles[0]!.id);
    expect(p.commit()).toBe(true);
    expect(p.tiles).toHaveLength(1);
    p.undo();
    expect(p.tiles).toHaveLength(2);
  });

  it("a new move after an undo leaves nothing to redo", () => {
    const p = new Puzzle(level("triangles"));
    p.layOwn(1);
    p.commit();
    p.layOwn(1);
    p.commit();
    p.undo();
    expect(p.canRedo).toBe(true);
    p.lift(p.tiles[0]!.id);
    p.commit();
    expect(p.canRedo).toBe(false);
    expect(p.tiles).toHaveLength(0);
  });

  it("undoes the finishing move, and redoes it to finish again", () => {
    const p = new Puzzle(level("squares"));
    p.layOwn();
    p.commit();
    expect(p.won).toBe(true);
    p.undo();
    expect(p.won).toBe(false);
    p.redo();
    expect(p.won).toBe(true);
  });
});

describe("a board kept and laid back", () => {
  // plain, marked, of several pieces, round-edged, flipped, and on a board
  // past the first
  for (const key of [
    "squares",
    "squares.2apart",
    "kissingsquares",
    "spectre",
    "hat",
    "rhombitrihex-2",
  ]) {
    it(`${key}: lays back exactly as it was left`, async () => {
      const items: Record<string, string> = {};
      const saved = await freshSaved(items);
      const lv = level(key);
      const p = new Puzzle(lv);
      p.layOwn(Math.ceil(lv.cells.length / 2));
      p.commit();
      saved.saveBoard(lv, p.layout, 65_400, 1);

      const kept = saved.loadBoard(lv)!;
      expect(kept.ms).toBe(65_400);
      expect(kept.hints).toBe(1);
      const q = new Puzzle(lv);
      q.resume(kept.tiles);
      expect(layoutOf(q)).toEqual(layoutOf(p));
      expect(layoutOf(q, q.layout)).toEqual(layoutOf(p));
      expect(q.canUndo).toBe(false);
      expect(q.coverage).toBeCloseTo(p.coverage, 9);
      // and it plays on from there
      q.solve();
      expect(q.won).toBe(true);
    });
  }

  it("a tile that does not fit, or is not its kind held that way, drops the board", async () => {
    const lv = level("hat");
    const p = new Puzzle(lv);
    p.layOwn(4);
    p.commit();
    const saved = await freshSaved({});
    saved.saveBoard(lv, p.layout, 1000, 0);
    const kept = saved.loadBoard(lv)!;

    const twice = [...kept.tiles, kept.tiles[0]!];
    const q = new Puzzle(lv);
    expect(() => q.resume(twice)).toThrow();
    expect(q.tiles).toHaveLength(0);

    const turned = kept.tiles.map((t, i) => (i === 0 ? { ...t, rot: t.rot + 1 } : t));
    expect(() => q.resume(turned)).toThrow();
    expect(q.tiles).toHaveLength(0);

    const flipped = kept.tiles.map((t, i) => (i === 0 ? { ...t, flip: !t.flip } : t));
    expect(() => q.resume(flipped)).toThrow();

    const noKind = kept.tiles.map((t, i) => (i === 0 ? { ...t, kind: 99 } : t));
    expect(() => q.resume(noKind)).toThrow();
    expect(q.tiles).toHaveLength(0);
  });
});

// saved.ts reads localStorage as it is called, so each test stubs it and
// imports a fresh copy.
async function freshSaved(items: Record<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => void (items[key] = value),
    removeItem: (key: string) => void delete items[key],
  });
  vi.resetModules();
  return await import("../../src/saved");
}

afterEach(() => vi.unstubAllGlobals());

describe("the boards kept (saved.ts)", () => {
  it("keeps a board per level, and forgets it emptied, restarted or past the limit", async () => {
    const items: Record<string, string> = {};
    const saved = await freshSaved(items);
    const lv = level("squares");
    const p = new Puzzle(lv);
    p.layOwn(3);
    p.commit();
    saved.saveBoard(lv, p.layout, 5000, 0);
    expect(saved.hasBoard("squares")).toBe(true);
    expect(saved.loadBoard(lv)!.tiles).toHaveLength(3);

    // nothing down and no hint shown: nothing to keep
    saved.saveBoard(lv, [], 5000, 0);
    expect(saved.hasBoard("squares")).toBe(false);
    expect(items["rep-tiles.boards"]).toBeUndefined();
    // …but a hint shown is kept, so leaving cannot win back the no-hint star
    saved.saveBoard(lv, [], 0, 2);
    expect(saved.loadBoard(lv)!.hints).toBe(2);
    saved.forgetBoard("squares");
    expect(saved.loadBoard(lv)).toBeNull();

    // past the limit, the board left longest ago goes
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    const keys = Array.from({ length: saved.MAX_SAVED + 2 }, (_, i) => `squares-x${i}`);
    for (const key of keys) saved.saveBoard({ ...lv, key }, p.layout, 1, 0);
    expect(keys.map(saved.hasBoard)).toEqual(keys.map((_, i) => i >= 2));
    vi.restoreAllMocks();
  });

  it("drops a board kept for the level as it was, or that cannot be read", async () => {
    const items: Record<string, string> = {};
    const saved = await freshSaved(items);
    const lv = level("triangles");
    const p = new Puzzle(lv);
    p.layOwn(2);
    p.commit();
    saved.saveBoard(lv, p.layout, 1, 0);
    expect(saved.loadBoard(lv)).not.toBeNull();
    // another level's board under this key: its cells are not these
    expect(saved.loadBoard({ ...level("squares"), key: "triangles" })).toBeNull();

    const record = JSON.parse(items["rep-tiles.boards"]!) as Record<
      string,
      { tiles: { verts: unknown }[] }
    >;
    record["triangles"]!.tiles[0]!.verts = [[[0.5, 1]]];
    items["rep-tiles.boards"] = JSON.stringify(record);
    expect(saved.loadBoard(lv)).toBeNull();
    items["rep-tiles.boards"] = "{not json";
    expect(saved.loadBoard(lv)).toBeNull();
    expect(saved.hasBoard("triangles")).toBe(false);
  });

  it("works with no storage at all", async () => {
    vi.resetModules();
    const saved = await import("../../src/saved");
    const lv = level("squares");
    const p = new Puzzle(lv);
    p.layOwn(1);
    p.commit();
    expect(() => saved.saveBoard(lv, p.layout, 1, 0)).not.toThrow();
  });
});
