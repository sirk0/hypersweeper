import { Vector2 } from "three";
import type { CellId, SymmetryId } from "../boards/core";

// Pointer/touch input. Emits high-level gestures; the app maps them onto game
// actions. The gesture state machine disambiguates tap / long-press / drag:
// a press that stays put and is released is a tap (reveal); held long on
// touch it becomes a long-press (flag); moved past the threshold it becomes a
// drag, which rotates the board when the app says the current board rotates
// (3D), pans it when the app says it can be panned (a zoomed-in flat board),
// and otherwise just cancels the tap. Right-click is a secondary (flag).
// A second finger starts a pinch: it zooms the board about the midpoint and
// pans with it, and it can never fire a tap.

const MOVE_THRESHOLD = 8; // px
const LONG_PRESS_MS = 450;

export interface ControlHandlers {
  pick(ndc: Vector2): CellId | null;
  onTap(cell: CellId): void;
  onLongPress(cell: CellId): void;
  onSecondary(cell: CellId): void;
  onHover(cell: CellId | null): void;
  /** Whether drags should rotate the current board (a 3D screen). */
  rotates(): boolean;
  /** A drag step of (dx, dy) CSS pixels while rotating. */
  onRotate(dx: number, dy: number): void;
  /** Whether a one-finger drag should pan the board (it is zoomed in and does
   * not rotate). A pinch pans whatever the answer. */
  pans(): boolean;
  /** Drag the board by (dx, dy) CSS pixels. */
  onPan(dx: number, dy: number): void;
  /** Zoom by `factor` about the point (x, y) in canvas CSS pixels. */
  onZoom(factor: number, x: number, y: number): void;
  /** Whether the board carries this symmetry, so the wheel should walk it
   * rather than zoom. */
  scrolls(id: SymmetryId): boolean;
  /** One step along one of the board's symmetries: +1 forward, -1 back. Fired
   * by the mouse wheel / two-finger trackpad scroll; a no-op off a board that
   * has it. */
  onScroll(id: SymmetryId, direction: number): void;
}

// Wheel/trackpad delta accumulated per ring step (a notch is ~100px).
const WHEEL_STEP = 40;
// Zoom per wheel pixel. A trackpad pinch arrives as ctrl+wheel with small
// deltas, so it gets the coarser rate; a mouse notch (~100px) the finer one.
const CTRL_WHEEL_ZOOM = 0.01;
const WHEEL_ZOOM = 0.0022;

