// The worker half of src/extension.ts: a finished level's tiling, worked out
// off the page. The level is built here from its key (`levelByKey`, the same
// code as the page, so the same level), as the hint worker builds its own.

import { solveExtension, type ExtensionReply } from "./extension";
import { levelByKey } from "./levels";

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<string>) => void) | null;
  postMessage(reply: ExtensionReply, transfer: Transferable[]): void;
};

scope.onmessage = (ev) => {
  let reply: ExtensionReply = null;
  try {
    const level = levelByKey(ev.data);
    reply = level ? solveExtension(level) : null;
  } catch {
    reply = null;
  }
  scope.postMessage(reply, reply ? [reply.coords.buffer, reply.sizes.buffer] : []);
};
