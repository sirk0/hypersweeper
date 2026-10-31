#!/bin/bash
# PostToolUse hook (Edit|Write): run Prettier on the file Claude just changed,
# when it is inside one of the TypeScript apps (apps/*/), so an edit never
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
  "$ROOT"/apps/*/*) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# From the file's app folder (apps/<game>/), so that app's .prettierignore
# applies; --ignore-unknown skips files Prettier has no parser for.
APP="${FILE#"$ROOT"/apps/}"
APP="$ROOT/apps/${APP%%/*}"
cd "$APP" && "$PRETTIER" --write --ignore-unknown --log-level silent "$FILE" >/dev/null 2>&1
exit 0
