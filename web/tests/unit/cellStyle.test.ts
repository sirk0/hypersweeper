import { describe, expect, it } from "vitest";
import { SRGBColorSpace } from "three";
import { cellPalette } from "../../src/render/shapePalette";
import {
  BOARD_LOOKS,
  BOARD_SHAPES,
  boardShape,
  boardStyleKey,
  CELL_STYLES,
  CELL_STYLE_KEYS,
  cellStyle,
  cellStyleLoops,
  cellVertexCount,
  DEFAULT_CELL_STYLE,
  DEFAULT_FINISH,
  finishStyle,
  type Finish,
  DEFAULT_SHAPE,
  resolveCellStyle,
  resolveShape,
  SHAPE_KEYS,
  type CellProfile,
} from "../../src/render/cellStyle";
import { DEFAULT_THEME, THEME_KEYS } from "../../src/ui/theme";

// The cell tables. A style is composed from a **shape** (the cut) and a theme's
// **look** (the colours), and `CELL_STYLES` is the product, so the invariants
// here are of two kinds: the ones a bad profile would break *in the vertex
// buffer* — a cell writing more vertices than it was allocated overruns into
// its neighbour's slice — plus the ones that say the composition keeps the two
// halves apart.

const profiles = (): [string, string, CellProfile][] =>
  CELL_STYLE_KEYS.flatMap((key) => [
    [key, "flat", CELL_STYLES[key]!.flat] as [string, string, CellProfile],
    [key, "solid", CELL_STYLES[key]!.solid] as [string, string, CellProfile],
  ]);

const crown = (p: CellProfile, state: "closed" | "open"): number =>
  p[state][p[state].length - 1]!.height;

