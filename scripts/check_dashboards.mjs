// Do the committed Grafana panels actually run?
//
// The dashboards in grafana/ are hand-authored JSON that nothing else in the
// repo executes, and the dialect they are written against is a *narrow*
// ClickHouse subset — Cloudflare's Analytics Engine SQL API. A panel that names
// a function the subset does not have looks perfectly fine in git and renders
// as an empty box in Grafana. This runs every panel's SQL against the real API
// and says which ones came back.
//
//   CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/check_dashboards.mjs
//   node scripts/check_dashboards.mjs --print          # no credentials needed
//   node scripts/check_dashboards.mjs --dashboard=boards --print
//
// The token is the same read-only one scripts/metrics.mjs wants — Account ->
// Account Analytics: Read. It is not the deploy token.
//
// What it does NOT check: that a panel is *right*. A query can run and still
// count with COUNT(*) instead of SUM(_sample_interval), which is the mistake
// that produces plausible wrong numbers. web/tests/unit/dashboards.test.ts is
// where that is pinned, offline and in CI.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.cloudflare.com/client/v4/accounts";
const DIR = fileURLToPath(new URL("../grafana", import.meta.url));

function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

const printOnly = process.argv.includes("--print");
const only = flag("dashboard", "");
const days = Number(flag("days", "7"));
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days must be a positive number");
  process.exit(2);
}

/** The picker's range, as the two epoch-seconds Grafana would interpolate. */
const to = Math.floor(Date.now() / 1000);
const from = to - Math.round(days) * 86400;

/** What each template variable stands in for. A dashboard's own `current`
 * value is the honest choice — it is what the panel shows on first open — and
 * a textbox defaults to empty, which is the "no filter" branch of every
 * predicate. */
function variableValues(dashboard) {
  const values = new Map();
  for (const variable of dashboard.templating?.list ?? []) {
    if (variable.type === "datasource") continue;
    const current = variable.current?.value;
    values.set(variable.name, current === undefined ? "" : String(current));
  }
  return values;
}

/** Interpolate exactly what Grafana would before the query leaves the browser:
 * the two global time variables, then every dashboard variable. Longest name
 * first, so `$device` cannot be eaten by a shorter `$dev`. */
function interpolate(sql, values) {
  let out = sql
    .replaceAll("${__from:date:seconds}", String(from))
    .replaceAll("${__to:date:seconds}", String(to))
    .replaceAll("${__from}", String(from * 1000))
    .replaceAll("${__to}", String(to * 1000));
  for (const name of [...values.keys()].sort((a, b) => b.length - a.length)) {
    out = out.replaceAll(`$${name}`, values.get(name));
  }
  return out;
}

/** Every panel that carries SQL, rows and nested row children included. */
function* panelsOf(dashboard) {
  const walk = function* (panels) {
    for (const panel of panels ?? []) {
      if (panel.type === "row") {
        yield* walk(panel.panels);
        continue;
      }
      yield panel;
    }
  };
  yield* walk(dashboard.panels);
}

async function query(sql, account, token) {
  // The Grafana plugin appends `FORMAT JSON` to every statement it sends, so
  // the thing under test is the statement plus that suffix — not the statement
  // alone. It also flattens newlines to spaces on the way out.
  const res = await fetch(`${API}/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: `${sql.replace(/\r\n|\r|\n/g, " ")} FORMAT JSON`,
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: text.slice(0, 300).replace(/\s+/g, " ") };
  return { ok: true, rows: JSON.parse(text).rows ?? 0 };
}

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .filter((name) => only === "" || name.includes(only))
  .sort();
if (files.length === 0) {
  console.error(only ? `no dashboard in grafana/ matching "${only}"` : "no dashboards in grafana/");
  process.exit(2);
}

const account = process.env["CF_ACCOUNT_ID"];
const token = process.env["CF_API_TOKEN"];
if (!printOnly && (!account || !token)) {
  console.error(
    "CF_ACCOUNT_ID and CF_API_TOKEN must both be set to run the queries.\n" +
      "Pass --print to dump the interpolated SQL without running anything.\n" +
      "CF_API_TOKEN needs 'Account Analytics: Read' — the same read-only token\n" +
      "scripts/metrics.mjs uses, not the deploy token.",
  );
  process.exit(2);
}

let failed = 0;
let checked = 0;
for (const file of files) {
  const dashboard = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
  const values = variableValues(dashboard);
  console.log(`\n${dashboard.title}  (${file})`);
  for (const panel of panelsOf(dashboard)) {
    for (const targetSpec of panel.targets ?? []) {
      if (!targetSpec.query) continue;
      const sql = interpolate(targetSpec.query, values);
      const label = `${panel.title} [${targetSpec.refId}]`;
      if (printOnly) {
        console.log(`\n-- ${label}\n${sql}`);
        continue;
      }
      checked += 1;
      const result = await query(sql, account, token);
      if (result.ok) {
        console.log(`  ok   ${label} — ${result.rows} row(s)`);
      } else {
        failed += 1;
        console.log(`  FAIL ${label}\n       ${result.error}`);
      }
    }
  }
}

if (printOnly) process.exit(0);
console.log(
  `\n${checked - failed}/${checked} queries ran` +
    (failed ? ` — ${failed} failed against the Analytics Engine dialect.` : "."),
);
process.exit(failed ? 1 : 0);
