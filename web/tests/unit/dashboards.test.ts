import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import catalog from "@data/catalog.json";
import { DATASET_BLOBS, DATASET_DOUBLES } from "../../src/analyticsEvent";

// The dashboards in grafana/ are the third description of the same positional
// schema — after DATASET_BLOBS/DATASET_DOUBLES and the table in
// docs/agents/metrics.md — and the only one nothing else in the repo executes.
// They address columns by *number*, so a column that is added, or moved, is
// invisible to them: the panel keeps rendering and quietly means something
// else. Like analyticsSchema.test.ts, none of this tests behaviour; it tests
// that the descriptions still agree, which is the only failure mode a blob
// layout has. scripts/check_dashboards.mjs is the other half — it needs
// credentials and asks Analytics Engine whether the SQL runs at all.

const DIR = fileURLToPath(new URL("../../../grafana", import.meta.url));

type Override = {
  matcher: { id: string; options?: string };
  properties: { id: string; value?: unknown }[];
};

type Panel = {
  id: number;
  type: string;
  title?: string;
  panels?: Panel[];
  targets?: { refId: string; query?: string; datasource?: { uid?: string } }[];
  datasource?: { uid?: string };
  fieldConfig?: { overrides?: Override[] };
};

type Dashboard = {
  uid: string;
  title: string;
  schemaVersion: number;
  time?: { from?: string; to?: string };
  panels: Panel[];
  templating: {
    list: { name: string; type: string; query?: string; options?: { value: string }[] }[];
  };
};

/** The board taxonomy the collector actually writes into `blob6`/`blob7`:
 * `boardInfo(mode)`, which is this table. `catalog.surfaces` is a different
 * (and smaller) list — it has no `solid`, because a polyhedron is not one of
 * the flat manifolds — so `modeInfo` is the only honest oracle for the values a
 * filter has to offer. */
const modeInfo = catalog.modeInfo as Record<string, { surface: string; family: string }>;

const TAXONOMIES: readonly (readonly [string, ReadonlySet<string>])[] = [
  ["difficulty", new Set<string>(catalog.difficulties)],
  ["surface", new Set(Object.values(modeInfo).map((board) => board.surface))],
  ["family", new Set(Object.values(modeInfo).map((board) => board.family))],
];

const files = readdirSync(DIR).filter((name) => name.endsWith(".json")).sort();

const dashboards = files.map((file) => ({
  file,
  doc: JSON.parse(readFileSync(`${DIR}/${file}`, "utf8")) as Dashboard,
}));

/** Rows nest their children; everything else is a leaf. */
function flatten(panels: Panel[]): Panel[] {
  return panels.flatMap((panel) =>
    panel.type === "row" ? [panel, ...flatten(panel.panels ?? [])] : [panel],
  );
}

function queriesOf(doc: Dashboard): { where: string; sql: string }[] {
  const found: { where: string; sql: string }[] = [];
  for (const panel of flatten(doc.panels)) {
    for (const target of panel.targets ?? []) {
      if (target.query) found.push({ where: `${panel.title} [${target.refId}]`, sql: target.query });
    }
  }
  return found;
}

/** `flagsRight` in the code is `flags_right` in SQL — the dialect has no case
 * convention worth fighting. `from` is the one column whose documented name is
 * a reserved word, so it is selected as `from_state`; metrics.md's own queries
 * already alias it that way. */
const ALIAS_EXCEPTIONS: Record<string, string> = { from: "from_state" };

