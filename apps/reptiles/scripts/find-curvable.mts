// Which plain boards can have their straight edges turned into the Spectre's
// round ones, and what that would ask of a player: a census, printed, that
// writes nothing. `npm run curvable` (`-- <key>…` for only those tilings).
//
// A round edge (`Bulge` in src/geometry/shape.ts) is one symmetric arc, out
// of one tile and into the one across, so a shared edge asks only that one
// side be OUT and the other IN — a mirror keeps an arc as it is. Every copy
// of a tile carries the same curves on its prototile's edges (its *slots*),
// so a board's curving is a parity problem on slots: each shared edge says
// "these two slots bulge opposite ways". Slots joined by meetings are a
// class; a class can be round when it has no odd cycle (a slot meeting
// itself — across a half turn about the edge's middle, or a mirror in it —
// is the shortest), and then has two ways, out on one side or the other.
// Tile(1,1)'s fourteen edges make one such class: the Spectre.
//
// Which copy's edge is which slot depends on how each copy is framed — for a
// symmetric tile, which of its self-turns it is laid by — so each periodic
// board's frames are searched too: one frame per translation class of each
// kind (`latticeOf`), every combination where there are few, else random
// restarts climbing class by class, keeping the framing that rounds the most
// shared edges; then, where the tiles have few edges, every labelling of
// their slots with each cell framed freely (`labellingSearch`), which finds
// what a climb cannot — but may lean on the window's rim, so a curving it
// finds is the board's, not always the tiling's. A board read off its builder's patch (the aperiodic levels,
// the spirals, the rep-tiles: `PATCH_MARKED`) keeps its builder's frames —
// the patch is too big to search, and its tiles mostly have no symmetry.
//
// Every edge is first cut where a corner of the tile across lands on it,
// every copy of a slot alike (`refine`: the bonds' long sides, Tile(1,1)'s
// flat corner), so each piece of a side is one curve.
//
// Whether it changes play is read two ways. On the board's own cells: how
// many of the ways the tray can hold a cell's kind (each self-turn, and
// mirror where the level flips) still land there once it is round — each
// class's way out chosen to leave fewest. And measured, as `npm run
// difficulty` measures a board (`measure`): the round board built as a
// jigsaw of one knob shape (`markedBoard` — an arc out of one tile is a knob
// into the other, a straight edge a flat seam, the rim cut as the tiles
// along it are), its score and its share of wrong fits beside the plain
// board's. Tile(1,1) measured so is the Spectre's own score, 1.77.
// `MEASURE=0` skips the measure (seconds a board, the Socolar–Taylor tile's
// minutes: left out unless named).

import { latticeOf } from "../src/colourings";
import { measure, wrongShare } from "../src/difficulty";
import { knobMark, seamMark, SEAM_FLAT } from "../src/geometry/marks";
import { ccw } from "../src/geometry/outline";
import type { Cyc, Ring } from "../src/geometry/cyclotomic";
import { turnsOnto, posed, type Shape } from "../src/geometry/shape";
import {
  PATCH_MARKED,
  makeFirstBoard,
  markedBoard,
  patchFrames,
  patchWindow,
  type Level,
} from "../src/levels";
import levelIndex from "../src/levelIndex.json";
import { meetings, refine, type FramedPatch, type RefinedPatch } from "../src/patchMarks";

const only = process.argv.slice(2);
const PLAIN_GROUPS = new Set([
  "regular",
  "uniform",
  "2-uniform",
  "laves",
  "2-isohedral",
  "pentagonal",
  "isogonal",
  "rectangle",
  "reptile",
  "spiral",
  "aperiodic",
]);
/** Every combination of frames is tried up to this many; past it, a climb. */
const EXHAUSTIVE = 20000;
const RESTARTS = 300;
/** Every choice of way for up to this many round classes is tried. */
const MAX_SIGN_CLASSES = 10;
/** `MEASURE=0` skips the difficulty measure (seconds a board). */
const MEASURE = process.env.MEASURE !== "0";
/** Boards whose measure takes minutes: left out unless named. */
const SLOW = new Set(only.length ? [] : ["socolartaylor"]);

