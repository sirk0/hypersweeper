// How a cell is *cut* — the relief a tile is drawn with, and (for the one style
// that asks for it) whether it is coloured by shape at all.
//
// A style is no longer a setting of its own: the **theme** names one (see
// ui/theme.ts), so picking "Classic" or "Realistic" changes the chrome and the
// board together rather than leaving the player to pair two lists by hand.
// There is one table entry per theme, and the keys match the theme keys.
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
   * almost nothing to say.
   *
   * How the falloff is laid down depends on the cell. A cell with relief ramps
   * it over the profile's loops (`vertexShade` below); the flat tiles of a
   * two-sided surface (cylinder, Möbius, Klein) have no loops and are cut by
   * the Klein clip besides, so theirs is measured off the geometry instead
   * (`radialShades` in solidBoard.ts). Either way it is the same bead, which is
   * what those surfaces need most — a flat tile with no relief has nothing else
   * to shade it. */
  shade?: { center: number; rim: number };
  /** How far past the gold tint the win wave's crest is overdriven, if not the
   * default. Vertex colours are not clamped, so a lit tile is pushed past white
   * and the shading brings it back down bright (see WIN_GLOW). An unlit tile has
   * no shading to bring it down, so the same overdrive would clip the crest to
   * plain white — it takes the tint nearly straight. */
  winGlow?: number;
  /** Draw every cell in the board's plain grays instead of its shape colour.
   * The one thing here that is not relief: the classic look is a gray
   * minesweeper board, and a shape-coloured one is a different game to look at
   * however it is cut. `shapePalette.ts` still measures the shapes (the menu
   * icons and the sound are keyed off the same tones); this only says the
   * *board* does not paint them. */
  monochrome?: true;
  /** Opacity of an **opened** cell on a flat board, if the style wants the page
   * to show through one. Only the flat board: there the WebGL canvas is
   * transparent, so what comes through a translucent tile is the themed page
   * behind it — the texture, on a theme that has one — and the tiles of a
   * tiling never overlap each other on screen, so one merged mesh needs no
   * per-triangle depth sorting to look right. A solid keeps opaque tiles: its
   * cells *do* overlap on screen (a two-sided surface draws its far side
   * through its near one), and one mesh cannot sort that. */
  openAlpha?: number;
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
 * every top face shades identically and colour alone would have to carry it.
 *
 * And it is **gray**: the classic theme is the 1990s board, which never had a
 * colour on it but the numbers. That is what `monochrome` is for — the shape
 * colour code is switched off for this style, so a board of hexagons and one of
 * squares are the same gray, exactly as the original was. Nothing is lost by
 * it: the relief is doing the whole job of telling closed from opened here, and
 * that is the classic board's own idiom. */
