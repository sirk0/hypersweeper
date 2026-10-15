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
//
// How long that hold has to last is the player's (Settings › Hold to flag, see
// input/hold.ts). It is asked for at press time rather than captured when the
// controls are attached — they are attached once, for the life of the app — so
// a change on the settings page applies to the board already in play. The flag
// it plants is the one move the player cannot see land (their own finger is on
// top of the cell), which is what the header's flag flash answers — see
// `Hud.flashFlag`.
//
// A finger counts as down from its `pointerdown` until its `pointerup` or
// `pointercancel` — and WebKit on iOS does not always send either: a lift at
// the end of a pinch, a system gesture, the app leaving the foreground can
// swallow it. A finger lost that way stayed "down" for the life of the app, so
// every real touch after it was its *second* finger: a one-finger drag zoomed
// about a point nobody was touching, taps did nothing, and a new game did not
// help, since the controls outlive it. So the record is never trusted on its
// own. A finger is forgotten when the browser says nothing is down any more —
// a press that is the only one (`isPrimary`), a touch list that has emptied —
// and everything is forgotten when the page is hidden. See `forget` and
// tests/e2e/stuckTouch.spec.ts.

const MOVE_THRESHOLD = 8; // px

export interface ControlHandlers {
  pick(ndc: Vector2): CellId | null;
  onTap(cell: CellId): void;
  onLongPress(cell: CellId): void;
  /** How long a press must be held before `onLongPress` fires, in ms. Asked at
   * every press, so the setting applies to the board already in play. */
  holdMs(): number;
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
  /** A press went down on `cell`, or (null) whatever was pressed is no longer
   * going to be a tap on it — lifted, dragged off, turned into a pinch or a
   * long-press flag. Drives the tile's press-down; optional. */
  onPress?(cell: CellId | null): void;
  /** A rotation drag let go while still moving, at (vx, vy) CSS px per ms —
   * the board coasts on from there. Optional. */
  onFling?(vx: number, vy: number): void;
  /** A rotation drag has begun / ended (lifted, cancelled, or turned into a
   * pinch). The renderer holds its framing still in between. Optional. */
  onRotateStart?(): void;
  onRotateEnd?(): void;
}

// Wheel/trackpad delta accumulated per ring step (a notch is ~100px).
const WHEEL_STEP = 40;
// Zoom per wheel pixel. A trackpad pinch arrives as ctrl+wheel with small
// deltas, so it gets the coarser rate; a mouse notch (~100px) the finer one.
const CTRL_WHEEL_ZOOM = 0.01;
const WHEEL_ZOOM = 0.0022;

/** What the native shell sends for a Catalyst trackpad pinch; `x`/`y` are in
 * web-view points, i.e. CSS pixels. */
interface NativePinch {
  phase: "start" | "change" | "end";
  scale: number;
  x: number;
  y: number;
}

