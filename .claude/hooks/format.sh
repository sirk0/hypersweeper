#!/bin/bash
# PostToolUse hook (Edit|Write): run Prettier on the file Claude just changed,
# when it is inside one of the TypeScript apps or packages (apps/*/,
# packages/*/), so an edit never
# leaves it unformatted and CI's `npm run format:check` stays green. Always
# exits 0 and prints nothing: formatting must never block an edit.

ROOT="${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
# Prettier is a root devDependency of the npm workspace (package.json), and the
# config is the root .prettierrc.json.
PRETTIER="$ROOT/node_modules/.bin/prettier"
[ -x "$PRETTIER" ] || exit 0

FILE=$(node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { process.stdout.write(JSON.parse(s).tool_input?.file_path ?? ""); } catch {}
  });
')
case "$FILE" in
  "$ROOT"/apps/*/* | "$ROOT"/packages/*/*) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# From the file's workspace folder (apps/<game>/ or packages/<name>/), so its
# .prettierignore applies; --ignore-unknown skips files Prettier has no parser
# for.
REST="${FILE#"$ROOT"/}" # apps/<game>/… or packages/<name>/…
KIND="${REST%%/*}"
REST="${REST#*/}"
cd "$ROOT/$KIND/${REST%%/*}" && "$PRETTIER" --write --ignore-unknown --log-level silent "$FILE" >/dev/null 2>&1
exit 0
