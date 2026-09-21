import type { BoardTint } from "./shapePalette";

// How a cell is *cut*, and what it is painted in — the two halves of a board's
// look, and now two settings rather than one.
//
//   * a **board shape** (`BOARD_SHAPES`) is the relief a tile is drawn with and
//     the material it is made of: Classic's beveled button, Realistic's glass
//     dome, Flat's plain plate. It is the player's `shape` setting.
//   * a **theme** contributes a `BoardLook` (`BOARD_LOOKS`, keyed by the theme
//     keys in ui/theme.ts) — whether the board is coloured by its shapes at all,
//     how loudly, and the face its digits are set in. It is the player's `theme`
//     setting, whose other half is the chrome palette and the page.
//
// They were one list of five entries until now, and that list was the two axes
// tangled: Realistic and Flat were one palette at two cuts, Sand and Flat Sand
// another palette at the same two cuts, and Classic a third palette welded to a
// third cut. Six of the nine looks were unreachable. `CELL_STYLES` is now their
// **product**, one entry per (shape, theme) pair keyed `"<shape>/<theme>"` and
// built once at module load — so everything downstream still takes one string
// key and one `CellStyle`, and the meshes, the session and the test seam did
// not have to learn about the split.
//
// A cell is a stack of concentric loops of its own polygon: loop 0 is the
// tile's outline on the board surface, each further loop is pulled in toward
// the centroid and lifted (or sunk) along the surface normal, and the innermost
// one is filled as the top face. Two loops is the classic beveled button; three
// gives a shoulder the flat lighting reads as a rounded tile. Both board meshes
// (flat PolygonBoard, 3D SolidBoard) build their geometry from these numbers,
// so a shape is one table entry rather than a change in two renderers.
//
// The vertex count of a cell follows from the loop count — n * (3 + 6 * rings)
// for an n-gon — so it is fixed when the mesh is built: `closed` and `open`
// must declare the *same* number of loops, since an opened cell is re-cut in
// place into the buffers the closed one was written to. `cellStyleLoops`
// asserts it, and a unit test sweeps every style.
//
// The active style is read once per board, when its mesh is built. Nothing
// re-cuts a board in flight: both settings are only reachable from the settings
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
  /** `"<shape>/<theme>"` — the pair this style was composed from, and the key
   * `CELL_STYLES` holds it under. It is what a `GameSession` is handed and what
   * `window.__ms.state().cellStyle` reports. */
  key: string;
  /** The two halves, kept beside the key so a mesh (or a test) can ask which
   * cut and which colours it is drawing without parsing the key. */
  shape: string;
  theme: string;
  /** Flat boards: lit head-on, so relief has to be generous to read at all. */
  flat: CellProfile;
  /** 3D boards: lower relief, because the cells of a curved surface tilt
   * against each other and a tall plateau shingles over its neighbours at the
   * silhouette. Two-sided surfaces (cylinder, Möbius, Klein) mirror this same
   * profile on **both** faces, so a button reads as a button from either side
   * (see `SolidBoard.writeGeometry`). */
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
   * it over the profile's loops (`vertexShade` below), and a two-sided cell
   * does the same on each of its two mirrored halves. The one exception is a
   * cell the Klein clip cuts: it keeps a flat tile with no loops for the ramp to
   * hang on, so its gradient is measured off the geometry instead
   * (`radialFalloff` in solidBoard.ts). */
  shade?: { center: number; rim: number };
  /** The same gradient for an **opened** cell, when the two states should not be
   * made of the same material. Defaults to `shade`.
   *
   * A centre hotspot is what reads as *polished*: it is the highlight a curved,
   * shiny thing throws back at you, and on a flat board it is the only thing
   * saying so, since the head-on lighting has nothing to add. So flattening it
   * is what reads as **matte** — an opened cell lit evenly across its floor,
   * next to closed cells that each carry a bright middle. That difference in
   * *material* is a second channel telling opened from closed, alongside the
   * relief and the tone, and it costs nothing: the gradient is already being
   * written per vertex, and which one to use is known from the cell's state. */
  openShade?: { center: number; rim: number };
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
   * style, and every 3D board. Diffuse shading returns only about a third of an
   * albedo here (measured on a flat board's head-on top face: 0.32), which is
   * what makes a lit board's saturated orange arrive as a dusky brown; a style
   * that wants the palette's colour rather than a shaded version of it pays that
   * back by asking for more albedo than exists.
   *
   * `1 / 0.32 ≈ 3.1` is therefore what *exactly* pays it back, and it is what
   * `classic` uses, because that style is quoting a specific board and has to
   * land on its specific grays. A style painting shape colours wants less: the
   * opened tone starts near white, so boosting it that far clips the tiles the
   * numbers sit on and the board goes chalky. Vertex colours are not clamped, so
   * a value above 1 is fine — the shading is what brings it back down. */
  albedo?: number;
  /** How loudly the shape colour code is painted on this style's board, if not
   * at `SHAPE_PALETTE.board`'s own strength. A per-style override, so a style
   * that wants a quieter board does not retune every other one — see
   * `BoardTint` in shapePalette.ts. */
  boardTint?: BoardTint;
  /** Draw the mine glyph **flat** — a filled disc, eight straight spikes and
   * one square glint (`glyphAtlas.drawFlatMine`) — rather than the modelled sea
   * mine `drawMine` bakes by default.
   *
   * What keeps a style from getting this for free is `solidMarkers` — a style
   * standing a real 3D bomb on a turnable board wants the modelled billboard on
   * its flat one to match it, exactly as the pin matches the flag. Colours come
   * from `MINE_COLORS` either way, so the game's mine is still one mine across
   * the themes. */
  flatMine?: true;
  /** The face this style's board digits are baked in, if not the bundled Rubik.
   * A CSS font stack, since it is handed straight to a canvas `ctx.font`. */
  digitFont?: string;
  /** **3D boards only**: stand real models on the cells carrying a flag or a
   * mine — a pin and a spiked bomb, `render/markers3d.ts` — instead of the
   * atlas's flat billboards. Absent means the billboards, as it always was.
   *
   * A flat board never gets them, whatever the style says: a plane is only ever
   * seen from one angle, so a model there would be a picture of one anyway, at
   * several hundred more vertices. Every board you can *turn* does, the
   * two-sided surfaces (cylinder, Möbius strip, Klein bottle) included — those
   * have no consistent outward normal, so `SolidBoard` stands one marker on each
   * of their two faces rather than picking a side. */
  solidMarkers?: true;
}

