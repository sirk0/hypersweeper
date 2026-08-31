import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
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

type Panel = {
  id: number;
  type: string;
  title?: string;
  panels?: Panel[];
  targets?: { refId: string; query?: string; datasource?: { uid?: string } }[];
  datasource?: { uid?: string };
};

type Dashboard = {
  uid: string;
  title: string;
  schemaVersion: number;
  panels: Panel[];
  templating: { list: { name: string; type: string }[] };
};

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
