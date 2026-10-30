import { describe, expect, it } from "vitest";
import { boundaryComponents, eulerCharacteristic, type Board } from "../../src/boards/core";
import {
  cellCount,
  CLOSED_SURFACES,
  COVER_COPIES,
  coverView,
  darts,
  hurwitzBoard,
  hurwitzCells,
  hurwitzGroup,
  hurwitzMap,
  hurwitzSurfaceLabel,
  SURFACE_MODES,
  gcDisc,
  type HurwitzOp,
  petrieLength,
  toddCoxeter,
} from "../../src/boards/hurwitz";
import { centralPolygon } from "../../src/boards/hyperbolic";
import { buildBoard } from "../../src/modes/presets";

// The closed hyperbolic surfaces (boards/hurwitz.ts). The conformance oracle
// holds the port to the Python builder's cell, edge and vertex counts and its
// Euler characteristic; these pin what the oracle cannot see -- that the group
// is the same group, that every cell keeps its full count, that the drawing
// says what the adjacency says, and that the pan's steps leave the picture as
// it was.

// The order of the group, and the {p,q} map's faces, vertices and edges.
const SURFACES: Record<string, readonly [number, number, number, number]> = {
  bolza: [48, 6, 16, 24],
  quartic: [168, 24, 56, 84],
  dyck: [96, 12, 32, 48],
  bring: [120, 24, 30, 60],
  macbeath: [504, 72, 168, 252],
  triplet: [1092, 156, 364, 546],
};

// The tiling each surface's board tests run on: the 6.6.7 of the Hurwitz
// surfaces, the easy board of the others. Mirrors `_TILING` in test_boards.py.
const TILING: Record<string, HurwitzOp> = {
  bolza: "gc3",
  quartic: "zip",
  dyck: "expand",
  bring: "expand",
  macbeath: "zip",
  triplet: "zip",
};

/** How many cells meet at every corner of `surface` in tiling `op`. */
function valence(surface: string, op: HurwitzOp): number {
  const { q } = CLOSED_SURFACES[surface]!;
  if (op === "none" || op.startsWith("gc")) return q;
  return { zip: 3, ambo: 4, expand: 4, bevel: 3 }[op as "zip" | "ambo" | "expand" | "bevel"];
}

type Cx = readonly [number, number];

/** A face's centroid in the board's own disc coordinates, taken after `move`:
 * an isometry of the disc is not affine, so the centroid of a face's image is
 * not the image of its centroid. */
function discCentre(board: Board, face: string, move: (z: Cx) => Cx = (z) => z): Cx {
  const { cx, cy, radius } = board.disc!;
  const poly = board.polygons.get(face)!;
  const mask = board.cornerMask!.get(face)!;
  let x = 0;
  let y = 0;
  let n = 0;
  poly.forEach(([px, py], i) => {
    if (!mask[i]) return;
    const [mx, my] = move([(px - cx) / radius, (py - cy) / radius]);
    x += mx;
    y += my;
    n++;
  });
  return [x / n, y / n];
}

/** z -> rot (z - c) / (1 - conj(c) z). */
function apply(c: Cx, rot: Cx, z: Cx): Cx {
  const num: Cx = [z[0] - c[0], z[1] - c[1]];
  const den: Cx = [1 - (c[0] * z[0] + c[1] * z[1]), -(c[0] * z[1] - c[1] * z[0])];
  const d = den[0] * den[0] + den[1] * den[1];
  const q: Cx = [(num[0] * den[0] + num[1] * den[1]) / d, (num[1] * den[0] - num[0] * den[1]) / d];
  return [rot[0] * q[0] - rot[1] * q[1], rot[0] * q[1] + rot[1] * q[0]];
}

