# Grafana dashboards

Three dashboards over `hypersweeper_game_events`, the Cloudflare Workers
Analytics Engine dataset the deployed game writes to. **These files are the
source of truth** — Grafana is where they are looked at, not where they live.

| File | Dashboard | Answers |
|---|---|---|
| `hypersweeper-events.json` | Raw events | Every column, one row per event. The explorer — start here when a number on another dashboard looks wrong. |
| `hypersweeper-overview.json` | Overview & trends | Games per day and the trend, starts vs finishes, wins and losses, win rate, the easy/medium/hard split and its trend, device and shell mix, how a deploy rolls out. |
| `hypersweeper-boards.json` | Boards & engagement | Which boards get played, win rate and mean game per board, how games get started, how far a loss gets, whether the controls are being found. |

The column map they are all built from is
[`docs/agents/metrics.md`](../docs/agents/metrics.md).

## The datasource

There is no first-party Analytics Engine datasource. These dashboards use the
**Altinity ClickHouse** plugin (`vertamedia-clickhouse-datasource`) pointed at
Cloudflare's SQL API, which speaks a narrow ClickHouse subset over the same
plain-text-POST shape:

- **URL** `https://api.cloudflare.com/client/v4/accounts/<account>/analytics_engine/sql`
- **HTTP method** POST, **Access** Server (default)
- **Header** `Authorization: Bearer <token>` — a **read-only** token carrying
  *Account → Account Analytics: Read*. Not the deploy token.
- Leave *Default database* empty, and leave HTTP compression and the CORS
  header off; the plugin adds query-string parameters for those and the SQL API
  wants none.

The plugin appends `FORMAT JSON` to every statement itself, so no query here
writes it.

Every panel reads its datasource from a `ds` dashboard variable rather than a
hard-coded uid, so importing onto a stack whose datasource has a different uid
is a dropdown, not an edit.

## Uploading and downloading

**Into Grafana:** Dashboards → New → Import → paste the file's contents →
select the ClickHouse datasource for **Data source** → Import.

**Back out of Grafana**, after editing a panel in the UI: Export → **Export as
JSON**, and in the format radio pick **Classic**, then save over the file here
and commit. Grafana 13.2 defaults that radio to *V2 Resource*; taking the
default gives a completely different JSON shape and an unreadable diff. These
files are classic v1, `schemaVersion: 42` — the final v1 version, frozen when
the dashboard API moved to the app platform, so it will not drift.

`web/tests/unit/dashboards.test.ts` runs in CI over whatever is committed here
and will fail on a file that has lost its time filter, started counting with
`COUNT(*)`, or fallen behind the event schema.

## Reading the numbers

Four things will make you misread a panel if you do not know them. All four are
explained at length in [`docs/agents/metrics.md`](../docs/agents/metrics.md).

- **Every count is a floor.** The dataset is sampled, content blockers eat some
  posts, players can switch reporting off in Settings › Privacy, and the
  packaged macOS and iPhone apps report nothing at all. Every one of those errs
  the same way.
- **Counts are `SUM(_sample_interval)`, never `COUNT(*)`.** Analytics Engine
  stores a sample and each stored row stands for `_sample_interval` real
  events. The raw-events dashboard shows the unweighted row count next to the
  weighted one, so the sampling ratio is visible.
- **Blank is not `unknown`.** A blank `device`, `trigger` or `version` is a
  `v: 1` event from a build that predates the column, still alive in someone's
  service-worker cache. `unknown` is a current build that looked and could not
  tell. The panels label the first `(pre-0.2.83 build)`.
- **Abandonment is `started − finished`**, not a column. There is no abandon
  event; a restart counts as a new play, and "boards opened" is the measure
  rather than distinct players.

### Two populations, one dataset

`blob4..blob12` and `double2..double11` arrived in **0.2.83**. Every event older
than that deploy is still in the dataset with those columns empty, so a
`GROUP BY blob4` collects the whole pre-0.2.83 history into one nameless bucket
that buries everything real — which, while the deploy is young, is most of what
a 30-day range contains.

So the panels that group by or average one of those columns are scoped with:

```sql
AND blob4 != ''
```

`blob4` is the marker because `parseEvent` writes `board?.label ?? mode` and
`mode` is validated non-empty — it is set on every event a current build sends,
including one naming a board the catalogue has never heard of. The obvious
alternatives are not equivalent: `blob5` (tiling) is legitimately empty for a
one-off board, and `blob12` (version) is empty when a build posts a version that
fails the shape check.

