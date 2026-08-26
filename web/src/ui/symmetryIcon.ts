// What a symmetry control's icon draws, measured from the board it belongs to.
//
// A chevron pair and a circular arrow say "this moves the board" and nothing
// else. A cube's three quarter turns would draw the same arrow as an
// icosahedron's fifth-turn, and a mirror in a vertical plane the same glyph as
// one in a horizontal plane. So the icons are not a table of drawings picked by
// slot: each is generated from the motion the button actually makes, measured
// off the board's own geometry at the view it opens in.
//
// Three pictures, one per kind of motion:
//
//   * a **step** along a seam — a wrapped board's ring and tube translations —
//     keeps the double chevrons. It has no angle to show: it slides the board
//     one column or one row along.
//   * a **turn** draws the fraction of a full circle it really is, on a faint
//     ellipse of the whole, so a quarter reads as a quarter and a sixth as a
//     sixth. The ellipse is the rotation's own circle as it projects at this
//     view, so the axis is in the drawing too: face-on it is a full circle with
//     a dot at the centre (the axis pointing at you), edge-on a thin ellipse
//     with the axis drawn as a line through it.
//   * a **reflection** draws its mirror line at the angle the plane really
//     makes on screen, with a shape and its image either side.
import { Quaternion, Vector3 } from "three";
import { surfaceOf } from "../boards/catalog";
import { isBoard3D, type AnyBoard, type BoardSymmetry, type CellId, type SymmetryId } from "../boards/core";
import { initialOrientation } from "../render/renderer";

export type MotionKind = "step" | "turn" | "reflection";

/** How a control's motion looks, in the frame the board opens in. */
export interface SymmetryPicture {
  kind: MotionKind;
  /** A turn's denominator: the motion is a `1 / turns` of a full circle, so 4
   * is a quarter and 6 a sixth. 0 for the other two kinds. */
  turns: number;
  /** The direction the motion is *about*, in view space (x right, y up, z out
   * of the screen): a turn's axis, or a reflection's plane normal. Both are
   * drawn the same way — as the circle at right angles to it, which projects to
   * a full circle when the direction points at the viewer and to a bare line
   * when it lies across the screen. Null for a step. */
  normal: [number, number, number] | null;
}

/** How many turns of a control are looked for before giving up and calling it a
 * step. No rotation of a board here is finer than a twelfth. */
const MAX_TURNS = 24;

/** How many cells a measurement samples. The displacements it reads are the
 * same at every cell up to sign, so a handful is as good as the board. */
const SAMPLE = 48;

/** The pictures for a board's controls, keyed by control. `quarterTurned` is
 * whether the renderer is showing a flat board turned on its side, which a
 * portrait viewport does to a landscape board — the mirror line the player sees
 * turns with it. */
export function symmetryPictures(
  board: AnyBoard,
  mode: string,
  quarterTurned: boolean,
): Map<SymmetryId, SymmetryPicture> {
  const wrapped = (surfaceOf(mode)?.key ?? "flat") !== "flat" && isBoard3D(board);
  const view = viewPositions(board, mode, quarterTurned);
  const pictures = new Map<SymmetryId, SymmetryPicture>();
  for (const symmetry of board.symmetries) {
    pictures.set(symmetry.id, picture(symmetry, view, wrapped));
  }
  return pictures;
}

/** Every cell's centre where the board's opening view puts it: x right, y up,
 * z toward the viewer. A flat board is drawn in the screen plane (its pixel y
 * runs down, so it flips); a 3D one is turned by the mode's own starting
 * orientation, which is what `Renderer.setOrientation` gives the mesh. */
function viewPositions(
  board: AnyBoard,
  mode: string,
  quarterTurned: boolean,
): Map<CellId, Vector3> {
  const turn = isBoard3D(board) ? initialOrientation(mode) : new Quaternion();
  const out = new Map<CellId, Vector3>();
  for (const [cell, polygon] of board.polygons) {
    const centre = new Vector3();
    for (const point of polygon) {
      centre.x += point[0];
      centre.y += isBoard3D(board) ? point[1] : -point[1];
      centre.z += isBoard3D(board) ? (point as [number, number, number])[2] : 0;
    }
    centre.divideScalar(polygon.length).applyQuaternion(turn);
    // the renderer turns a landscape flat board a quarter clockwise on a
    // portrait viewport (Renderer.frameFlat), and the icons turn with it
    if (quarterTurned) centre.set(centre.y, -centre.x, centre.z);
    out.set(cell, centre);
  }
  return out;
}

