// What the deployed game is actually played on, and how often it is won.
//
// Reads the Workers Analytics Engine dataset the Pages Function writes to
// (web/functions/api/tally.ts) through Cloudflare's SQL API, and prints one row
// per board and difficulty. No dependencies; Node's global fetch is all it is.
//
//   CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/metrics.mjs
//   node scripts/metrics.mjs --days=7 --mode=klein --min=20
//   node scripts/metrics.mjs --json | jq .
//
// The token is a *second*, read-only one — Account -> Account Analytics: Read.
// It is not the deploy token, which needs Pages: Edit and nothing else.
//
// THE ONE TRAP. Analytics Engine stores a *sample* of rows under load and gives
// each stored row a `_sample_interval`: how many real events it stands for. So
// every count here is SUM(_sample_interval), never COUNT(*), and every mean is
// SUM(value * _sample_interval) / SUM(_sample_interval). Getting this wrong
// produces numbers that look entirely plausible and are wrong by whatever the
// sampling rate happened to be — silently, and worst for the popular boards
// that are the ones worth reading.
//
// The numbers are estimates for two more reasons, both of them one-directional:
// content blockers eat some posts, and players can switch reporting off. Read
// every count as a floor.
//
// This report reads blob1..3 and double1 only. The dataset has grown past that
// — the whole column map, the traps and the queries for the rest are in
// docs/agents/metrics.md, and `--schema` prints the map from it. The report
// stays as it is because the append-only rule means those four columns still
// mean what they meant, and Grafana is where the rest is read.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATASET = "hypersweeper_game_events";
const API = "https://api.cloudflare.com/client/v4/accounts";

const require_ = createRequire(import.meta.url);
/** Every board this build knows — so a mode in the dataset that this checkout
 * has never heard of (a retired board, a newer deploy, a hand-posted row) is
 * reported apart rather than mixed into the table as if it were real. */
const KNOWN_MODES = new Set(
  Object.keys(require_("../data/presets.json").presets),
);

function usage(message) {
  console.error(
    `${message}\n\n` +
      "usage: CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/metrics.mjs [options]\n\n" +
      "  --schema     print the dataset's column map and exit\n" +
      "  --days=N     how far back to look (default 30; retention is ~90)\n" +
      "  --mode=TEXT  only boards whose name contains TEXT\n" +
      "  --min=N      dim rows with fewer than N finished games (default 5)\n" +
      "  --json       print the rows as JSON instead of a table\n\n" +
      "CF_API_TOKEN needs the 'Account Analytics: Read' permission — it is a\n" +
      "different token from the one the deploy workflow uses.",
  );
  process.exit(2);
}