Deliberately **not** scoped: the trend panels on *Overview & trends* (games per
bucket, wins and losses, win rate, *This range*) and the whole **Difficulty**
row read `blob1`, `blob2`, `blob3` and `double1` only, which have always been
written and still mean what they meant. `blob2` in particular is never empty —
the collector rejects any event whose difficulty is not one of the catalogue's
tiers — so the difficulty split is the one breakdown that runs on the full
history rather than the 0.2.83+ slice. The per-tier panel on *Boards &
engagement* is scoped, because first-move delay needs `double10`; the two
covering different spans is expected, and each panel says so.
Throwing that history away so two panels agree would be the worse error. The
consequence is that the device pies do not add up to the trend totals, and the
**Schema coverage** panel on *Overview & trends* is there to show exactly how
big that gap is. It closes on its own as 0.2.83+ traffic accumulates.

Retention is about 90 days, so the time picker can be moved back that far and
no further. All three dashboards are set to the **UTC** timezone: the dataset
buckets in UTC, and rendering those buckets in browser-local time slices every
day across two bars.

## The SQL, and why it looks the way it does

The dialect is a **narrow ClickHouse subset**. Three rules follow, and every
panel obeys them.

**The time filter is core Grafana interpolation, not a plugin macro:**

```sql
WHERE timestamp >= toDateTime(${__from:date:seconds})
  AND timestamp <= toDateTime(${__to:date:seconds})
```

`${__from:date:seconds}` is a built-in Grafana variable — epoch seconds,
substituted before the query reaches the plugin — and `toDateTime` is
documented Analytics Engine. Nothing here depends on the plugin's
`dateTimeType`/`dateColDataType` being set correctly, which is what breaks
`$timeFilter`. The equivalent plugin macro, if you prefer it in the query
builder, is `$timeFilterByColumn(timestamp)` with `dateTimeType: "DATETIME"`
and `dateColDataType: ""` — a Date column would make it emit `toDate()`, which
Analytics Engine does not have.

**Buckets are arithmetic, not dates:**

```sql
intDiv(toUInt32(timestamp), $bucket) * $bucket * 1000 AS t
```

This is Cloudflare's own Grafana recipe. It hands Grafana epoch milliseconds as
a number, which sidesteps the one thing Cloudflare does not document: how a
`DateTime` is rendered in `FORMAT JSON`. `toStartOfInterval(timestamp, INTERVAL
'1' DAY)` is documented and would also work, but then the panel depends on
parsing whatever string comes back.

**Pivots are `sum(if(…))`, not `sumIf`:**

```sql
sum(if(blob1 = 'end' AND blob3 = 'won', _sample_interval, 0)) AS won
```

`sumIf`/`countIf`/`avgIf` were added to Analytics Engine in late 2025 and would
read better, but `if()` and `sum()` have been there all along. Using them keeps
each pivot in one query — no join, no `calculateField` chain — while resting
only on the part of the dialect that is certain.

**`if()` is strict about types**, and the error is worth recognising:

> the 2nd and 3rd arguments to IF function must have the same type but instead
> had Double and Integer

Both branches must be one type. A `blob`/`_sample_interval` count takes the
integer zero; anything multiplied by a `double` column takes `0.0`:

```sql
sum(if(blob1 = 'end', _sample_interval, 0))             -- Integer, Integer
sum(if(blob1 = 'end', double1 * _sample_interval, 0.0)) -- Double,  Double
```

Also avoided, deliberately: `JOIN` and `UNION` (Analytics Engine has neither —
a query runs against one table), `$table` (it emits a backtick-quoted
`db.table`; there are no databases here), and `$rate`/`$perSecond`/`$columns`
and the other plugin macros that generate window functions or `groupArray`.

## Checking the SQL still runs

```sh
node scripts/check_dashboards.mjs --print          # no credentials needed
CF_ACCOUNT_ID=... CF_API_TOKEN=... make dashboards-check
```

`--print` interpolates every variable and dumps the statements. With
credentials, `make dashboards-check` runs each one against the real API and
reports per panel. That is the check for *does this dialect accept it*; the
vitest guard is the check for *is it addressing the right columns*. Neither
tells you a panel is drawing the number you meant — for that, look at it.

If a query ever comes back rejected, the error names the function. The two
likely swaps, in order:

| Rejected | Replace with |
|---|---|
| `intDiv(toUInt32(timestamp), N) * N * 1000` | `toStartOfInterval(timestamp, INTERVAL '1' DAY)`, plus a `convertFieldType` on the panel to parse it as time |
| `sum(if(c, x, 0))` | `sumIf(x, c)` |
