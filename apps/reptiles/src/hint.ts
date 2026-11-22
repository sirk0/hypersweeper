// The hint: what to do next on a board, worked out exactly.
//
// First the tiles already down are checked — can the board still be finished
// round them? Any exact cover wins, not only the board's own, so where a tile
// is down that the board was not cut with, that takes a search. If it can be
// finished, the hint is a tile to lay: one of a cover that finishes it, at the
// open corner with the fewest ways to fill it. If it cannot, the hint is a
// tile to take off: one whose going alone lets the board be finished, where
// there is one; else one the board was not cut with (taking off all of those
// always leaves a board that finishes, so each such hint is progress).
//
// The search is exact, not budgeted: at each step it works one *convex*
// corner of what is still open, where every tile that could cover the ground
// just inside it has a corner there and a side along the edge into it — so
// trying every tile, every way the tray can hold it, that fits with a corner
// there tries everything, and a convex corner nothing fits proves the board
// cannot be finished. A frontier found to be dead is remembered (by its exact
// edges), so a search does not explore it twice, nor does the next hint on
// the same level. The search is a generator, yielding between steps, so the
// worker (hint.worker.ts) can run it in slices and drop it when the board
// changes under it; the tests just run it through.
//
// On a level held to a vertex rule (`Level.rule`), a tile lands only where
// the rule lets it, as in play: each frontier the search reaches carries the
// rule's corners as the tiles round it leave them (`rulesOf`), and a frontier
// is remembered dead together with those corners — two layouts that leave one
// frontier can differ in what the rule still lets in.
//
// Pure — no DOM — and no float decides anything: corners are convex by an
// exact cross product (on a round edge, of its chord), placements come from
// the frontier's exact `placements`.

import { crossSign, type Cyc } from "./geometry/cyclotomic";
import { Frontier, type Edge } from "./geometry/frontier";
import { NONE } from "./geometry/marks";
import {
  centroidOf,
  posed,
  selfTurns,
  spotKey,
  turnsOntoPieces,
  type Piece,
  type Shape,
  type XY,
} from "./geometry/shape";
import { RuleState } from "./geometry/vertexRule";
import type { Level } from "./levels";

/** A tile down on the board, as the game holds it — its id, kind and pieces;
 * the worker gets these by structured clone. */
export interface Laid {
  id: number;
  kind: number;
  pieces: Piece[];
}

/** A tile to lay: which kind, and where — its pieces as they land. */
export interface PlaceHint {
  place: { kind: number; spot: Piece[] };
}

/** A tile to take off: the id of one of the `Laid` tiles. */
export interface RemoveHint {
  remove: number;
}

/** What to do next — null once the board is finished. */
export type Hint = PlaceHint | RemoveHint | null;

/** A way a tile fits at a corner. */
interface Option {
  kind: number;
  spot: Piece[];
  own: boolean;
  /** Its bounding box, in floats: only ever to say two tiles are well apart. */
  box: Box;
}

type Box = [x0: number, y0: number, x1: number, y1: number];

/** Farther apart than this, two boxes' tiles cannot touch — a margin far past
 * a float's error, so a float never decides a contact. */
const APART = 1e-6;

const apart = (a: Box, b: Box): boolean =>
  a[2] < b[0] - APART || b[2] < a[0] - APART || a[3] < b[1] - APART || b[3] < a[1] - APART;

/** A convex corner, and what names it with the two frontier edges that meet
 * there — the same name in a frontier a tile further on, so long as neither
 * edge changed; null at a corner taken only as a fallback. */
interface Corner {
  at: Cyc;
  name: string | null;
}

/** One step of the search: the corner worked, its ways, and every corner's
 * ways by name, for the steps after it to start from. */
interface Step {
  at: Cyc;
  options: Option[];
  known: Map<string, Option[]>;
}

/** What a step hands the next: its corners' ways, and the box of the tile
 * just laid — a way well apart from it fits as it did. */
interface Before {
  known: Map<string, Option[]>;
  laid: Option;
}

/** How much of the frontiers remembered as dead (their names' length, in
 * characters) a level keeps before the memory starts over — a guard on a
 * phone's memory: forgetting only costs time, never correctness. */
const MAX_DEAD_CHARS = 20_000_000;

/** Whether two edges, one on from the other, read as one: only plain straight
 * ones — a marked or round edge cut part-way takes no tile, so a cut there
 * matters. */