function sqlAlias(name: string): string {
  return ALIAS_EXCEPTIONS[name] ?? name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

it("has dashboards to check", () => {
  expect(files.length).toBeGreaterThan(0);
});

// Retention is about a fortnight in practice, so a picker opening on a month
// spends most of its rows on history that predates the wide schema — which is
// what an export of the raw-events table looked like before this. The three
// dashboards are read side by side, so they open on the same window.
it("opens on one window, short enough that retention covers it", () => {
  for (const { file, doc } of dashboards) {
    expect(doc.time?.from, `${file} default range`).toBe("now-7d");
    expect(doc.time?.to, `${file} default range`).toBe("now");
  }
});

describe("the raw-events dashboard reads the whole schema", () => {
  const raw = dashboards.find((d) => d.file === "hypersweeper-events.json");
  const sql = raw ? queriesOf(raw.doc).map((q) => q.sql).join("\n") : "";

  it("exists", () => {
    expect(raw, "grafana/hypersweeper-events.json").toBeDefined();
  });

  // A new column appended to DATASET_BLOBS lands here as a failing test naming
  // the blob nobody added to the explorer.
  it.each(DATASET_BLOBS.map((column, i) => [i + 1, column.name] as const))(
    "selects blob%i as %s",
    (index, name) => {
      expect(sql).toMatch(new RegExp(`\\bblob${index}\\s+AS\\s+${sqlAlias(name)}\\b`));
    },
  );

  it.each(DATASET_DOUBLES.map((column, i) => [i + 1, column.name] as const))(
    "selects double%i as %s",
    (index, name) => {
      expect(sql).toMatch(new RegExp(`\\bdouble${index}\\s+AS\\s+${sqlAlias(name)}\\b`));
    },
  );

  it("selects the index, the timestamp and the sample interval", () => {
    expect(sql).toMatch(/\bindex1\s+AS\s+mode\b/);
    expect(sql).toMatch(/\btimestamp\b/);
    expect(sql).toMatch(/\b_sample_interval\s+AS\s+sample_interval\b/);
  });

  // `t` is epoch milliseconds and the table sets `unit: short` for every field
  // it does not override, so without a date unit of its own the timestamp
  // *exports* as `1.79 Tri` — while the table's own time rendering shows it
  // correctly on screen. A bug that is only visible in the CSV is exactly the
  // kind that has to be pinned rather than watched for.
  it("gives the timestamp column a date unit, so it survives a CSV export", () => {
    const panels = flatten(raw?.doc.panels ?? []).filter((panel) =>
      (panel.targets ?? []).some((target) => /\bAS\s+t\b/.test(target.query ?? "")),
    );
    expect(panels.length, "no panel selects a timestamp").toBeGreaterThan(0);
    for (const panel of panels) {
      const unit = (panel.fieldConfig?.overrides ?? [])
        .filter((o) => o.matcher.id === "byName" && o.matcher.options === "t")
        .flatMap((o) => o.properties)
        .find((property) => property.id === "unit")?.value;
      expect(unit, `panel ${panel.id} has no date unit on t`).toMatch(/^(dateTime|time:)/);
    }
  });

  // blob13 today is nothing; the day it is something, the regexes above are
  // what fails. This is the belt to that braces: nothing may address a column
  // past the end of the layout, which is how a copy-paste error reads a column
  // that is not being written.
  it("addresses no column past the end of the layout", () => {
    for (const { doc } of dashboards) {
      for (const { where, sql: query } of queriesOf(doc)) {
        for (const [, index] of query.matchAll(/\bblob(\d+)\b/g)) {
          expect(Number(index), `${where} reads blob${index}`).toBeLessThanOrEqual(
            DATASET_BLOBS.length,
          );
        }
        for (const [, index] of query.matchAll(/\bdouble(\d+)\b/g)) {
          expect(Number(index), `${where} reads double${index}`).toBeLessThanOrEqual(
            DATASET_DOUBLES.length,
          );
        }
      }
    }
  });
});

describe.each(dashboards)("$file", ({ doc }) => {
  // The bug this whole change started from: the panel in Grafana had no
  // predicate on `timestamp` at all, so the time picker moved and the numbers
  // did not. It is invisible — the panel looks fine and shows every event ever
  // recorded — so it is pinned rather than watched for.
  it("filters every query by the dashboard's time range", () => {
    for (const { where, sql } of queriesOf(doc)) {
      expect(sql, `${where} has no time predicate`).toContain("${__from:date:seconds}");
      expect(sql, `${where} has no time predicate`).toContain("${__to:date:seconds}");
    }
  });

  // Analytics Engine stores a sample and gives each stored row a
  // _sample_interval: how many real events it stands for. COUNT(*) counts
  // stored rows, which is wrong by the sampling rate — plausibly, silently, and
  // worst for exactly the popular boards worth reading.
  it("counts with _sample_interval, never COUNT(*)", () => {
    for (const { where, sql } of queriesOf(doc)) {
      expect(sql, `${where} uses COUNT(*)`).not.toMatch(/count\s*\(\s*\*\s*\)/i);
      if (/\bsum\s*\(/i.test(sql)) expect(sql, where).toMatch(/_sample_interval/);
    }
  });

  it("uses only the datasource variable, so it imports onto any stack", () => {
    for (const panel of flatten(doc.panels)) {
      if (panel.type === "row") continue;
      expect(panel.datasource?.uid, `panel ${panel.id}`).toBe("${ds}");
      for (const target of panel.targets ?? []) {
        expect(target.datasource?.uid, `panel ${panel.id} [${target.refId}]`).toBe("${ds}");
      }
    }
    expect(doc.templating.list.some((v) => v.name === "ds" && v.type === "datasource")).toBe(true);
  });

  // A query naming a variable the dashboard does not declare interpolates to
  // the literal `$name` and the whole panel fails, in Grafana and in
  // check_dashboards.mjs alike.
  it("declares every variable its queries reference", () => {
    const declared = new Set(doc.templating.list.map((v) => v.name));
    for (const { where, sql } of queriesOf(doc)) {
      // `${__from…}` and friends are Grafana's own globals, not ours.
      const withoutGlobals = sql.replaceAll(/\$\{[^}]*\}/g, "");
      for (const [, name] of withoutGlobals.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
        expect(declared, `${where} references $${name}`).toContain(name);
      }
    }
  });

  // The difficulty panels pivot on the tier *values*, not on a column number —
  // the one place a dashboard hard-codes a vocabulary. `parseEvent` rejects any
  // difficulty outside `catalog.difficulties`, so a tier added there and not
  // here would simply stop being counted: the stacked trend would quietly not
  // add up to the total beside it. Same idea as the blob table in
  // analyticsSchema.test.ts, one level down.
  it("names exactly the difficulty tiers the catalogue defines", () => {
    const tiers = new Set<string>(catalog.difficulties);
    const seen = new Set<string>();
    for (const { where, sql } of queriesOf(doc)) {
      for (const match of sql.matchAll(/blob2\s*=\s*'([^']*)'/g)) {
        const tier = match[1] ?? "";
        // `blob2 = '$difficulty'` is the filter variable, not a literal tier.
        if (tier.startsWith("$")) continue;
        expect(tiers, `${where} names difficulty '${tier}'`).toContain(tier);
        seen.add(tier);
      }
    }
    // Whichever dashboard pivots on the tiers must name all of them.
    if (seen.size > 0) expect([...seen].sort()).toEqual([...tiers].sort());
  });

  // The filter dropdowns are hard-coded `custom` variables — the other place a
  // dashboard restates a vocabulary the catalogue owns, one level up from the
  // blob numbers. A value missing from one is invisible on the dashboard and in
  // the JSON alike: the filter cannot reach those rows, and *every other*
  // selection silently excludes them. `volume` (cube3d, "Volumetric") was
  // missing from all three Family filters until this test.
  it.each(TAXONOMIES)("offers exactly the %s values the catalogue defines", (name, values) => {
    const variable = doc.templating.list.find((v) => v.name === name);
    expect(variable, `no $${name} variable`).toBeDefined();
    const expected = [...values].sort();
    const offered = (variable?.options ?? []).map((o) => o.value).filter((v) => v !== "all");
    expect(offered.slice().sort(), `$${name} options`).toEqual(expected);
    // `query` is what Grafana re-expands the options from on import, so the two
    // halves of a custom variable have to say the same thing.
    const declared = (variable?.query ?? "").split(",").filter((v) => v !== "all");
    expect(declared.sort(), `$${name} query`).toEqual(expected);
  });

  it("is importable: v1 schema, a uid, a title and unique panel ids", () => {
    // 42 is the final v1 schema version — Grafana froze it when the dashboard
    // API moved to the app platform, so this number does not drift.
    expect(doc.schemaVersion).toBe(42);
    expect(doc.uid).toMatch(/^[a-z0-9-]+$/);
    expect(doc.title).toBeTruthy();
    const ids = flatten(doc.panels).map((panel) => panel.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });
});