const CLASSIC: CellStyle = {
  key: "classic",
  label: "Classic",
  hint: "Gray beveled buttons that sink when opened",
  monochrome: true,
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

/** Realistic: glass beads on a real surface. The theme this belongs to pairs it
 * with a textured page, and the three parts work together.
 *
 * **On a flat board** the tile is a five-loop dome — a chamfer off the grout, a
 * shoulder, a shallow crown — lit from its own middle and falling off to a dark
 * rim (`shade`). That gradient is the trick, and the reason the extra loops are
 * worth their vertices: a flat board is lit head-on, so a shinier *material* has
 * no angle to catch a highlight at and the roundness has to come from the colour
 * across the tile plus a silhouette with enough steps in it to read as curved
 * rather than chamfered.
 *
 * **On a solid** the same profile is flattened (a curved surface's cells tilt
 * against each other, and a tall plateau shingles over its neighbours at the
 * silhouette) and the finish earns its name instead: at this roughness the key
 * light lands as a moving highlight that sweeps across the faces as the board is
 * dragged around. The albedo is paid back so a turning solid is coloured glass
 * rather than dusky plastic.
 *
 * **Opened cells are translucent** (`openAlpha`, flat boards only — see the
 * field). An opened tile is glass with the page showing through it, which is
 * what ties the board to the theme's texture instead of leaving it floating on
 * top; kept high enough that the number on it stays the most contrasted thing
 * in the cell. */
const REALISTIC: CellStyle = {
  key: "realistic",
  label: "Realistic",
  hint: "Glass beads over a textured page",
  flat: {
    gap: 0.05,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: 0.13 },
      { inset: 0.12, height: 0.22 },
      { inset: 0.22, height: 0.27 },
      { inset: 0.42, height: 0.29 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.04, height: -0.03 },
      { inset: 0.1, height: -0.07 },
      { inset: 0.2, height: -0.1 },
      { inset: 0.4, height: -0.11 },
    ],
  },
  solid: {
    gap: 0.05,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: 0.042 },
      { inset: 0.12, height: 0.072 },
      { inset: 0.22, height: 0.093 },
      { inset: 0.42, height: 0.105 },
    ],
    open: [
      { inset: 0, height: 0 },
      { inset: 0.04, height: 0.008 },
      { inset: 0.1, height: 0.016 },
      { inset: 0.2, height: 0.024 },
      { inset: 0.4, height: 0.03 },
    ],
  },
  material: { roughness: 0.16, metalness: 0.1 },
  unlit: true,
  shade: { center: 1.06, rim: 0.7 },
  winGlow: 0.12,
  albedo: 1.5,
  openAlpha: 0.74,
};

/** The styles, one per theme (`ui/theme.ts` names them by these keys). Two
 * themes share `flat` — Light and Dark differ in chrome, not in how a tile is
 * cut — which is why this is still a table of its own rather than a field
 * inlined into each theme. */
export const CELL_STYLES: Record<string, CellStyle> = {
  flat: FLAT,
  classic: CLASSIC,
  realistic: REALISTIC,
};

export const CELL_STYLE_KEYS: readonly string[] = Object.keys(CELL_STYLES);

/** The style a board is drawn in when nothing says otherwise — the one the
 * default (Light) theme names. */
export const DEFAULT_CELL_STYLE = "flat";

/** The named style, or the default for anything this build does not know —
 * `Object.hasOwn`, never `in`, since the key can arrive from a theme record
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

/** How much brighter or darker vertex `v` of an `n`-sided cell is drawn than the
 * cell's own colour, under a style's across-the-tile gradient (`CellStyle.shade`).
 *
 * The ramp runs from `rim` at the cell's outer edge to `center` at its very
 * middle, spread over the profile's `loops` — every ring of walls a step
 * brighter than the one outside it. Spreading it is the whole point: a flat
 * board is lit head-on, so the *only* thing that can make a tile read as domed
 * rather than as a plate is the colour across it, and shading the top face
 * alone (what this did when the one style with a gradient had three loops)
 * paints a bright disc on a flat field instead of a bead. It also means a style
 * can buy a smoother dome by adding loops, which is what the extra vertices of a
 * detailed profile are for.
 *
 * The vertex layout is the one `writeGeometry` lays down in both meshes, and is
 * fixed by `cellVertexCount`: `n` fan triangles of (centroid, crown edge, crown
 * edge) first, then one ring of `n` quads per gap between consecutive loops,
 * outermost gap first, each quad written low(a) low(b) high(b) low(a) high(b)
 * high(a). */
export function vertexShade(
  shade: NonNullable<CellStyle["shade"]>,
  loops: number,
  v: number,
  n: number,
): number {
  // Loop 0 is the outermost (at the grout) and sits at `rim`; the centroid,
  // one step past the innermost loop, is `center`.
  const at = (loop: number): number =>
    shade.rim + (shade.center - shade.rim) * (loop / loops);
  if (v < 3 * n) return v % 3 === 0 ? shade.center : at(loops - 1);
  const w = v - 3 * n;
  const ring = Math.floor(w / (6 * n)); // the gap above loop `ring`
  const j = w % 6;
  const onLowLoop = j === 0 || j === 1 || j === 3;
  return at(onLowLoop ? ring : ring + 1);
}
