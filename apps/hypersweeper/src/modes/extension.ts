// The tiling a won board was cut from, carried on past the board's edge: the
// outlines the renderer draws round a flat board once it is won, to show that
// the board was one window onto a tiling that goes on (render/extension.ts).
//
// The geometry is `@tiling/geometry`'s (packages/geometry/src/extension.ts),
// shared with Rep-tiles; this is Hypersweeper's side of it: which boards have a
// tiling to carry on, and that a board measures from its own middle.
//
// - **A periodic board** (the regular lattices, every Archimedean/Laves/k-
//   uniform/bond board) is carried on from the board alone.
// - **Anything else** (the aperiodic patches, the spirals, the rep-tiles) is
//   found in bigger patches of its tiling, which its own builder grows
//   (modes/presets.ts `grownBoards`).

import {
  grownExtension,
  periodicExtension,
  type Board,
  type TilingExtension,
  type Vertex,
} from "@tiling/geometry";

/** A board's tiles, as the shared geometry takes them. */
const cellsOf = (board: Board): Vertex[][] => [...board.polygons.values()];

/** The point a flat board is framed about (render/polygonBoard.ts). */
const midOf = (board: Board): Vertex => [board.width / 2, board.height / 2];

/**
 * The tiling round a flat board, or null where there is none to show: a board
 * in a model of a curved plane (the hyperbolic boards), or one neither periodic
 * nor found in a bigger patch.
 *
 * `grow` is the bigger patches of the board's own tiling, the smallest first
 * (modes/presets.ts `grownBoards`), or null for a board whose builder has none.
 * A board that has them is found in them and is not tried as periodic: the
 * Sierpinski carpet's squares sit on a lattice, but its holes do not, and the
 * plain grid that lattice would carry on with is not the carpet. Of the
 * patches, the first that reaches `want` pixels from the board's centre is
 * kept, else the furthest-reaching.
 */
export function boardExtension(
  board: Board,
  grow: Iterable<Board> | null,
  want = Infinity,
): TilingExtension | null {
  if (board.disc || board.halfPlane || board.faces) return null;
  if (!grow) return periodicExtension(cellsOf(board), midOf(board));
  return grownExtension(cellsOf(board), midOf(board), mapIter(grow, cellsOf), want);
}

function* mapIter<A, B>(items: Iterable<A>, f: (a: A) => B): Iterable<B> {
  for (const a of items) yield f(a);
}