/** One **board shape**: everything in a `CellStyle` that is about the cut and
 * the material rather than the colour, plus what the picker calls it.
 *
 * The line between the two halves is the one `finishStyle` already draws for
 * the player's own two switches: relief, material, gradients and the marks the
 * game draws on a tile are the shape's; `monochrome`, `boardTint` and
 * `digitFont` are the theme's. `albedo` sits on this side because it pays back
 * what the *lighting* takes, which is a fact about how a cut is shaded — but a
 * theme may override it, and one does (see `BOARD_LOOKS.classic`). */
export interface BoardShape
  extends Omit<CellStyle, "key" | "shape" | "theme" | "monochrome" | "boardTint" | "digitFont"> {
  key: string;
  label: string;
  /** The picker row's one-line description. */
  hint: string;
}

/** The colour half a **theme** lends the board, keyed by theme in
 * `BOARD_LOOKS`. Everything here is a *colour* decision, so turning it into its
 * own axis is what makes the grey classic board reachable at any cut and the
 * sand tint reachable at any cut.
 *
 * The three overrides at the end exist because two of the five looks this
 * replaces were tuned as wholes rather than as a cut plus a palette, and a
 * split that quietly retuned them would not be a split. They only ever adjust a
 * value the shape already declares — a theme cannot *give* a flat plate a dome
 * gradient or a translucent floor. */
export interface BoardLook {
  monochrome?: true;
  boardTint?: BoardTint;
  digitFont?: string;
  /** Replaces the shape's `albedo`, on every board this theme paints. */
  albedo?: number;
  /** Replaces the shape's `openAlpha`, where it has one. `null` makes the
   * opened cells opaque instead. */
  openAlpha?: number | null;
  /** Replaces the shape's across-the-tile gradients, where it has them. */
  shade?: { center: number; rim: number };
  openShade?: { center: number; rim: number };
}

/** The classic tile: a raised beveled button while closed, re-cut as a recess
 * once opened. Under the fixed key light that inverts the highlight and shadow
 * — the lit edge moves from the top of the tile to the bottom — which is what
 * makes open and closed cells tell apart at a glance on a flat board, where
 * every top face shades identically and colour alone would have to carry it.
 *
 * What it is **not** any more is grey: that is the classic *theme*
 * (`BOARD_LOOKS.classic`), and the two used to be one entry. The 1990s board is
 * the bevel and the grey together, and it still is — but the bevel was the only
 * thing here that was ever about the cut, and welding the grey to it meant no
 * other palette could have a beveled board and this one could have no other
 * cut. */
