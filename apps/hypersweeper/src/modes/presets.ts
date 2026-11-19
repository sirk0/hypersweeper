// Port of minesweeper/boards/presets.py's build entry point, reading the same
// data/presets.json. A builder-name → function dispatch mirrors Python's
// _JSON_BUILDERS. M1 ported the flat regular modes; M2 adds the solids.
//
// This is the game's side of the boards, not the geometry's: a preset is a
// board's size *and* its mine count. The args in presets.json are positional
// for the Python builders, which take the mine count; the builders in
// boards/ do not — the geometry knows nothing of mines — so `mineArg` names
// which arg it is, and it is split out here (`presetMineCount`).
import presetsData from "@tiling/data/presets.json";
import windowsData from "@tiling/data/windows.json";
import {
  ammannBeenkerBoard,
  brickRingsBoard,
  penroseBoard,
  kiteDartBoard,
  spectreBoard,
  hatBoard,
  turtleBoard,
  hatMetatilesBoard,
  klaassenBoard,
  pentaSpiral5Board,
  pentaSpiral6Board,
  pentaSpiral7Board,
  phyllotaxisBoard,
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
  cuboctahedronBoard,
  rhombicosidodecahedronSplitBoard,
  snubCubeBoard,
  snubDodecahedronSplitBoard,
  truncatedIcosidodecahedronSplitBoard,
  truncatedOctahedronBoard,
  carpetBoard,
  chairBoard,
  gosperBoard,
  ltetrominoBoard,
  pentaflakeBoard,
  ppentominoBoard,
  sphinxBoard,
  trapezoidBoard,
  rightTrapezoidBoard,
  halfTrapezoidBoard,
  stretchedChairBoard,
  rhombicLBoard,
  rightIsoscelesBoard,
  drafterBoard,
  ttetrominoBoard,
  fiveTriangleBoard,
  hurwitzBoard,
  binaryBoard,
  hyperbolicBoard,
  hyperbolicUniformBoard,
  type AnyBoard,
  type Board,
  brickCubeBoard,
  c180Board,
  gp21Board,
  cubeBoard,
  cubeFrameBoard,
  dodecahedronBoard,
  icosahedronBoard,
  octahedronBoard,
  sphereSquareBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  steppedPyramidBoard,
  tetrahedronBoard,
  tetrahedronFrameBoard,
  solidCubeBoard,
  archimedeanBoard,
  hexBoard,
  hexhexBoard,
  hextriangleBoard,
  hextriBoard,
  squareBoard,
  squareDiamondBoard,
  triangleBoard,
  triangleGridBoard,
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
  trefoilBoard,
  trefoilHexBoard,
  trefoilTriangleBoard,
  boyBoard,
  projectiveBoard,
  projectiveHexBoard,
  projectiveTriangleBoard,
  doubleTorusBoard,
  doubleTorusHexBoard,
  doubleTorusTriangleBoard,
  torusTriangleBoard,
} from "@tiling/geometry";
import { DIFFICULTIES } from "./catalog";

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
  c180_board: c180Board,
  gp21_board: gp21Board,
  sphere_square_board: sphereSquareBoard,
  sphere_triangle_board: sphereTriangleBoard,
  // the Archimedean solids cut into boards (boards/archimedean.ts), duals of
  // their Catalan solids; (frequency) like those. The three
  // icosahedral ones take frequency 0 as well, the solid uncut.
  cuboctahedron_board: cuboctahedronBoard,
  truncated_octahedron_board: truncatedOctahedronBoard,
  snub_cube_board: snubCubeBoard,
  rhombicosidodecahedron_split_board: rhombicosidodecahedronSplitBoard,
  truncated_icosidodecahedron_split_board: truncatedIcosidodecahedronSplitBoard,
  snub_dodecahedron_split_board: snubDodecahedronSplitBoard,
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
  // (frequency), the face subdivision being their only size knob.
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
  // the donut's three lattices on a tube round a trefoil knot
  trefoil_board: trefoilBoard,
  trefoil_triangle_board: trefoilTriangleBoard,
  trefoil_hex_board: trefoilHexBoard,
  // the real projective plane: a cubed sphere, a geodesic sphere and its
  // Goldberg dual with antipodes identified, drawn as the whole sphere
  projective_board: projectiveBoard,
  projective_triangle_board: projectiveTriangleBoard,
  projective_hex_board: projectiveHexBoard,
  // the same cubed-sphere board drawn once, on Boy's surface
  boy_board: boyBoard,
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
  kitedart_board: kiteDartBoard,
  ammann_beenker_board: ammannBeenkerBoard,
  spectre_board: spectreBoard,
  hat_board: hatBoard,
  turtle_board: turtleBoard,
  hat_metatiles_board: hatMetatilesBoard,
  phyllotaxis_board: phyllotaxisBoard,
  klaassen_board: klaassenBoard,
  pentaspiral5_board: pentaSpiral5Board,
  pentaspiral6_board: pentaSpiral6Board,
  pentaspiral7_board: pentaSpiral7Board,
  brick_rings_board: brickRingsBoard,
  sphinx_board: sphinxBoard,
  chair_board: chairBoard,
  ltetromino_board: ltetrominoBoard,
  ppentomino_board: ppentominoBoard,
  trapezoid_board: trapezoidBoard,
  right_trapezoid_board: rightTrapezoidBoard,
  half_trapezoid_board: halfTrapezoidBoard,
  stretched_chair_board: stretchedChairBoard,
  rhombic_l_board: rhombicLBoard,
  right_isosceles_board: rightIsoscelesBoard,
  drafter_board: drafterBoard,
  ttetromino_board: ttetrominoBoard,
  five_triangle_board: fiveTriangleBoard,
  carpet_board: carpetBoard,
  pentaflake_board: pentaflakeBoard,
  gosper_board: gosperBoard,
  hyperbolic_board: hyperbolicBoard,
  hyperbolic_uniform_board: hyperbolicUniformBoard,
  binary_board: binaryBoard,
  hurwitz_board: hurwitzBoard,
};