describe("the closed surfaces", () => {
  it("test every surface there is", () => {
    expect(Object.keys(SURFACES)).toEqual(Object.keys(CLOSED_SURFACES));
    expect(Object.keys(TILING)).toEqual(Object.keys(CLOSED_SURFACES));
  });

  it("are built from the groups the Python port finds", () => {
    for (const [surface, [order]] of Object.entries(SURFACES)) {
      const { group } = CLOSED_SURFACES[surface]!;
      if (typeof group !== "number") continue;
      const { elements, times, x, y } = hurwitzGroup(group);
      expect(elements.length, surface).toBe(order);
      const identity = times(x, x);
      let power = times(x, y);
      let k = 1;
      while (power !== identity) {
        power = times(power, times(x, y));
        k++;
      }
      expect(k, surface).toBe(7);
    }
  });

  it("act on their darts as the group: x of order 2, y of order q, xy of order p", () => {
    for (const [surface, [order]] of Object.entries(SURFACES)) {
      const { p, q } = CLOSED_SURFACES[surface]!;
      const [stepX, stepY] = darts(surface);
      expect(stepX.length, surface).toBe(order);
      const turn = stepX.map((d) => stepY[d]!);
      for (const [step, n] of [
        [stepX, 2],
        [stepY, q],
        [turn, p],
      ] as const) {
        for (let d = 0; d < order; d++) {
          let e = d;
          for (let k = 0; k < n; k++) e = step[e]!;
          expect(e).toBe(d);
        }
        let e = 0;
        for (let k = 1; k < n; k++) {
          e = step[e]!;
          expect(e).not.toBe(0);
        }
      }
    }
  });

  it("enumerate a presentation into the same numbering as the Python port", () => {
    // breadth-first from the identity, x before y: the quartic's own
    // presentation gives 168 darts, x taking the identity to dart 1
    const [stepX, stepY] = toddCoxeter(7, 3, "xyxY".repeat(4));
    expect(stepX.length).toBe(168);
    expect(stepX[0]).toBe(1);
    expect([1, 2]).toContain(stepY[0]);
    expect(() => toddCoxeter(7, 3, "xyxY".repeat(9), 500)).toThrow();
  });

  it("read the map off the group: every edge once each way, chi = 2 - 2g", () => {
    for (const [surface, [, faces, vertices, edges]] of Object.entries(SURFACES)) {
      const { p, genus } = CLOSED_SURFACES[surface]!;
      const map = hurwitzMap(surface);
      expect(map.length).toBe(faces);
      const directed = new Set<string>();
      for (const face of map) {
        expect(new Set(face).size).toBe(p);
        for (let i = 0; i < p; i++) directed.add(`${face[i]}>${face[(i + 1) % p]}`);
      }
      expect(directed.size).toBe(2 * edges);
      for (const e of directed) {
        const [a, b] = e.split(">");
        expect(directed.has(`${b}>${a}`)).toBe(true);
      }
      expect(new Set(map.flat()).size).toBe(vertices);
      expect(vertices - edges + faces).toBe(2 - 2 * genus);
    }
  });

  it("land on the same surface of the triplet as the Python port", () => {
    expect(["quartic", "macbeath", "triplet"].map(petrieLength)).toEqual([8, 18, 14]);
    // and the others are the surfaces their presentations name
    expect(["bolza", "dyck", "bring"].map(petrieLength)).toEqual([12, 6, 6]);
  });

  it("are named in the info window by their mode, not their genus", () => {
    // Klein's quartic and Dyck's surface are both genus 3
    expect(hurwitzSurfaceLabel("quartic")).toBe("Klein quartic, genus 3");
    expect(hurwitzSurfaceLabel("dyck")).toBe("Dyck's surface, genus 3");
    expect(hurwitzSurfaceLabel("bolza")).toBe("Bolza surface, genus 2");
    expect(hurwitzSurfaceLabel("hyperbolic73")).toBeNull();
  });

  it("are one surface a mode, closed, with its genus, at every difficulty", () => {
    for (const [surface, mode] of Object.entries(SURFACE_MODES)) {
      for (const difficulty of ["easy", "medium", "hard"]) {
        const board = buildBoard(mode, difficulty) as Board;
        expect(board.mode).toBe(mode);
        expect(eulerCharacteristic(board)).toBe(2 - 2 * CLOSED_SURFACES[surface]!.genus);
        expect(boundaryComponents(board)).toBe(0);
      }
    }
  });

  it("grow every surface by its tiling, every cell still whole", () => {
    // {p,q}, a Wythoff tiling, then GC(n,0): the surface's own faces survive
    // every one of them, and every cell keeps its full count
    const levels: Record<string, readonly [number, number, number]> = {
      bolza: [70, 286, 510],
      quartic: [80, 248, 444],
      dyck: [60, 252, 396],
      bring: [114, 264, 474],
      macbeath: [72, 240, 324],
      triplet: [156, 520, 702],
    };
    for (const [surface, counts] of Object.entries(levels)) {
      const { p } = CLOSED_SURFACES[surface]!;
      ["easy", "medium", "hard"].forEach((difficulty, i) => {
        const board = buildBoard(SURFACE_MODES[surface]!, difficulty) as Board;
        expect(board.adjacency.size, `${surface} ${difficulty}`).toBe(counts[i]);
        let faces = 0;
        for (const cell of board.adjacency.keys()) if (board.quotient!.get(cell)!.length === p) faces++;
        expect(faces, `${surface} ${difficulty}`).toBe(SURFACES[surface]![1]);
      });
    }
  });

  it("count every surface's cells from its map, as the Python port does", () => {
    for (const surface of Object.keys(SURFACES)) {
      const [, faces, vertices, edges] = SURFACES[surface]!;
      expect(cellCount(surface, "none")).toBe(faces);
      expect(cellCount(surface, "zip")).toBe(faces + vertices);
      expect(cellCount(surface, "expand")).toBe(faces + vertices + edges);
      expect(hurwitzCells(surface, TILING[surface]!).size).toBe(cellCount(surface, TILING[surface]!));
    }
  });

  it("show about COVER_COPIES of the surface in the view, whatever its tiling", () => {
    // the view's area over the surface's, counted rather than computed: the
    // drawn tiles whose centre lies in the view against the surface's cells
    for (const [surface, op] of [
      ["bolza", "gc6"],
      ["quartic", "zip"],
      ["quartic", "gc4"],
      ["dyck", "gc4"],
      ["bring", "gc3"],
      ["macbeath", "none"],
      ["macbeath", "zip"],
      ["triplet", "zip"],
      ["triplet", "gc2"],
    ] as const) {
      const board = hurwitzBoard(surface, op, 0);
      const { cx, cy, radius, cover } = board.disc!;
      expect(cover!.view).toBeCloseTo(coverView(surface), 12);
      const r = Math.tanh(cover!.view / 2);
      let seen = 0;
      for (const poly of board.polygons.values()) {
        const x = poly.reduce((t, p) => t + p[0], 0) / poly.length;
        const y = poly.reduce((t, p) => t + p[1], 0) / poly.length;
        if (Math.hypot((x - cx) / radius, (y - cy) / radius) <= r) seen++;
      }
      const copies = seen / board.adjacency.size;
      // within a fifth: a count of whole tiles is coarse where few of them are
      // in view (the quartic's easy board shows about 50)
      expect(copies, `${surface} ${op}`).toBeGreaterThan(COVER_COPIES * 0.8);
      expect(copies, `${surface} ${op}`).toBeLessThan(COVER_COPIES * 1.2);
    }
  });

  it("give every cell its full count: on 6.6.7 a hexagon six, a heptagon seven", () => {
    // each corner adds the cells round it bar the two that share a side
    for (const surface of Object.keys(SURFACES)) {
      const op = TILING[surface]!;
      const board = hurwitzBoard(surface, op, 0);
      for (const [cell, neighbours] of board.adjacency) {
        expect(neighbours.length).toBe(board.quotient!.get(cell)!.length * (valence(surface, op) - 2));
      }
      if (surface === "bolza") continue; // six octagons, each bordering the other five
      const { p, q } = CLOSED_SURFACES[surface]!;
      const plain = hurwitzBoard(surface, "none", 0);
      expect(new Set([...plain.adjacency.values()].map((n) => n.length))).toEqual(new Set([p * (q - 2)]));
    }
  });

  it("draw every cell, named after its copy nearest the centre", () => {
    const board = hurwitzBoard("quartic", "zip", 0);
    const shown = new Map<string, number[]>();
    for (const [face, cell] of board.faces!) {
      const list = shown.get(cell) ?? [];
      list.push(Number(face));
      shown.set(cell, list);
    }
    expect(new Set(shown.keys())).toEqual(new Set(board.adjacency.keys()));
    for (const [cell, faces] of shown) expect(Math.min(...faces)).toBe(Number(cell));
    expect(board.polygons.size).toBeGreaterThan(board.adjacency.size);
  });

  it("draw what the adjacency says round every copy whole inside the patch", () => {
    const board = hurwitzBoard("macbeath", "zip", 0);
    const at = new Map<string, Set<string>>();
    const key = ([x, y]: readonly number[]) => `${Math.round(x! * 1e4)},${Math.round(y! * 1e4)}`;
    for (const [face, poly] of board.polygons) {
      poly.forEach((p, i) => {
        if (!board.cornerMask!.get(face)![i]) return;
        const s = at.get(key(p)) ?? new Set<string>();
        s.add(face);
        at.set(key(p), s);
      });
    }
    let checked = 0;
    for (const [face, poly] of board.polygons) {
      const points = poly.filter((_, i) => board.cornerMask!.get(face)![i]).map(key);
      if (points.some((p) => at.get(p)!.size !== 3)) continue;
      const cell = board.faces!.get(face)!;
      const around = new Set(points.flatMap((p) => [...at.get(p)!].map((g) => board.faces!.get(g)!)));
      around.delete(cell);
      expect(around).toEqual(new Set(board.adjacency.get(cell)));
      checked++;
    }
    expect(checked).toBeGreaterThan(board.adjacency.size / 4);
  });

  it("pan by steps that leave the picture as it was", () => {
    // A step's isometry carries a face onto another; the step's symmetry must
    // say the second shows what the first did.
    for (const [surface, op] of [
      ...Object.keys(SURFACES).map((s): [string, HurwitzOp] => [s, TILING[s]!]),
      ["macbeath", "none"],
      ["triplet", "gc2"],
      ["bring", "gc3"],
    ] as [string, HurwitzOp][]) {
      const board = hurwitzBoard(surface, op, 0);
      const steps = board.disc!.cover!.steps;
      expect(steps.length).toBe(CLOSED_SURFACES[surface]!.p);
      const centres = [...board.polygons.keys()].map((f) => [f, discCentre(board, f)] as const);
      const nearest = (z: Cx) => {
        let best = centres[0]!;
        let bestD = Infinity;
        for (const entry of centres) {
          const d = Math.hypot(entry[1][0] - z[0], entry[1][1] - z[1]);
          if (d < bestD) [best, bestD] = [entry, d];
        }
        return { face: best[0], d: bestD };
      };
      for (const { c, rot, cells } of steps) {
        // the central p-gon goes to one next to it
        expect(Math.hypot(c[0], c[1])).toBeGreaterThan(0.1);
        expect(cells.size).toBe(board.adjacency.size);
        expect(new Set(cells.values()).size).toBe(board.adjacency.size);
        let checked = 0;
        for (const [face, z] of centres) {
          if (Math.hypot(z[0], z[1]) > 0.6) continue;
          // the face the step carries this one onto shows the symmetry's
          // image of what this one shows
          const there = nearest(discCentre(board, face, (w) => apply(c, rot, w)));
          if (there.d > 1e-6) continue;
          expect(board.faces!.get(there.face)).toBe(cells.get(board.faces!.get(face)!));
          checked++;
        }
        expect(checked, `${surface} ${op}`).toBeGreaterThan(5);
      }
    }
  });

  it("draw the whole view round anywhere the pan can put its centre", () => {
    // The pan keeps the view's centre on the central p-gon of {p,q}
    // (`discRecentre`) and shows what lies within its view of it (`coverView`,
    // from the surface's genus), so the patch has to cover that circle from
    // every point of the p-gon -- its corners are the worst case. Probed on
    // the circle itself: inside it the patch is a disc, so a covered rim means
    // a covered circle.
    const toward = (a: Cx, z: Cx): Cx => {
      // the disc translation taking 0 to a, applied to z
      const num: Cx = [z[0] + a[0], z[1] + a[1]];
      const den: Cx = [1 + a[0] * z[0] + a[1] * z[1], a[0] * z[1] - a[1] * z[0]];
      const d = den[0] * den[0] + den[1] * den[1];
      return [(num[0] * den[0] + num[1] * den[1]) / d, (num[1] * den[0] - num[0] * den[1]) / d];
    };
    const boards: [string, HurwitzOp][] = [
      ...Object.keys(SURFACES).map((s): [string, HurwitzOp] => [s, "zip"]),
      ["bolza", "gc3"],
      ["bolza", "gc8"],
      ["dyck", "expand"],
      ["dyck", "gc5"],
      ["bring", "expand"],
      ["bring", "gc4"],
      ["quartic", "gc3"],
      ["quartic", "gc4"],
      ["macbeath", "none"],
      ["macbeath", "gc2"],
      ["triplet", "none"],
      ["triplet", "gc2"],
    ];
    for (const [surface, op] of boards) {
      const corners = centralPolygon(CLOSED_SURFACES[surface]!.p, CLOSED_SURFACES[surface]!.q);
      const board = hurwitzBoard(surface, op, 0);
      const { cx, cy, radius } = board.disc!;
      // only the faces the renderer draws: the ones it is told are never seen
      // must not be needed
      const polys = [...board.polygons]
        .filter(([face]) => !board.unseen?.has(face))
        .map(([, poly]) => poly.map(([x, y]) => [(x - cx) / radius, (y - cy) / radius] as Cx));
      const inside = ([x, y]: Cx) =>
        polys.some((poly) => {
          let hit = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [xi, yi] = poly[i]!;
            const [xj, yj] = poly[j]!;
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
          }
          return hit;
        });
      const view = board.disc!.cover!.view;
      expect(view).toBeCloseTo(coverView(surface), 12);
      const r = Math.tanh(view / 2);
      for (const centre of [[0, 0] as Cx, ...corners]) {
        for (let k = 0; k < 120; k++) {
          const t = (k * 2 * Math.PI) / 120;
          const z = toward(centre, [r * Math.cos(t), r * Math.sin(t)]);
          expect(inside(z), `${surface} ${op} from ${centre} at ${k * 3}°`).toBe(true);
        }
      }
    }
  });

  it("draw the subdivided tiling alone for a menu card, heptagons ringed by hexagons", () => {
    // `gcDisc` is GC(3,0) of {7,3} with no surface behind it -- what the card
    // shows instead of building the board -- so its cells are the board's shapes
    const card = gcDisc(7, 3, 3, 30, 1);
    const sides = [...card.polygons.keys()].map((f) => card.cornerMask!.get(f)!.filter(Boolean).length);
    expect(new Set(sides)).toEqual(new Set([6, 7]));
    expect(card.polygons.size).toBeGreaterThan(100);
    // and the Bolza surface's card, octagons ringed by hexagons; a square
    // subdivision of {5,4} draws pentagons among squares
    const bolza = gcDisc(8, 3, 3, 24, 1);
    const octagons = [...bolza.polygons.keys()].map((f) => bolza.cornerMask!.get(f)!.filter(Boolean).length);
    expect(new Set(octagons)).toEqual(new Set([6, 8]));
    const square = gcDisc(5, 4, 3, 20, 1);
    const pentagons = [...square.polygons.keys()].map((f) => square.cornerMask!.get(f)!.filter(Boolean).length);
    expect(new Set(pentagons)).toEqual(new Set([4, 5]));
  });

  it("keep the central p-gon's turn as a control", () => {
    for (const surface of Object.keys(SURFACES)) {
      const board = hurwitzBoard(surface, TILING[surface]!, 0);
      expect(board.symmetries.map((s) => s.id)).toContain("turn");
    }
  });
});
