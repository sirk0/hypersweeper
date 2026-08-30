# Metrics — what the deployed game reports, and how to read it

The hosted game counts what is played and how it goes. Two events per game go
to a Pages Function on the app's own origin, which writes one row each to a
Cloudflare Workers Analytics Engine dataset; a Grafana dashboard reads that
dataset back over Cloudflare's SQL API.

This file is the whole of it: the schema, the rules for changing it, the
queries, and the line the data must not cross. It is the one place any of that
is written — [`web/docs/deploy.md`](../../web/docs/deploy.md) covers only the
*deploy* side (which builds carry a collector, and the binding), and
[`shared-data.md`](shared-data.md) covers the generated `data/*.json` this
depends on.

## The pipeline

```
src/analytics.ts        the wire: sendBeacon, else a keepalive fetch
  ↑ names an event                     ↓ POST {app base}/api/tally
src/analyticsEvent.ts   the contract — imported by BOTH ends
  ↑ payloadFor                         ↓ parseEvent
functions/api/tally.ts  the Pages Function (one line) …
functions/api/_tally.ts … and its logic: gates, caps, one writeDataPoint
                                        ↓
        Workers Analytics Engine — dataset `hypersweeper_game_events`
                                        ↓ Cloudflare SQL API
        Grafana, and scripts/metrics.mjs
```

**Two events per game, and no third.** A `start` when a board opens
(`App.startGame`, last, after the session is built), an `end` on the move that
finishes it (`App.afterMove` → `trackFinish`). There is deliberately **no
abandon event**: a board opened and never finished is `plays − finished`, which
any report derives — so a `pagehide` hook that would also fire on every menu
return and every restart is not needed, and there is one less thing to keep
exactly-once.

A **restart counts as a new play**: the HUD smiley routes back through
`startGame`. "Boards opened" is the measure, not "distinct players" — nothing
here can count those, by design.

**The pure half and the transport half.** `analyticsEvent.ts` decides what an
event *is* and knows no globals; `analytics.ts` is the wire and owns everything
that needs a browser. The split is `audio/sound.ts`'s (`voicesFor` beside its
player), and it is what lets `tsconfig.functions.json` compile the contract with
no DOM lib at all — which is the proof it stayed pure — and what lets the node
unit tests pin the whole thing in one round-trip assertion.

## The schema

`index1` is the mode. It is the index because Analytics Engine samples *per
index*, so a board nobody plays keeps its fidelity while a popular one is being
sampled.

The layout is not a comment anywhere: `DATASET_BLOBS` and `DATASET_DOUBLES` in
`web/src/analyticsEvent.ts` **are** the layout, `_tally.ts` maps over them to
write, and `tests/unit/analyticsSchema.test.ts` checks the table below against
them. Change one, change all three.

> **Append only, never renumber.** Every dashboard panel and
> `scripts/metrics.mjs` address these by number, and nothing in the repo can
> notice a column that moved — the data just quietly changes meaning from the
> day of the deploy. A retired column is left in place and stops being written.

| column | name | what it holds |
| --- | --- | --- |
| `index1` | mode | the mode id, `torushexhex` |
| `blob1` | kind | `start` or `end` |
| `blob2` | difficulty | `easy`, `medium`, `hard` |
| `blob3` | outcome | `won`, `lost`; empty on a start |
| `blob4` | board | the full name, `Hexagons · Torus` |
| `blob5` | tiling | tiling key; empty for a one-off board |
| `blob6` | surface | `flat`, `cylinder`, `mobius`, `klein`, `torus`, `solid` |
| `blob7` | family | `regular`, `uniform`, `dual`, `isogonal`, `rectangle`, `aperiodic`, `fractal`, `sphere`, `platonic`, `catalan`, `polyhedra` |
| `blob8` | trigger | how it was dealt: `menu`, `random`, `again`, `link` |
| `blob9` | from | what the *previous* board was doing: empty, `playing`, `won`, `lost` |
| `blob10` | device | `phone`, `tablet`, `desktop`, `unknown` |
| `blob11` | shell | `browser`, `standalone` |
| `blob12` | version | the build, `0.2.83` |
| `double1` | seconds | on the clock; 0 on a start |
| `double2` | cells | total cells on the board |
| `double3` | mines | mines on the board |
| `double4` | opened | safe cells opened; 0 on a start |
| `double5` | flagsRight | the player's flags on mines, at the end |
| `double6` | flagsWrong | the player's flags on safe cells, at the end |
| `double7` | reveals | reveal moves |
| `double8` | chords | chord moves |
| `double9` | flagMoves | flag toggles |
| `double10` | firstMoveMs | board open to first move, in ms |
| `double11` | viewMoved | 1 if the view was ever rotated or zoomed |

Four of those read wrong if taken at face value.