/** An isometry of a cell's prototile onto it: where each prototile corner
 * lands, and so which prototile edge (slot) each of the cell's edges is. */
interface Frame {
  rot: number;
  flip: boolean;
  /** Undirected edge key → slot index (piece·1000 + edge). */
  slotOf: Map<string, number>;
}

const edgeKey = (ring: Ring, a: Cyc, b: Cyc): string => {
  const [x, y] = [ring.key(a), ring.key(b)];
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

/** Every frame carrying `proto` (pieces, prototile order) onto `cell` (the
 * same, any order): each turn ζ^rot, mirrored too where `mirror`. */
function framesOnto(ring: Ring, proto: Cyc[][], cell: Cyc[][], mirror: boolean): Frame[] {
  const cellKeys = new Set(cell.flat().map((v) => ring.key(v)));
  const anchor = cell[0]![0]!;
  const out: Frame[] = [];
  const seen = new Set<string>();
  for (const flip of mirror ? [false, true] : [false]) {
    for (let rot = 0; rot < ring.n; rot++) {
      const z = ring.zeta(rot);
      const image = proto.map((p) => p.map((v) => ring.mul(z, flip ? ring.conj(v) : v)));
      for (const v of image.flat()) {
        const t = ring.sub(anchor, v);
        const moved = image.map((p) => p.map((w) => ring.add(w, t)));
        const keys = moved.flat().map((w) => ring.key(w));
        if (keys.length !== cellKeys.size || !keys.every((k) => cellKeys.has(k))) continue;
        const id = keys.join(";");
        if (seen.has(id)) continue;
        seen.add(id);
        const slotOf = new Map<string, number>();
        moved.forEach((p, q) =>
          p.forEach((w, i) => slotOf.set(edgeKey(ring, w, p[(i + 1) % p.length]!), q * 1000 + i)),
        );
        out.push({ rot, flip, slotOf });
      }
    }
  }
  return out;
}

/** The plain board framed as `makeLevel` lays it: each cell its kind's tray
 * tile turned (or mirrored) onto it by the first turn that fits, its corners
 * in the tray tile's order. */
function boardFrames(level: Level): FramedPatch {
  const { ring } = level;
  const mirrored = level.tiles.map((s): Shape => ({
    ring,
    pieces: posed(s, { rot: 0, flip: true, t: ring.zero }),
  }));
  return {
    ring,
    cells: level.cells.map((cell) => {
      const verts = cell.map((p) => p.verts);
      for (const [kind, tile] of level.tiles.entries()) {
        for (const flip of [false, true]) {
          const shape = flip ? mirrored[kind]! : tile;
          const rots = turnsOnto(shape, verts);
          if (!rots.length) continue;
          // the tray tile's own corners, carried onto the cell in order (a
          // mirror listed as the mirror leaves them: clockwise)
          const z = ring.zeta(rots[0]!);
          const image = tile.pieces.map((p) =>
            p.verts.map((v) => ring.mul(z, flip ? ring.conj(v) : v)),
          );
          const keys = new Set(verts.flat().map((v) => ring.key(v)));
          for (const v of image.flat()) {
            const t = ring.sub(verts[0]![0]!, v);
            const moved = image.map((p) => p.map((w) => ring.add(w, t)));
            if (moved.flat().every((w) => keys.has(ring.key(w)))) return { kind, pieces: moved };
          }
        }
      }
      throw new Error(`${level.key}: a cell is no tray tile`);
    }),
  };
}

/** The cells of `refined` grouped into translation classes by `lattice`:
 * floats propose the lattice step between two cells, exact arithmetic
 * checks it. Each cell its own class where the board shows no lattice. */
function translationClasses(ring: Ring, refined: RefinedPatch, level: Level): number[] {
  let lattice: { u: Cyc; v: Cyc } | null = null;
  try {
    lattice = latticeOf(ring, level.cells);
  } catch {
    lattice = null;
  }
  const n = refined.cells.length;
  if (!lattice) return refined.cells.map((_, i) => i);
  const [ux, uy] = ring.toXY(lattice.u);
  const [vx, vy] = ring.toXY(lattice.v);
  const det = ux * vy - uy * vx;
  const times = (k: number, w: Cyc): Cyc => {
    let out = ring.zero;
    const step = k < 0 ? ring.neg(w) : w;
    for (let i = 0; i < Math.abs(k); i++) out = ring.add(out, step);
    return out;
  };
  const keysOf = (i: number): string[] =>
    refined.cells[i]!.pieces.flatMap((p) => p.verts.map((v) => ring.key(v))).sort();
  const reps: number[] = [];
  const cls: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = refined.cells[i]!.pieces[0]!.verts;
    const found = reps.findIndex((r) => {
      if (refined.cells[r]!.kind !== refined.cells[i]!.kind) return false;
      const b = refined.cells[r]!.pieces[0]!.verts;
      // try each of the rep's corners as the image of this cell's first
      for (const w of b) {
        const [dx, dy] = ring.toXY(ring.sub(a[0]!, w));
        const p = (dx * vy - dy * vx) / det;
        const q = (ux * dy - uy * dx) / det;
        const [ip, iq] = [Math.round(p), Math.round(q)];
        if (Math.abs(p - ip) > 1e-6 || Math.abs(q - iq) > 1e-6) continue;
        const t = ring.add(times(ip, lattice!.u), times(iq, lattice!.v));
        const shifted = refined.cells[r]!.pieces.flatMap((pc) =>
          pc.verts.map((x) => ring.key(ring.add(x, t))),
        );
        const own = keysOf(i);
        if (shifted.sort().join() === own.join()) return true;
      }
      return false;
    });
    if (found >= 0) cls[i] = found;
    else {
      cls[i] = reps.length;
      reps.push(i);
    }
  }
  return cls;
}