/** Safari's non-standard pinch event; not in lib.dom. */
interface GestureEventLike extends Event {
  scale: number;
  clientX: number;
  clientY: number;
}

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
  // The drag's recent velocity, smoothed, for the fling at release.
  let velX = 0;
  let velY = 0;
  let lastT = 0;
  // Live touch/pen/mouse points, so a second finger can be spotted. Pinch
  // state is the two-finger span and midpoint from the previous move. `stale`
  // marks a touch the browser's touch list has since said is no longer down,
  // whose own lift has not (yet) arrived.
  const points = new Map<
    number,
    { x: number; y: number; type: string; stale?: boolean }
  >();
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

  /** Drop the points `which` picks out, as if each had been cancelled, and
   * end whatever gesture they were part of once none is left. The recovery
   * for a lift the browser never delivered (see the header). */
  const forget = (which: (p: { type: string; stale?: boolean }) => boolean) => {
    let dropped = false;
    for (const [id, p] of points) {
      if (which(p)) {
        points.delete(id);
        dropped = true;
      }
    }
    if (!dropped || points.size > 0) return;
    clearLong();
    handlers.onPress?.(null);
    if (rotating) handlers.onRotateEnd?.();
    pressed = false;
    rotating = false;
    panning = false;
    downCell = null;
  };

  const startPinch = () => {
    const g = pinchGeometry();
    if (!g) return;
    // A pinch is never a tap and never a rotation: cancel whatever the first
    // finger had started, and leave `moved` set so the release stays silent.
    clearLong();
    handlers.onPress?.(null);
    if (rotating) handlers.onRotateEnd?.();
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
    // Nothing else of this kind can still be down: a primary press is the only
    // one of its type, and a touch the touch list has seen leave is gone.
    // Whatever the record still holds is a lift that never arrived.
    forget(
      (p) =>
        p.type === e.pointerType &&
        (e.isPrimary || (p.type === "touch" && p.stale === true)),
    );
    points.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
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
    velX = 0;
    velY = 0;
    lastT = e.timeStamp;
    // A pressed tile sinks — but not under a finger, which covers the very
    // tile it would show on (the reason a held flag drops in from above
    // instead). There it would be frames spent on nothing anyone can see.
    if (downCell != null && e.pointerType !== "touch") handlers.onPress?.(downCell);
    // keep receiving moves when a rotation drag leaves the canvas
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic pointers (tests) have no capture target */
    }
    if (downCell != null && e.pointerType !== "mouse") {
      const cell = downCell;
      longTimer = window.setTimeout(() => {
        longTimer = 0;
        longFired = true;
        handlers.onPress?.(null);
        handlers.onLongPress(cell);
      }, handlers.holdMs());
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    const point = points.get(e.pointerId);
    if (point) {
      point.x = e.clientX;
      point.y = e.clientY;
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
        handlers.onPress?.(null);
        if (handlers.rotates()) {
          rotating = true;
          handlers.onRotateStart?.();
        }
        else if (handlers.pans()) panning = true;
      }
      if (rotating) {
        handlers.onRotate(e.clientX - lastX, e.clientY - lastY);
        const dt = Math.max(1, e.timeStamp - lastT);
        // Exponentially smoothed so one jittery event does not decide the throw.
        velX = velX * 0.6 + ((e.clientX - lastX) / dt) * 0.4;
        velY = velY * 0.6 + ((e.clientY - lastY) / dt) * 0.4;
        lastT = e.timeStamp;
      }
      else if (panning) handlers.onPan(e.clientX - lastX, e.clientY - lastY);
    }
    lastX = e.clientX;
    lastY = e.clientY;
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
      handlers.onHover(handlers.pick(ndc(e.clientX, e.clientY)));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    // Only a pointer this canvas saw go down (it listens on the window, so a
    // lift WebKit hit-tests onto the chrome above still reaches it).
    if (!points.delete(e.pointerId)) return;
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
    handlers.onPress?.(null);
    const wasRotating = rotating;
    const wasPanning = panning;
    // A throw only counts if the finger was still moving when it lifted.
    if (wasRotating) handlers.onRotateEnd?.();
    if (wasRotating && e.timeStamp - lastT < 80) handlers.onFling?.(velX, velY);
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
    if (!points.delete(e.pointerId)) return;
    clearLong();
    handlers.onPress?.(null);
    if (points.size === 0) {
      if (rotating) handlers.onRotateEnd?.();
      pressed = false;
      rotating = false;
      panning = false;
      downCell = null;
    }
  };

  const onLeave = () => handlers.onHover(null);

  // The touch list is the platform's own count of the fingers on the glass.
  // Once it is empty every touch is up, whether or not its pointerup came. The
  // points are only *marked* here, and dropped at the next press: a browser
  // that sent the touchend ahead of the pointerup would otherwise have the
  // tap taken out from under it.
  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length > 0) return;
    for (const p of points.values()) if (p.type === "touch") p.stale = true;
  };
  // A hidden page hears no lifts at all; whatever was down is not when it
  // comes back.
  const onVisibility = () => {
    if (document.visibilityState === "hidden") forget(() => true);
  };

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
    // In the Mac Catalyst app the plain wheel is a two-finger trackpad swipe
    // (the native shell sets this flag), which means "move the board": pan a
    // flat board with it instead of zooming. Zoom there is the pinch.
    if (
      !e.ctrlKey &&
      (window as { hypersweeperShell?: string }).hypersweeperShell === "catalyst" &&
      !handlers.scrolls(id) &&
      !handlers.rotates()
    ) {
      if (performance.now() - nativePanAt < 150) return; // native pan has it
      // (Not `pans()`: that is false until zoomed, and an unzoomed swipe must
      // not fall through to zooming — it just has nothing to move.)
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      handlers.onPan(-e.deltaX * k, -e.deltaY * k);
      return;
    }
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

  // A trackpad pinch reaches the page by two more routes besides ctrl+wheel
  // (above). Both report `scale` cumulative since the gesture began, so zoom by
  // the ratio between successive scales about the pinch point:
  //   - Safari's own gesturestart/change/end, with the position as clientX/Y;
  //   - the Mac Catalyst app, where WebKit builds no gesture events for a
  //     trackpad at all: the native shell recognises the pinch and dispatches
  //     `hypersweeper:pinch` on window (ios/App/App/BridgeViewController.swift).
  // On a touchscreen WebKit fires gesture* *as well as* the pointer events the
  // two-finger pinch above already handles, so ignore them while two touch
  // points are down rather than zoom twice.
  let gestureScale = 1;
  let gestureX = Number.NaN;
  let gestureY = Number.NaN;
  const pinchTo = (scale: number, clientX: number, clientY: number) => {
    const next = scale || 1;
    const ratio = next / gestureScale;
    gestureScale = next;
    const dx = clientX - gestureX;
    const dy = clientY - gestureY;
    gestureX = clientX;
    gestureY = clientY;
    if (points.size >= 2 || !Number.isFinite(ratio) || ratio <= 0) return;
    const p = local(clientX, clientY);
    handlers.onZoom(ratio, p.x, p.y);
    // Two fingers travelling together drag the board as they zoom it, as the
    // touch pinch does.
    if (Number.isFinite(dx) && Number.isFinite(dy) && (dx || dy)) {
      handlers.onPan(dx, dy);
    }
  };
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    const g = e as GestureEventLike;
    gestureScale = g.scale || 1;
    gestureX = g.clientX;
    gestureY = g.clientY;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as GestureEventLike;
    pinchTo(g.scale, g.clientX, g.clientY);
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    gestureScale = 1;
  };
  // The same shell also forwards a two-finger trackpad *swipe* natively
  // (`hypersweeper:pan`, deltas in CSS px following the fingers), in case
  // WebKit never turns it into a wheel event. Where the wheel is already spoken
  // for — a 3D board zooms, a ring board walks it — leave it to onWheel.
  // `nativePanAt` lets onWheel stand down while these arrive, so a build where
  // both fire does not pan twice.
  let nativePanAt = -Infinity;
  const onNativePan = (e: Event) => {
    const d = (e as CustomEvent<{ phase: string; dx: number; dy: number }>).detail;
    if (!d || d.phase === "end") return;
    if (handlers.rotates() || handlers.scrolls("ring")) return;
    nativePanAt = performance.now();
    if (Number.isFinite(d.dx) && Number.isFinite(d.dy)) handlers.onPan(d.dx, d.dy);
  };
  const onNativePinch = (e: Event) => {
    const d = (e as CustomEvent<NativePinch>).detail;
    if (!d) return;
    if (d.phase === "start") {
      gestureScale = d.scale || 1;
      gestureX = d.x;
      gestureY = d.y;
    } else if (d.phase === "change") pinchTo(d.scale, d.x, d.y);
    else gestureScale = 1;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("gesturestart", onGestureStart);
  canvas.addEventListener("gesturechange", onGestureChange);
  canvas.addEventListener("gestureend", onGestureEnd);
  window.addEventListener("hypersweeper:pinch", onNativePinch);
  window.addEventListener("hypersweeper:pan", onNativePan);

  return () => {
    clearLong();
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("gesturestart", onGestureStart);
    canvas.removeEventListener("gesturechange", onGestureChange);
    canvas.removeEventListener("gestureend", onGestureEnd);
    window.removeEventListener("hypersweeper:pinch", onNativePinch);
    window.removeEventListener("hypersweeper:pan", onNativePan);
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
