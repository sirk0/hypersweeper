// The geometry's public surface: everything outside `boards/` imports from
// here, never from a module inside it. The geometry is meant to outlive this
// one game -- the same boards can carry other games -- so it knows nothing of
// mines, difficulties or menus (those live in `modes/`), and imports nothing
// from outside this folder. Modules inside `boards/` import each other
// directly, never through this file, so it cannot close an import cycle.
// `tests/unit/boardsBoundary.test.ts` holds all three rules.
//
// A name is public by being listed here. Export a new one when something
// outside needs it, not before.

// The board model: cells, adjacency, topology, and the vector helpers.
export {
  cid,
  cross,
  invertCycle,
  isBoard3D,
  newellNormal,
  normalize,
  pansHyperbolically,
  type AnyBoard,
  type Board,
  type Board3D,
  type BoardSymmetry,
  type CellId,
  type SymmetryId,
  type Vec3,
  type Vertex,
} from "./core";

// The flat tilings: the regular lattices and the `ARCH_TILINGS` templates.
export {
  ARCH_TILINGS,
  archimedeanBoard,
  archTemplate,
  hexBoard,
  hexhexBoard,
  hextriangleBoard,
  hextriBoard,
  squareBoard,
  squareDiamondBoard,
  templateCells,
  triangleBoard,
  triangleGridBoard,
  wrapTemplate,
  type ArchTemplate,
} from "./tilings";

// The aperiodic and nonperiodic flat tilings.
export {
  ammannBeenkerBoard,
  brickRingsBoard,
  brickRingsTiles,
  kiteDartBoard,
  klaassenBoard,
  klaassenTiles,
  penroseBoard,
  pentaSpiral5Board,
  pentaSpiral6Board,
  pentaSpiral7Board,
  pentaSpiralBoard,
  phyllotaxisBoard,
  spectreBoard,
  z7ToXy,
} from "./aperiodic";

// The self-similar boards.
export {
  carpetBoard,
  chairBoard,
  drafterBoard,
  fiveTriangleBoard,
  fiveTriangles,
  gosperBoard,
  halfTrapezoidBoard,
  ltetrominoBoard,
  pentaflakeBoard,
  placePoint,
  ppentominoBoard,
  rhombicLBoard,
  rightIsoscelesBoard,
  rightTrapezoidBoard,
  sphinxBoard,
  substitutionPlacements,
  substitutionXy,
  SUBSTITUTIONS,
  stretchedChairBoard,
  trapezoidBoard,
  ttetrominoBoard,
} from "./fractal";

// The hyperbolic plane, in the Poincaré disc and the upper half-plane.
export { binaryBoard, hyperbolicBoard, hyperbolicUniformBoard, type WythoffOp } from "./hyperbolic";

// The closed hyperbolic surfaces.
export {
  CLOSED_SURFACES,
  gcDisc,
  hurwitzBoard,
  hurwitzSurfaceLabel,
  SURFACE_MODES,
} from "./hurwitz";

// The closed 3D boards.
export {
  brickCubeBoard,
  c180Board,
  cubeBoard,
  cubeFrameBoard,
  dodecahedronBoard,
  gp21Board,
  icosahedronBoard,
  octahedronBoard,
  sphereSquareBoard,
  sphereTriangleBoard,
  steppedBipyramidBoard,
  steppedPyramidBoard,
  tetrahedronBoard,
  tetrahedronFrameBoard,
} from "./solids";

// The Catalan solids.
export {
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

// The Archimedean solids.
export {
  cuboctahedronBoard,
  rhombicosidodecahedronSplitBoard,
  snubCubeBoard,
  snubDodecahedronSplitBoard,
  truncatedIcosidodecahedronSplitBoard,
  truncatedOctahedronBoard,
} from "./archimedean";

// Tilings wrapped onto surfaces: torus, cylinder, Möbius strip, Klein bottle, …
export {
  archCylinderBoard,
  archKleinBoard,
  archMobiusBoard,
  archTorusBoard,
  boyBoard,
  cylinderBoard,
  cylinderHexBoard,
  cylinderTriangleBoard,
  doubleTorusBoard,
  doubleTorusHexBoard,
  doubleTorusTriangleBoard,
  kleinBoard,
  kleinHexBoard,
  kleinTriangleBoard,
  mobiusBoard,
  mobiusHexBoard,
  mobiusTriangleBoard,
  projectiveBoard,
  projectiveHexBoard,
  projectiveTriangleBoard,
  torusBoard,
  torusHexBoard,
  torusTriangleBoard,
  trefoilBoard,
  trefoilHexBoard,
  trefoilTriangleBoard,
} from "./surfaces";

// The volume boards.
export { solidCubeBoard } from "./volume";

// The region a self-intersecting immersion encloses (the Klein bottle's neck).
export {
  fanTriangles,
  intersectUnion,
  pruneSolid,
  subtractSolid,
  trianglesArea,
  type ClipPiece,
  type Tri,
} from "./clipSolid";
