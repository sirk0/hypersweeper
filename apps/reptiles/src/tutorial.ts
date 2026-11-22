// The first-run tutorial (`?tutorial`): four tiny boards, one thing each —
// dragging, turning, flipping and taking a tile off — with a coach card over
// the board saying what to do (main.ts draws it). Each board is a level made
// from its exact cells like any other (`tutorialLevel`), but none is listed,
// dealt, measured, starred, timed or kept: finishing one only moves the coach
// on.
//
// It opens by itself once, in place of home, for a player with nothing to
// show yet — no stars, no board in play — and is marked seen the moment it
// opens, so leaving it part-way (Skip, home, a reload) is leaving it for good.
// How to play links to it again.

import { readObject, storage } from "@tiling/platform";
import { cyclotomic, type Cyc, type Ring } from "./geometry/cyclotomic";
import { tutorialLevel, type Level } from "./levels";
import type { SavedTile } from "./saved";

const KEY = "rep-tiles.tutorial";

export interface TutorialStep {
  /** What the coach card calls the step. */
  title: string;
  /** What to do, each `[K]` a key cap (How to play's `withKeys`). */
  body: string;
  /** Said once the board is covered. */
  done: string;
  level: Level;
  /** Tiles already down as the step opens. */
  laid: SavedTile[];
}

/** The point a + b·ζ of `ring`, exactly: ζ is i on the square ring, e^{iπ/3}
 * on the triangular one. */
function at(ring: Ring, a: number, b: number): Cyc {
  const z = ring.zeta(1);
  return ring.one.map((u, i) => a * u + b * z[i]!);
}

const Z4 = cyclotomic(4);
const Z6 = cyclotomic(6);
const sq = (x: number, y: number): Cyc => at(Z4, x, y);
const tri = (a: number, b: number): Cyc => at(Z6, a, b);
/** The axis-aligned rectangle from (x, y), w by h. */
const box = (x: number, y: number, w: number, h: number): Cyc[] => [
  sq(x, y),
  sq(x + w, y),
  sq(x + w, y + h),
  sq(x, y + h),
];

/** The steps, built the first time they are asked for. */
let built: TutorialStep[] | null = null;

export function tutorialSteps(): TutorialStep[] {
  built ??= [
    {
      title: "Drag",
      body:
        "Drag a tile from the tray onto the board. It sticks to a corner of " +
        "what is still uncovered. Cover the whole board.",
      done: "Covered — no gaps, no overlaps.",
      // a 2×2 of squares
      level: tutorialLevel("tutorial-drag", "Drag", Z4, [
        box(0, 0, 1, 1),
        box(1, 0, 1, 1),
        box(0, 1, 1, 1),
        box(1, 1, 1, 1),
      ]),
      laid: [],
    },
    {
      title: "Turn",
      body:
        "A tile lands only as it is held. Turn every tray tile with the round " +
        "arrows by the tray — or [R], and [Shift]+[R] the other way.",
      done: "Turned and laid.",
      // a row of triangles, up and down by turns: three up, two down
      level: tutorialLevel("tutorial-turn", "Turn", Z6, [
        [tri(0, 0), tri(1, 0), tri(0, 1)],
        [tri(1, 0), tri(1, 1), tri(0, 1)],
        [tri(1, 0), tri(2, 0), tri(1, 1)],
        [tri(2, 0), tri(2, 1), tri(1, 1)],
        [tri(2, 0), tri(3, 0), tri(2, 1)],
      ]),
      laid: [],
    },
    {
      title: "Flip",
      body:
        "Some boards need a tile's mirror image. The flip control by the tray " +
        "— or [F] — turns every tray tile over.",
      done: "Flipped and laid.",
      // an S and a Z tetromino, an arch: the S fills the left, its mirror image
      // the right, neither turned
      level: tutorialLevel("tutorial-flip", "Flip", Z4, [
        [sq(0, 0), sq(2, 0), sq(2, 1), sq(3, 1), sq(3, 2), sq(1, 2), sq(1, 1), sq(0, 1)],
        [sq(4, 0), sq(6, 0), sq(6, 1), sq(5, 1), sq(5, 2), sq(3, 2), sq(3, 1), sq(4, 1)],
      ]),
      laid: [],
    },
    {
      title: "Take off",
      body:
        "That domino leaves two squares no tile fits. Drag it back over the " +
        "tray to take it off — or press ✕ by the tray, or [X], and tap it. " +
        "Then cover the board.",
      done: "Taken off, and covered.",
      // an L of three squares and one: a domino down its upright and one
      // along its foot; the one laid wrong lies across the corner
      level: tutorialLevel("tutorial-remove", "Take off", Z4, [box(0, 0, 1, 2), box(1, 0, 2, 1)]),
      laid: [{ kind: 0, rot: 0, flip: false, verts: [box(0, 0, 2, 1)] }],
    },
  ];
  return built;
}

/** Whether the tutorial has been opened before. */
export function tutorialSeen(): boolean {
  return readObject(KEY)?.["seen"] === true;
}

/** Mark the tutorial as seen: it never opens by itself again. */
export function markTutorialSeen(): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ seen: true }));
  } catch {
    // seen for as long as the page lasts
  }
}