- **`opened` does not count the mine a loss stepped on.** `Game.reveal` marks it
  revealed without counting it, so this stays *safe cells opened* — which is the
  honest measure of how far a lost game got. `opened / cells` is progress;
  `opened / (cells - mines)` is the fraction of the actual job done.
- **`flagsRight` is a snapshot, not a count of the flags on the board.** Winning
  auto-flags every mine still hidden, so a count taken afterwards says every win
  was flagged perfectly. `Game` freezes the tally at the instant the state
  leaves `playing` — before the auto-flag — and that frozen pair is what is
  reported. `tests/unit/game.test.ts` pins it.
- **`blob5..7` are keys, `blob4` is a label.** Group by the keys; title panels
  with the label. A label rewording must never break a dashboard.
- **Empty is not `unknown`.** An empty `device`, `trigger` or `version` means a
  `v: 1` event — an older build, still alive in a player's service-worker cache,
  from before the field existed. `unknown` means a current build looked and
  could not tell. They are different populations and the difference matters
  while a deploy rolls out.

The board columns (`blob4..7`) are **derived at the collector** from the mode,
not sent. Two reasons: the wire stays small, and the collector keeps the
property that it can only ever store strings from its own vocabulary — nothing
a poster chooses reaches a dashboard. The lookup is `modeInfo` in
`data/catalog.json`, generated by `scripts/export_data.py`; see
[`shared-data.md`](shared-data.md).

## Reading it

Retention is about 90 days. Two traps, in order of how much damage they do.

**Every count is `SUM(_sample_interval)`, never `COUNT(*)`.** Analytics Engine
stores a *sample* of rows under load and gives each stored row a
`_sample_interval`: how many real events it stands for. Getting this wrong
produces numbers that look entirely plausible and are wrong by whatever the
sampling rate happened to be — silently, and worst for exactly the popular
boards worth reading. Every mean is weighted the same way:
`SUM(value * _sample_interval) / SUM(_sample_interval)`.

**The dialect is a narrow ClickHouse subset.** A plain `GROUP BY` is the part of
it that is certain. Conditional aggregates are not worth betting a panel on —
pivot in the dashboard, or select the buckets as separate rows.

**Read every count as a floor.** It is sampled; content blockers eat some posts;
players can switch it off in Settings › Privacy; and the packaged macOS and
iPhone apps report nothing at all. All four err the same way.

### From Grafana

There is no first-party Analytics Engine datasource. The working arrangement is
the **Infinity** datasource pointed at the SQL API:

- URL `https://api.cloudflare.com/client/v4/accounts/<account>/analytics_engine/sql`
- method POST, body type `text/plain`, the SQL as the raw body
- header `Authorization: Bearer <token>` — a **read-only** token carrying
  *Account → Account Analytics: Read*, and not the deploy token
- parser JSON, rows at `data`

Two things to know about the results: 64-bit integers come back as **strings**,
so cast or set the field type in the panel; and the API takes plain SQL as the
body, not a JSON envelope.

### Queries worth having

Plays, wins and win rate per board — the original question:

```sql
SELECT blob4 AS board, blob2 AS difficulty, blob1 AS kind, blob3 AS outcome,
       SUM(_sample_interval) AS events
FROM hypersweeper_game_events
WHERE timestamp > NOW() - INTERVAL '30' DAY
GROUP BY board, difficulty, kind, outcome
```

Where the game is played, and how it goes there:

```sql
SELECT blob10 AS device, blob11 AS shell, blob3 AS outcome,
       SUM(_sample_interval) AS games
FROM hypersweeper_game_events
WHERE blob1 = 'end' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY device, shell, outcome
```

How games get started — the five categories are `trigger` × `from`: a re-roll
from the win card is `random`/`won`, the smiley after a loss is `again`/`lost`,
a mid-board re-roll is `random`/`playing`, a menu pick is `menu`/``:

```sql
SELECT blob8 AS trigger, blob9 AS from_state, SUM(_sample_interval) AS starts
FROM hypersweeper_game_events
WHERE blob1 = 'start' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY trigger, from_state
```

How far a loss gets, by surface — the shape of a board's difficulty, which the
win rate alone hides:

```sql
SELECT blob6 AS surface,
       SUM(double4 * _sample_interval) / SUM(double2 * _sample_interval) AS opened_fraction,
       SUM(_sample_interval) AS losses
FROM hypersweeper_game_events
WHERE blob1 = 'end' AND blob3 = 'lost' AND double2 > 0
  AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY surface
```

Whether the controls are being found — chording on any board, rotation on a 3D
one:

```sql
SELECT blob6 AS surface,
       SUM(double8 * _sample_interval) / SUM(_sample_interval) AS chords_per_game,
       SUM(double11 * _sample_interval) / SUM(_sample_interval) AS rotated_fraction,
       SUM(_sample_interval) AS games
FROM hypersweeper_game_events
WHERE blob1 = 'end' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY surface
```

