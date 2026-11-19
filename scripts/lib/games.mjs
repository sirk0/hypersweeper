// The games in this repo, read from their manifests: every apps/<key>/ with a
// packaging.json is a game. This is the one list — the CI, deploy, PR-preview
// and version-bump workflows ask scripts/games.mjs for it rather than naming
// games themselves, so a new game (scripts/new-game.mjs) needs no workflow
// edit. Hypersweeper is the one with jobs of its own (web-checks, the e2e
// shards, its pyproject-shared version); every other game runs the generic
// per-game jobs.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The game whose CI, versioning and iPhone app are its own. */
export const FLAGSHIP = "hypersweeper";

/**
 * @typedef {{ key: string, dir: string, name: string, productName: string,
 *   sharedVersion: boolean,
 *   web: { project: string, url: string, analytics?: boolean, siteUrlVariable?: string } | null }} Game
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
        sharedVersion: packaging.sharedVersion === true,
        web: packaging.web ?? null,
      };
    });
}

/** The games other than the flagship: the generic CI jobs' matrix. */
export function otherGames(games) {
  return games.filter((g) => g.key !== FLAGSHIP).map((g) => g.key);
}

/** The games other than the flagship with a version of their own — the ones
 * bump-version.yml bumps one by one. A game whose packaging.json says
 * `"sharedVersion": true` has the flagship's, and is bumped with it
 * (scripts/bump_version.py). */
export function ownVersionGames(games) {
  return games.filter((g) => g.key !== FLAGSHIP && !g.sharedVersion).map((g) => g.key);
}

/** One deploy / PR-preview matrix entry per game with a site. The flagship
 * keeps the sticky-comment marker it has always had, so open PRs keep theirs. */
export function deployMatrix(games) {
  return games
    .filter((g) => g.web)
    .map((g) => ({
      app: g.key,
      project: g.web.project,
      site: g.web.url,
      analytics: g.web.analytics ? "1" : "",
      siteUrlVariable: g.web.siteUrlVariable ?? "",
      title: g.key === FLAGSHIP ? "Play this PR" : `Play this PR in ${g.productName}`,
      marker: g.key === FLAGSHIP ? "<!-- pr-preview -->" : `<!-- pr-preview:${g.web.project} -->`,
    }));
}

/** Does this list of changed paths need the flagship's long jobs? Yes unless
 * every path is inside another game's folder. */
export function needsFlagship(changed, games) {
  const others = otherGames(games).map((k) => `apps/${k}/`);
  return changed.some((path) => !others.some((prefix) => path.startsWith(prefix)));
}