function picture(
  symmetry: BoardSymmetry,
  view: Map<CellId, Vector3>,
  wrapped: boolean,
): SymmetryPicture {
  const step: SymmetryPicture = { kind: "step", turns: 0, normal: null };
  // A wrapped board's two translations are the only controls that slide rather
  // than turn; everything else is a rotation or a reflection of the drawing.
  if (wrapped && (symmetry.id === "ring" || symmetry.id === "tube")) return step;
  const moves = displacements(symmetry, view);
  if (moves.length === 0) return step;
  const of = (v: Vector3): [number, number, number] => [v.x, v.y, v.z];
  if (symmetry.id.startsWith("mirror-")) {
    return { kind: "reflection", turns: 0, normal: of(planeNormal(moves)) };
  }
  const turns = orderOf(symmetry);
  if (turns < 2 || turns > MAX_TURNS) return step;
  return { kind: "turn", turns, normal: of(turnAxis(moves)) };
}

/** Where a sample of cells goes, and where it came from. */
function displacements(
  symmetry: BoardSymmetry,
  view: Map<CellId, Vector3>,
): { from: Vector3; to: Vector3; move: Vector3 }[] {
  const cells = [...view.keys()].sort();
  const stride = Math.max(1, Math.floor(cells.length / SAMPLE));
  const out: { from: Vector3; to: Vector3; move: Vector3 }[] = [];
  for (let i = 0; i < cells.length; i += stride) {
    const from = view.get(cells[i]!)!;
    const to = view.get(symmetry.cycle.get(cells[i]!)!);
    if (!to) continue;
    const move = to.clone().sub(from);
    if (move.length() > 1e-9) out.push({ from, to, move });
  }
  return out;
}

/** The number of presses that come back to the start.
 *
 * Every cell, not one of them: a cell *on the axis* comes home after a single
 * press, so asking the first one would call the Gosper island's sixth-turn a
 * step. */
function orderOf(symmetry: BoardSymmetry): number {
  if (symmetry.involution) return 2;
  let order = 1;
  let power = symmetry.cycle;
  while (order <= MAX_TURNS) {
    let home = true;
    for (const [cell, image] of power) {
      if (cell !== image) {
        home = false;
        break;
      }
    }
    if (home) return order;
    power = new Map([...power].map(([cell, image]) => [cell, symmetry.cycle.get(image)!]));
    order++;
  }
  return 0;
}

/** A reflection's plane, as the unit normal of it.
 *
 * A reflection moves every point straight across its plane, so each
 * displacement points along the normal — one way on one side of it and the other
 * way on the other, which is why they are all flipped to agree before they are
 * averaged. */
function planeNormal(moves: { move: Vector3 }[]): Vector3 {
  const lead = moves.reduce((a, b) => (a.move.length() >= b.move.length() ? a : b)).move;
  const normal = new Vector3();
  for (const { move } of moves) normal.addScaledVector(move, move.dot(lead) < 0 ? -1 : 1);
  return normal.length() < 1e-12 ? new Vector3(1, 0, 0) : normal.normalize();
}

/** A turn's axis, as a unit vector in view space.
 *
 * Every point of a rotation moves at a right angle to the axis, so the axis is
 * the one direction all the displacements miss — the cross product of any two
 * that are not parallel. Its *sign* is then settled by the motion itself: a
 * point crossed with where it goes leans the way a right hand turns, so the end
 * that sum leans towards is the end the arrow should wind about. */
function turnAxis(moves: { from: Vector3; to: Vector3; move: Vector3 }[]): Vector3 {
  const axis = new Vector3(0, 0, 1);
  if (moves.length >= 2) {
    const lead = moves.reduce((a, b) => (a.move.length() >= b.move.length() ? a : b)).move;
    let best = 0;
    for (const { move } of moves) {
      const spread = new Vector3().crossVectors(lead, move);
      if (spread.length() > best) {
        best = spread.length();
        axis.copy(spread);
      }
    }
    if (best < 1e-9) axis.set(0, 0, 1);
  }
  axis.normalize();
  // which end of the axis the motion winds about, right-handedly
  let handed = 0;
  for (const { from, to } of moves) handed += new Vector3().crossVectors(from, to).dot(axis);
  if (handed < 0) axis.negate();
  return axis;
}

// -- drawing ------------------------------------------------------------------

/** The icon box every control is drawn in, and the circle a motion is drawn
 * on. */
const BOX = 24;
const MIDDLE = BOX / 2;
const RADIUS = 8;

/** How square-on a plane has to be before it is called face-on: near enough
 * that the line it draws on screen is noise rather than an orientation. */
const FACING = 0.9;

/** Which way a plane lies, as the player sees it. */
export type PlaneLie = "vertical" | "horizontal" | "diagonal" | "facing";

