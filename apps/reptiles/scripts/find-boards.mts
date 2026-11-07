// Find each tiling's boards past its first and write where each is cut to
// src/boards.json, which the game reads (see "a tiling's boards" in
// src/levels.ts). `npm run boards` after changing a level's window or this
// search; the unit tests fail while the file is out of step with the levels.
//
// A tiling's first board is the window it shipped with. The others are the
// same cut made somewhere else:
//
// - a periodic tiling (uniform, 2-uniform, Laves, 2-isohedral, pentagonal,
//   isogonal, a bond): the square moved across one domain of the tiling on a
//   GRID × GRID lattice of steps — a step a whole domain over is the same board
//   again. The kept tiles change only where a tile's corner crosses the
//   square's edge, so each board is a patch of the grid; it is taken at a step
//   whose eight neighbours all keep the very same tiles, so no float landing
//   on an edge decides it;
// - an aperiodic tiling: the builder's own `variant`s, 1 to VARIANTS (each a
//   window elsewhere in the patch, already held to one piece and not bitten
//   into by the patch's rim);
// - the hat's family: the window centred on each tile well inside the patch.
//
// A candidate is a board worth playing when it has about as many tiles as the
// first (TOLERANCE), is about as square, is one outline with no hole and no
// pinch, and takes the very same tray — the same tile kinds, so a tiling's
// boards are the one puzzle laid out afresh; a uniform or 2-uniform one must
// also have every one of its vertex configurations inside. It is a new board
// only when it is congruent to none found before (`congruenceKey`). Of those,
// the most unlike each other are kept, up to MAX boards a tiling.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { congruenceKey } from "../src/geometry/congruent";
import type { Cyc, Ring } from "../src/geometry/cyclotomic";
import { hatPatch } from "../src/geometry/hat";
import { posed, turnsOnto } from "../src/geometry/shape";
import { cornersOf, fitsConfig, span, type Corner } from "../src/geometry/vertexRule";
import { BOARD_SOURCES, GRID, LEVELS, type Level, type Variant } from "../src/levels";

/** How far a board's tile count may stray from its first board's. */
const TOLERANCE = 0.1;
/** The most boards a tiling gets, its first among them. */
const MAX = { window: 6, variant: 8, centre: 8 } as const;
/** How far a periodic window's square may shrink and grow, in BOX_STEPs. */
const GROW = [0, 1, -1, 2, 3, 4, 5, 6, -2];
/** The aperiodic builders' variants tried. */
const VARIANTS = 160;
/** How far from a hat patch's middle a window may be centred, as a share of
 * the patch's half-width — far enough in that the window is all patch. */
const CENTRE_REACH = 0.4;

const only = process.argv.slice(2);

interface Candidate {
  at: Variant;
  key: string;
  /** How many of the steps tried kept these tiles: the patch's size. */
  hits: number;
}

/** A board's width over its height. */
function ratio(level: Level): number {
  const pts = level.region.flat().map((v) => level.ring.toXY(v));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
}

/** How square a board is: its shorter side over its longer. */
const aspect = (level: Level): number => Math.min(ratio(level), 1 / ratio(level));

/** The widest and the tallest a board may be — what the tests hold every
 * board to (the hexagonal Laves tilings come no nearer square than 0.87). */
const WIDEST = 1.11;
const TALLEST = 0.86;

/** One outline: one loop, never through the same point twice. */
function isDisc(level: Level): boolean {
  if (level.region.length !== 1) return false;
  const loop = level.region[0]!;
  return new Set(loop.map((v) => level.ring.key(v))).size === loop.length;
}

/** The same tray: kind for kind, the same tile, turned or mirrored. */
function sameTray(a: Level, b: Level): boolean {
  if (a.tiles.length !== b.tiles.length) return false;
  return a.tiles.every((t, i) => {
    const u = b.tiles[i]!;
    if (t.pieces.length !== u.pieces.length) return false;
    const cell = u.pieces.map((p) => p.verts);
    return [false, true].some(
      (flip) =>
        turnsOnto({ ring: a.ring, pieces: posed(t, { rot: 0, flip, t: a.ring.zero }) }, cell)
          .length > 0,
    );
  });
}

/** Every inner point one of the level's vertex configurations, and each of
 * them somewhere — what the tests hold a uniform or 2-uniform board to. */