function flag(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

/** The dataset's column map, read out of the doc that is its source of truth.
 * Not duplicated here: a second copy of a positional schema is exactly the
 * thing that goes stale. tests/unit/analyticsSchema.test.ts ties that table to
 * the code that writes it. */
function printSchema() {
  const doc = fileURLToPath(
    new URL("../docs/agents/metrics.md", import.meta.url),
  );
  const rows = [];
  for (const line of readFileSync(doc, "utf8").split("\n")) {
    const hit = /^\|\s*`(index1|blob\d+|double\d+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (hit) rows.push([hit[1], hit[2], hit[3]]);
  }
  if (rows.length === 0) {
    console.error("no schema table found in docs/agents/metrics.md");
    process.exit(1);
  }
  const width = [0, 1].map((i) => Math.max(...rows.map((r) => r[i].length)));
  console.log(`dataset ${DATASET}\n`);
  for (const [column, name, note] of rows) {
    console.log(`${column.padEnd(width[0])}  ${name.padEnd(width[1])}  ${note}`);
  }
  console.log("\nappend only, never renumber — see docs/agents/metrics.md");
}

if (process.argv.includes("--schema")) {
  printSchema();
  process.exit(0);
}

const days = Number(flag("days", "30"));
const modeFilter = flag("mode", "");
const minGames = Number(flag("min", "5"));
const asJson = process.argv.includes("--json");
if (!Number.isFinite(days) || days <= 0) usage("--days must be a positive number");

const account = process.env["CF_ACCOUNT_ID"];
const token = process.env["CF_API_TOKEN"];
if (!account || !token) usage("CF_ACCOUNT_ID and CF_API_TOKEN must both be set");

/** Run one SQL statement and hand back its rows. The API takes the statement as
 * a plain-text body, not JSON. */
async function query(sql) {
  const res = await fetch(`${API}/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "text/plain" },
    body: sql,
  });
  const text = await res.text();
  if (!res.ok) {
    // The dataset does not exist until its first write, which reads as an
    // unknown table rather than as an empty result.
    if (/UNKNOWN_TABLE|doesn't exist|Unknown table/i.test(text)) return null;
    throw new Error(`Analytics Engine API ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text).data ?? [];
}

// One row per (mode, difficulty, kind, outcome). Deliberately no conditional
// aggregate — the dialect is a narrow ClickHouse subset and a plain GROUP BY is
// the part of it that is certain; the four buckets are pivoted in JS below,
// which is a dozen lines and cannot be wrong about a function that is missing.
const SQL = `
SELECT
  index1 AS mode,
  blob2  AS difficulty,
  blob1  AS kind,
  blob3  AS outcome,
  SUM(_sample_interval)           AS events,
  SUM(double1 * _sample_interval) AS seconds
FROM ${DATASET}
WHERE timestamp > NOW() - INTERVAL '${Math.round(days)}' DAY
GROUP BY mode, difficulty, kind, outcome
FORMAT JSON`;

/** 64-bit integers arrive from ClickHouse as strings. */
const num = (v) => Number(v ?? 0);

function collect(rows) {
  const table = new Map();
  for (const row of rows) {
    const key = `${row.mode}|${row.difficulty}`;
    let entry = table.get(key);
    if (!entry) {
      entry = {
        mode: row.mode,
        difficulty: row.difficulty,
        plays: 0,
        won: 0,
        lost: 0,
        winSeconds: 0,
      };
      table.set(key, entry);
    }
    const events = num(row.events);
    if (row.kind === "start") entry.plays += events;
    else if (row.outcome === "won") {
      entry.won += events;
      entry.winSeconds += num(row.seconds);
    } else if (row.outcome === "lost") entry.lost += events;
  }
  for (const entry of table.values()) {
    entry.finished = entry.won + entry.lost;
    // A board can be left mid-game: opened but never finished. That difference
    // is the abandon count — which is why there is no abandon event to send.
    entry.abandoned = Math.max(0, entry.plays - entry.finished);
    entry.winRate = entry.finished > 0 ? entry.won / entry.finished : null;
    entry.avgWinSeconds = entry.won > 0 ? entry.winSeconds / entry.won : null;
    entry.known = KNOWN_MODES.has(entry.mode);
  }
  return [...table.values()].sort((a, b) => b.plays - a.plays || b.finished - a.finished);
}

const clock = (s) =>
  s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function print(rows) {
  const known = rows.filter((r) => r.known);
  const unknown = rows.filter((r) => !r.known);
  const shown = modeFilter
    ? known.filter((r) => r.mode.includes(modeFilter))
    : known;
  if (shown.length === 0) {
    console.log("no games recorded in that window");
    return;
  }
  const head = ["board", "diff", "plays", "won", "lost", "left", "win%", "avg win"];
  const body = shown.map((r) => [
    r.mode,
    r.difficulty,
    String(r.plays),
    String(r.won),
    String(r.lost),
    String(r.abandoned),
    r.winRate == null ? "—" : `${(r.winRate * 100).toFixed(1)}%`,
    clock(r.avgWinSeconds),
  ]);
  const width = head.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length)),
  );
  const line = (cells) =>
    cells
      .map((c, i) => (i < 2 ? c.padEnd(width[i]) : c.padStart(width[i])))
      .join("  ");
  console.log(line(head));
  console.log(width.map((w) => "-".repeat(w)).join("  "));
  for (const [i, cells] of body.entries()) {
    // A board played three times has a win rate, and it means nothing. Mark it
    // rather than dropping it — a board nobody opens is itself a finding.
    const thin = shown[i].finished < minGames;
    console.log(thin ? `${line(cells)}   (thin)` : line(cells));
  }

  const totals = shown.reduce(
    (acc, r) => ({
      plays: acc.plays + r.plays,
      won: acc.won + r.won,
      finished: acc.finished + r.finished,
    }),
    { plays: 0, won: 0, finished: 0 },
  );
  console.log(
    `\n${totals.plays} boards opened, ${totals.finished} finished, ` +
      `${totals.won} won (${
        totals.finished ? ((totals.won / totals.finished) * 100).toFixed(1) : "0.0"
      }%) over ${Math.round(days)} days`,
  );
  if (unknown.length > 0) {
    const events = unknown.reduce((n, r) => n + r.plays + r.finished, 0);
    console.log(
      `${unknown.length} row(s), ${events} event(s) name boards this checkout ` +
        `does not have — a retired board, a newer deploy, or a hand-posted row.`,
    );
  }
  console.log("estimates: sampled, and a floor (blockers, opt-outs, the Pages host)");
}

const rows = await query(SQL);
if (rows === null) {
  console.log(
    `no data yet — the '${DATASET}' dataset appears on its first write.\n` +
      "Play a board on the deployed site, wait a minute, and try again.",
  );
  process.exit(0);
}
const collected = collect(rows);
if (asJson) console.log(JSON.stringify(collected, null, 2));
else print(collected);
