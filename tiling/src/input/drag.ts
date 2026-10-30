// Drag and drop, and tap to select. Press a tray tile to take a fresh one, or
// a placed tile to lift it; it follows the pointer, and wherever it would snap
// a dot marks each of its corners that would meet the edge. Releasing there places the tile;
// releasing anywhere else drops a fresh tile and puts a lifted one back where
// it was — removing a tile is the Delete button's job, never a stray drop.
// A placed tile pressed and released without moving is selected instead (a
// second tap deselects it), which is what Delete acts on.
//
// A tile lands only as it is held: turn it with the rotate control by the
// tray (or R), before or while dragging — a second finger can tap the control
// mid-drag.

import type { Cyc } from "../geometry/cyclotomic";
import { centroid, signedArea, type XY } from "../geometry/shape";
import type { Placed, Puzzle } from "../puzzle";
import type { SvgBoard } from "../view/svgBoard";

/** How far from the pointer a placement may snap, in tile sizes. */
const REACH = 0.7;
/** How far a press may wander, in CSS pixels, and still count as a tap. */
const TAP_SLOP = 6;

interface Drag {
  pointer: number;
  kind: number;
  /** How it is held: the kind's shape turned by ζ^rot. */
  rot: number;
  outline: XY[];
  /** From the pointer to the tile's centroid, so it does not jump to centre. */
  offset: XY;
  at: XY;
  ghost: Cyc[] | null;
  /** The placed tile this drag lifted, to put back if it lands nowhere. */
  origin: Placed | null;
  wasSelected: boolean;
  start: XY;
  moved: boolean;
}

export interface DragControl {
  /** Turn the held tile — or, with none held, the tray's — one step
   * counter-clockwise (1) or clockwise (-1). */
  turn(dir: 1 | -1): void;
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

  const update = (): void => {
    frame = 0;
    if (!drag) return;
    drag.ghost = puzzle.snap(drag.kind, drag.at, reachFor(drag.kind), drag.rot);
    const stick = drag.ghost ? puzzle.touching(drag.ghost).map((v) => ring.toXY(v)) : [];
    board.drawDrag(drag.kind, drag.outline, drag.at, stick);
  };

  const turn = (dir: 1 | -1, kind = drag?.kind ?? 0): void => {
    if (!puzzle.canTurn(kind)) return;
    const step = dir * puzzle.level.turns[kind]!;
    if (drag && drag.kind === kind) {
      drag.rot = mod(drag.rot + step);
      drag.outline = board.outline(kind, drag.rot);
      update();
    } else {
      board.turns[kind] = mod(board.turns[kind]! + step);
      board.draw();
    }
  };

  svg.addEventListener("pointerdown", (ev) => {
    const target = ev.target as Element;
    const knob = target.closest("[data-turn]");
    if (knob) {
      // Before the drag check: a second finger may turn the tile mid-drag.
      ev.preventDefault();
      turn(Number(knob.getAttribute("data-turn")) as 1 | -1, Number(knob.getAttribute("data-kind")));
      return;
    }
    if (drag || ev.button > 0) return;
    const p = board.toBoard(ev.clientX, ev.clientY);
    let kind: number;
    let rot: number;
    let outline: XY[];
    let c: XY;
    let origin: Placed | null = null;
    let wasSelected = false;
    const tray = target.closest("[data-tray]");
    const placed = target.closest("[data-tile]");
    if (tray) {
      kind = Number(tray.getAttribute("data-tray"));
      rot = board.turns[kind]!;
      outline = board.outline(kind, rot);
      c = board.trayAt[kind]!;
      board.selected = null;
    } else if (placed) {
      const id = Number(placed.getAttribute("data-tile"));
      origin = puzzle.lift(id) ?? null;
      if (!origin) return;
      wasSelected = board.selected === id;
      kind = origin.kind;
      rot = origin.rot;
      const xy = origin.verts.map((v) => ring.toXY(v));
      c = centroid(xy);
      outline = xy.map(([x, y]): XY => [x - c[0], y - c[1]]);
    } else {
      if (board.selected !== null) {
        board.selected = null;
        settle();
      }
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
      outline,
      offset: [c[0] - p[0], c[1] - p[1]],
      at: c,
      ghost: null,
      origin,
      wasSelected,
      start: [ev.clientX, ev.clientY],
      moved: false,
    };
    settle();
    update();
  });

  svg.addEventListener("pointermove", (ev) => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    if (Math.hypot(ev.clientX - drag.start[0], ev.clientY - drag.start[1]) > TAP_SLOP) drag.moved = true;
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
    if (d.origin && !d.moved) {
      // A tap: the tile goes straight back, and its selection toggles.
      const back = puzzle.place(d.origin.kind, d.origin.verts, d.origin.rot);
      board.selected = d.wasSelected ? null : back.id;
      settle();
      return;
    }
    let ghost: Cyc[] | null = null;
    if (drop) {
      // Judge the snap at the release point itself, not the last frame's.
      const p = board.toBoard(ev.clientX, ev.clientY);
      ghost = puzzle.snap(d.kind, [p[0] + d.offset[0], p[1] + d.offset[1]], reachFor(d.kind), d.rot);
    }
    if (ghost) {
      puzzle.place(d.kind, ghost, d.rot);
      board.selected = null;
      // The tray keeps the turn just used, so the next tile comes the same way.
      board.turns[d.kind] = d.rot;
    } else if (d.origin) {
      const back = puzzle.place(d.origin.kind, d.origin.verts, d.origin.rot);
      if (d.wasSelected) board.selected = back.id;
    }
    settle();
  };
  svg.addEventListener("pointerup", (ev) => finish(ev, true));
  svg.addEventListener("pointercancel", (ev) => finish(ev, false));
  return { turn };
}
