import { describe, expect, it } from "vitest";
import { bandOf } from "../../src/difficulty";
import { GROUPS, LEVELS, levelByKey } from "../../src/levels";
import { MENU_GROUPS, TWO_COLUMNS, WIDE_QUERY } from "../../src/view/groups";
import { SHOWCASE } from "../../src/view/home";

// The desktop's sidebar groups the catalog's families (view/groups.ts): every
// tiling must be on exactly one group's page, or the desktop cannot reach it.
describe("the desktop's groups of tilings", () => {
  it("hold every family exactly once, and nothing else", () => {
    const listed = MENU_GROUPS.flatMap((g) => g.families);
    expect([...listed].sort()).toEqual(GROUPS.map((g) => g.key).sort());
  });

  it("are five, each with tilings, and together list every tiling", () => {
    expect(MENU_GROUPS).toHaveLength(5);
    const plain = LEVELS.filter((l) => !l.decor);
    const counts = MENU_GROUPS.map(
      (g) => plain.filter((l) => (g.families as readonly string[]).includes(l.group)).length,
    );
    for (const n of counts) expect(n).toBeGreaterThan(0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(plain.length);
  });

  it("draw their icons from a tiling of their own", () => {
    for (const g of MENU_GROUPS) {
      const level = LEVELS.find((l) => l.key === g.icon);
      expect(level, g.icon).toBeDefined();
      expect(g.families as readonly string[]).toContain(level!.group);
    }
  });

  it("switch on at Hypersweeper's width, and two columns only inside it", () => {
    expect(WIDE_QUERY).toContain("(min-width: 900px) and (min-height: 501px)");
    expect(TWO_COLUMNS).toContain("min-width: 1100px");
  });
});

describe("Quick start's pictures", () => {
  it("show a tiling of their own difficulty", () => {
    for (const [band, key] of Object.entries(SHOWCASE)) {
      expect(levelByKey(key), key).toBeDefined();
      expect(bandOf(key), key).toBe(band);
    }
  });
});