function keepsConfigs(level: Level): boolean {
  const { ring, configs } = level;
  const round = new Map<string, Corner[]>();
  for (const cell of level.cells) {
    for (const [k, corner] of cornersOf(ring, cell[0]!.verts))
      round.set(k, [...(round.get(k) ?? []), corner]);
  }
  const seen = new Set<number>();
  for (const corners of round.values()) {
    if (corners.reduce((sum, c) => sum + span(ring.n, c.sides), 0) !== ring.n) continue;
    const which = configs.findIndex(
      (c) => c.length === corners.length && fitsConfig(ring.n, c, corners),
    );
    if (which < 0) return false;
    seen.add(which);
  }
  return seen.size === configs.length;
}

const ofPolygons = (level: Level): boolean =>
  level.group === "uniform" || level.group === "2-uniform";

/** What tells two boards of one tiling apart at a glance: how many of each
 * tile, and how long the rim is. */
const features = (level: Level): number[] => [...level.need, level.region[0]!.length / 2];

const distance = (a: number[], b: number[]): number =>
  a.reduce((sum, x, i) => sum + Math.abs(x - b[i]!), 0);

/** The candidates for the boards of `first`, distinct from it and each
 * other. */
function candidates(first: Level): Candidate[] {
  const source = BOARD_SOURCES.get(first.key)!;
  const keyOf = (cut: { ring: Ring; cells: Cyc[][] }): string => congruenceKey(cut.ring, cut.cells);
  const baseKey = keyOf(source.cut());
  const found = new Map<string, Candidate>();
  if (source.kind === "window") {
    // the key at every step of the grid, at each size; a cut the window
    // cannot make (two pieces) is none. A board is taken at the first step
    // well inside its patch of the grid — every neighbour the same — at the
    // size nearest the first board's.
    const memo = new Map<string, string>();
    const inside = new Map<string, { at: Variant | null; hits: number }>();
    for (const grow of GROW) {
      const grid: (string | null)[][] = [];
      for (let i = 0; i < GRID; i++) {
        grid.push([]);
        for (let j = 0; j < GRID; j++) {
          let key: string | null = null;
          try {
            const cut = source.cut(i === 0 && j === 0 && grow === 0 ? undefined : [i, j, grow]);
            const raw = cut.cells.map((c) => c.map((v) => cut.ring.key(v)).join(" ")).join("|");
            key = memo.get(raw) ?? keyOf(cut);
            memo.set(raw, key);
          } catch {
            key = null;
          }
          grid[i]!.push(key);
        }
      }
      const at = (i: number, j: number): string | null =>
        grid[(i + GRID) % GRID]![(j + GRID) % GRID]!;
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const key = at(i, j);
          if (key === null || key === baseKey) continue;
          let alike = 0;
          for (let di = -1; di <= 1; di++)
            for (let dj = -1; dj <= 1; dj++) if (at(i + di, j + dj) === key) alike++;
          const known = inside.get(key) ?? { at: null, hits: 0 };
          known.hits++;
          if (known.at === null && alike === 9) known.at = grow ? [i, j, grow] : [i, j];
          inside.set(key, known);
        }
      }
    }
    for (const [key, { at, hits }] of inside) if (at) found.set(key, { at, key, hits });
  } else if (source.kind === "variant") {
    for (let v = 1; v <= VARIANTS; v++) {
      const key = keyOf(source.cut(v));
      if (key === baseKey) continue;
      const known = found.get(key);
      if (known) known.hits++;
      else found.set(key, { at: v, key, hits: 1 });
    }
  } else {
    const { tile, depth } = first.hat!;
    const whole = hatPatch(tile, depth, 1e9);
    const centroids = whole.cells.map((cell) => {
      const pts = cell.map((v) => whole.ring.toXY(v));
      return [
        pts.reduce((s, p) => s + p[0], 0) / pts.length,
        pts.reduce((s, p) => s + p[1], 0) / pts.length,
      ] as const;
    });
    const gx = centroids.reduce((s, p) => s + p[0], 0) / centroids.length;
    const gy = centroids.reduce((s, p) => s + p[1], 0) / centroids.length;
    const reach = Math.min(
      ...[Math.max, Math.min].flatMap((f) => [
        Math.abs(f(...centroids.map((p) => p[0])) - gx),
        Math.abs(f(...centroids.map((p) => p[1])) - gy),
      ]),
    );
    centroids.forEach(([x, y], i) => {
      if (Math.max(Math.abs(x - gx), Math.abs(y - gy)) > reach * CENTRE_REACH) return;
      const key = keyOf(source.cut(i));
      if (key === baseKey) return;
      const known = found.get(key);
      if (known) known.hits++;
      else found.set(key, { at: i, key, hits: 1 });
    });
  }
  return [...found.values()];
}

