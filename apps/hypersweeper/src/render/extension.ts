// The won board's tiling, carried on past its edge as outlines only: the tiles
// the board was cut from, drawn as hairlines over the page from one edge of the
// screen to the other, so a player who has just cleared a board sees that it
// was one window onto a tiling that goes on. Nothing out there is coloured or
// can be tapped — the board stays the only thing with tiles on it.
//
// The tiles come from modes/extension.ts (`BoardExtension`), in the board's
// pixel space; this lays them out in the flat board's mesh space ([x - w/2,
// h/2 - y], as polygonBoard.ts does), as a child of the board so they turn with
// it on a portrait screen. Only what the view can reach is built (`cover`), and
// rebuilt when a zoom out or a pan carries the view past it.
//
// The lines are three.js's screen-space fat lines, so a hairline is a hairline
// at every zoom and on every display, and they sit just under the tiles and are
// depth tested, so the board covers them. They are drawn with depth writes and
// a strict depth test: an edge two outline tiles share is drawn twice, and the
// second copy would otherwise darken it.

import { Color, LessDepth } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { BoardExtension } from "../modes/extension";

/** How opaque the outlines end up, over the page. Faint on purpose: they are
 * the board's surroundings, not more board. */
const OPACITY = 0.5;
/** Line width, CSS px. */
const WIDTH = 1.25;
/** How long the outlines take to fade in once the board is won. */
const FADE_MS = 900;
/** How much further than the view needs an outline build reaches, so a zoom
 * or a pan does not rebuild it every step. */
const HEADROOM = 1.4;
/** Below the tiles' bases, so the board covers every outline it stands on. */
const DEPTH = -1;

export class TilingOutline extends LineSegments2 {
  private covered = 0;
  private shownAt: number | null = null;
  declare material: LineMaterial;

  constructor(
    private readonly extension: BoardExtension,
    private readonly width: number,
    private readonly height: number,
    color: string,
  ) {
    super(
      new LineSegmentsGeometry(),
      new LineMaterial({
        color: new Color(color || "#808080"),
        linewidth: WIDTH,
        transparent: true,
        opacity: 0,
        depthWrite: true,
      }),
    );
    this.material.depthFunc = LessDepth;
    this.name = "extension";
    this.renderOrder = -1;
    this.frustumCulled = false;
    this.position.z = DEPTH;
  }

  /** Never a pick target: nothing out here is a cell. */
  override raycast(): void {}

  /** How far out, in the board's pixel units, the tiling is known. */
  get reach(): number {
    return this.extension.reach;
  }

  /** The tiling's typical tile size (modes/extension.ts `tile`). */
  get tile(): number {
    return this.extension.tile;
  }

  /** Make sure every tile within `radius` (board pixel units, from the
   * board's centre) is drawn. */
  cover(radius: number): void {
    const want = Math.min(radius, this.extension.reach);
    if (want <= this.covered) return;
    const r = Math.min(want * HEADROOM, this.extension.reach);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const segments: number[] = [];
    for (const poly of this.extension.cells(r)) {
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i]!;
        const [bx, by] = poly[(i + 1) % poly.length]!;
        segments.push(ax - cx, cy - ay, 0, bx - cx, cy - by, 0);
      }
    }
    this.geometry.dispose();
    this.geometry = new LineSegmentsGeometry();
    this.geometry.setPositions(segments);
    this.covered = r;
  }

  /** Size the hairlines for a drawing buffer of this many CSS pixels. */
  setResolution(w: number, h: number): void {
    this.material.resolution.set(w, h);
  }

  /** Start the fade in. */
  show(now: number, animate: boolean): void {
    this.shownAt = animate ? now : now - FADE_MS;
  }

  /** Advance the fade; true while it still wants frames. */
  step(now: number): boolean {
    if (this.shownAt === null) return false;
    const t = Math.min(1, (now - this.shownAt) / FADE_MS);
    this.material.opacity = OPACITY * t * (2 - t);
    return t < 1;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
