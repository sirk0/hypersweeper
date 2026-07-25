import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import type { CellId } from "../boards/core";
import { surfaceOf, viewHint } from "../boards/catalog";
import type { BoardMesh } from "./boardMesh";

// One rendering pipeline for both board families. Flat boards use the
// orthographic camera fit to the board extent; solids are scaled to the unit
// sphere and viewed by the perspective camera, rotated by a small custom
// trackball (drag deltas premultiply the board's quaternion, matching the
// pygame renderer's `rotation = turn * rotation`). Resize is DPR-aware and
// clamped to 2 to bound cost on retina displays.

/** Radians of board rotation per CSS pixel of drag — the pygame feel. */
export const ROTATE_SPEED = 0.008;
/** Drag-pixels-worth of rotation per arrow-key press (0.32 rad). */
export const KEY_ROTATE_STEP = 40;

const SOLID_FOV = 40; // degrees
// Air left around the board when it is framed — just enough that antialiasing
// and the tile bevels never touch the very edge of the viewport.
const SOLID_MARGIN = 1.03;
// How much closer than the unit-sphere fit the camera may come. Flat boards
// (torus, cylinder, Möbius, Klein bottle) and the faceted solids fill nothing
// like their bounding sphere, so fitting the *silhouette* wins up to ~2× on a
// phone; the cap keeps the perspective from going fisheye on a board that is
// nearly edge-on, and bounds how much the framing can change as it turns.
const MAX_SOLID_ZOOM = 2;
/** Width/height beyond which a flat board is turned a quarter-turn on a
 * portrait viewport (the classic 30×16 hard board, aspect 1.875, would
 * otherwise shrink to a sliver). Mirrors GameScreen.ROTATE_ASPECT. */
const ROTATE_ASPECT = 1.2;

const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);