/** The boards past `first` worth keeping, most unlike the ones before first. */
function boardsOf(first: Level): Variant[] {
  const source = BOARD_SOURCES.get(first.key)!;
  const n0 = first.cells.length;
  const slack = Math.max(1, Math.round(TOLERANCE * n0));
  // as square as the first board, or nearly — and never squarer than 0.9 asked
  const square = Math.min(aspect(first) - 0.04, 0.9);
  const fit: { at: Variant; level: Level; hits: number }[] = [];
  const why: Record<string, number> = {};
  const no = (reason: string): void => void (why[reason] = (why[reason] ?? 0) + 1);
  const all = candidates(first);
  for (const c of all) {
    const level = source.make(c.at);
    if (Math.abs(level.cells.length - n0) > slack) no(`size ${level.cells.length}`);
    else if (aspect(level) < square || ratio(level) > WIDEST || ratio(level) < TALLEST)
      no("not square");
    else if (!isDisc(level)) no("not one outline");
    else if (!sameTray(first, level)) no("another tray");
    else if (ofPolygons(first) && !keepsConfigs(level)) no("a configuration missing");
    else fit.push({ at: c.at, level, hits: c.hits });
  }
  if (process.env.DEBUG)
    console.log(`  ${all.length} distinct, ${fit.length} fit (${n0} tiles):`, why);
  const chosen: number[][] = [features(first)];
  const out: Variant[] = [];
  const left = fit.slice();
  while (out.length < MAX[source.kind] - 1 && left.length > 0) {
    let best = 0;
    let score = -Infinity;
    left.forEach(({ level, hits }, i) => {
      const f = features(level);
      const apart = Math.min(...chosen.map((g) => distance(f, g)));
      // most unlike what is kept, then nearest the first board's size, then
      // the commonest cut
      const s = apart * 1e6 - Math.abs(level.cells.length - n0) * 1e3 + Math.min(hits, 999);
      if (s > score) [best, score] = [i, s];
    });
    const [pick] = left.splice(best, 1);
    chosen.push(features(pick!.level));
    out.push(pick!.at);
  }
  return out;
}

const path = fileURLToPath(new URL("../src/boards.json", import.meta.url));
const previous = JSON.parse(readFileSync(path, "utf8")) as { boards: Record<string, Variant[]> };
const boards: Record<string, Variant[]> = only.length ? { ...previous.boards } : {};
// Tile(1,1) and the Spectre are one board, straight and round: they share
// their windows.
const shared = new Map<string, Variant[]>();
for (const first of LEVELS) {
  if (!BOARD_SOURCES.has(first.key)) continue;
  if (only.length && !only.includes(first.key)) continue;
  const t0 = performance.now();
  const same = first.aperiodic
    ? `${first.aperiodic.mode}|${first.aperiodic.depth}|${first.aperiodic.keep}`
    : first.key;
  const list = shared.get(same) ?? boardsOf(first);
  shared.set(same, list);
  if (list.length) boards[first.key] = list;
  else delete boards[first.key];
  const ms = (performance.now() - t0).toFixed(0);
  console.log(`${first.key}: ${1 + list.length} boards (${ms} ms)`);
}
const comment =
  "Generated by scripts/find-boards.mts (npm run boards). Each tiling's boards past its first: a periodic window's square moved [i, j] steps of 1/grid of the tiling's domain and grown by a third, in quarter edges; an aperiodic builder's variant; or the tile a hat window is centred on. See src/levels.ts.";
// one tiling to a line, in the catalog's order
const rows = LEVELS.filter((l) => boards[l.key]).map(
  (l) => `    ${JSON.stringify(l.key)}: ${JSON.stringify(boards[l.key]).replace(/,/g, ", ")}`,
);
writeFileSync(
  path,
  `{\n  "_comment": ${JSON.stringify(comment)},\n  "grid": ${GRID},\n  "boards": {\n${rows.join(",\n")}\n  }\n}\n`,
);
console.log(`wrote ${rows.length} tilings' boards to ${path}`);
