// The pieces of scripts/new-game.mjs that decide something, kept apart from
// the file copying and npm runs so they can be unit-tested
// (scripts/test/scaffold.test.mjs).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A game's key is its folder (apps/<key>), npm package name, Pages project
 * and *.pages.dev subdomain, so it is held to what all four accept. */
export function checkKey(key, root) {
  if (!/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(key) || key.includes("--")) {
    return `"${key}" is not a key: lowercase letters, digits and single hyphens, 3–32 characters, starting with a letter`;
  }
  if (existsSync(join(root, "apps", key))) return `apps/${key} already exists`;
  if (["packages", "data", "shells", "templates"].includes(key)) return `"${key}" is reserved`;
  return null;
}

/** The desktop bundle identifier: reverse-DNS, no hyphens. */
export function appIdFor(key) {
  return `com.sirk0.${key.replace(/-/g, "")}`;
}

/** A `vite preview` port of the game's own, so every game's smoke test can run
 * at once: one past the highest any game already claims (from 4175). */
export function nextPreviewPort(root) {
  let highest = 4174;
  const apps = join(root, "apps");
  for (const name of readdirSync(apps)) {
    for (const file of ["vite.config.ts", "playwright.config.ts"]) {
      const path = join(apps, name, file);
      if (!existsSync(path)) continue;
      for (const m of readFileSync(path, "utf8").matchAll(/\b(4\d{3})\b/g)) {
        highest = Math.max(highest, Number(m[1]));
      }
    }
  }
  return highest + 1;
}

/** Fill the template's tokens. */
export function render(text, tokens) {
  return text.replace(/__([A-Z_]+)__/g, (whole, name) =>
    Object.hasOwn(tokens, name) ? String(tokens[name]) : whole,
  );
}

/** The dev tools a game needs, at the versions the flagship already locks —
 * the exact Playwright pin included — so a new game adds nothing new to the
 * lockfile. */
export function devDependencies(root) {
  const flagship = JSON.parse(
    readFileSync(join(root, "apps/hypersweeper/package.json"), "utf8"),
  ).devDependencies;
  const wanted = [
    "@playwright/test",
    "@types/node",
    "typescript",
    "vite",
    "vite-plugin-pwa",
    "vitest",
  ];
  const deps = { "@tiling/vite-preset": "*" };
  for (const name of wanted) {
    if (!flagship[name]) throw new Error(`apps/hypersweeper/package.json has no ${name}`);
    deps[name] = flagship[name];
  }
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

/** The Docker e2e runner installs the workspace from manifests alone, so it
 * lists every workspace's package.json (apps/hypersweeper/Dockerfile.e2e) and
 * lets each through the root .dockerignore; a new game joins both lists, next
 * to the other games. Returns the two files' new text. */
export function registerDocker(dockerfile, dockerignore, key) {
  const copy = `COPY apps/${key}/package.json apps/${key}/`;
  const allow = `!apps/${key}/package.json`;
  const insertAfterLast = (text, prefix, line) => {
    const lines = text.split("\n");
    const at = lines.findLastIndex((l) => l.startsWith(prefix));
    if (at < 0) throw new Error(`no line starting "${prefix}" to add ${line} after`);
    lines.splice(at + 1, 0, line);
    return lines.join("\n");
  };
  return {
    dockerfile: dockerfile.includes(copy)
      ? dockerfile
      : insertAfterLast(dockerfile, "COPY apps/", copy),
    dockerignore: dockerignore.includes(allow)
      ? dockerignore
      : insertAfterLast(dockerignore, "!apps/", allow),
  };
}