const CLASSIC_SHAPE: BoardShape = {
  key: "classic",
  label: "Classic",
  hint: "Beveled buttons that sink when opened",
  flatMine: true,
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
  // The classic board is *lit* — the bevel's highlight and shadow, and their
  // inversion when a cell opens, come from the key light, so this style cannot
  // go unlit the way Flat and Realistic do. Diffuse shading returns only about
  // 32% of an albedo here, which is what made the board read as charcoal rather
  // than as the silver-gray it is quoting; the boost pays exactly that back, so
  // a closed top face lands on `mono.hidden` and an opened floor on
  // `mono.revealed`. The bevel walls are boosted with it and the lit edge clips
  // to near-white, which is right: the classic bevel's light edge always was
  // white. Measured, not guessed — `1 / 0.3246`.
  albedo: 3.08,
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
const FLAT_SHAPE: BoardShape = {
  key: "flat",
  label: "Flat",
  hint: "Unlit plates in flat colour, wide gaps",
  // A drawn mark rather than the modelled sea mine, on the same argument
  // Classic makes: a miniature bomb standing on a plain plate is a piece of
  // another vocabulary. `flatMine` follows the *cut* and nothing else, so the
  // two flat-looking shapes draw it and the dome keeps the model.
  flatMine: true,
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
const REALISTIC_SHAPE: BoardShape = {
  key: "realistic",
  label: "Realistic",
  hint: "Glass beads, domed and translucent when opened",
  flat: {
    gap: 0.05,
    closed: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: 0.13 },
      { inset: 0.12, height: 0.22 },
      { inset: 0.22, height: 0.27 },
      { inset: 0.42, height: 0.29 },
    ],
    // A pan, not a dish: the wall drops fast and then the floor is flat. The
    // closed profile eases its heights off toward the crown, which is what
    // curves it; holding these level instead is the geometric half of the matte
    // reading, and it keeps the number sitting on a plane rather than in a bowl.
    open: [
      { inset: 0, height: 0 },
      { inset: 0.05, height: -0.085 },
      { inset: 0.12, height: -0.105 },
      { inset: 0.22, height: -0.11 },
      { inset: 0.42, height: -0.11 },
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
      { inset: 0.05, height: 0.022 },
      { inset: 0.12, height: 0.028 },
      { inset: 0.22, height: 0.03 },
      { inset: 0.42, height: 0.03 },
    ],
  },
  material: { roughness: 0.16, metalness: 0.1 },
  unlit: true,
  shade: { center: 1.06, rim: 0.7 },
  // Nearly flat, and that is the point — see `openShade`. A touch of falloff is
  // kept so the recess still reads as one; take it to a constant and the opened
  // cells lose their edges against each other.
  openShade: { center: 0.99, rim: 0.92 },
  winGlow: 0.12,
  albedo: 1.5,
  openAlpha: 0.74,
  // ...and on a board you can turn, a flag and a mine stop being pictures: a
  // pin stands on the flagged cells and a spiked bomb sits on the mined ones
  // once a loss reveals them. Of a piece with the rest of the style — the
  // argument for a bead over a plate is the argument for an object over a
  // billboard, and it is the same argument the flat board cannot use.
  solidMarkers: true,
};

/** The three cuts, in the order the shape picker lists them. */
export const BOARD_SHAPES: Record<string, BoardShape> = {
  classic: CLASSIC_SHAPE,
  realistic: REALISTIC_SHAPE,
  flat: FLAT_SHAPE,
};

export const SHAPE_KEYS: readonly string[] = Object.keys(BOARD_SHAPES);

/** The cut the app boots into. The beveled button is the one every player
 * already knows a minesweeper by, and it is the only cut whose two states are
 * told apart by *relief* rather than by colour alone — so it is the shape that
 * reads on any of the three palettes. */
export const DEFAULT_SHAPE = "classic";

/** The shape key to actually use for `key` — `Object.hasOwn`, never `in`, since
 * it arrives from a stored record and `"toString"` is not a board shape. */
export function resolveShape(key: string | null | undefined): string {
  return key != null && Object.hasOwn(BOARD_SHAPES, key) ? key : DEFAULT_SHAPE;
}

export function boardShape(key: string | null | undefined): BoardShape {
  return BOARD_SHAPES[resolveShape(key)]!;
}

/** Sand's board tint, and the face its digits are baked in.
 *
 * `boardTint` takes the shape colour to about a quarter chroma and sits the
 * closed tone slightly deeper. The shape code still runs, so a hexagon board is
 * still greener than a square one — but at a strength you notice when you
 * compare two boards rather than one that competes with the digit on top of it.
 * On a mixed tiling (the rhombitrihexagonal 3.4.6.4 this was drawn against puts
 * triangles, squares and hexagons on one board) full-strength hue is three
 * colours at once and the numbers lose. */