const plainRun = (a: Edge, b: Edge): boolean =>
  a.bulge === 0 && b.bulge === 0 && a.mark === NONE && b.mark === NONE;

/**
 * What a hint search knows about one level, kept between hints: each kind's
 * shape held flat and flipped, the turns the tray can hold it at, the board's
 * own cells, and the frontiers found dead.
 */
export class HintSolver {
  private readonly own: Set<string>;
  /** Per kind, per way up the tray can hold it: the shape and the turns that
   * land it as the tray can hold it (`placements`' `turns`). */
  private readonly held: { shape: Shape; turns: number[] }[][];
  private readonly dead = new Set<string>();
  private deadChars = 0;
  /** On a level with a vertex rule, the rule's corners that go with each
   * frontier the solver made (`frontierOf`, `lay`, `parts`). */
  private readonly rules = new WeakMap<Frontier, RuleState>();

  constructor(readonly level: Level) {
    const { ring, tiles } = level;
    this.own = new Set(level.cells.map((c) => spotKey(ring, c)));
    const n = ring.n;
    // the tray turns every tile by multiples of `turn` (or not at all)
    const reach: number[] = [];
    if (level.turn > 0) for (let k = 0; k < n; k += level.turn) reach.push(k);
    else reach.push(0);
    this.held = tiles.map((shape) =>
      (level.mirror ? [false, true] : [false]).map((flip) => {
        const posedShape: Shape = {
          ring,
          pieces: posed(shape, { rot: 0, flip, t: ring.zero }),
        };
        // a turn that carries the tile onto itself lands it as held too
        const same = selfTurns(posedShape);
        const turns = new Set<number>();
        for (const r of reach) for (const s of same) turns.add((((r + s) % n) + n) % n);
        return { shape: posedShape, turns: [...turns].sort((a, b) => a - b) };
      }),
    );
  }

  /** The frontier with `laid` down — those tiles' pieces covered. */
  frontierOf(laid: readonly Laid[]): Frontier {
    const { ring, region, regionCurves, regionMarks, rule } = this.level;
    let f = Frontier.ofRegion(ring, region, regionCurves, regionMarks);
    for (const t of laid) f = f.cover(t.pieces);
    if (rule)
      this.rules.set(
        f,
        RuleState.of(
          ring,
          rule,
          laid.map((t) => t.pieces),
        ),
      );
    return f;
  }

  /** The vertex rule's corners as the tiles round `f` leave them — null on a
   * level without a rule. `f` must be one this solver made. */
  private rulesOf(f: Frontier): RuleState | null {
    if (!this.level.rule) return null;
    const r = this.rules.get(f);
    if (!r) throw new Error("hint: a frontier the solver did not make, on a level with a rule");
    return r;
  }

  /** Whether `spot` (which fits `f`) lands there by the vertex rule — always,
   * on a level without one. */
  private allowed(f: Frontier, spot: readonly Piece[]): boolean {
    const r = this.rulesOf(f);
    return !r || r.allows(f, spot);
  }

  /** `f` with `spot` covered, its rule's corners carried along. */
  lay(f: Frontier, spot: Piece[]): Frontier {
    const next = f.cover(spot);
    const r = this.rulesOf(f);
    if (r) this.rules.set(next, r.with(spot));
    return next;
  }

  /** Whether a tile down is one of the board's own. */
  isOwn(pieces: readonly Piece[]): boolean {
    return this.own.has(spotKey(this.level.ring, pieces));
  }

  /** Every way a tile can land with a corner on `at` (exact, every kind, every
   * way the tray holds it), the board's own first, then the biggest kinds. */
  optionsAt(f: Frontier, at: Cyc): Option[] {
    const { ring } = this.level;
    const xy = ring.toXY(at);
    const seen = new Set<string>();
    const out: Option[] = [];
    const r = this.rulesOf(f);
    const accept = r ? (spot: Piece[]) => r.allows(f, spot) : undefined;
    for (let kind = this.held.length - 1; kind >= 0; kind--) {
      for (const { shape, turns } of this.held[kind]!) {
        for (const spot of f.placements(shape, xy, 1e-6, false, turns, accept)) {
          const key = spotKey(ring, spot);
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(this.option(kind, spot, this.own.has(key)));
        }
      }
    }
    // stable: the board's own first, then as found (biggest kinds first)
    return out.sort((a, b) => Number(b.own) - Number(a.own));
  }

