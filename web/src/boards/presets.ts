// Port of minesweeper/boards/presets.py's build entry point, reading the same
// data/presets.json. A builder-name → function dispatch mirrors Python's
// _JSON_BUILDERS. M1 ported the flat regular modes; M2 adds the solids.
import presetsData from "@data/presets.json";
import windowsData from "@data/windows.json";
import {
  brickRingsBoard,
  penroseBoard,
  spectreBoard,
  phyllotaxisBoard,
} from "./aperiodic";
import {
  deltoidalHexecontahedronBoard,
  deltoidalIcositetrahedronBoard,
  disdyakisDodecahedronBoard,
  disdyakisTriacontahedronBoard,
  pentagonalIcositetrahedronBoard,
  pentakisDodecahedronBoard,
  rhombicDodecahedronBoard,
  rhombicTriacontahedronBoard,
  sphereBoard,
  tetrakisHexahedronBoard,
  triakisIcosahedronBoard,
  triakisOctahedronBoard,
  triakisTetrahedronBoard,
} from "./catalan";
import {
  carpetBoard,
  chairBoard,
  gosperBoard,
  pentaflakeBoard,
  sphinxBoard,
} from "./fractal";
import { DIFFICULTIES } from "./catalog";
import type { AnyBoard } from "./core";
import {
  brickCubeBoard,
  c180Board,
  c80Board,
  cubeBoard,
  cubeFrameBoard,
  dodecahedronBoard,
  icosahedronBoard,
  octahedronBoard,
  rhombicosidodecahedronBoard,
  snubDodecahedronBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  steppedPyramidBoard,
  tetrahedronBoard,
  tetrahedronFrameBoard,
  truncatedIcosidodecahedronBoard,
} from "./solids";
import { solidCubeBoard } from "./volume";
import {
  archimedeanBoard,
  hexBoard,
  hexhexBoard,
  hextriangleBoard,
  hextriBoard,
  squareBoard,
  squareDiamondBoard,
  triangleBoard,
  triangleGridBoard,
} from "./tilings";
import {
  archCylinderBoard,
  archKleinBoard,
  archMobiusBoard,
  archTorusBoard,
  cylinderBoard,
  cylinderHexBoard,
  cylinderTriangleBoard,
  kleinBoard,
  kleinHexBoard,
  kleinTriangleBoard,
  mobiusBoard,
  mobiusHexBoard,
  mobiusTriangleBoard,
  torusBoard,
  torusHexBoard,
  doubleTorusBoard,
  doubleTorusHexBoard,
  doubleTorusTriangleBoard,
  torusTriangleBoard,
} from "./surfaces";

// The Archimedean/Laves builders take the tiling key as their first argument,
// so a preset's args are a mix of that leading string and numbers. The dispatch
// map is intentionally loose (each concrete builder has its own signature).
type Arg = number | string;
type Builder = (...args: any[]) => AnyBoard;

const BUILDERS: Record<string, Builder> = {
  square_board: squareBoard,
  triangle_board: triangleBoard,
  triangle_grid_board: triangleGridBoard,
  hex_board: hexBoard,
  hexhex_board: hexhexBoard,
  hextri_board: hextriBoard,
  hextriangle_board: hextriangleBoard,
  square_diamond_board: squareDiamondBoard,
  c80_board: c80Board,
  c180_board: c180Board,
  sphere_triangle_board: sphereTriangleBoard,
  snub_dodecahedron_board: snubDodecahedronBoard,
  rhombicosidodecahedron_board: rhombicosidodecahedronBoard,
  truncated_icosidodecahedron_board: truncatedIcosidodecahedronBoard,
  cube_board: cubeBoard,
  cube_frame_board: cubeFrameBoard,
  // the one volume board: a solid cube of cells, 26 neighbours
  solid_cube_board: solidCubeBoard,
  // the three brick bonds that lay on a square face, one cube each
  brick_cube_board: brickCubeBoard,
  tetrahedron_board: tetrahedronBoard,
  tetrahedron_frame_board: tetrahedronFrameBoard,
  octahedron_board: octahedronBoard,
  icosahedron_board: icosahedronBoard,
  dodecahedron_board: dodecahedronBoard,
  stepped_bipyramid_board: steppedBipyramidBoard,
  stepped_pyramid_board: steppedPyramidBoard,
  // The thirteen Catalan solids (boards/catalan.ts). Every one takes
  // (mineCount, frequency), the face subdivision being their only size knob.
  triakis_tetrahedron_board: triakisTetrahedronBoard,
  rhombic_dodecahedron_board: rhombicDodecahedronBoard,
  triakis_octahedron_board: triakisOctahedronBoard,
  tetrakis_hexahedron_board: tetrakisHexahedronBoard,
  deltoidal_icositetrahedron_board: deltoidalIcositetrahedronBoard,
  pentagonal_icositetrahedron_board: pentagonalIcositetrahedronBoard,
  disdyakis_dodecahedron_board: disdyakisDodecahedronBoard,
  rhombic_triacontahedron_board: rhombicTriacontahedronBoard,
  triakis_icosahedron_board: triakisIcosahedronBoard,
  pentakis_dodecahedron_board: pentakisDodecahedronBoard,
  deltoidal_hexecontahedron_board: deltoidalHexecontahedronBoard,
  sphere_board: sphereBoard,
  disdyakis_triacontahedron_board: disdyakisTriacontahedronBoard,
  torus_board: torusBoard,
  torus_triangle_board: torusTriangleBoard,
  torus_hex_board: torusHexBoard,
  // the genus-2 board: two square-tiled donuts merged at their outer rims
  double_torus_board: doubleTorusBoard,
  double_torus_triangle_board: doubleTorusTriangleBoard,
  double_torus_hex_board: doubleTorusHexBoard,
  mobius_board: mobiusBoard,
  mobius_triangle_board: mobiusTriangleBoard,
  mobius_hex_board: mobiusHexBoard,
  klein_board: kleinBoard,
  klein_triangle_board: kleinTriangleBoard,
  klein_hex_board: kleinHexBoard,
  cylinder_board: cylinderBoard,
  cylinder_triangle_board: cylinderTriangleBoard,
  cylinder_hex_board: cylinderHexBoard,
  archimedean_board: archimedeanBoard,
  arch_torus_board: archTorusBoard,
  arch_cylinder_board: archCylinderBoard,
  arch_mobius_board: archMobiusBoard,
  arch_klein_board: archKleinBoard,
  penrose_board: penroseBoard,
  spectre_board: spectreBoard,
  phyllotaxis_board: phyllotaxisBoard,
  brick_rings_board: brickRingsBoard,
  sphinx_board: sphinxBoard,
  chair_board: chairBoard,
  carpet_board: carpetBoard,
  pentaflake_board: pentaflakeBoard,
  gosper_board: gosperBoard,
};