const SAND_TINT: BoardTint = {
  hiddenLightness: -0.02,
  chroma: { hidden: 0.04, revealed: 0.014 },
  // Off, so every hue sits at the same lightness — see `BoardTint.cuspBlend`.
  cuspBlend: 0,
};

const SAND_DIGITS = '"Space Grotesk", "Rubik", sans-serif';

/** What each theme paints the board in, keyed by the theme keys in
 * `ui/theme.ts`. Colour only: the cut is the player's other setting.
 *
 * This is the half of the old five-entry table that was never about relief, and
 * pulling it out is what makes the nine looks reachable — a grey beveled board
 * was the only grey board there was, and a sand-tinted one could only be had at
 * two of the three cuts. */
export const BOARD_LOOKS: Record<string, BoardLook> = {
  // The board's own shape colours at full strength, and nothing else to say.
  bright: {},
  // The 1990s board: no colour on it but the numbers. `monochrome` switches the
  // shape colour code off, so a board of hexagons and one of squares are the
  // same grey, exactly as the original was — and the relief (whichever cut is
  // chosen) does the whole job of telling closed from opened, which is that
  // board's own idiom.
  classic: {
    monochrome: true,
    // The mono tones (`SHAPE_PALETTE.board.mono`) are a third darker than the
    // colour ones and were chosen against a fully paid-back shading, so the
    // payback travels with them rather than with the cut: at a coloured board's
    // 1.5 this grey arrives as charcoal on every lit board. `1 / 0.3246`,
    // measured on a flat board's head-on top face — see `CellStyle.albedo`.
    albedo: 3.08,
    // ...and opaque, whichever cut is chosen. A translucent grey tile showing a
    // grain through it is a different board from the one this is quoting, and
    // the classic page is not a texture the board was ever meant to sit *in*.
    openAlpha: null,
  },
  // Sand: the board turned down until the numbers are the loudest thing on it.
  sand: {
    boardTint: SAND_TINT,
    // Space Grotesk for the digits, which on a board this quiet are the design,
    // and the face the chrome around it is already set in (the `[data-theme]`
    // block in styles.css).
    digitFont: SAND_DIGITS,
    // A hair lower than the dome's own, because what shows through is a warm
    // textured page rather than a cool one, and the grain reads stronger
    // through the same opacity.
    openAlpha: 0.72,
    // ...and the rim a touch less deep, because the tint above has already
    // taken lightness out of the closed tone and stacking the full falloff on
    // top of that closes the tiles up.
    shade: { center: 1.06, rim: 0.72 },
    openShade: { center: 0.99, rim: 0.92 },
  },
};

/** The key `CELL_STYLES` holds the (shape, theme) pair under. Both halves are
 * resolved, so a key built from a stored record is always one the table has. */
export function boardStyleKey(
  shape: string | null | undefined,
  theme: string | null | undefined,
): string {
  return `${resolveShape(shape)}/${theme != null && Object.hasOwn(BOARD_LOOKS, theme) ? theme : DEFAULT_LOOK}`;
}

/** The theme whose look is used when a key names none. Written out rather than
 * imported from ui/theme.ts, which imports *this* module — and it is the same
 * constant either way, pinned by a unit test. */
const DEFAULT_LOOK = "sand";

/** One cut painted in one theme's colours. The overrides only ever adjust what
 * the shape already declares: a theme cannot give a flat plate a dome gradient
 * or a translucent floor, so `sand` on the flat cut is simply the tint and the
 * digits. */
function composeStyle(shape: BoardShape, theme: string, look: BoardLook): CellStyle {
  const { key, label: _label, hint: _hint, ...cut } = shape;
  const style: CellStyle = { ...cut, key: `${key}/${theme}`, shape: key, theme };
  if (look.monochrome) style.monochrome = true;
  if (look.boardTint) style.boardTint = look.boardTint;
  if (look.digitFont !== undefined) style.digitFont = look.digitFont;
  if (look.albedo !== undefined) style.albedo = look.albedo;
  if (look.shade && style.shade) style.shade = { ...look.shade };
  if (look.openShade && style.openShade) style.openShade = { ...look.openShade };
  if (look.openAlpha === null) delete style.openAlpha;
  else if (look.openAlpha !== undefined && style.openAlpha !== undefined) {
    style.openAlpha = look.openAlpha;
  }
  return style;
}

/** Every (shape, theme) pair, built once. A board is cut from one of these, and
 * `key` is what a `GameSession` carries and the test seam reports. */