export class BoardRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly orthoCamera: OrthographicCamera;
  readonly perspCamera: PerspectiveCamera;
  private readonly raycaster = new Raycaster();
  private board: BoardMesh | null = null;
  private frameHandle = 0;
  private dirty = true;
  /** CSS px of chrome reserved at the top (the HUD header); flat boards are
   * framed in the space below it rather than centred in the whole viewport. */
  private topInset = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Airy iOS-theme field behind the board (matches CSS --bg and the pygame
    // `ios` background; the board tiles keep their own classic bevel colours).
    this.renderer.setClearColor(new Color("#f2f2f7"), 1);

    this.scene = new Scene();
    // The flat board lives in pixel units (hundreds wide) with per-cell bevel
    // heights that scale with cell size, so place the camera far back in z and
    // give it a deep frustum: otherwise big cells (e.g. triangle boards) poke
    // past a nearby near plane and become invisible to the picking ray.
    this.orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    this.orthoCamera.position.set(0, 0, 2000);
    this.orthoCamera.lookAt(0, 0, 0);

    this.perspCamera = new PerspectiveCamera(SOLID_FOV, 1, 0.1, 20);
    this.perspCamera.position.set(0, 0, 4);
    this.perspCamera.lookAt(0, 0, 0);

    // Soft ambient plus a directional key from the top-left so the tile bevels
    // catch a highlight/shadow (the classic raised-button look) without
    // blowing the light-gray faces out to white. The lights are fixed in world
    // space, so rotating a solid sweeps its faces through the light.
    const hemi = new HemisphereLight(0xffffff, 0x9a9a9a, 0.9);
    this.scene.add(hemi);
    const key = new DirectionalLight(0xffffff, 0.55);
    key.position.set(-4, 6, 8);
    this.scene.add(key);
  }

  /** The camera matching the current board's view kind. */
  get camera(): OrthographicCamera | PerspectiveCamera {
    return this.board?.view.kind === "solid"
      ? this.perspCamera
      : this.orthoCamera;
  }

  setBoard(board: BoardMesh): void {
    if (this.board) this.scene.remove(this.board);
    this.board = board;
    if (board.view.kind === "solid") {
      // Scale the solid into the unit sphere so one camera setup frames all.
      board.scale.setScalar(1 / board.view.radius);
    }
    this.scene.add(board);
    this.resize(); // frames the camera, then re-orients the board (below)
    this.dirty = true;
  }

  /** Drop the current board from the scene (leaving an empty field) — the
   * menu draws over the canvas, so a board left in the scene would show
   * through between its rows. */
  clearBoard(): void {
    if (this.board) this.scene.remove(this.board);
    this.board = null;
    this.dirty = true;
  }

  /** Replace the board's orientation (used for per-mode initial views). */
  setOrientation(q: Quaternion): void {
    if (!this.board) return;
    this.board.quaternion.copy(q);
    this.frameSolid(); // re-frames and re-culls glyphs for the new silhouette
    this.dirty = true;
  }

  /** Trackball: rotate the board by a drag of (dx, dy) CSS pixels — yaw
   * around the world y-axis, pitch around the world x-axis, premultiplied so
   * the board turns under the cursor regardless of its current orientation.
   * Dragging down tilts the top toward the viewer. */
  rotateBy(dxPx: number, dyPx: number): void {
    if (!this.board || this.board.view.kind !== "solid") return;
    const turn = new Quaternion()
      .setFromAxisAngle(X_AXIS, dyPx * ROTATE_SPEED)
      .multiply(
        new Quaternion().setFromAxisAngle(Y_AXIS, dxPx * ROTATE_SPEED),
      );
    this.board.quaternion.premultiply(turn);
    this.frameSolid(); // the silhouette changed as it turned, so re-fit
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Reserve `px` CSS pixels at the top of the viewport for the header. Call
   * before `resize()` (which reads it to frame the board below the header). */
  setTopInset(px: number): void {
    this.topInset = Math.max(0, px);
    this.dirty = true;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    // Header height reserved at the top; the board is framed in the region
    // below it (top of viewport = pixel `top`, height `usableH`).
    const top = Math.max(0, Math.min(this.topInset, h - 1));
    const usableH = Math.max(1, h - top);

    const view = this.board?.view;
    if (view?.kind === "flat") {
      // A clearly landscape board on a portrait viewport is turned a
      // quarter-turn (clockwise) so it fills the width instead of shrinking to
      // a sliver — the same rule as the pygame GameScreen._rotated.
      const rotated =
        usableH > w && view.width > view.height * ROTATE_ASPECT;
      if (this.board) {
        this.board.rotation.z = rotated ? -Math.PI / 2 : 0;
        this.board.setQuarterTurn?.(rotated);
      }
      const boardW = rotated ? view.height : view.width;
      const boardH = rotated ? view.width : view.height;
      const margin = 1.06;
      const halfW = (boardW * margin) / 2;
      const halfH = (boardH * margin) / 2;
      // World units per CSS pixel that fits the board in the region both ways.
      const wpp = Math.max((2 * halfW) / w, (2 * halfH) / usableH);
      // Keep the frustum full-canvas (so mouse→NDC picking stays consistent),
      // but bias it vertically so the board is *centred* in the region below
      // the header rather than centred in the whole canvas (which would tuck
      // its top under the header). Horizontally centred.
      this.orthoCamera.left = (-wpp * w) / 2;
      this.orthoCamera.right = (wpp * w) / 2;
      this.orthoCamera.top = wpp * (top + usableH / 2);
      this.orthoCamera.bottom = this.orthoCamera.top - wpp * h;
      this.orthoCamera.updateProjectionMatrix();
    } else if (view?.kind === "solid") {
      this.frameSolid();
    }
    this.dirty = true;
  }

  /** Place the perspective camera so the solid fills the region below the
   * header at its current orientation. The board is scaled to the unit sphere,
   * which is a loose bound for anything that is not a ball — a torus seen
   * face-on covers barely half of it — so the distance is fit to the board's
   * real silhouette (its hull points under the current rotation) and only
   * falls back to the sphere fit as it turns edge-on. Re-fitting on every
   * rotation is what keeps that safe: the board is framed, never cropped. */
  private frameSolid(): void {
    const view = this.board?.view;
    if (!this.board || view?.kind !== "solid") return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const top = Math.max(0, Math.min(this.topInset, h - 1));
    const usableH = Math.max(1, h - top);

    const aspect = w / h;
    this.perspCamera.aspect = aspect;
    const halfY = (SOLID_FOV * Math.PI) / 360;
    const tanY = Math.tan(halfY);
    // Half-angles of the region below the header: the vertical fov covers the
    // whole canvas, so scale it down to the usable slice before fitting.
    const tanX = tanY * aspect;
    const tanUsableY = (tanY * usableH) / h;
    // The loose bound: the unit sphere just touching the narrower axis. No
    // orientation can need more room than this.
    const sphereDist =
      SOLID_MARGIN /
      Math.sin(Math.min(Math.atan(tanX), Math.atan(tanUsableY)));
    const fit = this.fitSolid(view.hull, view.radius, tanX, tanUsableY);
    const dist = Math.max(
      sphereDist / MAX_SOLID_ZOOM,
      Math.min(sphereDist, fit.dist),
    );

    // Aim at the silhouette's centre (an immersed surface — the Möbius strip,
    // the Klein bottle — does not sit centred on the board's origin), and
    // raise the camera so the board centres in the region below the header
    // too: the object drops by half the header height on screen.
    const worldPerPx = (2 * dist * tanY) / h;
    this.perspCamera.position.set(fit.cx, fit.cy + (top / 2) * worldPerPx, dist);
    this.perspCamera.lookAt(this.perspCamera.position.x, this.perspCamera.position.y, 0);
    this.perspCamera.near = Math.max(0.05, dist - 2);
    this.perspCamera.far = dist + 2;
    this.perspCamera.updateProjectionMatrix();
    // The camera distance sets the perspective horizon, so re-cull glyphs.
    this.board.orient?.(this.board.quaternion, this.perspCamera.position);
  }

  /** Fit the board's hull, rotated by its current quaternion and scaled to the
   * unit sphere, into the frustum: the point the camera aims at (the centre of
   * the rotated hull box) and the distance at which every hull point still
   * lands inside it — a point at (x, y, z) needs `|x| * margin / tanX + z`
   * (and the same in y) once x and y are measured from that centre. */
  private fitSolid(
    hull: Float32Array,
    radius: number,
    tanX: number,
    tanUsableY: number,
  ): { dist: number; cx: number; cy: number } {
    const invR = 1 / radius;
    const { x: qx, y: qy, z: qz, w: qw } = this.board!.quaternion;
    // v = q * p * q⁻¹, inlined (Three's Vector3.applyQuaternion) — the hull is
    // walked twice (centre, then distance), so keep it allocation free.
    const rotated = (i: number, out: [number, number, number]): void => {
      const px = hull[i]! * invR;
      const py = hull[i + 1]! * invR;
      const pz = hull[i + 2]! * invR;
      const ix = qw * px + qy * pz - qz * py;
      const iy = qw * py + qz * px - qx * pz;
      const iz = qw * pz + qx * py - qy * px;
      const iw = -qx * px - qy * py - qz * pz;
      out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    };

    const p: [number, number, number] = [0, 0, 0];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < hull.length; i += 3) {
      rotated(i, p);
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    if (minX > maxX) return { dist: 0, cx: 0, cy: 0 }; // no geometry
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let dist = 0;
    for (let i = 0; i < hull.length; i += 3) {
      rotated(i, p);
      const need = Math.max(
        (Math.abs(p[0] - cx) * SOLID_MARGIN) / tanX,
        (Math.abs(p[1] - cy) * SOLID_MARGIN) / tanUsableY,
      );
      if (need + p[2] > dist) dist = need + p[2];
    }
    return { dist, cx, cy };
  }

  /** Cell under normalized device coords (-1..1), or null. On solids only
   * front faces are hit — back cells are culled from picking too. */
  pick(ndc: Vector2): CellId | null {
    if (!this.board) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const cells = this.board.getObjectByName("cells");
    if (!cells) return null;
    const hits = this.raycaster.intersectObject(cells, false);
    const hit = hits[0];
    if (!hit || hit.faceIndex == null) return null;
    return this.board.cellForFace(hit.faceIndex);
  }

  private renderOnce = (): void => {
    // Advance any in-flight board animation (reveal ripple, flag pop, lose
    // shake); while one is running keep the loop dirty so it renders every
    // frame, then fall idle again when it settles.
    const animating = this.board?.tickAnimations(performance.now()) ?? false;
    if (this.dirty || animating) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = animating;
    }
    this.frameHandle = requestAnimationFrame(this.renderOnce);
  };

  start(): void {
    if (!this.frameHandle) this.renderOnce();
  }

  stop(): void {
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }
}