  private option(kind: number, spot: Piece[], own: boolean): Option {
    return { kind, spot, own, box: this.boxOf(spot) };
  }

  private boxOf(spot: readonly Piece[]): Box {
    const { ring } = this.level;
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of spot)
      for (const v of p.verts) {
        const [x, y] = ring.toXY(v);
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    // a round edge bulges past its corners: by at most half its length
    if (spot.some((p) => p.curve?.some((b) => b !== 0))) {
      const grow = Math.max(box[2] - box[0], box[3] - box[1]) / 2;
      return [box[0] - grow, box[1] - grow, box[2] + grow, box[3] + grow];
    }
    return box;
  }

  /** The corners worth branching on: the frontier's convex ones (one edge in,
   * one out, turning left — the open ground on the left), where whatever
   * covers the ground just inside has a corner. Every bounded open area has
   * one; should none be found (a pinch at each), every corner, as a fallback. */
  corners(f: Frontier): Corner[] {
    const { ring } = this.level;
    const into = new Map<string, Edge[]>();
    const outOf = new Map<string, Edge[]>();
    for (const e of f.edges) {
      (into.get(e.bk) ?? into.set(e.bk, []).get(e.bk)!).push(e);
      (outOf.get(e.ak) ?? outOf.set(e.ak, []).get(e.ak)!).push(e);
    }
    const name = (e: Edge): string => `${e.ak}>${e.bk}:${e.bulge}:${e.mark}`;
    const out: Corner[] = [];
    for (const [k, at] of f.corners) {
      const ins = into.get(k) ?? [];
      const outs = outOf.get(k) ?? [];
      if (ins.length !== 1 || outs.length !== 1) continue;
      const [a, b] = [ins[0]!, outs[0]!];
      if (crossSign(ring, ring.sub(a.b, a.a), ring.sub(b.b, b.a)) > 0)
        out.push({ at, name: `${name(a)}|${name(b)}` });
    }
    return out.length > 0 ? out : [...f.corners.values()].map((at) => ({ at, name: null }));
  }

  /** The convex corners' positions. */
  convexCorners(f: Frontier): Cyc[] {
    return this.corners(f).map((c) => c.at);
  }

  /**
   * The convex corner with the fewest ways to fill it, and those ways — none
   * at all where the board cannot be finished. A corner whose two edges are
   * as they were a step before has the ways it had then that still fit (a
   * way that fits now fitted then: covering a tile only takes ways away),
   * and one well apart from the tile laid since still fits — so only the
   * corners and ways near that tile are worked out again.
   */
  branch(f: Frontier, before?: Before): Step | null {
    const known = new Map<string, Option[]>();
    let best: Step | null = null;
    for (const { at, name } of this.corners(f)) {
      const was = name !== null ? before?.known.get(name) : undefined;
      const options = was
        ? was.filter(
            (o) => apart(o.box, before!.laid.box) || (f.fits(o.spot) && this.allowed(f, o.spot)),
          )
        : this.optionsAt(f, at);
      if (name !== null) known.set(name, options);
      if (!best || options.length < best.options.length) best = { at, options, known };
      if (options.length === 0) break; // stuck: nothing after this matters
    }
    return best;
  }

  /** The convex corners nothing fits — where the board is stuck. */
  deadCorners(f: Frontier): Cyc[] {
    return this.convexCorners(f).filter((at) => this.optionsAt(f, at).length === 0);
  }