interface Meeting {
  a: number;
  b: number;
  key: string;
}

interface Outcome {
  /** Meetings whose class can be round. */
  round: number;
  /** The round classes' roots: each class two ways, out on one side or in. */
  roots: string[];
  /** Each slot of a round class (kind:slot): its root, and whether it bulges
   * as the root does (0) or the other way (1). */
  sides: Map<string, [string, number]>;
}

/** The parity union–find over `frames` (one per cell): every meeting asks
 * its two slots to bulge opposite ways. */
function solve(kinds: number[], meets: readonly Meeting[], frames: readonly Frame[]): Outcome {
  const parent = new Map<string, string>();
  const parity = new Map<string, number>();
  const find = (s: string): [string, number] => {
    const p = parent.get(s);
    if (p === undefined) {
      parent.set(s, s);
      parity.set(s, 0);
      return [s, 0];
    }
    if (p === s) return [s, 0];
    const [root, up] = find(p);
    const own = parity.get(s)! ^ up;
    parent.set(s, root);
    parity.set(s, own);
    return [root, own];
  };
  const slot = (cell: number, key: string): string =>
    `${kinds[cell]}:${frames[cell]!.slotOf.get(key)}`;
  const pairs = meets.map(({ a, b, key }) => [slot(a, key), slot(b, key)] as const);
  for (const [s, t] of pairs) {
    const [rs, ps] = find(s);
    const [rt, pt] = find(t);
    if (rs !== rt) {
      parent.set(rt, rs);
      parity.set(rt, ps ^ pt ^ 1);
    }
  }
  const odd = new Set<string>();
  for (const [s, t] of pairs) {
    const [rs, ps] = find(s);
    const [, pt] = find(t);
    if ((ps ^ pt) !== 1) odd.add(rs);
  }
  let round = 0;
  const roots = new Set<string>();
  for (const [s] of pairs) {
    const [rs] = find(s);
    if (!odd.has(rs)) {
      round++;
      roots.add(rs);
    }
  }
  const sides = new Map<string, [string, number]>();
  for (const s of parent.keys()) {
    const [r, p] = find(s);
    if (!odd.has(r)) sides.set(s, [r, p]);
  }
  return { round, roots: [...roots].sort(), sides };
}