/** The per-mode starting orientation (port of GameScreen3D._initial_rotation). */
export function initialOrientation(mode: string): Quaternion {
  const qx = (a: number) => new Quaternion().setFromAxisAngle(X_AXIS, a);
  const qy = (a: number) => new Quaternion().setFromAxisAngle(Y_AXIS, a);
  // flat-faced solids show only one face head-on; a 3/4 turn reveals three
  // faces at once
  if (["cube", "tetrahedron", "cubeframe", "steppedbipyramid"].includes(mode)) {
    return qx(-0.5).multiply(qy(0.6));
  }
  // a tetrahedron viewed down a 2-fold axis looks like a flat square; turn
  // to a vertex-first 3/4 view so the frame's gaps read clearly
  if (mode === "tetraframe") return qx(-0.62).multiply(qy(0.45));
  // the Klein bottle reads best from a 3/4 turn: the neck diving through the
  // body (the self-intersection) is then plainly visible
  if (surfaceOf(mode)?.key === "klein") return qx(-0.4).multiply(qy(0.6));
  // wrapped surfaces tilt by their SurfaceSpec hint (donut, cylinder, Möbius);
  // everything else faces straight on
  const tilt = viewHint(mode);
  return tilt != null ? qx(tilt) : new Quaternion();
}
