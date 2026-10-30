import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `src/boards/` is the geometry, kept apart from the game so that other games
// can be built on the same boards (see the header of src/boards/index.ts).
// Nothing typechecks a module boundary, and an agent reaching for a helper will
// import it from wherever it lives, so the rules are held here:
//
//   1. the geometry imports nothing from outside its folder — no game code, no
//      `@data`, no package;
//   2. inside the folder, modules import each other directly, never through
//      the index (which would close an import cycle);
//   3. everything outside imports the geometry through the index alone.
//
// The unit tests are left out of rule 3 on purpose: most of them are the
// geometry's own tests, and they reach the internals they test.

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BOARDS = join(WEB, "src/boards");
const INDEX = join(BOARDS, "index.ts");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.m?ts$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Every module a file imports or re-exports, static or dynamic. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const found = [
    ...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gms),
    ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
  ];
  return found.map((m) => m[1]!);
}

const rel = (path: string): string => relative(WEB, path);

describe("the geometry's boundary (src/boards)", () => {
  const inside = sources(BOARDS);

  it("finds the geometry's modules", () => {
    expect(inside.length).toBeGreaterThan(10);
    expect(inside).toContain(INDEX);
  });

  it("imports nothing from outside its own folder", () => {
    const leaks = inside.flatMap((file) =>
      specifiers(file)
        .filter((spec) => !spec.startsWith(".") || dirname(resolve(dirname(file), spec)) !== BOARDS)
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(leaks).toEqual([]);
  });

  it("imports its own modules directly, never through the index", () => {
    const viaIndex = inside
      .filter((file) => file !== INDEX)
      .flatMap((file) =>
        specifiers(file)
          .filter((spec) => [BOARDS, join(BOARDS, "index")].includes(resolve(dirname(file), spec)))
          .map((spec) => `${rel(file)} -> ${spec}`),
      );
    expect(viaIndex).toEqual([]);
  });

  it("knows nothing of mines", () => {
    const mentions = inside.filter((file) => /\bmineCount\b/.test(readFileSync(file, "utf8")));
    expect(mentions.map(rel)).toEqual([]);
  });

  it("is imported from outside through the index alone", () => {
    const outside = ["src", "scripts", "functions"]
      .flatMap((dir) => sources(join(WEB, dir)))
      .filter((file) => !file.startsWith(BOARDS + "/"));
    const reachingIn = outside.flatMap((file) =>
      specifiers(file)
        .filter((spec) => spec.startsWith("."))
        .filter((spec) => {
          const target = resolve(dirname(file), spec);
          return target.startsWith(BOARDS + "/") && target !== join(BOARDS, "index");
        })
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(reachingIn).toEqual([]);
  });
});