/** Each slot's bulge for one choice of way per round class (`signs`, by
 * root): OUT (−1) or IN (1) as `Bulge` has them; straight slots absent. */
function bulgesOf(o: Outcome, signs: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [s, [r, p]] of o.sides) out.set(s, (p ? -1 : 1) * signs.get(r)!);
  return out;
}

/** The bulge pattern a cell shows under `frame`, edge key by edge key. */
function pattern(kind: number, frame: Frame, bulge: ReadonlyMap<string, number>): string {
  return [...frame.slotOf.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([, s]) => bulge.get(`${kind}:${s}`) ?? 0)
    .join(",");
}

/** The labellings tried per board: every slot out, in or straight while
 * 3^slots is within this, else out or in while 2^slots is. */
const LABELLINGS = 20000;
/** The backtracking search's steps per labelling before it gives up. */
const STEPS = 3000;

/** The labelling search (see `census`): the framing of the labelling that
 * rounds the most meetings, or null where none rounds any. */
function labellingSearch(
  refined: RefinedPatch,
  allFrames: readonly Frame[][],
  meets: readonly Meeting[],
): { frames: Frame[]; how: string } | null {
  const kinds = refined.cells.map((c) => c.kind);
  if (refined.cells.some((c) => c.pieces.length > 1)) return null;
  const kindList = [...new Set(kinds)].sort((a, b) => a - b);
  const sizes = kindList.map(
    (k) => refined.cells.find((c) => c.kind === k)!.pieces[0]!.verts.length,
  );
  const slots = sizes.reduce((a, b) => a + b, 0);
  const values = 3 ** slots <= LABELLINGS ? [0, 1, -1] : 2 ** slots <= LABELLINGS ? [1, -1] : null;
  if (!values) return null;
  const total = values.length ** slots;
  // each cell's meetings: the edge, and the cell across
  const around: { key: string; other: number }[][] = refined.cells.map(() => []);
  for (const { a, b, key } of meets) {
    around[a]!.push({ key, other: b });
    around[b]!.push({ key, other: a });
  }
  // cells in breadth-first order, so each has a framed neighbour
  const order: number[] = [];
  const seen = new Set<number>();
  for (let s = 0; s < refined.cells.length; s++) {
    if (seen.has(s)) continue;
    seen.add(s);
    const queue = [s];
    while (queue.length) {
      const c = queue.shift()!;
      order.push(c);
      for (const { other } of around[c]!)
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
    }
  }
  let best: { frames: Frame[]; round: number } | null = null;
  const label = new Map<number, number[]>();
  for (let n = 0; n < total; n++) {
    let rest = n;
    kindList.forEach((k, i) => {
      const own: number[] = [];
      for (let j = 0; j < sizes[i]!; j++) {
        own.push(values[rest % values.length]!);
        rest = Math.floor(rest / values.length);
      }
      label.set(k, own);
    });
    const value = (c: number, f: Frame, key: string): number =>
      label.get(kinds[c]!)![f.slotOf.get(key)!]!;
    const chosen: (Frame | null)[] = refined.cells.map(() => null);
    let steps = 0;
    const place = (at: number): boolean => {
      if (at === order.length) return true;
      if (++steps > STEPS) return false;
      const c = order[at]!;
      for (const f of allFrames[c]!) {
        let ok = true;
        for (const { key, other } of around[c]!) {
          const g = chosen[other];
          if (g && value(c, f, key) + value(other, g, key) !== 0) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        chosen[c] = f;
        if (place(at + 1)) return true;
        chosen[c] = null;
      }
      return false;
    };
    if (!place(0)) continue;
    const frames = chosen as Frame[];
    const round = meets.filter(({ a, key }) => value(a, frames[a]!, key) !== 0).length;
    if (!best || round > best.round) best = { frames: [...frames], round };
  }
  if (!best || best.round === 0) return null;
  return { frames: best.frames, how: `${total} labellings` };
}

interface Row {
  key: string;
  label: string;
  group: string;
  meetings: number;
  asLaid: Outcome;
  best: Outcome;
  searched: string;
  fitsPlain: number;
  fitsRound: number;
  mirror: boolean;
  /** The level has round edges already: the Spectre. */
  alreadyRound: boolean;
  /** Its difficulty plain and round, as `measure` reads it. */
  measured: {
    plain: number;
    round: number;
    wrongPlain: number;
    wrongRound: number;
    kinds: [number, number];
  } | null;
}

function census(entry: { key: string; label: string; group: string }): Row {
  const level = makeFirstBoard(entry.key);
  const patched = PATCH_MARKED.includes(entry.key);
  const framed = patched ? patchFrames(entry.key) : boardFrames(level);
  const refined = refine(framed);
  const { ring } = refined;
  const kinds = refined.cells.map((c) => c.kind);
  // each kind's prototile: its first copy, refined, in its own order
  const protos = new Map<number, Cyc[][]>();
  for (const c of refined.cells)
    if (!protos.has(c.kind))
      protos.set(
        c.kind,
        c.pieces.map((p) => p.verts),
      );
  const allFrames = refined.cells.map((c) =>
    framesOnto(
      ring,
      protos.get(c.kind)!,
      c.pieces.map((p) => p.verts),
      level.mirror,
    ),
  );
  // the frame each cell is laid by: the one its slots name
  const laidFrames = refined.cells.map((c, i) => {
    const own = new Map<string, number>();
    c.pieces.forEach((p, q) =>
      p.verts.forEach((v, j) =>
        own.set(edgeKey(ring, v, p.verts[(j + 1) % p.verts.length]!), q * 1000 + j),
      ),
    );
    const found = allFrames[i]!.find((f) => [...own].every(([k, s]) => f.slotOf.get(k) === s));
    return found ?? { rot: 0, flip: false, slotOf: own };
  });
  const meets: Meeting[] = meetings(refined).map(({ a, b }) => {
    const p = refined.cells[a.cell]!.pieces[a.piece]!.verts;
    const key = edgeKey(ring, p[a.edge]!, p[(a.edge + 1) % p.length]!);
    return { a: a.cell, b: b.cell, key };
  });
  const asLaid = solve(kinds, meets, laidFrames);

  // the search: one frame per translation class of each kind
  let best = asLaid;
  let bestFrames = laidFrames;
  let searched = "builder's frames";
  if (!patched) {
    const cls = translationClasses(ring, refined, level);
    const classCount = Math.max(...cls) + 1;
    // a class's frames, as indices into each of its cells' own lists: a
    // frame of the class is a turn and mirror, the same for every member
    const options: { rot: number; flip: boolean }[][] = [];
    for (let k = 0; k < classCount; k++) {
      const first = cls.indexOf(k);
      options.push(allFrames[first]!.map(({ rot, flip }) => ({ rot, flip })));
    }
    const pick = (choice: number[]): Frame[] =>
      refined.cells.map((_, i) => {
        const want = options[cls[i]!]![choice[cls[i]!]!]!;
        return (
          allFrames[i]!.find((f) => f.rot === want.rot && f.flip === want.flip) ?? laidFrames[i]!
        );
      });
    const total = options.reduce((p, o) => p * o.length, 1);
    const better = (o: Outcome): boolean =>
      o.round > best.round || (o.round === best.round && o.roots.length > best.roots.length);
    if (total <= EXHAUSTIVE) {
      searched = `all ${total} framings`;
      const choice = options.map(() => 0);
      for (let n = 0; n < total; n++) {
        let rest = n;
        for (let k = 0; k < classCount; k++) {
          choice[k] = rest % options[k]!.length;
          rest = Math.floor(rest / options[k]!.length);
        }
        const frames = pick(choice);
        const o = solve(kinds, meets, frames);
        if (better(o)) [best, bestFrames] = [o, frames];
      }
    } else {
      searched = `${RESTARTS} climbs over ${total.toExponential(1)} framings`;
      let seed = 1;
      const random = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      for (let r = 0; r < RESTARTS; r++) {
        const choice = options.map((o) => Math.floor(random() * o.length));
        let here = solve(kinds, meets, pick(choice));
        for (let sweep = 0, moved = true; moved && sweep < 20; sweep++) {
          moved = false;
          for (let k = 0; k < classCount; k++) {
            const was = choice[k]!;
            for (let f = 0; f < options[k]!.length; f++) {
              if (f === was) continue;
              choice[k] = f;
              const o = solve(kinds, meets, pick(choice));
              if (o.round > here.round) {
                here = o;
                moved = true;
              } else choice[k] = was;
            }
          }
        }
        if (better(here)) [best, bestFrames] = [here, pick(choice)];
      }
    }
    // then, where the tiles have few edges, every labelling of their slots
    // (each edge out, in or straight; out or in only past `LABELLINGS`),
    // each cell framed freely — not one frame a translation class — by a
    // backtracking search for frames that make every meeting out against
    // in or straight against straight. Exact where the climb is not, but a
    // framing it finds may lean on the window's rim and not carry on past it
    const found = labellingSearch(refined, allFrames, meets);
    if (found) {
      const o = solve(kinds, meets, found.frames);
      if (better(o)) {
        [best, bestFrames] = [o, found.frames];
        searched += `; ${found.how}, framed cell by cell`;
      }
    }
  }

  // which way each round class bulges: the choice that leaves fewest of
  // the ways the tray can hold a cell's kind landing on it
  const ownFits = (bulge: ReadonlyMap<string, number>): number => {
    let n = 0;
    refined.cells.forEach((c, i) => {
      const own = pattern(c.kind, bestFrames[i]!, bulge);
      for (const f of allFrames[i]!) if (pattern(c.kind, f, bulge) === own) n++;
    });
    return n;
  };
  const fitsPlain = allFrames.reduce((n, f) => n + f.length, 0);
  const k = best.roots.length;
  let bulge = bulgesOf(best, new Map(best.roots.map((r) => [r, 1])));
  let fitsRound = ownFits(bulge);
  for (let m = 1; m < 2 ** Math.min(k, MAX_SIGN_CLASSES); m++) {
    const signs = new Map(best.roots.map((r, i) => [r, (m >> i) & 1 ? -1 : 1]));
    const b = bulgesOf(best, signs);
    const f = ownFits(b);
    if (f < fitsRound) [bulge, fitsRound] = [b, f];
  }

  // and what they ask of a player, measured as a board's difficulty is: the
  // arcs as one knob shape, out of one tile and into the other, a straight
  // edge a flat seam (straight meets straight), the rim cut as the tiles
  // along it are
  let measured: Row["measured"] = null;
  const round = best.round > 0 && level.regionCurves === undefined;
  if (MEASURE && round && !SLOW.has(entry.key)) {
    const markOf = (b: number | undefined): number =>
      b ? knobMark(0, b === -1, 0) : seamMark(SEAM_FLAT, 0);
    let cells: Cyc[][][];
    let marks: number[][][];
    if (patched) {
      // the window's cells read off the same refined patch, slot for slot
      const index = new Map<string, string>();
      for (const c of refined.cells)
        c.pieces.forEach((p, q) =>
          p.slots.forEach((s, i) => index.set(s, `${c.kind}:${q * 1000 + i}`)),
        );
      const win = patchWindow(level);
      cells = win.cells.map((cell) => cell.pieces.map((p) => p.verts));
      marks = win.cells.map((cell) =>
        cell.pieces.map((p) => p.slots.map((s) => markOf(bulge.get(index.get(s)!)))),
      );
    } else {
      cells = refined.cells.map((c) => c.pieces.map((p) => ccw(ring, p.verts)));
      marks = cells.map((cell, i) =>
        cell.map((verts) =>
          verts.map((v, e) => {
            const key = edgeKey(ring, v, verts[(e + 1) % verts.length]!);
            const s = bestFrames[i]!.slotOf.get(key);
            return markOf(bulge.get(`${kinds[i]}:${s}`));
          }),
        ),
      );
    }
    const curved = markedBoard(level, `${entry.key}.curved`, cells, marks);
    const before = measure(level);
    const after = measure(curved);
    measured = {
      plain: before.score,
      round: after.score,
      wrongPlain: wrongShare(before),
      wrongRound: wrongShare(after),
      kinds: [level.tiles.length, curved.tiles.length],
    };
  }
  return {
    key: entry.key,
    label: entry.label,
    group: entry.group,
    meetings: meets.length,
    asLaid,
    best,
    searched,
    fitsPlain,
    fitsRound,
    mirror: level.mirror,
    alreadyRound: level.regionCurves !== undefined,
    measured,
  };
}

const plain = (levelIndex as { key: string; label: string; group: string }[]).filter(
  (e) => PLAIN_GROUPS.has(e.group) && (only.length === 0 || only.includes(e.key)),
);
const rows: Row[] = [];
const pct = (n: number, of: number): string => `${Math.round((100 * n) / Math.max(of, 1))}%`;
for (const entry of plain) {
  const started = performance.now();
  try {
    const row = census(entry);
    rows.push(row);
    const kept = (row.fitsRound / Math.max(row.fitsPlain, 1)).toFixed(2);
    const m = row.measured;
    console.log(
      [
        entry.key.padEnd(22),
        entry.group.padEnd(12),
        `as laid ${pct(row.asLaid.round, row.meetings).padStart(4)}`,
        `best ${pct(row.best.round, row.meetings).padStart(4)}`,
        `${String(row.best.roots.length).padStart(2)} cls`,
        `own fits ${kept}`,
        m
          ? `score ${m.plain.toFixed(2)} → ${m.round.toFixed(2)}  wrong ${pct(m.wrongPlain * 100, 100)} → ${pct(m.wrongRound * 100, 100)}  tray ${m.kinds[0]} → ${m.kinds[1]}`
          : row.alreadyRound
            ? "already round"
            : "not measured",
        row.searched,
        `${((performance.now() - started) / 1000).toFixed(1)} s`,
      ].join("  "),
    );
  } catch (e) {
    console.log(`${entry.key.padEnd(22)}  failed: ${(e as Error).stack}`);
  }
}

// the summary: a board is worth a level where some edge can be round and
// the curves change what fits — on its own cells, or anywhere as measured
const curvable = rows.filter((r) => r.best.round > 0 && !r.alreadyRound);
const whole = curvable.filter((r) => r.best.round === r.meetings);
const ownCut = curvable.filter((r) => r.fitsRound < r.fitsPlain);
const fewerWrong = curvable.filter(
  (r) => r.measured && r.measured.wrongRound < r.measured.wrongPlain - 1e-9,
);
const changes = curvable.filter((r) => ownCut.includes(r) || fewerWrong.includes(r));
console.log();
console.log(`${rows.length} plain boards (the Spectre, round already, among them)`);
console.log(`  some shared edge can be round:   ${curvable.length}`);
console.log(`  every shared edge can be round:  ${whole.length}`);
console.log(`  curves rule out own-cell turns:  ${ownCut.length}`);
console.log(
  `  curves cut the wrong fits:       ${fewerWrong.length} (of ${rows.filter((r) => r.measured).length} measured)`,
);
console.log(`  either — a new level:            ${changes.length}`);
console.log(
  `  ways to curve those (2^classes): ${changes.reduce((s, r) => s + 2 ** r.best.roots.length, 0)}`,
);
console.log(
  `  none round: ${rows
    .filter((r) => r.best.round === 0)
    .map((r) => r.key)
    .join(", ")}`,
);
const unchanged = curvable.filter((r) => !changes.includes(r) && r.measured);
console.log(`  round but no change: ${unchanged.map((r) => r.key).join(", ")}`);
