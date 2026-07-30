// How a cell is *cut* — the relief a tile is drawn with, independent of the
// colour it is drawn in (that is shapePalette.ts's job, and the two are
// deliberately separate: a style changes every board's look without touching
// the shape colour code).
//
// A cell is a stack of concentric loops of its own polygon: loop 0 is the
// tile's outline on the board surface, each further loop is pulled in toward
// the centroid and lifted (or sunk) along the surface normal, and the innermost
// one is filled as the top face. Two loops is the classic beveled button; three
// gives a shoulder the flat lighting reads as a rounded tile. Both board meshes
// (flat PolygonBoard, 3D SolidBoard) build their geometry from these numbers,
// so a style is one table entry rather than a change in two renderers.
//
// The vertex count of a cell follows from the loop count — n * (3 + 6 * rings)
// for an n-gon — so it is fixed when the mesh is built: `closed` and `open`
// must declare the *same* number of loops, since an opened cell is re-cut in
// place into the buffers the closed one was written to. `cellStyleLoops`
// asserts it, and a unit test sweeps every style.
//
// The active style is read once per board, when its mesh is built. Nothing
// re-cuts a board in flight: the setting is only reachable from the settings
// page, which lives in the menu, and the menu is only up when no game is.

/** One loop of a cell's profile. `inset` is how much further in the loop sits
 * than the tile's outline, as a fraction of the way from the cell's polygon to
 * its centroid, and on top of `gap` (so 0 is the outline itself); `height` is
 * the lift along the surface normal as a fraction of the cell's radius —
 * negative for a recess below the board. */
export interface CellLoop {
  inset: number;
  height: number;
}

/** The relief of a cell on one kind of board. */
export interface CellProfile {
  /** How far every tile is pulled in from its shared edges — the grout gap. */
  gap: number;
  /** Loops from the outline inward, while the cell is closed. */
  closed: CellLoop[];
  /** ...and once it is opened. Same length as `closed`. */
  open: CellLoop[];
}

export interface CellStyle {
  key: string;
  label: string;
  /** The settings row's one-line description. */
  hint: string;
  /** Flat boards: lit head-on, so relief has to be generous to read at all. */
  flat: CellProfile;
  /** 3D boards: lower relief, because the cells of a curved surface tilt
   * against each other and a tall plateau shingles over its neighbours at the
   * silhouette. Two-sided surfaces (cylinder, Möbius, Klein) draw flat tiles
   * whatever the style, so only `gap` reaches them. */
  solid: CellProfile;
  /** Surface finish of the cell material — a low roughness reads as glossy
   * plastic under the fixed key light, a high one as matte. */
  material: { roughness: number; metalness: number };
  /** Draw the tiles **unlit**: the shape colour as it is, with no diffuse
   * shading over it. The renderer reflects about a third of a tile's albedo, so
   * a lit board shows a saturated orange as a warm brown; unlit is what makes a
   * flat style read as flat *colour* rather than as unlit-looking relief, which
   * on a head-on board is the whole difference.
   *
   * **Flat boards only.** On a solid the shading is what shows the shape — an
   * unlit sphere is a flat disc of tiles — so a 3D board keeps its lit material
   * whatever the style; only the relief and the gap follow the style there. */
  unlit?: true;
  /** A brightness gradient *across* each tile, if the style wants one:
   * `center` multiplies the middle of the top face, `rim` its outer edge (and
   * the walls under it). The rasteriser interpolates between them, so the tile
   * carries a smooth radial falloff — the one way to shade a tile that does not
   * go through the lighting, which is what makes it work on an unlit style and
   * on a flat board, where every top face faces the camera and the lighting has
   * almost nothing to say. Not applied to the flat tiles of a two-sided surface:
   * those are cut by the Klein clip, which leaves no rim/centre structure to
   * hang it on. */
  shade?: { center: number; rim: number };
  /** How far past the gold tint the win wave's crest is overdriven, if not the
   * default. Vertex colours are not clamped, so a lit tile is pushed past white
   * and the shading brings it back down bright (see WIN_GLOW). An unlit tile has
   * no shading to bring it down, so the same overdrive would clip the crest to
   * plain white — it takes the tint nearly straight. */
  winGlow?: number;
  /** Multiplier on a tile's colour **where it is lit** — the flat board of a lit
   * style, and every 3D board. Diffuse shading returns only about 60% of an
   * albedo here, which is what makes a lit board's saturated orange arrive as a
   * dusky brown; a style that wants the palette's colour rather than a shaded
   * version of it pays that back by asking for more albedo than exists. Kept
   * modest: the opened tone starts near white, so a big boost clips the tiles
   * the numbers sit on and the board goes chalky. `classic` deliberately has
   * none — dusky is what it has always looked like. */
  albedo?: number;
}

