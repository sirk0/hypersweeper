// Drag and drop, and the remove mode. Press a tray tile to take a fresh one,
// or a placed tile to lift it; it follows the pointer, and wherever it would
// snap a ✓ says it fits and a dot marks each of its corners that would meet
// the edge. Releasing there places the tile. Releasing it back over the tray
// takes it off the board (a lifted tile shows red on the way); releasing
// anywhere else drops a fresh tile and puts a lifted one back where it was —
// a stray drop on the board never loses a tile.
//
// Removing is a mode: with ✕ on (the control beside the tray, or X), pressing a placed
// tile takes it off the board, as many as you like, until ✕ is turned off or a
// tray tile is picked up. Any exact cover wins, so a board can be finished more
// than one way — and laid into a corner it cannot be finished from, which is
// what taking tiles back off is for.
//
// A tile lands only as it is held. The one rotate control (or R) turns every
// tray tile at once, and the tile in hand, before or while dragging — a second
// finger can tap it mid-drag; on a level with several kinds, turning one into
// place can turn another out of it.

import type { Cyc } from "../geometry/cyclotomic";
import { centroid, signedArea, type XY } from "../geometry/shape";
import type { Placed, Puzzle } from "../puzzle";
import type { SvgBoard } from "../view/svgBoard";

/** How far from the pointer a placement may snap, in tile sizes. */
const REACH = 0.7;

interface Drag {
  pointer: number;
  kind: number;
  /** How it is held: the kind's shape, mirrored if `flip`, turned by ζ^rot. */
  rot: number;
  flip: boolean;
  outline: XY[];
  /** From the pointer to the tile's centroid, so it does not jump to centre. */
  offset: XY;
  at: XY;
  ghost: Cyc[] | null;
  /** The placed tile this drag lifted, to put back if it lands nowhere. */
  origin: Placed | null;
}

export interface DragControl {
  /** Turn every tray tile, and the one in hand, one step counter-clockwise
   * (1) or clockwise (-1). */
  turn(dir: 1 | -1): void;
  /** Mirror every tray tile, and the one in hand. */
  flip(): void;
  /** Switch the remove mode on or off. */
  setRemoving(on: boolean): void;
}