Version over version, for the deploy that changed something:

```sql
SELECT blob12 AS version, blob3 AS outcome,
       SUM(double1 * _sample_interval) / SUM(_sample_interval) AS mean_seconds,
       SUM(_sample_interval) AS games
FROM hypersweeper_game_events
WHERE blob1 = 'end' AND blob12 != '' AND timestamp > NOW() - INTERVAL '14' DAY
GROUP BY version, outcome
```

Abandonment needs no column: it is `starts − ends` for the same board, which is
why there is no abandon event to send.

### From the command line

`make metrics` (or `node scripts/metrics.mjs`) still prints the original
per-board table — it reads `blob1..3` and `double1`, which the append-only rule
keeps meaning what they meant. `node scripts/metrics.mjs --schema` prints the
column map. Flags: `--days=N`, `--mode=TEXT`, `--min=N`, `--json`.

## Adding a field

In this order, because each step is checked by the next:

1. **`web/src/analyticsEvent.ts`** — add the key to `EventPayload` (short, this
   is sent on every game), write it in `payloadFor`, validate and total it in
   `parseEvent`, and **append** an entry to `DATASET_BLOBS` or
   `DATASET_DOUBLES`. Validate against a closed `Set` if it is an enum; clamp it
   with `count()` if it is a number. Never carry an unrecognised value through.
2. **Do not bump `v` unless the shape changes incompatibly**, and if you do,
   keep the old version parsing. The service worker keeps older builds alive in
   players' caches for days after a deploy; rejecting their posts silently drops
   real games. A field a v1 event does not have is empty or zero, not absent.
3. **Produce it** — `game.ts` / `session.ts` for something about the game,
   `device.ts` for something about the client, `main.ts` for something only
   `App` knows. Anything measured at the end of a game belongs in
   `GameSession.stats()`.
4. **`docs/agents/metrics.md`** — this file: a row in the schema table, and a
   note under it if the value can be read wrong.
5. **Tests** — `tests/unit/analytics.test.ts` for the round trip and the
   validation, `tests/unit/tally.test.ts` for the exact column vector,
   `tests/unit/analyticsSchema.test.ts` for the doc.
6. **The privacy copy**, if it is anything about the client: `README.md` and the
   Privacy note in `web/src/ui/settings.ts` both say what is sent, and they must
   stay true.

`npm run typecheck` runs twice — the second pass compiles the contract with no
DOM lib, and is what catches a browser-only import sneaking into the Worker
bundle. `MAX_BODY` in `_tally.ts` is 1024; the widest real `end` is about 210
bytes.

## What must never be sent

The collector stores **nothing about the request**: no IP, no country, no colo,
no user agent, no referrer, nothing from `request.cf`. A rare board plus a
country is an identifier, and not being one is the entire promise of this
feature. The client facts it does carry are deliberately coarse — four device
values, two shell values, a build number — and none is a measurement: no screen
size, no pixel ratio, no language, no timezone.

Also absent, and to stay absent: any identifier of any kind (no cookie, no
session id, no visitor hash), the board's seed or layout, and the player's
settings. There is no way to link two events, which is what makes the counts
safe and is also why "distinct players" is not a number this dataset has.

The endpoint is called `tally` rather than `event`, `track` or `collect`,
because those are the words filter lists match on and a blocked request is a
lost count.

## Cloudflare Web Analytics

Web Analytics is enabled on the Pages project and answers a different set of
questions: visits and page views, referrers, browser and OS, country. It knows
nothing about a game, and this dataset knows nothing about a visit; the two do
not join.

Three things to know about it here:

- **Its beacon is injected at the edge**, by Pages, not built into the bundle.
  So it is not in the repo, `scripts/check-offline-assets.mjs` does not see it,
  and the "reference nothing remote" rule is not violated by it. It is also
  absent from the packaged macOS and iPhone apps, which serve their own files.
- **Grafana reaches it over the GraphQL API**
  (`rumPageloadEventsAdaptiveGroups`), not the SQL API this dataset uses — a
  second datasource, not a second query.
- **For "phone or desktop", prefer `blob10` here.** Web Analytics can tell you
  the same thing about *visits*; only this dataset can tell you it about *games
  won*.

## Worth adding later

Considered for the current round and left out, each with the reason:

- **Session depth** — an n-th-board-this-page-load counter. No identifier, and
  it would show how many boards a visit plays and where people stop. The only
  one of these with real value; left out to keep the privacy statement short.
- **Input type per move** (touch vs mouse, from `pointerType`) — a better "how
  is it played" signal than device class on a hybrid machine.
- **Orientation at start** — portrait/landscape, for layout decisions.
- **A settings snapshot** (theme, sound, animations) — would say which settings
  are worth keeping, and is the one on this list that meaningfully widens the
  fingerprint. If it is ever added, add it as a small number of coarse values,
  never as a blob of the whole settings record.