/** The classic tile: a raised beveled button while closed, re-cut as a recess
 * once opened. Under the fixed key light that inverts the highlight and shadow
 * — the lit edge moves from the top of the tile to the bottom — which is what
 * makes open and closed cells tell apart at a glance on a flat board, where
 * every top face shades identically and colour alone would have to carry it. */
const CLASSIC: CellStyle = {
  key: "classic",
  label: "Classic",
  hint: "Beveled buttons that sink when opened",
  flat: {
    gap: 0.04,
    closed: [{ inset: 0, height: 0 }, { inset: 0.16, height: 0.24 }],
    // A thin rim (so the sunken face still reads full-size) dropping to a floor
    // below the board plane.
    open: [{ inset: 0, height: 0 }, { inset: 0.07, height: -0.09 }],
  },
  solid: {
    gap: 0.04,
    closed: [{ inset: 0, height: 0 }, { inset: 0.16, height: 0.1 }],
    // Sunk almost to the grout, kept just above it so the two never z-fight.
    open: [{ inset: 0, height: 0 }, { inset: 0.16, height: 0.02 }],
  },
  material: { roughness: 0.65, metalness: 0 },
};

/** Flat colour: unlit plates with a wide gap and no relief at all — the tiling
 * and its shape colours, nothing else. Two things carry it. The tiles are
 * unlit, so a cell is exactly the colour the shape palette named instead of a
 * third of it, which is what makes the board read as poster colour rather than
 * moulded plastic; and the gap is wide, which on a flat board (there is no
 * grout under it, unlike a solid) lets the page show between the tiles, so they
 * read as laid on the page rather than cut into a panel. Closed and opened
 * cells are then told apart by colour alone — which is exactly what the wide
 * hidden/opened step in the palette is for. */
const FLAT: CellStyle = {
  key: "flat",
  label: "Flat",
  hint: "Unlit plates in flat colour, wide gaps",
  flat: {
    gap: 0.1,
    // A hair of relief, not for the look but so the two states are never
    // coplanar with each other where a board wraps back on itself.
    closed: [{ inset: 0, height: 0.004 }, { inset: 0.02, height: 0.004 }],
    open: [{ inset: 0, height: 0 }, { inset: 0.02, height: 0 }],
  },
  // A solid keeps its relief and its lighting (see `unlit`): all that carries
  // over is the wide gap, which there shows the grout.
  solid: {
    gap: 0.1,
    closed: [{ inset: 0, height: 0 }, { inset: 0.04, height: 0.05 }],
    // Above the grout, or the two z-fight.
    open: [{ inset: 0, height: 0 }, { inset: 0.04, height: 0.008 }],
  },
  material: { roughness: 0.7, metalness: 0 },
  unlit: true,
  winGlow: 0.12,
  // Only the solids see this (the plane is unlit): it carries the same clean,
  // unmuddied colour over to a 3D board, which is the whole point of the style.
  albedo: 1.5,
};

/** A pillow: three shoulders rounding into a broad top face, and a shallow dish
 * when opened. This is the one style whose *lighting* does the work — the
 * flat-shaded bands each catch the key light a little differently, so the tile
 * reads as domed rather than chamfered, and the light comes from the top left,
 * so the roundness is directional in a way no gradient across a tile is.
 *
 * That is also why it needs the bands: at two loops it was a wider bevel, which
 * next to Classic looked like Classic and read as "the setting did nothing".
 * Keep it at four loops with the heights easing off toward the top (0.13 →
 * 0.21 → 0.25), which is what makes the shading fall away smoothly instead of
 * stepping. Matte, and with the albedo paid back so the colours are the
 * palette's rather than a dusky third of them. */