/** The circle at right angles to `direction`, as it projects on screen.
 *
 * This is one drawing doing two jobs. For a **turn** the circle is the one its
 * points travel round, so the arc drawn on it is the angle. For a **reflection**
 * the circle lies *in* the mirror plane, so its shape is the plane's own
 * attitude: a full circle when the plane faces the viewer, a bare line when it
 * is edge-on, and an ellipse in between. Both are the circle perpendicular to a
 * direction — an axis in one case, a normal in the other — so both come out of
 * the same three lines of trigonometry. */
function projectedCircle(direction: readonly [number, number, number], radius: number) {
  const axis = new Vector3(...direction).normalize();
  const towardViewer = new Vector3(0, 0, 1);
  const first = new Vector3().crossVectors(axis, towardViewer);
  if (first.length() < 1e-6) first.set(1, 0, 0);
  first.normalize();
  const second = new Vector3().crossVectors(axis, first).normalize();
  return (phi: number): [number, number] => [
    MIDDLE + radius * (Math.cos(phi) * first.x + Math.sin(phi) * second.x),
    MIDDLE - radius * (Math.cos(phi) * first.y + Math.sin(phi) * second.y),
  ];
}

const round = (v: number) => Math.round(v * 100) / 100;

/** An arc of a projected circle as a path, walked rather than fitted: the
 * ellipse is at an arbitrary attitude and a handful of segments draws it as
 * smoothly as an arc command would. */
function arcPath(
  at: (phi: number) => [number, number],
  from: number,
  to: number,
  steps: number,
): string {
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = at(from + ((to - from) * i) / steps);
    points.push(`${round(x)} ${round(y)}`);
  }
  return `M${points.join(" L")}`;
}

/** A filled arrowhead at the end of an arc, pointing the way it was going. */
function head(at: (phi: number) => [number, number], end: number, sweep: number): string {
  const tipAt = at(end);
  const before = at(end - Math.sign(sweep) * 0.16);
  const along = new Vector3(tipAt[0] - before[0], tipAt[1] - before[1], 0);
  if (along.length() < 1e-6) along.set(1, 0, 0);
  along.normalize();
  const side = new Vector3(-along.y, along.x, 0);
  const point = (forward: number, across: number) =>
    `${round(tipAt[0] + along.x * forward + side.x * across)} ${round(
      tipAt[1] + along.y * forward + side.y * across,
    )}`;
  return `<path d="M${point(2.7, 0)} L${point(-1.5, 2.4)} L${point(-1.5, -2.4)} Z" fill="currentColor"/>`;
}

/** The icon for a control, or null where the config's own drawing should stand
 * — a step along a seam, which the double chevrons already say. `direction` is
 * +1 for the forward button and -1 for its undo. */
export function symmetryIcon(picture: SymmetryPicture, direction: number): string | null {
  if (!picture.normal) return null;
  if (picture.kind === "turn") return turnIcon(picture.normal, picture.turns, direction);
  if (picture.kind === "reflection") return reflectionIcon(picture.normal);
  return null;
}

/** A turn: the fraction of a circle that it really is, on the faint whole, so a
 * quarter reads as a quarter and a sixth as a sixth.
 *
 * The circle is drawn **face on** rather than as the rotation's own circle
 * projected. Projected is the truer picture and it was tried first: it puts the
 * axis in the drawing for free, since the ellipse opens and closes with it. But
 * a cube's axes lie almost across the screen at its opening view, and a
 * quarter of an ellipse that thin is a scribble — the angle, which is the thing
 * being asked about, stops being legible exactly on the boards that have the
 * most of them. So the angle is drawn square-on and the axis is drawn beside
 * it: a line through the circle at the angle the axis makes on screen, or a dot
 * in the middle where it points at the viewer, which is the old convention for
 * a line coming out of the page. */