/** The builders that take a `variant` after their preset args: the
 * substitution tilings, which grow far more of a patch than a board keeps, so
 * one preset is a whole family of boards rather than a single one (see
 * `windowRows` in boards/aperiodic.ts). Every other builder ignores the
 * variant, and the nonperiodic-by-symmetry boards — the spiral, the brick rings
 * — are left out on purpose: each has one distinguished centre and no second
 * window onto it. Must match `_VARIANT_BUILDERS` in
 * minesweeper/boards/presets.py. */
const VARIANT_BUILDERS = new Set([
  "penrose_board",
  "kitedart_board",
  "ammann_beenker_board",
  "spectre_board",
  "hat_board",
  "turtle_board",
  "hat_metatiles_board",
]);

interface PresetSpec {
  builder: string;
  // the index of the mine count among `args` (see the top of this file)
  mineArg: number;
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
 * The seed only ever means more than one board for the aperiodic
 * substitution tilings, where it picks which measured window onto the grown
 * patch the game is played on (`windowFor`, then `windowRows` in
 * boards/aperiodic.ts); every other mode builds the same board whatever it is
 * passed, so a caller can hand the seed along blindly. A re-deal is a new
 * window, and a share link — which carries the seed — reopens the one it names.
 */
export function buildBoard(mode: string, difficulty: string, seed = 0): AnyBoard {
  const { builder, args, variant } = presetBuilder(mode, difficulty);
  const patch = variant ? windowFor(mode, difficulty, seed) : 0;
  const key = `${mode}|${difficulty}|${patch}`;
  let board = BUILT.get(key);
  if (board) {
    BUILT.delete(key); // re-inserted below, as the most recent
  } else {
    board = variant ? builder(...args, patch) : builder(...args);
  }
  BUILT.set(key, board);
  if (BUILT.size > BUILT_KEEP) BUILT.delete(BUILT.keys().next().value!);
  return board;
}

/**
 * The board a mode and difficulty name, built fresh and kept nowhere — for a
 * picture of the board (a menu card, ui/icons.ts) rather than a game. It skips
 * `BUILT`, which exists for restarts: a page of cards would push the board
 * just played out of it. A variant mode gets its centred window.
 */
export function presetBoard(mode: string, difficulty: string): AnyBoard {
  const { builder, args, variant } = presetBuilder(mode, difficulty);
  return variant ? builder(...args, 0) : builder(...args);
}

/** The mine count a mode's preset plays at this difficulty. */
export function presetMineCount(mode: string, difficulty: string): number {
  return presetBuilder(mode, difficulty).mineCount;
}

function presetBuilder(
  mode: string,
  difficulty: string,
): { builder: Builder; args: Arg[]; mineCount: number; variant: boolean } {
  const spec = PRESETS[mode];
  if (!spec) throw new Error(`unknown mode ${mode}`);
  if (!DIFFICULTIES.includes(difficulty)) {
    throw new Error(`unknown difficulty ${difficulty}`);
  }
  const builder = BUILDERS[spec.builder];
  const args = spec.args[difficulty];
  if (!builder || !args) throw new Error(`no preset for ${mode}/${difficulty}`);
  return {
    builder,
    args: args.filter((_, i) => i !== spec.mineArg),
    mineCount: Number(args[spec.mineArg]),
    variant: VARIANT_BUILDERS.has(spec.builder),
  };
}

/**
 * The boards `buildBoard` handed out last, by mode, difficulty and window,
 * most recent last. A restart — the smiley, *Play again*, a share link to the
 * board just played — deals the same board again, and the biggest boards
 * take long enough to build that a player sees the pause, so the board is
 * handed back instead of rebuilt. Sharing it is safe because a
 * board is never changed once built: `Game` copies the adjacency it is dealt
 * on, the meshes read the board and keep their own buffers, and the lazy
 * `symmetries` is measured once either way. A few are kept, not every one:
 * the conformance suite builds every board there is.
 */
const BUILT = new Map<string, AnyBoard>();
const BUILT_KEEP = 4;

/**
 * How a builder that is not periodic grows a bigger patch of its tiling, the
 * `k`-th size up: its preset args (mine count already split out) rewritten, or
 * null past the last size it has. A periodic board needs none — its tiling is
 * measured off the board itself (modes/extension.ts) — and neither does a board
 * with no flat tiling to carry on (the solids, the surfaces, the hyperbolic
 * boards).
 *
 * The windowed patches keep `keep` tiles of a patch grown to some depth, so the
 * whole patch at that depth (`keep` null) is the first size up and every
 * deeper one after it; the spirals add rings; a rep-tile adds levels, each one
 * a copy of the last in every corner. The rep-tiles whose patches are cut from
 * a periodic tiling (the right isosceles triangle, the drafter, the T-tetromino
 * and the Gosper island's hexagons) are left to the lattice, which is exact,
 * unbounded and instant where a search of a patch that looks the same
 * everywhere is not.
 */
const GROW: Record<string, (args: Arg[], k: number) => (Arg | null)[]> = {
  // (subdivisions, scale, keep)
  penrose_board: ([d, scale], k) => [Number(d) + k, scale!, null],
  kitedart_board: ([d, scale], k) => [Number(d) + k, scale!, null],
  ammann_beenker_board: ([d, scale], k) => [Number(d) + k, scale!, null],
  // (depth, keep, scale)
  spectre_board: ([d, , scale], k) => [Number(d) + k, null, scale!],
  hat_board: ([d, , scale], k) => [Number(d) + k, null, scale!],
  turtle_board: ([d, , scale], k) => [Number(d) + k, null, scale!],
  hat_metatiles_board: ([d, , scale], k) => [Number(d) + k, null, scale!],
  // (rings, keep, scale)
  phyllotaxis_board: ([n, , scale], k) => [Number(n) * 2 ** (k + 1), null, scale!],
  klaassen_board: ([n, , scale], k) => [Number(n) * 2 ** (k + 1), null, scale!],
  pentaspiral5_board: ([n, , scale], k) => [Number(n) * 2 ** (k + 1), null, scale!],
  pentaspiral6_board: ([n, , scale], k) => [Number(n) * 2 ** (k + 1), null, scale!],
  pentaspiral7_board: ([n, , scale], k) => [Number(n) * 2 ** (k + 1), null, scale!],
  // (rings, scale)
  brick_rings_board: ([n, scale], k) => [Number(n) * 2 ** (k + 1), scale!],
  // (levels, scale): the rep-tiles
  ...Object.fromEntries(
    [
      "sphinx_board",
      "chair_board",
      "ltetromino_board",
      "ppentomino_board",
      "trapezoid_board",
      "right_trapezoid_board",
      "half_trapezoid_board",
      "stretched_chair_board",
      "rhombic_l_board",
      "five_triangle_board",
      "carpet_board",
      "pentaflake_board",
    ].map((name) => [name, ([d, scale]: Arg[], k: number) => [Number(d) + k + 1, scale!]]),
  ),
};

/** How many times more tiles a builder's next size up has than the last,
 * where that is not about four — the guess `grownBoards` stops on before it
 * has seen two sizes and can measure it: a Penrose patch deflates by φ² a
 * step, the hat's family and the Spectre grow about eightfold. */
const GROWTH: Record<string, number> = {
  penrose_board: 2.7,
  kitedart_board: 2.7,
  ammann_beenker_board: 6,
  spectre_board: 8,
  hat_board: 8,
  turtle_board: 8,
  hat_metatiles_board: 8,
};

/** Where a builder may grow past `grownBoards`' usual cap, because the usual
 * cap stops it with the board still at the edge of its patch: the carpet,
 * whose squares are cheap and whose next level is eight times the last, and
 * the Spectre, whose windows sit far out in a patch that grows eightfold. */
const CAP: Record<string, number> = { carpet_board: 40000, spectre_board: 40000 };

/** Whether a mode's board is carried on by growing its patch (`GROW`) rather
 * than as a periodic tiling. */
export function grows(mode: string): boolean {
  return Object.hasOwn(PRESETS, mode) && Object.hasOwn(GROW, PRESETS[mode]!.builder);
}

/**
 * Bigger and bigger patches of the tiling a mode's board is cut from, for
 * `boardExtension` (modes/extension.ts) to find the board in — none for a mode
 * whose builder has no rule in `GROW`. Each is built only when asked for, and
 * the run stops before a patch it expects to pass `maxCells` (judged by the
 * growth so far, or by `GROWTH` before there is any), since the biggest take
 * seconds to build.
 */
export function* grownBoards(mode: string, difficulty: string, maxCells?: number): Iterable<Board> {
  if (!grows(mode)) return;
  const name = PRESETS[mode]!.builder;
  const grow = GROW[name]!;
  const { builder, args } = presetBuilder(mode, difficulty);
  let last = 0;
  let ratio = GROWTH[name] ?? 4;
  const cap = maxCells ?? CAP[name] ?? 20000;
  for (let k = 0; k < 6; k++) {
    if (last * ratio > cap) return;
    const board = builder(...grow(args, k)) as Board;
    const cells = board.polygons.size;
    if (cells <= last) return;
    if (last) ratio = cells / last;
    last = cells;
    yield board;
  }
}