export function attachControls(
  canvas: HTMLCanvasElement,
  handlers: ControlHandlers,
): () => void {
  let pressed = false;
  let downCell: CellId | null = null;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let moved = false;
  let rotating = false;
  let panning = false;
  let longTimer = 0;
  let longFired = false;
  // Live touch/pen/mouse points, so a second finger can be spotted. Pinch
  // state is the two-finger span and midpoint from the previous move.
  const points = new Map<number, { x: number; y: number }>();
  let pinchSpan = 0;
  let pinchX = 0;
  let pinchY = 0;
  // The pointer's real position, kept from the last pointer event. A
  // PointerEvent carries fractional client coordinates; a plain MouseEvent
  // (`contextmenu`, `click`, `mousedown`) carries the same point cut down to
  // whole pixels. Picking from the cut-down pair aims up to a pixel away from
  // where the pointer actually is, and a pixel is the whole story at a cell
  // edge: hovering the seam between two cells highlighted one and right-clicking
  // flagged the other. See `pointerPoint`.
  let pointerX = Number.NaN;
  let pointerY = Number.NaN;

  const local = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const ndc = (clientX: number, clientY: number): Vector2 => {
    const r = canvas.getBoundingClientRect();
    return new Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -(((clientY - r.top) / r.height) * 2 - 1),
    );
  };

  /** Where to aim a MouseEvent's pick. The pointer's own last position when
   * this event is that same point rounded off (which is what a right-click is:
   * `contextmenu` follows `pointerdown` with no chance to move in between), and
   * the event's own coordinates otherwise — a context menu raised from the
   * keyboard has no pointer behind it. */
  const pointerPoint = (e: MouseEvent): { x: number; y: number } =>
    Math.abs(pointerX - e.clientX) < 1 && Math.abs(pointerY - e.clientY) < 1
      ? { x: pointerX, y: pointerY }
      : { x: e.clientX, y: e.clientY };

  const clearLong = () => {
    if (longTimer) window.clearTimeout(longTimer);
    longTimer = 0;
  };

  /** The span and midpoint (canvas CSS px) of the first two live points. */
  const pinchGeometry = (): { span: number; x: number; y: number } | null => {
    const [a, b] = [...points.values()];
    if (!a || !b) return null;
    const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    return { span: Math.hypot(a.x - b.x, a.y - b.y), ...mid };
  };

  const startPinch = () => {
    const g = pinchGeometry();
    if (!g) return;
    // A pinch is never a tap and never a rotation: cancel whatever the first
    // finger had started, and leave `moved` set so the release stays silent.
    clearLong();
    moved = true;
    rotating = false;
    panning = false;
    pinchSpan = g.span;
    pinchX = g.x;
    pinchY = g.y;
  };

  const onPointerDown = (e: PointerEvent) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (e.button === 2) return; // handled on contextmenu
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size >= 2) {
      startPinch();
      return;
    }
    pressed = true;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    moved = false;
    rotating = false;
    panning = false;
    longFired = false;
    downCell = handlers.pick(ndc(e.clientX, e.clientY));
    // keep receiving moves when a rotation drag leaves the canvas
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic pointers (tests) have no capture target */
    }
    if (downCell != null && e.pointerType !== "mouse") {
      const cell = downCell;
      longTimer = window.setTimeout(() => {
        longFired = true;
        handlers.onLongPress(cell);
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (points.has(e.pointerId)) {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (points.size >= 2) {
      const g = pinchGeometry();
      if (g) {
        if (pinchSpan > 0 && g.span > 0) {
          handlers.onZoom(g.span / pinchSpan, g.x, g.y);
        }
        // Two fingers travelling together drag the board as they zoom it.
        handlers.onPan(g.x - pinchX, g.y - pinchY);
        pinchSpan = g.span;
        pinchX = g.x;
        pinchY = g.y;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      return;
    }
    if (pressed && !longFired) {
      if (
        !moved &&
        Math.hypot(e.clientX - downX, e.clientY - downY) > MOVE_THRESHOLD
      ) {
        moved = true;
        clearLong();
        if (handlers.rotates()) rotating = true;
        else if (handlers.pans()) panning = true;
      }
      if (rotating) handlers.onRotate(e.clientX - lastX, e.clientY - lastY);
      else if (panning) handlers.onPan(e.clientX - lastX, e.clientY - lastY);
    }
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
      handlers.onHover(handlers.pick(ndc(e.clientX, e.clientY)));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    points.delete(e.pointerId);
    if (points.size >= 1) {
      // Lifting one finger of a pinch: re-seed from the fingers still down so
      // the board does not jump, and keep the gesture non-tapping.
      const g = pinchGeometry();
      if (g) {
        pinchSpan = g.span;
        pinchX = g.x;
        pinchY = g.y;
      } else {
        const rest = [...points.values()][0];
        if (rest) {
          lastX = rest.x;
          lastY = rest.y;
        }
      }
      moved = true;
      return;
    }
    clearLong();
    const wasRotating = rotating;
    const wasPanning = panning;
    pressed = false;
    rotating = false;
    panning = false;
    // Act on the cell the press landed on, not on whatever is under the point
    // the finger lifted from. Under the threshold the gesture is a tap, and the
    // cell the player aimed at is the one they pressed — it is also the one
    // long-press flags. Re-picking at the release point instead meant a tap
    // that wandered a pixel or two across a cell edge (routine on a touch
    // screen, and cells are small on a dense board) picked a different cell and
    // was thrown away, so the tap did nothing at all.
    if (!longFired && !moved && !wasRotating && !wasPanning && downCell != null) {
      handlers.onTap(downCell);
    }
    downCell = null;
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const p = pointerPoint(e);
    const cell = handlers.pick(ndc(p.x, p.y));
    if (cell != null) handlers.onSecondary(cell);
  };

  const onCancel = (e: PointerEvent) => {
    points.delete(e.pointerId);
    clearLong();
    if (points.size === 0) {
      pressed = false;
      rotating = false;
      panning = false;
      downCell = null;
    }
  };

  const onLeave = () => handlers.onHover(null);

  let scrollAccum = 0;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault(); // don't let the page scroll (or zoom) under the board
    // A trackpad pinch reaches the page as ctrl+wheel, so it always zooms; a
    // plain wheel walks the ring on a board that has one, shift+wheel rolls it
    // round the tube, and the wheel zooms on every other board. Shift turns a
    // vertical wheel into a horizontal one in some browsers, so take whichever
    // axis the event actually carries.
    const id: SymmetryId = e.shiftKey ? "tube" : "ring";
    const delta = e.deltaY || e.deltaX;
    if (e.ctrlKey || !handlers.scrolls(id)) {
      const rate = e.ctrlKey ? CTRL_WHEEL_ZOOM : WHEEL_ZOOM;
      // deltaMode 1 counts lines, 2 pages; normalise both to pixels.
      const px = delta * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const p = local(e.clientX, e.clientY);
      handlers.onZoom(Math.exp(-px * rate), p.x, p.y);
      return;
    }
    scrollAccum += delta;
    while (scrollAccum >= WHEEL_STEP) {
      scrollAccum -= WHEEL_STEP;
      handlers.onScroll(id, 1);
    }
    while (scrollAccum <= -WHEEL_STEP) {
      scrollAccum += WHEEL_STEP;
      handlers.onScroll(id, -1);
    }
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    clearLong();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onCancel);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("wheel", onWheel);
  };
}

/** Stop the *browser* from zooming the page on the board — the fix for the
 * iOS bug where a double-tap (two quick reveals, a double tap on the smiley)
 * blows the whole page up: the layout viewport then no longer matches what the
 * player sees, the board appears to have jumped, and taps land on the wrong
 * cells with no way back short of reloading. The app does its own board zoom
 * instead (pinch / wheel / +,-), which is bounded and reversible.
 *
 * Three layers, because no single one covers every WebKit build:
 *   - `touch-action: manipulation` on the chrome and `none` on the canvas
 *     (styles.css) is the standards-based half;
 *   - Safari's own `gesture*` events are the page-pinch path, which
 *     touch-action does not govern;
 *   - a fast second `touchend` is the classic double-tap-to-zoom trigger.
 *     Buttons are left alone there so a double tap on the smiley still
 *     restarts twice — `touch-action` already covers them.
 */
export function blockBrowserZoom(target: Document = document): () => void {
  const DOUBLE_TAP_MS = 350;
  let lastTouchEnd = 0;

  const stop = (e: Event) => e.preventDefault();
  const onTouchEnd = (e: Event) => {
    const now = Date.now();
    const onButton =
      e.target instanceof Element && e.target.closest("button") != null;
    if (!onButton && now - lastTouchEnd < DOUBLE_TAP_MS) e.preventDefault();
    lastTouchEnd = now;
  };

  target.addEventListener("gesturestart", stop as EventListener);
  target.addEventListener("gesturechange", stop as EventListener);
  target.addEventListener("gestureend", stop as EventListener);
  target.addEventListener("dblclick", stop as EventListener);
  target.addEventListener("touchend", onTouchEnd, { passive: false });

  return () => {
    target.removeEventListener("gesturestart", stop as EventListener);
    target.removeEventListener("gesturechange", stop as EventListener);
    target.removeEventListener("gestureend", stop as EventListener);
    target.removeEventListener("dblclick", stop as EventListener);
    target.removeEventListener("touchend", onTouchEnd);
  };
}