function turnIcon(
  direction: readonly [number, number, number],
  turns: number,
  step: number,
): string {
  const axis = new Vector3(...direction).normalize();
  const at = (phi: number): [number, number] => [
    MIDDLE + RADIUS * Math.cos(phi),
    MIDDLE - RADIUS * Math.sin(phi),
  ];
  // Anticlockwise is what a right-handed turn about an axis pointing at the
  // viewer looks like; about one pointing away it is the other way round. An
  // axis lying across the screen looks like neither, and the pair is told apart
  // by the buttons alone.
  const sense = Math.abs(axis.z) > 0.2 ? Math.sign(axis.z) : 1;
  const sweep = ((step < 0 ? -1 : 1) * sense * 2 * Math.PI) / turns;
  const from = Math.PI / 2; // the top, so a half turn reads as a clean half
  const across = Math.hypot(axis.x, axis.y);
  const reach = RADIUS + 3;
  // The axis as two ticks where it leaves the circle rather than a line across
  // it: a line through the middle crosses the arc twice, and the arc is the
  // thing being read.
  const tick = (side: number) =>
    `M${round(MIDDLE + (axis.x / across) * (RADIUS - 1.5) * side)} ${round(
      MIDDLE - (axis.y / across) * (RADIUS - 1.5) * side,
    )} L${round(MIDDLE + (axis.x / across) * reach * side)} ${round(
      MIDDLE - (axis.y / across) * reach * side,
    )}`;
  const marker =
    across > 0.3
      ? `<path d="${tick(1)} ${tick(-1)}" stroke="currentColor" stroke-width="1.5"
          opacity="0.5" stroke-linecap="round"/>`
      : `<circle cx="${MIDDLE}" cy="${MIDDLE}" r="1.6" fill="currentColor" opacity="0.5"/>`;
  return `<svg viewBox="0 0 ${BOX} ${BOX}" aria-hidden="true">
    <circle cx="${MIDDLE}" cy="${MIDDLE}" r="${RADIUS}" stroke="currentColor"
      stroke-width="1.1" fill="none" opacity="0.28"/>
    ${marker}
    <path d="${arcPath(at, from, from + sweep, 18)}" stroke="currentColor" stroke-width="2"
      fill="none" stroke-linecap="round"/>
    ${head(at, from + sweep, sweep)}
  </svg>`;
}

/** A reflection: its plane, drawn as a dashed disc at the attitude it really
 * has, with a two-headed arrow through it showing what swaps with what. A
 * vertical plane comes out as a vertical dashed line with the arrow across it,
 * a horizontal one as a horizontal line with the arrow up and down, and a plane
 * square-on to the viewer as a dashed circle with the arrow running into the
 * page — which is the one case a line could never have told the player. */
function reflectionIcon(direction: readonly [number, number, number]): string {
  const at = projectedCircle(direction, RADIUS);
  const normal = new Vector3(...direction).normalize();
  const facing = Math.abs(normal.z) > FACING;
  // where the two sides of the plane sit on screen; a plane facing the viewer
  // has its two sides one behind the other, and the arrow leans out of the page
  const dx = facing ? 0.72 : normal.x;
  const dy = facing ? -0.72 : normal.y;
  const length = Math.hypot(dx, dy) || 1;
  const reach = facing ? RADIUS - 1.5 : RADIUS + 2.5;
  const tip = (side: number): [number, number] => [
    MIDDLE + (dx / length) * reach * side,
    MIDDLE - (dy / length) * reach * side,
  ];
  const arrow = (side: number) => {
    const [x, y] = tip(side);
    const ax = (dx / length) * side * 3.2;
    const ay = (-dy / length) * side * 3.2;
    const sx = -ay * 0.72;
    const sy = ax * 0.72;
    return `<path d="M${round(x)} ${round(y)} L${round(x - ax + sx)} ${round(
      y - ay + sy,
    )} L${round(x - ax - sx)} ${round(y - ay - sy)} Z" fill="currentColor"/>`;
  };
  const [x1, y1] = tip(1);
  const [x2, y2] = tip(-1);
  return `<svg viewBox="0 0 ${BOX} ${BOX}" aria-hidden="true">
    <path d="${arcPath(at, 0, 2 * Math.PI, 40)}" stroke="currentColor" stroke-width="1.5"
      fill="none" stroke-dasharray="2.4 2.6" stroke-linecap="round"/>
    <path d="M${round(x1)} ${round(y1)} L${round(x2)} ${round(y2)}" stroke="currentColor"
      stroke-width="1.7" stroke-linecap="round"/>
    ${arrow(1)}${arrow(-1)}
  </svg>`;
}

/** Which way a plane lies, to within the eye's own tolerance: the line it draws
 * on screen is at right angles to the screen part of its normal, and a plane
 * whose normal points at the viewer draws no line at all. */
export function planeLie(direction: readonly [number, number, number] | null): PlaneLie {
  if (!direction) return "facing";
  const [nx, ny, nz] = direction;
  const length = Math.hypot(nx, ny, nz) || 1;
  if (Math.abs(nz / length) > FACING) return "facing";
  const line = (Math.atan2(ny, nx) * 180) / Math.PI + 90;
  const angle = ((line % 180) + 180) % 180;
  if (angle < 25 || angle > 155) return "horizontal";
  if (angle > 65 && angle < 115) return "vertical";
  return "diagonal";
}
