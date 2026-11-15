// The page's side of the hint: after every move the board goes to the hint
// worker (hint.worker.ts), which works its hint out in the background, so by
// the time the player asks it is often ready; asking before it is waits for
// it ("thinking"). Where a worker cannot start or fails, the same search runs
// here on the page, in slices between frames.

import { HintSolver, runSliced, type Hint, type Laid } from "./hint";
import type { HintReply, HintRequest } from "./hint.worker";
import type { Level } from "./levels";

export class Hinter {
  private worker: Worker | null = null;
  private seq = 0;
  /** The current board's hint, once worked out. */
  private result: { seq: number; hint: Hint } | null = null;
  private waiting: ((hint: Hint) => void)[] = [];
  /** The current board, for working it out on the page instead. */
  private board: { level: Level; laid: Laid[] } | null = null;
  private local: HintSolver | null = null;

  constructor() {
    try {
      this.worker = new Worker(new URL("./hint.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (ev: MessageEvent<HintReply>) => {
        const reply = ev.data;
        if ("error" in reply) this.fallBack();
        else this.settle(reply.seq, reply.hint);
      };
      this.worker.onerror = () => this.fallBack();
    } catch {
      this.worker = null;
    }
  }

  /** The board has changed (or a level opened): start on its hint. */
  update(level: Level, laid: Laid[]): void {
    this.seq++;
    this.result = null;
    this.board = { level, laid };
    if (this.worker) {
      const request: HintRequest = { seq: this.seq, level: level.key, laid };
      this.worker.postMessage(request);
    } else if (this.waiting.length > 0) this.runHere();
  }

  /** Whether the current board's hint is ready. */
  get ready(): boolean {
    return this.result?.seq === this.seq;
  }

  /** The current board's hint, once it is worked out — the board as it is
   * then, should it change meanwhile. */
  hint(): Promise<Hint> {
    if (this.result && this.result.seq === this.seq) return Promise.resolve(this.result.hint);
    const out = new Promise<Hint>((resolve) => this.waiting.push(resolve));
    // on the page, a hint is worked out only when asked for
    if (!this.worker && this.waiting.length === 1) this.runHere();
    return out;
  }

  private settle(seq: number, hint: Hint): void {
    if (seq !== this.seq) return;
    this.result = { seq, hint };
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve(hint);
  }

  /** The worker failed: work hints out on the page from now on. */
  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.waiting.length > 0) this.runHere();
  }

  private runHere(): void {
    const board = this.board;
    if (!board) return;
    const seq = this.seq;
    if (this.local?.level !== board.level) this.local = new HintSolver(board.level);
    void runSliced(this.local.hint(board.laid), () => seq !== this.seq).then((hint) => {
      if (hint !== undefined) this.settle(seq, hint);
    });
  }
}
