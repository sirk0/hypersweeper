#!/usr/bin/env node
// Scaffold a new game: apps/<key>/, written from templates/game/ (a small but
// complete game on the shared packages — build, PWA, security headers, unit
// test, Playwright smoke test, icons, desktop packaging), and registered with
// the one list that is not read from the games' own packaging.json: the Docker
// e2e runner's manifests. CI, the deploy, the PR previews and the version bump
// find the game by itself (scripts/games.mjs). See docs/agents/new-game.md.
//
//   node scripts/new-game.mjs <key> "<Title>" [--no-install]
//
// e.g. node scripts/new-game.mjs tile-slide "Tile Slide"
//
// Then: create the Cloudflare Pages project <key> (production branch master),
// replace the template game, redraw the icons, and open a pull request.
import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appIdFor,
  checkKey,
  devDependencies,
  nextPreviewPort,
  registerDocker,
  render,
} from "./lib/scaffold.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const install = !args.includes("--no-install");
const [key, title] = args.filter((a) => !a.startsWith("--"));

function die(message) {
  console.error(`new-game: ${message}`);
  process.exit(1);
}

if (!key || !title) die('usage: node scripts/new-game.mjs <key> "<Title>" [--no-install]');
const problem = checkKey(key, ROOT);
if (problem) die(problem);

const dir = join(ROOT, "apps", key);
const tokens = { KEY: key, TITLE: title, APP_ID: appIdFor(key), PORT: nextPreviewPort(ROOT) };

// 1. The files, tokens filled in. Binary files are copied as they are.
const TEXT = new Set([".json", ".ts", ".mts", ".html", ".css", ".md", ".toml", ""]);
cpSync(join(ROOT, "templates/game"), dir, { recursive: true });
(function fill(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) fill(path);
    else if (TEXT.has(extname(name)) || name.startsWith(".")) {
      writeFileSync(path, render(readFileSync(path, "utf8"), tokens));
    }
  }
})(dir);
const pkgPath = join(dir, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.devDependencies = devDependencies(ROOT);
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`wrote apps/${key}/ (preview port ${tokens.PORT})`);

// 2. The Docker e2e runner's manifest lists.
const dockerfilePath = join(ROOT, "apps/hypersweeper/Dockerfile.e2e");
const ignorePath = join(ROOT, ".dockerignore");
const docker = registerDocker(
  readFileSync(dockerfilePath, "utf8"),
  readFileSync(ignorePath, "utf8"),
  key,
);
writeFileSync(dockerfilePath, docker.dockerfile);
writeFileSync(ignorePath, docker.dockerignore);
console.log("registered it with the Docker e2e runner (Dockerfile.e2e, .dockerignore)");

// 3. Install (the root workspace picks apps/* up by itself), draw the icons,
//    and format what the tokens may have lengthened.
if (install) {
  const run = (cmd, argv, cwd) => execFileSync(cmd, argv, { cwd, stdio: "inherit" });
  run("npm", ["install", "--no-audit", "--no-fund"], ROOT);
  run("npm", ["run", "icons"], dir);
  run("npx", ["prettier", "--write", "--log-level", "warn", "."], dir);
}

console.log(`
${title} is in apps/${key}/. Next (docs/agents/new-game.md):
  1. Create the Cloudflare Pages project "${key}" (direct upload, production
     branch master), or the deploy and PR preview will fail for it.
  2. cd apps/${key} && npm run dev — and replace the template game.
  3. npm run icons after changing the picture in scripts/make-icons.mts.
  4. Commit (including package-lock.json) and open a pull request.`);
