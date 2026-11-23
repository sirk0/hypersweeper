import { readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const DIR = "tests/unit";
const ALL = [`${DIR}/**/*.test.ts`];

/** CI's shard of the unit tests (TEST_SHARD="i/n", tests/unit/shard.ts): the
 * files that take a slice of their own cases (they import ./shard) on every
 * shard, and each of the others on one, dealt round by name. Unset, all. */
function sharded(): string[] {
  const value = process.env.TEST_SHARD;
  if (!value) return ALL;
  const [index, count] = value.split("/").map(Number) as [number, number];
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".test.ts"))
    .sort();
  const slicing = (f: string): boolean =>
    /from "\.\/shard"/.test(readFileSync(`${DIR}/${f}`, "utf8"));
  const whole = files.filter((f) => !slicing(f));
  return [...files.filter(slicing), ...whole.filter((_, k) => k % count === index - 1)].map(
    (f) => `${DIR}/${f}`,
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: sharded(),
    globals: false,
  },
});
