// The games in this repo, read from their manifests: every apps/<key>/ with a
// packaging.json is a game. This is the one list — the CI, deploy, PR-preview
// and version-bump workflows ask scripts/games.mjs for it rather than naming
// games themselves, so a new game (scripts/new-game.mjs) needs no workflow
// edit. Hypersweeper is the one with jobs of its own (web-checks, the e2e
// shards, its pyproject-shared version); every other game runs the generic
// per-game jobs.
//
// Where a game is served is its packaging.json `web`:
//
//   path       its folder on the shared site, https://tiling-games.pages.dev/<path>/
//              (site/site.json). Every game with a site has one, and every PR
//              preview builds every game there.
//   project    a Cloudflare Pages project of its own. Set, the game's
//              production deploy goes there (deploy-cloudflare.yml's `deploy`
//              job) and the shared site redirects /<path> to its `url` (a 302:
//              it is meant to move). Unset, production serves it from the
//              shared site too.
//   url        where the game is played in production.
//   movedFrom  a Pages project the game used to have, now redeployed as a
//              redirect to `url` (scripts/build-site.mjs `moved`).
//
// How many runners its CI jobs take is its packaging.json `ci`:
//
//   e2eShards   game-e2e's Playwright suite, split with `--shard=i/n`
//   unitShards  game-unit's vitest run, told its slice by TEST_SHARD="i/n" —
//               which the game's own tests must honour (Rep-tiles':
//               tests/unit/shard.ts), or every runner runs all of them
//
// Both default to 1: a scaffolded game's tests are seconds of work.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The game whose CI, versioning and iPhone app are its own. */
export const FLAGSHIP = "hypersweeper";

/**
 * @typedef {{ path: string, url: string, project?: string, movedFrom?: string,
 *   analytics?: boolean, siteUrlVariable?: string }} Web
 * @typedef {{ key: string, dir: string, name: string, productName: string,
 *   description: string, appStore: string | null, sharedVersion: boolean,
 *   web: Web | null, ci: { e2eShards: number, unitShards: number } }} Game
 * @typedef {{ project: string, url: string, previewAlias: string }} Site
 */

/** Every game, sorted by key. @returns {Game[]} */
export function listGames(root) {
  const apps = join(root, "apps");
  return readdirSync(apps, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(apps, d.name, "packaging.json")))
    .map((d) => d.name)
    .sort()
    .map((key) => {
      const dir = join(apps, key);
      const packaging = JSON.parse(readFileSync(join(dir, "packaging.json"), "utf8"));
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return {
        key,
        dir: `apps/${key}`,
        name: pkg.name,
        productName: packaging.productName,
        description: packaging.description ?? "",
        appStore: packaging.appStore ?? null,
        sharedVersion: packaging.sharedVersion === true,
        web: packaging.web ? { path: key, ...packaging.web } : null,
        ci: { e2eShards: 1, unitShards: 1, ...packaging.ci },
      };
    });
}

/** The shared site every game is served from: site/site.json. @returns {Site} */
export function readSite(root) {
  return JSON.parse(readFileSync(join(root, "site/site.json"), "utf8"));
}

/** The games other than the flagship: the generic CI jobs' matrix. */
export function otherGames(games) {
  return games.filter((g) => g.key !== FLAGSHIP).map((g) => g.key);
}

/** game-e2e's or game-unit's matrix: one `{ game, shard, of }` per runner,
 * `of` being the game's `ci.e2eShards` or `ci.unitShards`.
 * @param {"e2e" | "unit"} kind */
export function shardMatrix(games, kind) {
  return games
    .filter((g) => g.key !== FLAGSHIP)
    .flatMap((g) => {
      const of = g.ci[`${kind}Shards`];
      return Array.from({ length: of }, (_, i) => ({ game: g.key, shard: i + 1, of }));
    });
}

/** The games other than the flagship with a version of their own — the ones
 * bump-version.yml bumps one by one. A game whose packaging.json says
 * `"sharedVersion": true` has the flagship's, and is bumped with it
 * (scripts/bump_version.py). */
export function ownVersionGames(games) {
  return games.filter((g) => g.key !== FLAGSHIP && !g.sharedVersion).map((g) => g.key);
}

/** The production deploy's matrix: one entry per game with a Pages project of
 * its own (`web.project`). A game without one is served from the shared site,
 * which deploy-cloudflare.yml's `site` job builds. */
export function deployMatrix(games) {
  return games
    .filter((g) => g.web?.project)
    .map((g) => ({
      app: g.key,
      project: g.web.project,
      site: g.web.url,
      analytics: g.web.analytics ? "1" : "",
      siteUrlVariable: g.web.siteUrlVariable ?? "",
    }));
}

/** The Pages projects a game has moved away from, each redeployed as a
 * redirect to where it went (`web.movedFrom`). */
export function movedMatrix(games) {
  return games
    .filter((g) => g.web?.movedFrom)
    .map((g) => ({ app: g.key, project: g.web.movedFrom, url: g.web.url }));
}

/** Every Pages project a `pr-<number>` preview may be on: the shared site's,
 * where previews go now, and every game's own or former one, where they went
 * before — the teardown and the daily sweep clean up all of them. */
export function previewProjects(games, site) {
  const projects = [site.project];
  for (const g of games) {
    for (const p of [g.web?.project, g.web?.movedFrom]) {
      if (p && !projects.includes(p)) projects.push(p);
    }
  }
  return projects;
}

/** Does this list of changed paths need the flagship's long jobs? Yes unless
 * every path is inside another game's folder. */
export function needsFlagship(changed, games) {
  const others = otherGames(games).map((k) => `apps/${k}/`);
  return changed.some((path) => !others.some((prefix) => path.startsWith(prefix)));
}