describe("cell styles", () => {
  it("defaults to the pair the two settings ship at", () => {
    expect(DEFAULT_CELL_STYLE).toBe(boardStyleKey(DEFAULT_SHAPE, DEFAULT_THEME));
    expect(cellStyle(DEFAULT_CELL_STYLE).shape).toBe("classic");
    expect(cellStyle(DEFAULT_CELL_STYLE).theme).toBe("sand");
    // cellStyle.ts writes the default theme out rather than importing it from
    // ui/theme.ts, which imports *this* module. This is what keeps the two in
    // step.
    expect(Object.hasOwn(BOARD_LOOKS, DEFAULT_THEME)).toBe(true);
    expect(cellStyle(DEFAULT_CELL_STYLE).theme).toBe(DEFAULT_THEME);
    expect(resolveShape(null)).toBe(DEFAULT_SHAPE);
  });

  it("holds every shape crossed with every theme, once each", () => {
    // The table is the *product* of the two settings: every pair a player can
    // choose must be in it, and nothing else, or a look is unreachable (which
    // is exactly what the five-entry table this replaces did to six of the
    // nine).
    expect(Object.keys(BOARD_LOOKS).sort()).toEqual([...THEME_KEYS].sort());
    const pairs = SHAPE_KEYS.flatMap((s) => THEME_KEYS.map((t) => boardStyleKey(s, t)));
    expect(new Set(pairs)).toEqual(new Set(CELL_STYLE_KEYS));
    expect(pairs).toHaveLength(CELL_STYLE_KEYS.length);
    for (const key of CELL_STYLE_KEYS) {
      const style = CELL_STYLES[key]!;
      expect(key).toBe(`${style.shape}/${style.theme}`);
    }
  });

  it("falls back for a style this build does not have", () => {
    // The key reaches a mesh builder from a theme record, so: a key from a
    // newer build, and a key that is only an Object property (the `in` vs
    // `Object.hasOwn` trap). "gloss" and "soft" were styles before the merge.
    expect(resolveCellStyle("hologram")).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle("toString")).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle(null)).toBe(DEFAULT_CELL_STYLE);
    expect(resolveCellStyle("gloss")).toBe(DEFAULT_CELL_STYLE);
    // ...including the five keys that *were* whole styles before the split.
    for (const old of ["flat", "classic", "realistic", "sand", "flatSand"]) {
      expect(resolveCellStyle(old), old).toBe(DEFAULT_CELL_STYLE);
    }
    expect(resolveCellStyle("realistic/bright")).toBe("realistic/bright");
    // A shape key is read the same way, since it arrives from a record too.
    expect(resolveShape("hologram")).toBe(DEFAULT_SHAPE);
    expect(resolveShape("toString")).toBe(DEFAULT_SHAPE);
  });

  it("draws the classic theme's board in gray, at every cut", () => {
    // Monochrome is the *theme's*, not the cut's — which is the whole point of
    // the split: a grey board used to be available only as a beveled one.
    for (const shape of SHAPE_KEYS) {
      expect(cellStyle(boardStyleKey(shape, "classic")).monochrome, shape).toBe(true);
      for (const t of ["bright", "sand"]) {
        expect(cellStyle(boardStyleKey(shape, t)).monochrome, `${shape}/${t}`).toBeUndefined();
      }
    }
  });

  it("keeps the cut out of the colours and the colours out of the cut", () => {
    // One shape at three themes is three boards with identical geometry; one
    // theme at three shapes is three cuts with identical tints.
    for (const shape of SHAPE_KEYS) {
      const cut = boardShape(shape);
      for (const t of THEME_KEYS) {
        const style = cellStyle(boardStyleKey(shape, t));
        expect(style.flat, `${shape}/${t}`).toEqual(cut.flat);
        expect(style.solid, `${shape}/${t}`).toEqual(cut.solid);
        expect(style.unlit, `${shape}/${t}`).toBe(cut.unlit);
        expect(style.flatMine, `${shape}/${t}`).toBe(cut.flatMine);
      }
    }
    for (const t of THEME_KEYS) {
      const look = BOARD_LOOKS[t]!;
      for (const shape of SHAPE_KEYS) {
        const style = cellStyle(boardStyleKey(shape, t));
        expect(style.boardTint, `${shape}/${t}`).toBe(look.boardTint);
        expect(style.digitFont, `${shape}/${t}`).toBe(look.digitFont);
      }
    }
  });

  it("labels every shape, and names the shape and theme on every style", () => {
    for (const key of SHAPE_KEYS) {
      const shape = BOARD_SHAPES[key]!;
      expect(shape.key).toBe(key);
      expect(shape.label.length).toBeGreaterThan(0);
      expect(shape.hint.length).toBeGreaterThan(0);
    }
    for (const key of CELL_STYLE_KEYS) {
      const style = CELL_STYLES[key]!;
      expect(style.key).toBe(key);
      expect(SHAPE_KEYS).toContain(style.shape);
      expect(THEME_KEYS).toContain(style.theme);
    }
  });

  it("only ever overrides what the cut already declares", () => {
    // A theme may quieten a dome's gradient or its translucency; it may not
    // *give* a flat plate either, or the cut would stop being the cut.
    for (const shape of SHAPE_KEYS) {
      const cut = boardShape(shape);
      for (const t of THEME_KEYS) {
        const style = cellStyle(boardStyleKey(shape, t));
        if (cut.shade === undefined) expect(style.shade, `${shape}/${t}`).toBeUndefined();
        if (cut.openAlpha === undefined) {
          expect(style.openAlpha, `${shape}/${t}`).toBeUndefined();
        }
      }
    }
  });

  it("gives both states of a profile the same loop count", () => {
    // The one that matters: an opened cell is re-cut into the slice of the
    // buffer the closed one wrote, so a mismatch corrupts the next cell.
    for (const [key, kind, profile] of profiles()) {
      expect(() => cellStyleLoops(profile), `${key} ${kind}`).not.toThrow();
      expect(profile.closed.length, `${key} ${kind}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("counts a cell's vertices from its loops", () => {
    // A square at two loops: 4 top-fan triangles + a ring of 4 quads.
    const twoLoop: CellProfile = {
      gap: 0,
      closed: [{ inset: 0, height: 0 }, { inset: 0.1, height: 0.2 }],
      open: [{ inset: 0, height: 0 }, { inset: 0.1, height: -0.1 }],
    };
    expect(cellVertexCount(4, twoLoop)).toBe(36); // 4 * (3 + 6)
    expect(cellVertexCount(6, twoLoop)).toBe(54);
    const threeLoop: CellProfile = {
      gap: 0,
      closed: [...twoLoop.closed, { inset: 0.3, height: 0.25 }],
      open: [...twoLoop.open, { inset: 0.3, height: -0.15 }],
    };
    expect(cellVertexCount(4, threeLoop)).toBe(60); // 4 * (3 + 12)
    // Every real profile's count is divisible by 3 (whole triangles).
    for (const [, , profile] of profiles()) {
      expect(cellVertexCount(5, profile) % 3).toBe(0);
    }
  });

  it("stands a closed cell above an opened one, on every board", () => {
    for (const [key, kind, profile] of profiles()) {
      expect(crown(profile, "closed"), `${key} ${kind}`).toBeGreaterThan(
        crown(profile, "open"),
      );
    }
  });

  it("keeps a 3D board's relief low, and off the grout", () => {
    for (const key of CELL_STYLE_KEYS) {
      const style = CELL_STYLES[key]!;
      // Cells of a curved surface tilt against each other, so a plateau as tall
      // as a flat board's shingles over its neighbours at the silhouette.
      expect(crown(style.solid, "closed"), key).toBeLessThanOrEqual(0.15);
      // A solid is always lit, so its relief is what shows the shape there: a
      // style that flattens the *plane* (Flat draws unlit plates, where relief
      // would not show anyway) still stands its 3D tiles up.
      expect(crown(style.solid, "closed"), key).toBeGreaterThan(0.02);
      // Nothing on a solid cuts below the grout, or the two z-fight (a flat
      // board has no grout, so there a recess may go below zero).
      for (const loop of [...style.solid.open, ...style.solid.closed]) {
        expect(loop.height, key).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps every loop inside its cell", () => {
    for (const [key, kind, profile] of profiles()) {
      for (const loop of [...profile.closed, ...profile.open]) {
        expect(profile.gap + loop.inset, `${key} ${kind}`).toBeLessThan(0.9);
        expect(loop.inset, `${key} ${kind}`).toBeGreaterThanOrEqual(0);
      }
      // Loops run outward-in, so their insets ascend within a state.
      for (const state of ["closed", "open"] as const) {
        let previous = -1;
        for (const loop of profile[state]) {
          expect(loop.inset, `${key} ${kind} ${state}`).toBeGreaterThan(previous);
          previous = loop.inset;
        }
      }
    }
  });
});

// Sand's board is a quotation: the "shape hue, whispered" study the theme was
// designed from (option 1c of the palette exploration) computed its tiles with
// this repo's own OkLCh code, so the numbers below are what that study drew and
// what the theme has to keep landing on. They pin the two halves that make it
// that board — the quarter chroma, and the cusp blend being off so every hue
// sits at one lightness (a red triangle beside a green hexagon is the case that
// shows it; with the blend on, the triangle comes out a step darker).
describe("the Sand board tint", () => {
  const srgb = (
    style: string,
    tone: { sides: number; regularity: number },
    state: "hidden" | "revealed",
  ) =>
    `#${cellPalette(tone, "flat", false, cellStyle(style).boardTint)[state].getHexString(
      SRGBColorSpace,
    )}`;

  // Every cut, because the tint is the theme's: a tile of the domed board and
  // the same tile of the flat one are the *same colour*, and only what is drawn
  // on top of it differs.
  for (const style of SHAPE_KEYS.map((s) => boardStyleKey(s, "sand"))) {
    it(`lands on the study's own tones, shape by shape (${style})`, () => {
      for (const [sides, closed, opened] of [
        [3, "#c6a5a1", "#f6e9e7"],
        [4, "#c0a994", "#f3eae3"],
        [6, "#9eb5a0", "#e6efe7"],
      ] as const) {
        const tone = { sides, regularity: 1 };
        expect(srgb(style, tone, "hidden"), `${sides}-gon closed`).toBe(closed);
        expect(srgb(style, tone, "revealed"), `${sides}-gon opened`).toBe(opened);
      }
    });
  }

  it("leaves every other style's board exactly where it was", () => {
    // The tint is a per-style override, not a retune of SHAPE_PALETTE: a style
    // that names none must come out of the same call unchanged.
    for (const key of CELL_STYLE_KEYS) {
      if (cellStyle(key).theme === "sand") continue;
      const tone = { sides: 6, regularity: 1 };
      const withStyle = cellPalette(tone, "flat", false, cellStyle(key).boardTint);
      const plain = cellPalette(tone, "flat", false);
      expect(withStyle.hidden.getHex(), key).toBe(plain.hidden.getHex());
    }
  });
});

