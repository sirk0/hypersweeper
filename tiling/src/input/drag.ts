// Drag and drop. Press a tray tile to take a fresh one, or a placed tile to
// lift it; it follows the pointer, and wherever a fitting placement is within
// reach a ghost shows where it would land. Releasing over a ghost places the
// tile there; releasing anywhere else drops it (a lifted tile is gone).

import type { Cyc } from "../geometry/cyclotomic";
import { centroid, signedArea, type XY } from "../geometry/shape";
import type { Puzzle } from "../puzzle";
import type { SvgBoard } from "../view/svgBoard";

/** How far from the pointer a placement may snap, in tile sizes. */
const REACH = 0.7;

interface Drag {
  pointer: number;
  kind: number;
  outline: XY[];
  /** From the pointer to the tile's centroid, so it does not jump to centre. */
  offset: XY;
  at: XY;
  ghost: Cyc[] | null;
}

export function attachDrag(board: SvgBoard, puzzle: Puzzle, changed: () => void): void {
  const { svg } = board;
  const { ring } = puzzle.level;
  let drag: Drag | null = null;
  let frame = 0;

  const reachFor = (kind: number): number => {
    const xy = puzzle.level.tiles[kind]!.verts.map((v) => ring.toXY(v));
    return REACH * Math.sqrt(Math.abs(signedArea(xy)));
  };

  const update = (): void => {
    frame = 0;
    if (!drag) return;
    drag.ghost = puzzle.snap(drag.kind, drag.at, reachFor(drag.kind));
    board.drawDrag(
      drag.kind,
      drag.outline,
      drag.at,
      drag.ghost ? drag.ghost.map((v) => ring.toXY(v)) : null,
    );
  };

  svg.addEventListener("pointerdown", (ev) => {
    if (drag || ev.button > 0) return;
    const target = ev.target as Element;
    const p = board.toBoard(ev.clientX, ev.clientY);
    let kind: number;
    let outline: XY[];
    let c: XY;
    const tray = target.closest("[data-tray]");
    const placed = target.closest("[data-tile]");
    if (tray) {
      kind = Number(tray.getAttribute("data-tray"));
      outline = board.outline(kind);
      c = board.trayAt[kind]!;
    } else if (placed) {
      const tile = puzzle.lift(Number(placed.getAttribute("data-tile")));
      if (!tile) return;
      kind = tile.kind;
      const xy = tile.verts.map((v) => ring.toXY(v));
      c = centroid(xy);
      outline = xy.map(([x, y]): XY => [x - c[0], y - c[1]]);
      board.draw();
      changed();
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
    drag = { pointer: ev.pointerId, kind, outline, offset: [c[0] - p[0], c[1] - p[1]], at: c, ghost: null };
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
    if (drop) {
      // Judge the snap at the release point itself, not the last frame's.
      const p = board.toBoard(ev.clientX, ev.clientY);
      drag.at = [p[0] + drag.offset[0], p[1] + drag.offset[1]];
      drag.ghost = puzzle.snap(drag.kind, drag.at, reachFor(drag.kind));
      if (drag.ghost) puzzle.place(drag.kind, drag.ghost);
    }
    drag = null;
    board.clearDrag();
    board.draw();
    changed();
  };
  svg.addEventListener("pointerup", (ev) => finish(ev, true));
  svg.addEventListener("pointercancel", (ev) => finish(ev, false));
}
