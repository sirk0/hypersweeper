// Which game this shell is running, and how that game is packaged.
//
// The shell holds no game of its own. scripts/stage-desktop.sh copies one in:
// the game's packaged build to `app/` and its apps/<game>/packaging.json to
// `app.json`, both beside this file (and so inside the .app electron-builder
// makes). For `npm start` with nothing staged there is a convenience fallback:
// the game named by GAME (default hypersweeper), read straight from its folder
// — its dist/ if it has been built, its packaging.json.
//
// Kept apart from main.mjs, which needs Electron, so the rules can be unit
// tested with plain node (test/config.test.mjs).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What every packaging.json must carry for the shell, with the defaults a
 * field falls back to. */
const DEFAULTS = {
  backgroundColor: "#ffffff",
  smokeRoute: "",
  smokePainted: "document.body.children.length",
};

/**
 * @param {string} here   the shell's own folder (shells/desktop, or the
 *                        packaged app's resources)
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ dist: string | null, packaging: { productName: string,
 *   desktop: { backgroundColor: string, smokeRoute: string, smokePainted: string,
 *   userDataName?: string } } }}
 *   `dist` is null when there is nothing built to serve.
 */
export function loadGame(here, env = process.env) {
  const built = (dir) => (existsSync(join(dir, "index.html")) ? dir : null);
  const staged = join(here, "app.json");
  if (existsSync(staged)) {
    return { dist: built(join(here, "app")), packaging: parse(staged) };
  }
  const game = env.GAME || "hypersweeper";
  const folder = resolve(here, "../../apps", game);
  const manifest = join(folder, "packaging.json");
  if (!existsSync(manifest)) {
    throw new Error(`no packaging.json for "${game}" (looked in ${folder}); run scripts/stage-desktop.sh`);
  }
  return { dist: built(join(folder, "dist")), packaging: parse(manifest) };
}

function parse(file) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw.productName !== "string" || !raw.productName) {
    throw new Error(`${file}: productName is missing`);
  }
  return { productName: raw.productName, desktop: { ...DEFAULTS, ...(raw.desktop ?? {}) } };
}
