// CI's unit-test shards (packaging.json `ci.unitShards`, the game-unit job):
// TEST_SHARD="i/n" says which of n runners this is. Vitest's own `--shard`
// splits by file, which cannot help here — puzzle.test.ts alone is four and a
// half minutes of one worker, its tests one after another — so the long files
// split themselves by test case instead: each wraps its per-level and
// per-board lists in `part`, and runs on every shard with its slice of them.
// vitest.config.ts runs every file that imports this module on every shard,
// and deals each of the others to one.
//
// Unset (`npm run test`, `vitest related`), `part` keeps everything.

/** This runner's shard, 1-based, of how many; [1, 1] when unsharded. */
export function shardOf(value = process.env.TEST_SHARD): [index: number, count: number] {
  if (!value) return [1, 1];
  const m = /^(\d+)\/(\d+)$/.exec(value);
  const index = Number(m?.[1]);
  const count = Number(m?.[2]);
  if (!m || count < 1 || index < 1 || index > count) {
    throw new Error(`TEST_SHARD must be "i/n" with 1 <= i <= n, not ${JSON.stringify(value)}`);
  }
  return [index, count];
}

/** This shard's share of `items`: every n-th, from the i-th. Dealt round
 * rather than cut in runs, so neighbours of like cost — a tiling's boards,
 * one after another — spread over the shards. */
export function part<T>(items: readonly T[]): T[] {
  const [index, count] = shardOf();
  return items.filter((_, k) => k % count === index - 1);
}
