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

  it("leaves the Bright theme's icons exactly as they were", () => {
    const before = menuIcon("hexagon");
    for (const key of ["bright", "realistic", "flat"]) {
      setIconPalette(theme(key).icons);
      expect(menuIcon("hexagon"), key).toBe(before);
    }
  });

  it("paints Classic's tiles grey, the way its board is grey", () => {
    // The whole claim: this theme's board carries no colour at any cut
    // (`BOARD_LOOKS.classic` is monochrome), so neither do the rows that open
    // one. Measured rather than trusted to the parameter — `iconHex` scales the
    // chroma available at a lightness, so a zero there has to come out with
    // equal channels, not merely a low one.
    setIconPalette(theme("classic").icons);
    for (const key of ["square", "hexagon", "triangle"]) {
      for (const hex of fills(menuIcon(key))) {
        const v = parseInt(hex.slice(1), 16);
        const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        // The `plain` ramp is this theme's own slate and is deliberately not
        // neutral; a tile glyph never reaches it (see the test below).
        if (["#4b545c", "#6f787f", "#2a3036", "#3f474d"].includes(hex)) continue;
        expect(Math.max(r, g, b) - Math.min(r, g, b), `${key} ${hex}`).toBeLessThanOrEqual(1);
      }
    }
    // ...and Sand's are *not* grey: the two quieted themes no longer share a
    // register, which is what this replaces.
    const classic = menuIcon("square");
    setIconPalette(theme("sand").icons);
    expect(menuIcon("square")).not.toBe(classic);
  });

  it("paints Classic's non-tile chrome in its own ink, not the indigo", () => {
    expect(menuIcon("help").toLowerCase()).toContain("#6366f1");
    setIconPalette(theme("classic").icons);
    const classic = menuIcon("help").toLowerCase();
    expect(classic).not.toContain("#6366f1");
    expect(classic).toContain("#4b545c");
  });

  it("gives a folded-away theme key the set of the theme it became", () => {
    // `flatSand` was Sand's palette at another cut, so a record naming it
    // resolves to Sand — and must therefore draw Sand's glyphs, not the vivid
    // default. Compared as drawings, not as object identity: this is the claim
    // a reader of the menu could check.
    setIconPalette(theme("sand").icons);
    const sand = menuIcon("square");
    setIconPalette(theme("flatSand").icons);
    expect(menuIcon("square")).toBe(sand);
  });
});
