import { afterEach, describe, expect, it } from "vitest";
import { menuIcon, previewIcon, setIconPalette } from "../../src/ui/icons";
import { SOLID_MODES } from "../../src/boards/catalog";
import { theme } from "../../src/ui/theme";

// The desktop menu's card previews (icons.ts `previewIcon`). A card is four
// times the size of a menu row's glyph, so it shows the board rather than a
// picture of one: a flat board as its tiling run to the edges, a solid as the
// real solid lit. What these pin is which keys get which treatment — the rule
// is not "is it flat" but "is there a lattice to repeat" — and that the
// previews are cached under the same single-writer rule the small icons are.

afterEach(() => setIconPalette(undefined));

const paths = (svg: string): number => (svg.match(/<path/g) ?? []).length;

describe("card previews", () => {
  it("wallpapers a tiling to the edges of its own box", () => {
    const square = previewIcon("square");
    expect(square.tiled).toBe(true);
    // Wider than tall and sliced, so one drawing covers a card of any width.
    expect(square.svg).toContain('viewBox="0 0 100 70"');
    expect(square.svg).toContain('preserveAspectRatio="xMidYMid slice"');
    // Many tiles, where the row's glyph is a single square.
    expect(paths(square.svg)).toBeGreaterThan(10);
    expect(paths(menuIcon("square"))).toBe(1);
  });

  it("wallpapers from a template and from a stated domain alike", () => {
    // `rhombitrihex` is an ArchTemplate; `hex` and `penrose` are boards built
    // by hand, whose repeats backgroundPattern.ts states. Both paths tile.
    for (const key of ["rhombitrihex", "deltoidal", "hex", "penrose", "sphinx"]) {
      expect(previewIcon(key).tiled, key).toBe(true);
    }
  });

  it("keeps the aliases pointing at the same drawing as the row", () => {
    // The home-page keys resolve before anything else, exactly as `draw` does:
    // Classic is squares, 3D is the sphere board.
    expect(previewIcon("classic").svg).toBe(previewIcon("square").svg);
    expect(previewIcon("3d").svg).toBe(previewIcon("sphere").svg);
    expect(previewIcon("tri").svg).toBe(previewIcon("trigrid").svg);
  });

  it("draws a solid as the real board, not the row's symbol", () => {
    // The three solids whose small icon is a hand-drawn symbol — a card has
    // room for the board itself, so it gets the board.
    for (const key of ["tetrahedron", "cube", "cubeframe"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      expect(preview.svg, key).not.toBe(menuIcon(key));
      // Every cell of the visible half, where the symbol is a few strokes.
      expect(paths(preview.svg), key).toBeGreaterThan(20);
    }
  });

  it("draws the boards that do not repeat from the board itself", () => {
    // These have a `DOMAINS` entry — the periodic stand-in the *page* pattern
    // uses — and must not take it: repeating a sample of an aperiodic tiling
    // or a substitution claims the one thing that is not true of it. Cropped
    // from the real patch, they fill the card like any other tiling.
    for (const key of ["penrose", "spectre", "sphinx", "chair", "pentaflake", "carpet"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(true);
      expect(paths(preview.svg), key).toBeGreaterThan(10);
    }
    // ...and the two family rows resolve onto their board's drawing.
    expect(previewIcon("aperiodic").svg).toBe(previewIcon("penrose").svg);
    expect(previewIcon("fractal").svg).toBe(previewIcon("sphinx").svg);
  });

  it("fits the whole patch where the board's shape is the point", () => {
    // A spiral and an island outline are global: cropped close they are a hex
    // grid, which is true of the neighbourhood and the wrong thing to say. So
    // they are fitted whole, and are still the board rather than the row's
    // hand-drawn glyph.
    for (const key of ["phyllotaxis", "gosper"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      expect(paths(preview.svg), key).toBeGreaterThan(paths(menuIcon(key)));
    }
  });

  it("keeps the row's figure when there is no lattice and no solid", () => {
    // A family row, a surface and a shaped board: the first two have no tiling
    // of their own, and the shaped boards *are* a tiling — cut to an outline,
    // which is the one thing a wallpaper of them could not show. Each is the
    // row's own drawing, repainted (see below), so the shape count matches
    // while the colours do not.
    for (const key of ["uniform", "torus", "hexhex"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      expect(paths(preview.svg), key).toBe(paths(menuIcon(key)));
    }
  });

  it("turns the palette down for a card, without touching the rows", () => {
    // A colour tuned for a 38px glyph shouts over a card, so previews are
    // drawn through a damped tint. The row icons must come out of it
    // untouched — same module-level palette, same cache.
    const row = menuIcon("square");
    const chroma = (svg: string): number => {
      const hexes = [...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
      return Math.max(
        ...hexes.map((hex) => {
          const v = parseInt(hex.slice(1), 16);
          const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
          return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        }),
      );
    };
    expect(chroma(previewIcon("square").svg)).toBeLessThan(chroma(row));
    // ...and asking for the preview first did not repaint the row.
    expect(menuIcon("square")).toBe(row);
  });

  it("keeps every solid inside its box", () => {
    // The drawing is fitted to the silhouette's *span* and then placed by its
    // *centre* (icons.ts `solidFaces`). Placing it by the board's origin
    // instead is not the same thing for a solid whose projection is lopsided:
    // a tetrahedron runs from its apex at +R to the opposite face plane at
    // -R/3, and the apex hung over the top of the viewBox, where the SVG root
    // clipped it off — on the Tetrahedron and Tetrahedron frame cards, on the
    // Platonic family card (which aliases onto the tetrahedron), and on the
    // 38px row glyph of the frame.
    const outside = (svg: string): number[] =>
      [...svg.matchAll(/ d="([^"]*)"/g)]
        .flatMap((m) => m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? [])
        .map(Number)
        .filter((v) => v < -0.01 || v > 100.01);
    for (const key of [...SOLID_MODES, "platonic"]) {
      expect(outside(previewIcon(key).svg), `${key} card`).toEqual([]);
      expect(outside(menuIcon(key)), `${key} row`).toEqual([]);
    }
  });

  it("repaints a cached preview when the palette changes", () => {
    const before = previewIcon("square").svg;
    setIconPalette(theme("sand").icons);
    expect(previewIcon("square").svg).not.toBe(before);
    setIconPalette(undefined);
    expect(previewIcon("square").svg).toBe(before);
  });
});
