// The tiling a finished level was cut from, carried on past its edge: what the
// board draws round the region once it is covered, as outlines only, out to
// the edges of the screen (`SvgBoard.showBeyond`), when the player has it on
// (src/preferences.ts) — a level is one window onto a tiling that goes on. The
// geometry is `geometry/extension.ts`; this is where a level's tiling comes
// from.
//
// - **A periodic level** (the uniform, 2-uniform, Laves, 2-isohedral, bond,
//   pentagonal, isogonal, star and periodic girih windows, and the rep-tiles that are cut from a
//   lattice) is carried on from its own tiles — or, where its window is too
//   small to hold a whole period, from a wider window of the same tiling round
//   it (`periodicContext`, already in the window's coordinates).
// - **The rest** — the aperiodic windows, the hat's family, the self-similar
//   girih pattern, the tilings Rep-tiles grows itself (`GROWN`), the spirals, the
//   rep-tiles, the Socolar–Taylor tile — are found in bigger patches their own
//   builders grow: the whole patch a window was cut from and deeper ones, more
//   rings, more inflations.
//
// The levels are small (two or three dozen tiles), so a patch of a few
// thousand reaches far past any zoom out; the search still runs in a worker
// (extension.worker.ts), as building the deeper patches exactly takes a moment.

import type { Vertex } from "@tiling/geometry";
import { aperiodicPatch } from "./geometry/aperiodic";
import {
  grownExtension,
  listedExtension,
  periodicExtension,
  placeIn,
  type TilingExtension,
} from "./geometry/extension";
import type { Cyc, Ring } from "./geometry/cyclotomic";
import { hatPatch } from "./geometry/hat";
import { girihWindow } from "./geometry/girih";
import { grownWindow } from "./geometry/grown";
import { piecePatch } from "./geometry/pieces";
import { repTilePatch } from "./geometry/repTile";
import { socolarTaylorPatch } from "./geometry/socolarTaylor";
import { spiralPatch } from "./geometry/spiral";
import { levelByKey, paintedBox, periodicContext, type Level } from "./levels";

/** Every piece of every tile as a polygon in board units — the outlines only
 * care where the lines are, so a tile of several pieces is its pieces. */
function polygons(ring: Ring, cells: readonly (readonly { verts: Cyc[] }[])[]): Vertex[][] {
  return cells.flatMap((cell) => cell.map((p) => p.verts.map((v): Vertex => ring.toXY(v))));
}

/** The same, for a patch whose cells are bare vertex lists. */
function plain(ring: Ring, cells: readonly (readonly Cyc[])[]): Vertex[][] {
  return cells.map((c) => c.map((v): Vertex => ring.toXY(v)));
}

/** The point a level is framed about: the middle of its region's reach, as
 * the board's camera centres it at zoom 1 (`SvgBoard.clamp`). */