/** The two builders that take a `variant` after their preset args: the
 * substitution tilings, which grow far more of a patch than a board keeps, so
 * one preset is a whole family of boards rather than a single one (see
 * `windowRows` in boards/aperiodic.ts). Every other builder ignores the
 * variant, and the nonperiodic-by-symmetry boards — the spiral, the brick rings
 * — are left out on purpose: each has one distinguished centre and no second
 * window onto it. Must match `_VARIANT_BUILDERS` in
 * minesweeper/boards/presets.py. */
const VARIANT_BUILDERS = new Set(["penrose_board", "spectre_board"]);

interface PresetSpec {
  builder: string;
  args: Record<string, Arg[]>;
}

const PRESETS = presetsData.presets as Record<string, PresetSpec>;

export const MODES: string[] = Object.keys(PRESETS);

export function hasMode(mode: string): boolean {
  // `hasOwn`, not `in`: mode names arrive from shared links, and `in` walks the
  // prototype chain, so `?mode=toString` (or `constructor`, `valueOf`, …) would
  // pass validation and then hand `buildBoard` a function instead of a preset.
  return Object.hasOwn(PRESETS, mode);
}

/** Which windows onto an aperiodic patch a board may be dealt from
 * (data/windows.json, measured by scripts/difficulty/windows.py). A window is a
 * board of its own — a patch of an aperiodic tiling is not interchangeable with
 * another patch of it at 81 cells — so the list is the ones whose measured win
 * rate lands within the calibration's tolerance of the centred window's, the
 * window the mine count was fitted on. Index 0 is that centred window, so the
 * patch this game shipped with stays in the deal. */
const WINDOWS = windowsData.modes as Record<
  string,
  Record<string, { baseline: number; measured: number; windows: number[] }>
>;

/**
 * Which window of a board's patch a game seed is played on. A mode with no
 * measured list is one board however it is seeded, and the seed passes through
 * to a builder that ignores it. Must match `window_for` in
 * minesweeper/boards/presets.py.
 */
export function windowFor(mode: string, difficulty: string, seed: number): number {
  const rows = Object.hasOwn(WINDOWS, mode) ? WINDOWS[mode] : undefined;
  if (!rows) return seed;
  const windows = rows[difficulty]!.windows;
  // Positive remainder, as Python's `%` is: a seed is a uint32 in the app, but
  // this is callable with anything.
  return windows[((seed % windows.length) + windows.length) % windows.length]!;
}

/**
 * The board a mode and difficulty name, as dealt for one game `seed`.
 *
 * The seed only ever means more than one board for the two aperiodic
 * substitution tilings, where it picks which measured window onto the grown
 * patch the game is played on (`windowFor`, then `windowRows` in
 * boards/aperiodic.ts); every other mode builds the same board whatever it is
 * passed, so a caller can hand the seed along blindly. A re-deal is a new
 * window, and a share link — which carries the seed — reopens the one it names.
 */
export function buildBoard(mode: string, difficulty: string, seed = 0): AnyBoard {
  const spec = PRESETS[mode];
  if (!spec) throw new Error(`unknown mode ${mode}`);
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new Error(`unknown difficulty ${difficulty}`);
  }
  const builder = BUILDERS[spec.builder];
  const args = spec.args[difficulty];
  if (!builder || !args) throw new Error(`no preset for ${mode}/${difficulty}`);
  return VARIANT_BUILDERS.has(spec.builder)
    ? builder(...args, windowFor(mode, difficulty, seed))
    : builder(...args);
}