  /** A name for what `f` leaves open: its edges, with each plain straight
   * run through a point that is no corner read as one edge — however the
   * tiles along it cut it — so the same open ground reached two ways is the
   * same name. */
  private keyOf(f: Frontier): string {
    const corners = f.corners;
    const into = new Map<string, Edge[]>();
    const outOf = new Map<string, Edge[]>();
    for (const e of f.edges) {
      (into.get(e.bk) ?? into.set(e.bk, []).get(e.bk)!).push(e);
      (outOf.get(e.ak) ?? outOf.set(e.ak, []).get(e.ak)!).push(e);
    }
    // the edge `e` runs on into, where its end is passed straight through
    const onward = (e: Edge): Edge | null => {
      if (corners.has(e.bk) || into.get(e.bk)!.length !== 1) return null;
      const outs = outOf.get(e.bk);
      const next = outs?.length === 1 ? outs[0]! : null;
      return next && plainRun(e, next) ? next : null;
    };
    const runs: string[] = [];
    for (const e of f.edges) {
      // a run is named once, from its first edge
      const ins = into.get(e.ak);
      if (ins?.length === 1 && onward(ins[0]!) === e) continue;
      let end = e;
      for (let next = onward(end); next && next !== e; next = onward(end)) end = next;
      runs.push(`${e.ak}>${end.bk}:${e.bulge}:${e.mark}`);
    }
    const key = runs.sort().join("|");
    // on a rule level, the corners already round the frontier's points too
    const r = this.rulesOf(f);
    if (!r) return key;
    const points = new Set<string>();
    for (const e of f.edges) points.add(e.ak);
    return `${key}#${r.keyAt(points)}`;
  }

  /** Whether `f` can be covered exactly; if so, `path` ends holding the
   * tiles that cover it, in the order laid. */
  *finish(f: Frontier, path: Option[], before?: Before): Generator<void, boolean> {
    if (f.empty) return true;
    const key = this.keyOf(f);
    if (this.dead.has(key)) return false;
    // Parts apart are finished apart: one that cannot be is found once, not
    // again for every way of filling the others. The smallest first.
    const parts = f.parts();
    const r = this.rulesOf(f);
    if (r) for (const part of parts) this.rules.set(part, r);
    if (parts.length > 1) {
      parts.sort((a, b) => a.edges.length - b.edges.length);
      const mark = path.length;
      for (const part of parts) {
        if (!(yield* this.finish(part, path, before))) {
          path.length = mark;
          this.remember(key);
          return false;
        }
      }
      return true;
    }
    yield;
    const step = this.branch(f, before);
    for (const option of step?.options ?? []) {
      path.push(option);
      const next = { known: step!.known, laid: option };
      if (yield* this.finish(this.lay(f, option.spot), path, next)) return true;
      path.pop();
    }
    this.remember(key);
    return false;
  }

  private remember(key: string): void {
    if (this.deadChars + key.length > MAX_DEAD_CHARS) {
      this.dead.clear();
      this.deadChars = 0;
    }
    this.dead.add(key);
    this.deadChars += key.length;
  }

  /**
   * A cover of `f` — the spots of tiles that finish it — if it has one.
   * First the quick way: lay every one of the board's own cells that still
   * fits, and search only the hole that leaves (six triangles where a hexagon
   * was) — instant when every tile down is the board's own. Where that hole
   * cannot be filled, the board's own cells laid round it may be what blocks
   * a cover, so the hole is widened — the own cells nearest it left out, a
   * tile's width further each time — and searched again, until none are
   * left: the whole of `f`, whose search decides. A board that can be
   * finished by mending round the trouble is found long before the whole
   * search would find it.
   */
  *cover(f: Frontier): Generator<void, Piece[][] | null> {
    const { ring, cells } = this.level;
    const fitting = cells.filter((cell) => f.fits(cell));
    // the trouble: where the board's own cells laid wherever they fit leave
    // a hole
    let rest = f;
    for (const cell of fitting) if (this.allowed(rest, cell)) rest = this.lay(rest, cell);
    const trouble = rest.edges.map((e) => e.axy);
    const centre = (cell: Piece[]): XY =>
      centroidOf(cell.map((p) => p.verts.map((v) => ring.toXY(v))));
    const near = fitting.map((cell) => {
      const [x, y] = centre(cell);
      return Math.min(Infinity, ...trouble.map(([tx, ty]) => Math.hypot(x - tx, y - ty)));
    });
    // a tile's width: the side of a square of the average cell's area
    const area = Math.abs(
      this.level.region.reduce(
        (sum, loop) =>
          sum +
          loop.reduce((a, v, k) => {
            const [x0, y0] = ring.toXY(v);
            const [x1, y1] = ring.toXY(loop[(k + 1) % loop.length]!);
            return a + (x0 * y1 - x1 * y0) / 2;
          }, 0),
        0,
      ),
    );
    const step = Math.sqrt(area / Math.max(1, cells.length));
    for (let reach = 0; ; reach += step) {
      // the own cells left in: those farther than `reach` from the trouble,
      // each where the vertex rule lets it land round those before it
      // (a float only orders the cells to widen by: any choice is exact)
      const farther = fitting.filter((_, k) => near[k]! > reach);
      let open = f;
      const kept: Piece[][] = [];
      for (const cell of farther) {
        if (!this.allowed(open, cell)) continue;
        open = this.lay(open, cell);
        kept.push(cell);
      }
      const path: Option[] = [];
      if (yield* this.finish(open, path)) return [...kept, ...path.map((o) => o.spot)];
      if (kept.length === 0) return null;
    }
  }