export function levelMid(level: Level): Vertex {
  const xy = level.region.flat().map((v) => level.ring.toXY(v));
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** How far round the level the tiling should reach, in board units: far
 * enough for the furthest zoom out (`SvgBoard`'s `WON_MIN_ZOOM`) on any screen
 * shape. */
export function wantedReach(level: Level): number {
  const xy = level.region.flat().map((v) => level.ring.toXY(v));
  const w = Math.max(...xy.map((p) => p[0])) - Math.min(...xy.map((p) => p[0]));
  const h = Math.max(...xy.map((p) => p[1])) - Math.min(...xy.map((p) => p[1]));
  return 3 * Math.hypot(w, h);
}

/** The most patches a level is searched in, and the most tiles one may hold. */
const MAX_PATCHES = 4;
const MAX_TILES = 8000;

/** Bigger and bigger patches of the tiling a non-periodic level is cut from,
 * built lazily, or null for a level that is periodic. */
function grown(level: Level): Iterable<Vertex[][]> | null {
  const sizes = (make: (k: number) => Vertex[][] | null): Iterable<Vertex[][]> => ({
    *[Symbol.iterator]() {
      let last = 0;
      for (let k = 0; k < MAX_PATCHES; k++) {
        let patch: Vertex[][] | null;
        try {
          patch = make(k);
        } catch {
          return; // past the last size its builder has
        }
        if (!patch || patch.length <= last) return;
        last = patch.length;
        yield patch;
        if (patch.length > MAX_TILES) return;
      }
    },
  });
  const { aperiodic, hat, girih, grown, spiral, inflations, pieceTile, socolarTaylor } = level;
  if (aperiodic) {
    const { mode, depth, variant } = aperiodic;
    // the whole patch the window was cut from, then deeper ones; a round tile
    // keeps its flat corner, as its level does
    const round = level.regionCurves !== undefined;
    return sizes((k) => {
      const { ring, cells } = aperiodicPatch(mode, depth + k, null, round, variant);
      return plain(ring, cells);
    });
  }
  if (hat) {
    return sizes((k) => {
      const { ring, cells } = hatPatch(hat.tile, hat.depth + k, Number.MAX_SAFE_INTEGER);
      return plain(ring, cells);
    });
  }
  if (girih) {
    return sizes((k) => {
      const { ring, cells } = girihWindow(girih.depth + k, null);
      return plain(ring, cells);
    });
  }
  if (grown) {
    return sizes((k) => {
      const { ring, cells } = grownWindow(level.base, grown.depth + k, null);
      return plain(ring, cells);
    });
  }
  if (spiral) {
    return sizes((k) => {
      const { ring, cells } = spiralPatch(level.base, spiral.rings * 2 ** (k + 1), null);
      return plain(ring, cells);
    });
  }
  if (inflations !== undefined) {
    return sizes((k) => {
      const { ring, cells } = repTilePatch(level.base, inflations + k + 1);
      return plain(ring, cells);
    });
  }
  if (pieceTile) {
    return sizes((k) => {
      const { ring, cells } = piecePatch(level.base, pieceTile.inflations + k + 1);
      return cells.flatMap((cell) => plain(ring, cell));
    });
  }
  if (socolarTaylor) {
    return sizes((k) => {
      const { ring, cells } = socolarTaylorPatch(socolarTaylor.rings + k + 1);
      return cells.flatMap((cell) => plain(ring, cell));
    });
  }
  return null;
}

/** The tiling round a level, in its board units, or null where none is found.
 * A rep-tile is tried as periodic first: most of them are cut from a lattice
 * (the right isosceles triangle, the drafter, the T-tetromino, the kissing
 * squares), which then reaches without end, where a grown patch of one is a
 * bigger copy of the tile that the level sits in a corner of. */
export function levelExtension(level: Level, want = wantedReach(level)): TilingExtension | null {
  const cells = polygons(level.ring, level.cells);
  const mid = levelMid(level);
  // a marked level is its plain level's board: what that is cut from, it is
  const plain = (level.decor && levelByKey(level.decor.of)) || level;
  const patches = grown(plain);
  const repTile = plain.inflations !== undefined || plain.pieceTile !== undefined;
  if (patches && !repTile) return grownExtension(cells, mid, patches, want);
  const own = periodicExtension(cells, mid) ?? (repTile ? null : widerPeriod(plain, cells, mid));
  if (own || !patches) return own;
  return grownExtension(cells, mid, patches, want);
}

/** A periodic level whose window is too small to hold a whole period (a
 * 2-uniform tiling with a long one): its tiling measured off a window three
 * times as wide cut with its tiling's first board (`periodicContext`), found
 * round the level wherever its own board was cut. */
function widerPeriod(plain: Level, cells: Vertex[][], mid: Vertex): TilingExtension | null {
  const first = levelByKey(plain.base);
  const box = first && paintedBox(first.key);
  if (!first || box === undefined) return null;
  let wide: Vertex[][];
  try {
    wide = polygons(first.ring, periodicContext(first, box, 3, true));
  } catch {
    return null; // a tiling no wider window is cut of
  }
  const place = placeIn(cells, mid, wide);
  if (!place) return null;
  return periodicExtension(
    cells,
    mid,
    wide.map((c) => c.map(place.from)),
  );
}

/** What the worker answers for a level: the tiles round it within the reach
 * it was asked for, as one flat list of coordinates (`sizes` says how many
 * corners each has) — or null, when the level has none. */
export type ExtensionReply = {
  key: string;
  coords: Float64Array;
  sizes: Uint16Array;
  tile: number;
} | null;

/** The worker's whole job (extension.worker.ts), also run on the page when
 * there is no worker: a level's tiling, listed out to `wantedReach`. */
export function solveExtension(level: Level): ExtensionReply {
  const want = wantedReach(level);
  const ext = levelExtension(level, want);
  if (!ext) return null;
  const cells = ext.cells(want);
  const sizes = Uint16Array.from(cells, (c) => c.length);
  const coords = new Float64Array(sizes.reduce((s, n) => s + 2 * n, 0));
  let at = 0;
  for (const poly of cells) {
    for (const [x, y] of poly) {
      coords[at++] = x;
      coords[at++] = y;
    }
  }
  return { key: level.key, coords, sizes, tile: ext.tile };
}

/** A reply read back into tiles, round the level it was asked for. */
export function fromReply(level: Level, reply: ExtensionReply): TilingExtension | null {
  if (!reply) return null;
  const cells: Vertex[][] = [];
  let at = 0;
  for (const n of reply.sizes) {
    const poly: Vertex[] = [];
    for (let i = 0; i < n; i++, at += 2) poly.push([reply.coords[at]!, reply.coords[at + 1]!]);
    cells.push(poly);
  }
  return listedExtension(cells, levelMid(level), reply.tile);
}

/** A finished level's tiling, worked out off the page where a worker can
 * start (building the deeper patches exactly takes a moment, a second or two
 * on a phone), on it a moment after the win otherwise. */
export function findExtension(level: Level): Promise<TilingExtension | null> {
  return new Promise((resolve) => {
    const here = () =>
      setTimeout(() => {
        try {
          resolve(fromReply(level, solveExtension(level)));
        } catch {
          resolve(null);
        }
      }, 600);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./extension.worker.ts", import.meta.url), { type: "module" });
    } catch {
      here();
      return;
    }
    worker.onmessage = (ev: MessageEvent<ExtensionReply>) => {
      worker.terminate();
      resolve(fromReply(level, ev.data));
    };
    worker.onerror = () => {
      worker.terminate();
      here();
    };
    worker.postMessage(level.key);
  });
}
