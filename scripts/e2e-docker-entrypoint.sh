#!/bin/sh
# Entry point for the container in web/docker-compose.e2e.yml. An entry point
# rather than a baked command so that everything a developer types after the
# service name reaches `playwright test` untouched.
set -eu

WEB=/app/web

# Docker seeds a volume only when it is empty, so a lockfile change would leave
# the previous run's modules mounted over a freshly built image — the classic
# named-volume trap. The image stamps its own install; re-seed whenever the
# mounted copy disagrees. (The mount point itself cannot be removed, so its
# contents are cleared rather than the directory.)
want=$(cat /opt/web-deps/.lockfile-sha)
if [ "$(cat "$WEB/node_modules/.lockfile-sha" 2>/dev/null || true)" != "$want" ]; then
  echo "e2e: seeding web/node_modules from the image" >&2
  find "$WEB/node_modules" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a /opt/web-deps/node_modules/. "$WEB/node_modules/"
  printf '%s' "$want" > "$WEB/node_modules/.lockfile-sha"
fi

# A bind mount passes the container's uid straight through on a Linux host, so
# everything written below — regenerated baselines, dist/, the HTML report —
# would land in the developer's checkout owned by root and need sudo to clean up.
# Hand it back to whoever owns the checkout on the way out. Docker Desktop maps
# ownership itself, so on a Mac this finds nothing to change. .git is mounted too
# and is deliberately not covered: do not run git in here.
owner=$(stat -c '%u:%g' "$WEB/package.json")
handback() {
  chown -R "$owner" \
    "$WEB/tests/e2e" "$WEB/dist" "$WEB/test-results" "$WEB/playwright-report" \
    2>/dev/null || true
}
trap handback EXIT INT TERM

cd "$WEB"
# Not exec: the trap above has to run. Playwright's CLI takes the last occurrence
# of a flag, so a caller's own --workers/--timeout overrides these.
status=0
npx playwright test \
  --workers="${E2E_WORKERS:-2}" \
  --timeout="${PLAYWRIGHT_TEST_TIMEOUT_MS:-120000}" \
  "$@" || status=$?
exit $status