// The two halves of a style's finish the player owns rather than the theme
// (`finishStyle`). What matters here is that the override changes only what it
// is meant to: it may retune a material and a gradient, and it may never touch
// the geometry, because a board is cut from the profile and re-cut in place
// from the same slice of the buffer.
describe("the player's finish", () => {
  const FINISHES: Finish[] = [
    { gloss: false, pins: false },
    { gloss: false, pins: true },
    { gloss: true, pins: false },
    { gloss: true, pins: true },
  ];

  it("ships matte, with pins", () => {
    expect(DEFAULT_FINISH).toEqual({ gloss: false, pins: true });
  });

  it("never touches the geometry, whatever it is set to", () => {
    for (const key of CELL_STYLE_KEYS) {
      const style = cellStyle(key);
      for (const finish of FINISHES) {
        const cut = finishStyle(style, finish);
        expect(cut.flat, key).toEqual(style.flat);
        expect(cut.solid, key).toEqual(style.solid);
        expect(cellStyleLoops(cut.flat), key).toBe(cellStyleLoops(style.flat));
        expect(cellStyleLoops(cut.solid), key).toBe(cellStyleLoops(style.solid));
      }
    }
  });

  it("leaves the style's colour alone — that half is the theme's", () => {
    // Turning the gloss off must not make Realistic opaque or Classic
    // coloured: what the finish owns is the polish, not the palette.
    for (const key of CELL_STYLE_KEYS) {
      const style = cellStyle(key);
      for (const finish of FINISHES) {
        const cut = finishStyle(style, finish);
        expect(cut.openAlpha, key).toBe(style.openAlpha);
        expect(cut.boardTint, key).toBe(style.boardTint);
        expect(cut.monochrome, key).toBe(style.monochrome);
        expect(cut.unlit, key).toBe(style.unlit);
        expect(cut.albedo, key).toBe(style.albedo);
        expect(cut.key, key).toBe(style.key);
      }
    }
  });

  it("mattes the material and flattens the hotspot with the gloss off", () => {
    // A style that has two gradients calls the second one its matte reading, so
    // that is what the closed cells fall back to: the tile keeps its relief and
    // its edges and loses only the polish.
    const realistic = cellStyle(boardStyleKey("realistic", "bright"));
    const matte = finishStyle(realistic, { gloss: false, pins: true });
    expect(matte.material.roughness).toBeGreaterThan(realistic.material.roughness);
    expect(matte.material.metalness).toBe(0);
    expect(matte.shade).toEqual(realistic.openShade);
    expect(matte.openShade).toEqual(realistic.openShade);
    // A style with no gradient at all has nothing to flatten.
    const flat = cellStyle(boardStyleKey("flat", "bright"));
    expect(finishStyle(flat, { gloss: false, pins: true }).shade).toBeUndefined();
  });

  it("lends the glass finish to a style that has none, and keeps one that has", () => {
    const classic = cellStyle(boardStyleKey("classic", "classic"));
    const glossy = finishStyle(classic, { gloss: true, pins: false });
    expect(glossy.material.roughness).toBeLessThan(classic.material.roughness);
    expect(glossy.shade).toBeDefined();
    expect(glossy.shade!.center).toBeGreaterThan(glossy.shade!.rim);
    // Sand's gradient is tuned a hair off the bright one's on purpose;
    // answering the setting must not quietly retune the theme.
    const sand = cellStyle(boardStyleKey("realistic", "sand"));
    const kept = finishStyle(sand, { gloss: true, pins: false });
    expect(kept.shade).toEqual(sand.shade);
    expect(kept.material).toEqual(sand.material);
  });

  it("puts real markers on any style, and takes Realistic's away", () => {
    for (const key of CELL_STYLE_KEYS) {
      const style = cellStyle(key);
      expect(finishStyle(style, { gloss: false, pins: true }).solidMarkers, key).toBe(true);
      expect(finishStyle(style, { gloss: false, pins: false }).solidMarkers, key).toBeUndefined();
    }
  });
});
