#!/usr/bin/env node
// Build the shared site, https://tiling-games.pages.dev/ (site/site.json): the
// landing page at its root and every game in a folder of its own, as one
// Cloudflare Pages upload. Or the redirect site a game leaves behind on the
// Pages project it moved away from.
//
//   node scripts/build-site.mjs site --mode production|preview \
//     [--site-url <url>] [--out site/dist]
//   node scripts/build-site.mjs moved <project> --out <dir>
//
// `site` builds each game it includes with `npm run build` in apps/<game>,
// with VITE_BASE=/<path>/ and VITE_SITE_URL=<site-url><path>/, and copies its
// dist/ to <out>/<path>/. The rest of the build's environment passes through:
// the PR preview sets VITE_NO_SW=1 and GITHUB_SHA. Which games it includes:
//
//   production  the games without a Pages project of their own; each game
//               with one gets a 302 from its folder to its own site instead
//   preview     every game, so a PR is one preview with every game in it
//
// Cloudflare reads _headers and _redirects at the root of the upload only, so
// each game's are moved under its folder and joined into the root files
// (scripts/lib/site.mjs). A preview also gets `X-Robots-Tag: noindex`.
//
// `moved` writes, for a Pages project a game has left (packaging.json
// `web.movedFrom`): a 301 for each path it used to serve, a service worker that
// retires the old one, and a 404 page that redirects too.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listGames, readSite } from "./lib/games.mjs";
import {
  KILL_SWITCH_WORKER,
  movedNotFound,
  movedRedirects,
  NOINDEX_HEADERS,
  prefixHeaders,
  prefixRedirects,
  renderLanding,
  standaloneRedirects,
} from "./lib/site.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];

function option(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
}

function die(message) {
  console.error(`build-site: ${message}`);
  process.exit(1);
}

const games = listGames(ROOT).filter((g) => g.web);
const site = readSite(ROOT);

if (command === "site") {
  const mode = option("mode");
  if (mode !== "production" && mode !== "preview") die("--mode must be production or preview");
  const siteUrl = option("site-url", site.url).replace(/\/*$/, "/");
  const out = resolve(option("out", join(ROOT, "site/dist")));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const headers = [readFileSync(join(ROOT, "site/_headers"), "utf8").trimEnd()];
  const redirects = [];
  const icons = new Set();

  for (const game of games) {
    const prefix = `/${game.web.path}`;
    const favicon = join(ROOT, game.dir, "public/favicon.svg");
    if (existsSync(favicon)) {
      mkdirSync(join(out, "icons"), { recursive: true });
      cpSync(favicon, join(out, "icons", `${game.key}.svg`));
      icons.add(game.key);
    }
    if (mode === "production" && game.web.project) {
      console.log(`${game.key}: ${prefix} -> ${game.web.url} (its own Pages project)`);
      redirects.push(
        `# ${game.productName}: deployed to its own Pages project\n${standaloneRedirects(game)}`,
      );
      continue;
    }
    console.log(`${game.key}: building into ${prefix}/`);
    execFileSync("npm", ["run", "build"], {
      cwd: join(ROOT, game.dir),
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_BASE: `${prefix}/`,
        VITE_SITE_URL: `${siteUrl}${game.web.path}/`,
      },
    });
    const dest = join(out, game.web.path);
    cpSync(join(ROOT, game.dir, "dist"), dest, { recursive: true });
    for (const [file, prefixed, into] of [
      ["_headers", prefixHeaders, headers],
      ["_redirects", prefixRedirects, redirects],
    ]) {
      const path = join(dest, file);
      if (!existsSync(path)) continue;
      into.push(
        `# ${game.productName} (${game.dir}/public/${file})\n${prefixed(readFileSync(path, "utf8"), prefix)}`,
      );
      rmSync(path);
    }
  }

  if (mode === "preview")
    headers.push(`# A PR preview stays out of search results.\n${NOINDEX_HEADERS}`);
  writeFileSync(join(out, "_headers"), headers.join("\n\n") + "\n");
  if (redirects.length) writeFileSync(join(out, "_redirects"), redirects.join("\n\n") + "\n");

  const template = readFileSync(join(ROOT, "site/index.html"), "utf8");
  writeFileSync(join(out, "index.html"), renderLanding(template, games, icons));
  for (const file of ["404.html", "favicon.svg", "fonts", "app-store-badge.svg"]) {
    cpSync(join(ROOT, "site", file), join(out, file), { recursive: true });
  }
  console.log(`wrote ${out} (${mode}, ${siteUrl})`);
} else if (command === "moved") {
  const project = args[1];
  const game = games.find((g) => g.web.movedFrom === project);
  if (!game) die(`no game has web.movedFrom "${project}"`);
  const out = resolve(option("out") ?? die("--out is required"));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "_redirects"), movedRedirects(game.web.url) + "\n");
  writeFileSync(join(out, "sw.js"), KILL_SWITCH_WORKER);
  writeFileSync(join(out, "404.html"), movedNotFound(game.web.url, game.productName));
  console.log(`wrote ${out}: ${project}.pages.dev -> ${game.web.url}`);
} else {
  die(
    "usage: node scripts/build-site.mjs site --mode production|preview [--site-url <url>] [--out <dir>]\n" +
      "       node scripts/build-site.mjs moved <project> --out <dir>",
  );
}
