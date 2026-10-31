import { afterEach, describe, expect, it } from "vitest";
import {
  cachedLevelPreview,
  iconBoard,
  levelPreview,
  menuIcon,
  previewIcon,
  setIconPalette,
} from "../../src/ui/icons";
import { FRACTAL_MODES, MENU, SHAPED_MODES, SOLID_MODES } from "../../src/modes/catalog";
import type { Board } from "@tiling/geometry/core";
import { presetBoard } from "../../src/modes/presets";
import { theme } from "../../src/ui/theme";

// The desktop menu's card previews (icons.ts `previewIcon`). A card is four
// times the size of a menu row's glyph, so it shows the board rather than a
// picture of one: a flat board as its tiling run to the edges, a solid as the
// real solid lit. What these pin is which keys get which treatment — the rule
// is not "is it flat" but "is there a lattice to repeat" — and that the
// previews are cached under the same single-writer rule the small icons are.

afterEach(() => setIconPalette(undefined));

const MANIFOLD_ORDER = MENU.manifoldOrder as string[];

const paths = (svg: string): number => (svg.match(/<path/g) ?? []).length;

describe("card previews", () => {
  it("wallpapers a tiling to the edges of its own box", () => {
    const square = previewIcon("square");
    expect(square.tiled).toBe(true);
    // Wider than tall and sliced, so one drawing covers a card of any width.
    expect(square.svg).toContain('viewBox="0 0 100 70"');
    expect(square.svg).toContain('preserveAspectRatio="xMidYMid slice"');
    // Many tiles, where the row's glyph is a two-by-two corner of the grid.
    expect(paths(square.svg)).toBeGreaterThan(10);
    expect(paths(menuIcon("square"))).toBe(4);
  });

  it("wallpapers from a template and from a stated domain alike", () => {
    // `rhombitrihex` is an ArchTemplate; `hex` and `penrose` are boards built
    // by hand, whose repeats backgroundPattern.ts states. Both paths tile.
    for (const key of ["rhombitrihex", "deltoidal", "hex", "penrose"]) {
      expect(previewIcon(key).tiled, key).toBe(true);
    }
  });

  it("keeps the aliases pointing at the same drawing as the row", () => {
    // The home-page keys resolve before anything else, exactly as `draw` does:
    // Classic is squares, 3D and the Sphere group are the Goldberg sphere of
    // hexagons — not "sphere", which is the pentagonal hexecontahedron.
    expect(previewIcon("classic").svg).toBe(previewIcon("square").svg);
    expect(previewIcon("3d").svg).toBe(previewIcon("c180").svg);
    expect(menuIcon("spheres")).toBe(menuIcon("c180"));
    expect(menuIcon("spheres")).not.toBe(menuIcon("sphere"));
    expect(previewIcon("tri").svg).toBe(previewIcon("trigrid").svg);
    // the Closed surfaces submenu is Klein's quartic, on the card and the row
    expect(previewIcon("hyperbolic-closed").svg).toBe(previewIcon("quartic").svg);
    expect(menuIcon("hyperbolic-closed")).toBe(menuIcon("quartic"));
    // ...and the Solids page is the dodecahedron
    expect(previewIcon("solids").svg).toBe(previewIcon("dodecahedron").svg);
    expect(menuIcon("solids")).toBe(menuIcon("dodecahedron"));
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

  it("draws a flat manifold as its easy board's squares, on the row and the card", () => {
    // Each surface is the board itself on its own immersion, one quad a cell,
    // where it used to be a smooth mesh of the surface. The row and the card
    // are one drawing at two sizes, so they draw the same cells — the card
    // with its solid grout laid under each, two paths a cell.
    for (const key of MANIFOLD_ORDER) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      expect(paths(preview.svg), key).toBeGreaterThan(20);
      expect(2 * paths(menuIcon(key)), key).toBe(paths(preview.svg));
    }
    // An open surface keeps the far side that shows through its open ends:
    // all sixteen by five of the easy cylinder's cells are drawn.
    expect(paths(menuIcon("cylinder"))).toBe(80);
    // The projective plane is played on the whole cubed sphere, each cell
    // twice (150 faces at the easy size), and is drawn as that sphere: the
    // near half of it, the far half culled.
    expect(paths(menuIcon("projective"))).toBeLessThan(150);
    expect(paths(menuIcon("projective"))).toBeGreaterThan(50);
    // ...and the Flat manifolds entry is still the torus.
    expect(previewIcon("manifolds").svg).toBe(previewIcon("torus").svg);
  });

  it("draws the boards that do not repeat from the board itself", () => {
    // These have a `DOMAINS` entry — the periodic stand-in the *page* pattern
    // uses — and must not take it: repeating a sample of an aperiodic tiling
    // or a substitution claims the one thing that is not true of it. Cropped
    // from the real patch, they fill the card like any other tiling.
    for (const key of ["penrose", "kitedart", "ammannbeenker", "spectre"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(true);
      expect(paths(preview.svg), key).toBeGreaterThan(10);
    }
    // ...and the family rows resolve onto their board's drawing.
    expect(previewIcon("aperiodic").svg).toBe(previewIcon("penrose").svg);
    expect(previewIcon("spiral").svg).toBe(previewIcon("phyllotaxis").svg);
    expect(previewIcon("reptile").svg).toBe(previewIcon("sphinx").svg);
    expect(previewIcon("fractal").svg).toBe(previewIcon("pentaflake").svg);
  });

  it("fits the whole patch where the board's shape is the point", () => {
    // An island outline is global: cropped close it is a hex grid, which is
    // true of the neighbourhood and the wrong thing to say. So it is fitted
    // whole, and is still the board rather than the row's hand-drawn glyph.
    const preview = previewIcon("gosper");
    expect(preview.tiled).toBe(false);
    expect(paths(preview.svg)).toBeGreaterThan(paths(menuIcon("gosper")));
  });

  it("draws a fractal or a shaped board as its easy board, whole", () => {
    // A fractal is one tile grown into itself, and a shaped board a regular
    // tiling cut to an outline: either way the picture is the whole board,
    // which a crop or a wallpaper would lose. Every cell of the easy board is
    // one path, so the counts are the boards' own.
    for (const key of [...FRACTAL_MODES, ...Object.values(SHAPED_MODES).flat()]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      const board = presetBoard(key, "easy") as Board;
      expect(paths(preview.svg), key).toBe(board.polygons.size);
    }
  });

  it("crops a figure card to the drawing, so it fills the card", () => {
    // A figure is drawn in the row icon's square box; shown in that box, a
    // wide board sat at the card's height with air either side. Its viewBox
    // is the drawing's own bounds instead — wide for a wide board — and
    // still holds every point drawn.
    const box = (svg: string): number[] =>
      / viewBox="([^"]*)"/.exec(svg)![1]!.split(" ").map(Number);
    for (const key of ["doubletorus", "torus", "triangle", "steppedbipyramid", "hyperbolic73"]) {
      const { svg, tiled } = previewIcon(key);
      expect(tiled, key).toBe(false);
      const [x, y, w, h] = box(svg) as [number, number, number, number];
      const coords = [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) =>
        (m[1]!.match(/-?\d*\.?\d+/g) ?? []).map(Number),
      );
      const xs = coords.filter((_, i) => i % 2 === 0);
      const ys = coords.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs), key).toBeGreaterThanOrEqual(x);
      expect(Math.max(...xs), key).toBeLessThanOrEqual(x + w);
      expect(Math.min(...ys), key).toBeGreaterThanOrEqual(y);
      expect(Math.max(...ys), key).toBeLessThanOrEqual(y + h);
      // tight: no more than the outline margin to spare on any side
      expect(Math.min(...xs) - x, key).toBeLessThan(2);
      expect(Math.min(...ys) - y, key).toBeLessThan(2);
    }
    const [, , w, h] = box(previewIcon("doubletorus").svg) as number[];
    expect(w! / h!).toBeGreaterThan(1.5);
  });

  it("draws a level preview as the dealt board, at its difficulty", () => {
    // Every cell of the level, flat or bent onto its surface, so the card
    // changes with the difficulty the way the level does.
    for (const [mode, difficulty] of [
      ["square", "easy"],
      ["square", "hard"],
      ["penrose", "medium"],
      ["hyperbolic54", "easy"],
    ] as const) {
      const preview = levelPreview(mode, difficulty);
      expect(preview.tiled, mode).toBe(false);
      const board = presetBoard(mode, difficulty) as Board;
      expect(paths(preview.svg), `${mode} ${difficulty}`).toBe(board.polygons.size);
    }
    expect(levelPreview("square", "hard").svg).not.toBe(levelPreview("square", "easy").svg);
    // A wrapped surface is the real immersion, every cell painted back to
    // front over its own solid grout (two paths a cell), so no seam is a hole
    // onto the far side and no culled cell leaves a gap at the silhouette.
    for (const difficulty of ["easy", "hard"]) {
      expect(paths(levelPreview("torus", difficulty).svg), difficulty).toBe(
        2 * presetBoard("torus", difficulty).polygons.size,
      );
    }
    // ...and a drawn level is cached, under its difficulty.
    expect(cachedLevelPreview("square", "hard")).toBe(levelPreview("square", "hard"));
    expect(cachedLevelPreview("square", "medium")).toBeUndefined();
  });

  it("names the board a group's card is drawn from", () => {
    // A family, a submenu or a random pool shows a level too: the board its
    // icon is drawn from.
    expect(iconBoard("uniform")).toBe("rhombitrihex");
    expect(iconBoard("aperiodic")).toBe("penrose");
    expect(iconBoard("platonic")).toBe("tetrahedron");
    expect(iconBoard("manifolds")).toBe("torus");
    expect(iconBoard("hyperbolic-home")).toBe("hyperbolic54");
    expect(iconBoard("torus")).toBe("torus");
    expect(iconBoard("start")).toBeUndefined();
  });

  it("gives the home page's rows their own drawings", () => {
    // Classic and the Flat entry are corners of their grids, not one tile:
    // two by two squares, and hexagons three, two, three.
    expect(paths(menuIcon("classic"))).toBe(4);
    expect(paths(menuIcon("hex"))).toBe(8);
    // Custom is a real uniform tiling, not three loose regular polygons.
    expect(menuIcon("custom")).toBe(menuIcon("rhombitrihex"));
    // Hyperbolic is {5,4} parted by seams; the family row stays {7,3}, and the
    // desktop card is the {5,4} board's.
    expect(menuIcon("hyperbolic-home")).not.toBe(menuIcon("hyperbolic"));
    expect(menuIcon("hyperbolic-home")).not.toBe(menuIcon("hyperbolic54"));
    expect(previewIcon("hyperbolic-home").svg).toBe(previewIcon("hyperbolic54").svg);
  });

  it("crops a spiral round its own centre, edge to edge", () => {
    // Fitted whole, a spiral grown out by rings is a ragged star floating in
    // the card. Cropped anywhere but its middle, it is a field of tiles with
    // no winding. So: its middle, run off every edge of the card.
    const coords = (svg: string): number[][] =>
      [...svg.matchAll(/ d="([^"]*)"/g)].map((m) =>
        (m[1]!.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
      );
    for (const key of ["phyllotaxis", "klaassen", "pentaspiral5", "pentaspiral6", "pentaspiral7"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(true);
      expect(paths(preview.svg), key).toBeGreaterThan(30);
      const xs = coords(preview.svg).flatMap((c) => c.filter((_, i) => i % 2 === 0));
      const ys = coords(preview.svg).flatMap((c) => c.filter((_, i) => i % 2 === 1));
      expect(Math.min(...xs), key).toBeLessThan(0);
      expect(Math.max(...xs), key).toBeGreaterThan(100);
      expect(Math.min(...ys), key).toBeLessThan(0);
      expect(Math.max(...ys), key).toBeGreaterThan(70);
    }
  });

  it("wallpapers a flat family card with the tiling its row icon is drawn from", () => {
    // The row icon is a small patch of one member; the card is that member's
    // whole tiling, the same picture its own card shows.
    for (const [family, member] of [
      ["uniform", "rhombitrihex"],
      ["dual", "deltoidal"],
      ["2-uniform", "dodecarhombitrihex"],
      ["2-isohedral", "elongated2dual"],
      ["isogonal", "rotatedhex"],
      ["rectangle", "herringbone"],
      ["other", "durer"],
    ] as const) {
      const preview = previewIcon(family);
      expect(preview.tiled, family).toBe(true);
      expect(preview.svg, family).toBe(previewIcon(member).svg);
    }
  });

  it("keeps the row's figure when there is no lattice and no solid", () => {
    // A surface has no tiling of its own. It is the row's own drawing,
    // repainted (see below), so the shape count matches — the card's cells
    // each over their grout — while the colours do not.
    for (const key of ["torus"]) {
      const preview = previewIcon(key);
      expect(preview.tiled, key).toBe(false);
      expect(paths(preview.svg), key).toBe(2 * paths(menuIcon(key)));
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
