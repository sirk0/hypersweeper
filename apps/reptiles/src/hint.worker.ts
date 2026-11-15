// The hint search's own thread: the game posts the board after every move
// (hintClient.ts), and this works out its hint in the background — exactly,
// however long that takes — so a press of the hint button usually finds it
// ready. A newer board drops the search for the older one. The level is built
// here from its key (`levelByKey`, the same code as the page, so the same
// level, kind for kind), and its solver kept, with the frontiers it has found
// dead, while the level stays the same.

import { HintSolver, runSliced, type Hint, type Laid } from "./hint";
import { levelByKey } from "./levels";

export interface HintRequest {
  seq: number;
  level: string;
  laid: Laid[];
}

export type HintReply = { seq: number; hint: Hint } | { seq: number; error: string };

const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<HintRequest>) => void) | null;
  postMessage(reply: HintReply): void;
};

let latest = 0;
let solver: HintSolver | null = null;

scope.onmessage = (ev) => {
  latest = ev.data.seq;
  void work(ev.data);
};

async function work({ seq, level, laid }: HintRequest): Promise<void> {
  try {
    if (solver?.level.key !== level) {
      const built = levelByKey(level);
      if (!built) throw new Error(`no level ${level}`);
      solver = new HintSolver(built);
    }
    const hint = await runSliced(solver.hint(laid), () => seq !== latest);
    if (hint !== undefined) scope.postMessage({ seq, hint });
  } catch (err) {
    scope.postMessage({ seq, error: String(err) });
  }
}
