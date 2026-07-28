// Build-time constants substituted by Vite's `define` (see vite.config.ts).
// The version tracks `web/package.json`, which the bump-version workflow keeps
// in lockstep with `pyproject.toml` on every push to master, so it identifies a
// deployed build exactly. The commit is the short SHA when built in CI and an
// empty string locally.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
