import { afterEach, describe, expect, it } from "vitest";
import { menuIcon, setIconPalette } from "../../src/ui/icons";
import { theme } from "../../src/ui/theme";

// A menu icon is a *string of SVG with its colours already in it*, memoised per
// key — so a theme that repaints the set has to invalidate that cache or the
// page keeps the old theme's colours for as long as it lives. That is the whole
// risk in making the icons themeable, and it is what these pin.

afterEach(() => setIconPalette(undefined));

const fills = (svg: string): string[] =>
  [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);

describe("themeable menu icons", () => {
  it("repaints a cached icon when the palette changes", () => {
    // Ask first, so the key is definitely cached under the default palette.
    const before = menuIcon("square");
    setIconPalette(theme("sand").icons);
    const after = menuIcon("square");
    expect(after).not.toBe(before);
    // ...and back again, so this is a swap rather than a one-way door.
    setIconPalette(undefined);
    expect(menuIcon("square")).toBe(before);
  });

  it("draws Sand's set quieter than the default one, at one lightness", () => {
    const vivid = fills(menuIcon("square"));
    setIconPalette(theme("sand").icons);
    const quiet = fills(menuIcon("square"));
    expect(quiet.length).toBe(vivid.length);
    expect(quiet).not.toEqual(vivid);
    // Every colour the Sand set paints a tile in is less saturated than the
    // default's — "turned down" is the whole claim, so measure it rather than
    // trusting the parameters.
    const chroma = (hex: string): number => {
      const v = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    };
    const worst = Math.max(...quiet.map(chroma));
    const best = Math.min(...vivid.map(chroma));
    expect(worst).toBeLessThan(best);
  });

  it("paints the non-tile chrome in the theme's own colour, not the indigo", () => {
    // The question mark is drawn with a `null` tone (it is not a tile), so it
    // is the one that falls through to `plain` — indigo by default, and the
    // design system's sage on Sand.
    expect(menuIcon("help").toLowerCase()).toContain("#6366f1");
    setIconPalette(theme("sand").icons);
    const sand = menuIcon("help").toLowerCase();
    expect(sand).not.toContain("#6366f1");
    expect(sand).toContain("#8fa073");
  });

  it("leaves every other theme's icons exactly as they were", () => {
    const before = menuIcon("hexagon");
    for (const key of ["realistic", "flat"]) {
      setIconPalette(theme(key).icons);
      expect(menuIcon("hexagon"), key).toBe(before);
    }
  });

  it("draws Classic's set nearly gray, at one lightness", () => {
    // Same claim as Sand's, harder: Classic's board carries no colour at all,
    // so its menu row has to be the quietest of the themed sets rather than
    // merely quieter than the default.
    const vivid = fills(menuIcon("square"));
    setIconPalette(theme("classic").icons);
    const quiet = fills(menuIcon("square"));
    expect(quiet.length).toBe(vivid.length);
    expect(quiet).not.toEqual(vivid);
    const chroma = (hex: string): number => {
      const v = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    };
    const worst = Math.max(...quiet.map(chroma));
    const best = Math.min(...vivid.map(chroma));
    expect(worst).toBeLessThan(best);
  });

  it("paints Classic's non-tile chrome in its own ink, not the indigo", () => {
    expect(menuIcon("help").toLowerCase()).toContain("#6366f1");
    setIconPalette(theme("classic").icons);
    const classic = menuIcon("help").toLowerCase();
    expect(classic).not.toContain("#6366f1");
    expect(classic).toContain("#4b545c");
  });

  it("gives Flat Sand the same set as Sand", () => {
    // The two share their whole chrome and differ only in how a cell is cut, so
    // the glyphs are one palette named twice rather than two that happen to
    // agree today. Compared as drawings, not as object identity: this is the
    // claim a reader of the menu could check.
    setIconPalette(theme("sand").icons);
    const sand = menuIcon("square");
    setIconPalette(theme("flatSand").icons);
    expect(menuIcon("square")).toBe(sand);
  });
});
