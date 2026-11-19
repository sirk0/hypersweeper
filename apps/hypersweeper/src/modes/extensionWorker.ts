// The worker half of modes/extensionTask.ts: rebuild the won board, grow its
// tiling and find it in there, off the main thread.

import type { Board } from "@tiling/geometry";
import { solveExtension, type ExtensionReply, type ExtensionRequest } from "./extensionTask";
import { buildBoard } from "./presets";

self.onmessage = (e: MessageEvent<ExtensionRequest>) => {
  let reply: ExtensionReply = null;
  try {
    const board = buildBoard(e.data.mode, e.data.difficulty, e.data.seed) as Board;
    reply = solveExtension(board, e.data);
  } catch {
    reply = null;
  }
  const transfer = reply ? [reply.coords.buffer, reply.sizes.buffer] : [];
  (self as unknown as Worker).postMessage(reply, transfer);
};
