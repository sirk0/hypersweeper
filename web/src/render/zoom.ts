// The board view transform: how far the board is zoomed in and how far it is
// panned. Pure arithmetic, kept out of `renderer.ts` so it is unit testable
// without a WebGL context; the renderer owns the state and applies it to
// whichever camera the current board uses.
//
// Both cameras share one screen->world model. With `wpp` world units per CSS
// pixel and the view centred on the pixel `(cx, cy)` (the centre of the region
// below the header, not of the whole canvas), the world point under pixel
// `(px, py)` is
//
//     world = ref + wpp * (px - cx,  cy - py)
//
// where `ref` is the fitted centre plus the current pan. That is all the
// gesture math needs: zooming about a finger keeps one world point fixed, and
// panning slides `ref` the other way.

/** Fitted size — the board framed in the viewport, the only zoom before this. */
export const MIN_ZOOM = 1;
/** Ceiling on zoom: past this a cell is bigger than a fingertip and the board
 * is mostly off-screen, so more magnification is only a way to get lost. */
export const MAX_ZOOM = 6;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The pan that keeps the world point under an anchor pixel fixed while the
 * scale changes from `wppBefore` to `wppAfter`. `offset` is the anchor's
 * distance from the view centre along that axis, in CSS pixels (`px - cx`
 * horizontally, `cy - py` vertically — y grows upward in world space). */
export function anchoredPan(
  pan: number,
  wppBefore: number,
  wppAfter: number,
  offset: number,
): number {
  return pan + (wppBefore - wppAfter) * offset;
}

/** Pan clamped so the board can never be dragged off the screen: with a board
 * half-extent of `halfBoard` world units and a view half-extent of `halfView`,
 * there is exactly their difference of slack (and none at all — the board stays
 * centred — while the view is the larger of the two). */
export function clampPan(
  pan: number,
  halfBoard: number,
  halfView: number,
): number {
  const limit = Math.max(0, halfBoard - halfView);
  return Math.min(limit, Math.max(-limit, pan));
}
