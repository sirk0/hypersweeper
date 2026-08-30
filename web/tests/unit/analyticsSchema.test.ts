import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it } from "vitest";
import catalog from "@data/catalog.json";
import presets from "@data/presets.json";
import {
  DATASET_BLOBS,
  DATASET_DOUBLES,
  boardInfo,
} from "../../src/analyticsEvent";
import {
  fullModeLabel,
  surfaceOf,
  tilingOf,
  SOLID_MODES,
} from "../../src/boards/catalog";
import { familyKeyOf } from "../../src/ui/boardFacts";

// The two oracles that keep a positional schema honest. Neither tests
// behaviour: they test that three descriptions of the same thing still agree,
// which is the only failure mode a blob layout has. See docs/agents/metrics.md.

const DOC = fileURLToPath(new URL("../../../docs/agents/metrics.md", import.meta.url));

/** The regular tiling a shaped flat board is cut from — the same table
 * `boardFacts.ts` reads, since those modes are their own and `tilingOf` does
 * not know them. */
function shapedTilingOf(mode: string): string | null {
  const shaped = catalog.menu.shapedModes as Record<string, string[]>;
  for (const [key, modes] of Object.entries(shaped)) {
    if (modes.includes(mode)) return key;
  }
  return null;
}

/** The `| \`blob4\` | board | … |` rows of the doc's schema table, in order. */
function docColumns(prefix: "blob" | "double"): { index: number; name: string }[] {
  const rows = readFileSync(DOC, "utf8").split("\n");
  const pattern = new RegExp(`^\\|\\s*\`${prefix}(\\d+)\`\\s*\\|\\s*([^|]+?)\\s*\\|`);
  const found: { index: number; name: string }[] = [];
  for (const row of rows) {
    const hit = pattern.exec(row);
    if (hit) found.push({ index: Number(hit[1]), name: hit[2] as string });
  }
  return found;
}

describe("the documented schema", () => {
  // A column that moves is the one change nothing else in the repo notices:
  // the data just quietly changes meaning from the day of the deploy. The doc
  // is what a dashboard is built from, so the doc is what this pins.
  it("lists every blob, in order, under the name the code gives it", () => {
    const documented = docColumns("blob");
    expect(documented.map((c) => c.index)).toEqual(
      DATASET_BLOBS.map((_, i) => i + 1),
    );
    expect(documented.map((c) => c.name)).toEqual(DATASET_BLOBS.map((c) => c.name));
  });

  it("lists every double, in order, under the name the code gives it", () => {
    const documented = docColumns("double");
    expect(documented.map((c) => c.index)).toEqual(
      DATASET_DOUBLES.map((_, i) => i + 1),
    );
    expect(documented.map((c) => c.name)).toEqual(DATASET_DOUBLES.map((c) => c.name));
  });

  it("documents the index column too", () => {
    expect(readFileSync(DOC, "utf8")).toContain("`index1`");
  });
});

describe("the generated board table", () => {
  const modes = Object.keys(presets.presets);

  it("covers exactly the modes this build can play", () => {
    // `analyticsEvent.ts` validates a mode against presets and then looks it up
    // in modeInfo. A mode in one and not the other is a board the collector
    // accepts and cannot name.
    expect(Object.keys(catalog.modeInfo).sort()).toEqual([...modes].sort());
  });

  it("agrees with the app's own naming for every board", () => {
    // `modeInfo` is generated from the Python catalog (scripts/export_data.py)
    // because the Worker bundle cannot run the TypeScript one. This is what
    // proves the two derivations still say the same thing.
    for (const mode of modes) {
      const info = boardInfo(mode);
      expect(info, mode).not.toBeNull();
      expect(info?.label, mode).toBe(fullModeLabel(mode));
      expect(info?.family, mode).toBe(familyKeyOf(mode));
      // `tiling` is the periodic mode's tiling, the shaped board's cut-out
      // tiling, or empty. A solid or an aperiodic board is made of no tiling
      // the catalogue names.
      const tiling = tilingOf(mode) ?? shapedTilingOf(mode) ?? "";
      expect(info?.tiling, mode).toBe(tiling);
      const surface = surfaceOf(mode);
      if (surface) expect(info?.surface, mode).toBe(surface.key);
      else expect(info?.surface, mode).toBe(SOLID_MODES.includes(mode) ? "solid" : "flat");
    }
  });

  it("gives every board a name and a family", () => {
    for (const mode of modes) {
      const info = boardInfo(mode);
      expect(info?.label, mode).toBeTruthy();
      expect(info?.family, mode).toBeTruthy();
    }
  });
});
