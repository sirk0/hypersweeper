import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// `packages/geometry` is the geometry every game in this repo is built on,
// kept apart from any one game. Nothing typechecks a module boundary, and an
// agent reaching for a helper will import it from wherever it lives, so the
// rules are held here:
//
//   1. the geometry imports nothing from outside its own folder — no game
//      code, no `@tiling/data`, no package;
//   2. inside the folder, modules import each other directly, never through
//      the index (which would close an import cycle);
//   3. a game imports the geometry as `@tiling/geometry` — the index — alone:
//      never a deep path into it, never a relative path into packages/;
//   4. no package imports a game, and no game imports another game.
//
// Unit tests are left out of rule 3 on purpose: the geometry's own tests, and
// the games' tests of how they use it, reach the internals they test
// (`@tiling/geometry/<module>`, which the package's `exports` allow).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = join(ROOT, "packages/geometry/src");
const INDEX = join(SRC, "index.ts");
const APPS = join(ROOT, "apps");
const PACKAGES = join(ROOT, "packages");

function sources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
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

const rel = (path: string): string => relative(ROOT, path);
const dirs = (parent: string): string[] =>
  readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((path) => statSync(path).isDirectory());

/** A game's own code: what ships, and the scripts that build its assets. */
const gameSources = (app: string): string[] =>
  ["src", "scripts", "functions"].flatMap((dir) => sources(join(app, dir)));

describe("the geometry's boundary (packages/geometry)", () => {
  const inside = sources(SRC);

  it("finds the geometry's modules", () => {
    expect(inside.length).toBeGreaterThan(10);
    expect(inside).toContain(INDEX);
  });

  it("imports nothing from outside its own folder", () => {
    const leaks = inside.flatMap((file) =>
      specifiers(file)
        .filter((spec) => !spec.startsWith(".") || dirname(resolve(dirname(file), spec)) !== SRC)
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(leaks).toEqual([]);
  });

  it("imports its own modules directly, never through the index", () => {
    const viaIndex = inside
      .filter((file) => file !== INDEX)
      .flatMap((file) =>
        specifiers(file)
          .filter((spec) => [SRC, join(SRC, "index")].includes(resolve(dirname(file), spec)))
          .map((spec) => `${rel(file)} -> ${spec}`),
      );
    expect(viaIndex).toEqual([]);
  });

  it("knows nothing of mines", () => {
    const mentions = inside.filter((file) => /\bmineCount\b/.test(readFileSync(file, "utf8")));
    expect(mentions.map(rel)).toEqual([]);
  });

  it("is imported by the games as `@tiling/geometry` alone", () => {
    const reachingIn = dirs(APPS)
      .flatMap(gameSources)
      .flatMap((file) =>
        specifiers(file)
          .filter(
            (spec) =>
              spec.startsWith("@tiling/geometry/") ||
              (spec.startsWith(".") && resolve(dirname(file), spec).startsWith(PACKAGES + "/")),
          )
          .map((spec) => `${rel(file)} -> ${spec}`),
      );
    expect(reachingIn).toEqual([]);
  });
});

describe("workspace boundaries", () => {
  const apps = dirs(APPS);

  it("finds the games", () => {
    expect(apps.map(rel)).toEqual(expect.arrayContaining(["apps/hypersweeper", "apps/reptiles"]));
  });

  it("no package imports a game", () => {
    const appNames = apps.map(
      (app) =>
        (JSON.parse(readFileSync(join(app, "package.json"), "utf8")) as { name: string }).name,
    );
    const leaks = dirs(PACKAGES)
      .flatMap((pkg) => sources(pkg))
      .flatMap((file) =>
        specifiers(file)
          .filter(
            (spec) =>
              appNames.some((name) => spec === name || spec.startsWith(name + "/")) ||
              (spec.startsWith(".") && resolve(dirname(file), spec).startsWith(APPS + "/")),
          )
          .map((spec) => `${rel(file)} -> ${spec}`),
      );
    expect(leaks).toEqual([]);
  });

  it("no game imports another game", () => {
    const crossing = apps.flatMap((app) =>
      ["src", "scripts", "functions", "tests"]
        .flatMap((dir) => sources(join(app, dir)))
        .flatMap((file) =>
          specifiers(file)
            .filter((spec) => {
              if (!spec.startsWith(".")) return false;
              const target = resolve(dirname(file), spec);
              return target.startsWith(APPS + "/") && !target.startsWith(app + "/");
            })
            .map((spec) => `${rel(file)} -> ${spec}`),
        ),
    );
    expect(crossing).toEqual([]);
  });
});