export const CELL_STYLES: Record<string, CellStyle> = Object.fromEntries(
  SHAPE_KEYS.flatMap((s) =>
    Object.entries(BOARD_LOOKS).map(([t, look]) => {
      const style = composeStyle(BOARD_SHAPES[s]!, t, look);
      return [style.key, style] as const;
    }),
  ),
);

export const CELL_STYLE_KEYS: readonly string[] = Object.keys(CELL_STYLES);

/** The style a board is drawn in when nothing says otherwise — the pair the
 * shipped defaults name (`DEFAULT_SHAPE`, and Sand in ui/theme.ts). */
export const DEFAULT_CELL_STYLE = boardStyleKey(DEFAULT_SHAPE, DEFAULT_LOOK);

/** The named style, or the default for anything this build does not know —
 * `Object.hasOwn`, never `in`, since the key can arrive from a record written
 * by another build (and `"toString"` is not a cell style). */
export function resolveCellStyle(key: string | null | undefined): string {
  return key != null && Object.hasOwn(CELL_STYLES, key) ? key : DEFAULT_CELL_STYLE;
}

export function cellStyle(key: string | null | undefined): CellStyle {
  return CELL_STYLES[resolveCellStyle(key)]!;
}

/** The two halves of a style's finish the *player* gets to choose, rather than
 * the theme (settings.ts `gloss` and `pins`; ui/settings.ts draws the rows).
 *
 * They were Realistic's alone, welded to its cell style, which meant the glass
 * finish could not be had without its page and its pins could not be had at
 * all on any other theme. Both are one flag or one number deep in the table
 * above, and neither changes the vertex layout, so both can simply be spread
 * over whichever style the theme names. */
export interface Finish {
  /** The polished reading: the specular finish a solid catches a moving
   * highlight with, and the bright-centre gradient that is the *only* thing
   * saying "polished" on a flat board lit head-on (see `shade`). */
  gloss: boolean;
  /** Real models for a flag and a mine on a board you can turn
   * (`solidMarkers`; flat boards never take them whatever this says). */
  pins: boolean;
}

/** What the finish is when nobody has said — the shipped defaults, matching
 * `DEFAULT_SETTINGS`. Gloss is off because it is a flourish; pins are on
 * because a board you can turn should carry objects rather than pictures. */
export const DEFAULT_FINISH: Finish = { gloss: false, pins: true };

/** The glossy half, lifted out of `REALISTIC` so a style with no polish of its
 * own can borrow one. A style that *has* one keeps it: Sand's gradient is tuned
 * a hair off Realistic's on purpose, and taking that away would be retuning a
 * theme rather than answering a setting. */
const GLOSSY = {
  material: { roughness: 0.16, metalness: 0.1 },
  shade: { center: 1.06, rim: 0.7 },
  openShade: { center: 0.99, rim: 0.92 },
} as const;

/** What a matte board's material is — Flat's own, the dullest in the table. */
const MATTE = { roughness: 0.7, metalness: 0 } as const;

/** `style` as the player's finish settings ask for it.
 *
 * Three rules, and what is deliberately *not* touched:
 *
 *   * **Gloss off** mattes the material and replaces the closed gradient with
 *     the style's own `openShade`. That is not an invented number: a style that
 *     has both already calls the second one its matte reading (Realistic's
 *     "glass beads closed, matte pans opened"), so the board keeps its relief
 *     and its edges and loses only the hotspot. A style with no gradient at all
 *     (Classic, Flat) changes only its material.
 *   * **Gloss on** lends `GLOSSY` to a style that declares no `shade`, and
 *     leaves one that does alone.
 *   * **Pins** set or clear `solidMarkers`.
 *
 * The profiles, `openAlpha`, `unlit`, `albedo`, `boardTint` and `monochrome`
 * are untouched. The profiles because a style's two states must keep the same
 * loop count (`cellStyleLoops`) and a board is re-cut in place from it; the
 * rest because they are the style's *colour*, which is the theme's business and
 * not the finish's — turning the gloss off is not meant to make Realistic
 * opaque or Classic coloured. */
export function finishStyle(style: CellStyle, finish: Finish): CellStyle {
  const next: CellStyle = { ...style };
  if (finish.gloss) {
    if (!style.shade) {
      next.material = { ...GLOSSY.material };
      next.shade = { ...GLOSSY.shade };
      next.openShade = { ...GLOSSY.openShade };
    }
  } else {
    next.material = { ...MATTE };
    // `openShade` defaults to `shade` when a style names only one, so this
    // reads the same as the renderers do.
    const matte = style.openShade ?? style.shade;
    if (matte) next.shade = { ...matte };
  }
  if (finish.pins) next.solidMarkers = true;
  else delete next.solidMarkers;
  return next;
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