  /** The next tile to lay on `f`, if it can be finished: the tile of a cover
   * that fills the convex corner with the fewest ways to fill it — whatever
   * covers the ground inside a convex corner has a corner on it, so the
   * cover's tile there is one of those ways. */
  *next(f: Frontier): Generator<void, Option | null> {
    const cover = yield* this.cover(f);
    if (!cover) return null;
    const { ring } = this.level;
    const keys = new Set(cover.map((spot) => spotKey(ring, spot)));
    const step = this.branch(f);
    const pick = step?.options.find((o) => keys.has(spotKey(ring, o.spot)));
    if (pick) return pick;
    // (a fallback that should not be needed: the cover's first tile)
    const first = cover[0]!;
    const own = this.isOwn(first);
    for (let kind = this.held.length - 1; kind >= 0; kind--)
      for (const { shape } of this.held[kind]!)
        if (turnsOntoPieces(shape, first).length > 0) return this.option(kind, first, own);
    return null;
  }

  /** The hint for the board with `laid` down. */
  *hint(laid: readonly Laid[]): Generator<void, Hint> {
    const f = this.frontierOf(laid);
    if (f.empty) return null;
    const stray = laid.filter((t) => !this.isOwn(t.pieces));
    const next = yield* this.next(f);
    if (next) return { place: { kind: next.kind, spot: next.spot } };

    // Stuck: a tile to take off. The ones the board was not cut with first —
    // nearest where it is stuck, then the last laid — then the rest.
    const { ring } = this.level;
    const stuck = this.deadCorners(f).map((v) => ring.toXY(v));
    const distance = (t: Laid): number => {
      if (stuck.length === 0) return 0;
      const [cx, cy] = centroidOf(t.pieces.map((p) => p.verts.map((v) => ring.toXY(v))));
      return Math.min(...stuck.map(([x, y]) => Math.hypot(x - cx, y - cy)));
    };
    const byNear = (list: Laid[]): Laid[] =>
      list
        .map((t) => ({ t, d: distance(t) }))
        // nearer first; a tie (within a float's error) to the one laid last
        .sort((a, b) => (Math.abs(a.d - b.d) > 1e-9 ? a.d - b.d : b.t.id - a.t.id))
        .map(({ t }) => t);
    const candidates = [...byNear(stray), ...byNear(laid.filter((t) => this.isOwn(t.pieces)))];
    for (const t of candidates) {
      const rest = laid.filter((o) => o !== t);
      // with only the board's own left down, it finishes: no search needed
      if (rest.every((o) => this.isOwn(o.pieces))) return { remove: t.id };
      if (yield* this.cover(this.frontierOf(rest))) return { remove: t.id };
    }
    // No one tile will do: take off a stray one — taking off every stray
    // tile always leaves a board that finishes.
    const first = candidates[0];
    return first ? { remove: first.id } : null;
  }
}

/** Run a hint search to the end, in one go (the tests, and anywhere time is
 * no matter). */
export function runToEnd<T>(gen: Generator<void, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

/** The hint for `level` with `laid` down, worked out in one go. */
export function hintFor(level: Level, laid: readonly Laid[], solver = new HintSolver(level)): Hint {
  return runToEnd(solver.hint(laid));
}

/** Run a hint search in slices of about `slice` milliseconds, giving the
 * event loop a turn between them, so a page or worker stays responsive and
 * can ask for a newer board meanwhile; `stale` is asked after each turn, and
 * once it says the board has moved on the search is dropped (undefined). */
export async function runSliced<T>(
  gen: Generator<void, T>,
  stale: () => boolean,
  slice = 25,
): Promise<T | undefined> {
  let until = performance.now() + slice;
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
    if (performance.now() < until) continue;
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (stale()) {
      gen.return(undefined as T);
      return undefined;
    }
    until = performance.now() + slice;
  }
}