const SOFT: CellStyle = {
  key: "soft",
  label: "Soft",
  hint: "Rounded matte pillows, lit from the top left",
  flat: {
    gap: 0.075,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.06, height: 0.13 },
      { inset: 0.16, height: 0.21 },
      { inset: 0.34, height: 0.25 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: -0.04 },
      { inset: 0.13, height: -0.07 },
      { inset: 0.28, height: -0.09 },
    ],
  },
  solid: {
    gap: 0.075,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.06, height: 0.05 },
      { inset: 0.16, height: 0.085 },
      { inset: 0.34, height: 0.1 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: 0.008 },
      { inset: 0.13, height: 0.015 },
      { inset: 0.28, height: 0.02 },
    ],
  },
  material: { roughness: 0.85, metalness: 0 },
  albedo: 1.45,
};

/** Glass beads: each tile lit from its own middle and falling off to a dark rim
 * (`shade`), on a domed profile, unlit so the gradient is the whole of it. That
 * gradient is the trick — a lit dome on a flat board is what "Soft" already is,
 * because the board is lit head-on and a shinier material has no angle to catch
 * a highlight at, so the difference has to come from the colour across the tile
 * rather than from the light. Reads as a board of glass beads; the opened tiles,
 * pale to start with, come out as the shallow dishes between them. */
const GLOSS: CellStyle = {
  key: "gloss",
  label: "Glossy",
  hint: "Glass beads, each lit from its middle",
  flat: {
    gap: 0.05,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.09, height: 0.22 },
      { inset: 0.3, height: 0.28 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.06, height: -0.06 },
      { inset: 0.3, height: -0.1 },
    ],
  },
  solid: {
    gap: 0.05,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.09, height: 0.07 },
      { inset: 0.3, height: 0.11 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.06, height: 0.02 },
      { inset: 0.3, height: 0.03 },
    ],
  },
  // A solid is lit, and this is where the finish earns its name: at this
  // roughness the key light lands as a moving highlight that sweeps across the
  // faces as the board is dragged around, which is the best thing the style
  // does. Keep it low. The albedo is paid back too, so a turning solid is
  // coloured glass rather than dusky plastic.
  material: { roughness: 0.16, metalness: 0.1 },
  unlit: true,
  shade: { center: 1.04, rim: 0.72 },
  winGlow: 0.12,
  albedo: 1.5,
};

/** The styles, in the order the settings page lists them. */
export const CELL_STYLES: Record<string, CellStyle> = {
  classic: CLASSIC,
  flat: FLAT,
  soft: SOFT,
  gloss: GLOSS,
};

export const CELL_STYLE_KEYS: readonly string[] = Object.keys(CELL_STYLES);

/** The style a board is drawn in when nothing says otherwise. Classic: the
 * board this game has always drawn, and the one the visual baselines pin. */
export const DEFAULT_CELL_STYLE = "classic";

/** The named style, or the default for anything this build does not know —
 * `Object.hasOwn`, never `in`, since the key can arrive from stored settings
 * written by another build (and `"toString"` is not a cell style). */
export function resolveCellStyle(key: string | null | undefined): string {
  return key != null && Object.hasOwn(CELL_STYLES, key) ? key : DEFAULT_CELL_STYLE;
}

export function cellStyle(key: string | null | undefined): CellStyle {
  return CELL_STYLES[resolveCellStyle(key)]!;
}

/** How many loops a profile has — the number both states must agree on, since
 * the two are written into the same slice of the vertex buffer. A style whose
 * `open` and `closed` disagree is a bug in the table above, so it is caught
 * here rather than corrupting a neighbouring cell's geometry. */
export function cellStyleLoops(profile: CellProfile): number {
  if (profile.closed.length !== profile.open.length) {
    throw new Error(
      `cell profile loop count mismatch: closed ${profile.closed.length}, open ${profile.open.length}`,
    );
  }
  return profile.closed.length;
}

/** Vertices a cell of `sides` sides costs at this profile: the top face is a
 * fan of `sides` triangles over the innermost loop, and every gap between two
 * consecutive loops is a ring of `sides` quads. */
export function cellVertexCount(sides: number, profile: CellProfile): number {
  return sides * (3 + 6 * (cellStyleLoops(profile) - 1));
}
