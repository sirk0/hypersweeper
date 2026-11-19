// Finding a won board's surrounding tiling (modes/extension.ts) without
// stalling the win.
//
// A periodic board's is measured off the board in a few milliseconds, here. A
// board that is not periodic has to have a bigger patch of its tiling built and
// searched, which on a phone can take a second or two — so that runs in a
// worker (extensionWorker.ts), which rebuilds the board from its mode,
// difficulty and seed (the same board: `buildBoard` is deterministic) and sends
// back the outline tiles. Where a worker cannot be started (an embedding that
// refuses one), it runs here after all, a moment after the win, so the
// celebration gets its first frames first.

import { listedExtension, type Board, type TilingExtension, type Vertex } from "@tiling/geometry";
import { boardExtension } from "./extension";
import { grownBoards, grows } from "./presets";

/** What the worker is asked. */
export interface ExtensionRequest {
  mode: string;
  difficulty: string;
  seed: number;
  want: number;
}

/** What it answers: the tiles as one flat list of coordinates, `sizes` saying
 * how many corners each has — or null, when there is no extension. */
export type ExtensionReply = {
  coords: Float64Array;
  sizes: Uint16Array;
  tile: number;
} | null;

/** How far round the board the tiling should reach: far enough for the
 * furthest zoom out (render/renderer.ts `minZoom`) on any screen shape. */
export function wantedReach(board: Board): number {
  return 6 * Math.hypot(board.width, board.height);
}

/** The worker's whole job, also run here when there is no worker. */
export function solveExtension(board: Board, req: ExtensionRequest): ExtensionReply {
  const ext = boardExtension(board, grownBoards(req.mode, req.difficulty), req.want);
  if (!ext) return null;
  const cells = ext.cells(Infinity);
  const sizes = Uint16Array.from(cells, (c) => c.length);
  const coords = new Float64Array(sizes.reduce((s, n) => s + 2 * n, 0));
  let at = 0;
  for (const poly of cells) {
    for (const [x, y] of poly) {
      coords[at++] = x;
      coords[at++] = y;
    }
  }
  return { coords, sizes, tile: ext.tile };
}

function fromReply(board: Board, reply: ExtensionReply): TilingExtension | null {
  if (!reply) return null;
  const cells: Vertex[][] = [];
  let at = 0;
  for (const n of reply.sizes) {
    const poly: Vertex[] = [];
    for (let i = 0; i < n; i++, at += 2) poly.push([reply.coords[at]!, reply.coords[at + 1]!]);
    cells.push(poly);
  }
  return listedExtension(cells, [board.width / 2, board.height / 2], reply.tile);
}

/** The tiling round `board`, a won game's flat board, built from its mode,
 * difficulty and the seed it was dealt from — null where it has none. */
export function findExtension(
  board: Board,
  mode: string,
  difficulty: string,
  seed: number,
): Promise<TilingExtension | null> {
  if (board.disc || board.halfPlane || board.faces) return Promise.resolve(null);
  if (!grows(mode)) return Promise.resolve(boardExtension(board, null));
  const req: ExtensionRequest = { mode, difficulty, seed, want: wantedReach(board) };
  return new Promise((resolve) => {
    const here = () =>
      setTimeout(() => {
        try {
          resolve(fromReply(board, solveExtension(board, req)));
        } catch {
          resolve(null);
        }
      }, 600);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./extensionWorker.ts", import.meta.url), { type: "module" });
    } catch {
      here();
      return;
    }
    worker.onmessage = (e: MessageEvent<ExtensionReply>) => {
      worker.terminate();
      resolve(fromReply(board, e.data));
    };
    worker.onerror = () => {
      worker.terminate();
      here();
    };
    worker.postMessage(req);
  });
}