export function attachDrag(board: SvgBoard, puzzle: Puzzle, changed: () => void): DragControl {
  const { svg } = board;
  const { ring } = puzzle.level;
  const mod = (k: number): number => ((k % ring.n) + ring.n) % ring.n;
  let drag: Drag | null = null;
  let frame = 0;

  const reachFor = (kind: number): number => {
    const xy = puzzle.level.tiles[kind]!.verts.map((v) => ring.toXY(v));
    return REACH * Math.sqrt(Math.abs(signedArea(xy)));
  };

  const settle = (): void => {
    board.draw();
    changed();
  };

  const setRemoving = (on: boolean): void => {
    board.removing = on;
  };

  /** The pointer, in board units, of the drag's latest move. */
  const pointer = (d: Drag): XY => [d.at[0] - d.offset[0], d.at[1] - d.offset[1]];

  const update = (): void => {
    frame = 0;
    if (!drag) return;
    // Back over the tray, a lifted tile is on its way off the board.
    const discard = drag.origin !== null && board.overTray(pointer(drag));
    drag.ghost = discard ? null : puzzle.snap(drag.kind, drag.at, reachFor(drag.kind), drag.rot, drag.flip);
    const ghost = drag.ghost?.map((v) => ring.toXY(v)) ?? null;
    const stick = drag.ghost ? puzzle.touching(drag.ghost).map((v) => ring.toXY(v)) : [];
    board.drawDrag(drag.kind, drag.outline, drag.at, ghost && centroid(ghost), stick, discard);
  };

  // One turn for everything: every tray tile, and the one in hand.
  const turn = (dir: 1 | -1): void => {
    if (!puzzle.canTurn()) return;
    const step = dir * puzzle.level.turn;
    board.turn = mod(board.turn + step);
    board.draw();
    if (drag) {
      drag.rot = mod(drag.rot + step);
      drag.outline = board.outline(drag.kind, drag.rot, drag.flip);
      update();
    }
  };

  const flip = (): void => {
    if (!puzzle.canFlip()) return;
    board.flip = !board.flip;
    board.draw();
    if (drag) {
      drag.flip = !drag.flip;
      drag.outline = board.outline(drag.kind, drag.rot, drag.flip);
      update();
    }
  };

  svg.addEventListener("pointerdown", (ev) => {
    const target = ev.target as Element;
    const knob = target.closest("[data-turn]");
    if (knob) {
      // Before the drag check: a second finger may turn the tiles mid-drag.
      ev.preventDefault();
      turn(Number(knob.getAttribute("data-turn")) as 1 | -1);
      return;
    }
    if (target.closest("[data-flip]")) {
      ev.preventDefault();
      flip();
      return;
    }
    if (target.closest("[data-remove]")) {
      ev.preventDefault();
      setRemoving(!board.removing);
      return;
    }
    if (drag || ev.button > 0) return;
    const p = board.toBoard(ev.clientX, ev.clientY);
    let kind: number;
    let rot: number;
    let flipped = false;
    let outline: XY[];
    let c: XY;
    let origin: Placed | null = null;
    const tray = target.closest("[data-tray]");
    const placed = target.closest("[data-tile]");
    if (placed && board.removing) {
      ev.preventDefault();
      puzzle.lift(Number(placed.getAttribute("data-tile")));
      settle();
      return;
    }
    if (tray) {
      // Picking up a new tile is the end of removing.
      setRemoving(false);
      kind = Number(tray.getAttribute("data-tray"));
      rot = board.turn;
      flipped = board.flip;
      outline = board.outline(kind, rot, flipped);
      c = board.trayAt[kind]!;
    } else if (placed) {
      origin = puzzle.lift(Number(placed.getAttribute("data-tile"))) ?? null;
      if (!origin) return;
      kind = origin.kind;
      rot = origin.rot;
      flipped = origin.flip;
      const xy = origin.verts.map((v) => ring.toXY(v));
      c = centroid(xy);
      outline = xy.map(([x, y]): XY => [x - c[0], y - c[1]]);
    } else {
      return;
    }
    ev.preventDefault();
    // Throws for a pointer the browser no longer tracks (or a synthetic one);
    // the drag works without capture, it just loses moves outside the svg.
    try {
      svg.setPointerCapture(ev.pointerId);
    } catch {
      // carry on uncaptured
    }
    drag = {
      pointer: ev.pointerId,
      kind,
      rot,
      flip: flipped,
      outline,
      offset: [c[0] - p[0], c[1] - p[1]],
      at: c,
      ghost: null,
      origin,
    };
    settle();
    update();
  });

  svg.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    const p = board.toBoard(ev.clientX, ev.clientY);
    drag.at = [p[0] + drag.offset[0], p[1] + drag.offset[1]];
    if (!frame) frame = requestAnimationFrame(update);
  });

  const finish = (ev: PointerEvent, drop: boolean): void => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const d = drag;
    drag = null;
    board.clearDrag();
    let ghost: Cyc[] | null = null;
    // Judged at the release point itself, not the last frame's.
    const p = board.toBoard(ev.clientX, ev.clientY);
    const discard = drop && board.overTray(p);
    if (drop && !discard) {
      ghost = puzzle.snap(d.kind, [p[0] + d.offset[0], p[1] + d.offset[1]], reachFor(d.kind), d.rot, d.flip);
    }
    if (ghost) {
      puzzle.place(d.kind, ghost, d.rot, d.flip);
    } else if (d.origin && !discard) {
      puzzle.place(d.origin.kind, d.origin.verts, d.origin.rot, d.origin.flip);
    }
    settle();
  };
  svg.addEventListener("pointerup", (ev) => finish(ev, true));
  svg.addEventListener("pointercancel", (ev) => finish(ev, false));
  return { turn, flip, setRemoving };
}
