import { describe, expect, it } from "vitest";
import { boundaryComponents, eulerCharacteristic, type Board } from "../../src/boards/core";
import {
  COVER_VIEW,
  HURWITZ_SURFACES,
  hurwitzBoard,
  hurwitzGroup,
  hurwitzMap,
  SURFACE_MODES,
  gcDisc,
  type HurwitzOp,
  petrieLength,
} from "../../src/boards/hurwitz";
import { centralPolygon } from "../../src/boards/hyperbolic";
import { buildBoard } from "../../src/boards/presets";

// The closed hyperbolic surfaces (boards/hurwitz.ts). The conformance oracle
// holds the port to the Python builder's cell, edge and vertex counts and its
// Euler characteristic; these pin what the oracle cannot see -- that the group
// is the same group, that every cell keeps its full count, that the drawing
// says what the adjacency says, and that the pan's steps leave the picture as
// it was.

// The order of PSL(2,q), and the {7,3} map's faces, vertices and edges.
const SURFACES: Record<string, readonly [number, number, number, number]> = {
  quartic: [168, 24, 56, 84],
  macbeath: [504, 72, 168, 252],
  triplet: [1092, 156, 364, 546],
};

type Cx = readonly [number, number];

/** A face's centroid in the board's own disc coordinates. */
function discCentre(board: Board, face: string): Cx {
  const { cx, cy, radius } = board.disc!;
  const poly = board.polygons.get(face)!;
  const mask = board.cornerMask!.get(face)!;
  let x = 0;
  let y = 0;
  let n = 0;
  poly.forEach(([px, py], i) => {
    if (!mask[i]) return;
    x += (px - cx) / radius;
    y += (py - cy) / radius;
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

describe("the Hurwitz surfaces", () => {
  it("are built from the groups the Python port finds", () => {
    for (const [surface, [order]] of Object.entries(SURFACES)) {
      const { elements, times, x, y } = hurwitzGroup(HURWITZ_SURFACES[surface]![0]);
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

  it("read the map off the group: every edge once each way, chi = 2 - 2g", () => {
    for (const [surface, [, faces, vertices, edges]] of Object.entries(SURFACES)) {
      const map = hurwitzMap(surface);
      expect(map.length).toBe(faces);
      const directed = new Set<string>();
      for (const face of map) {
        expect(new Set(face).size).toBe(7);
        for (let i = 0; i < 7; i++) directed.add(`${face[i]}>${face[(i + 1) % 7]}`);
      }
      expect(directed.size).toBe(2 * edges);
      for (const e of directed) {
        const [a, b] = e.split(">");
        expect(directed.has(`${b}>${a}`)).toBe(true);
      }
      expect(new Set(map.flat()).size).toBe(vertices);
      expect(vertices - edges + faces).toBe(2 - 2 * HURWITZ_SURFACES[surface]![1]);
    }
  });

  it("land on the same surface of the triplet as the Python port", () => {
    expect(["quartic", "macbeath", "triplet"].map(petrieLength)).toEqual([8, 18, 14]);
  });

  it("are one surface a mode, closed, with its genus, at every difficulty", () => {
    for (const [surface, mode] of Object.entries(SURFACE_MODES)) {
      for (const difficulty of ["easy", "medium", "hard"]) {
        const board = buildBoard(mode, difficulty) as Board;
        expect(board.mode).toBe(mode);
        expect(eulerCharacteristic(board)).toBe(2 - 2 * HURWITZ_SURFACES[surface]![1]);
        expect(boundaryComponents(board)).toBe(0);
      }
    }
  });

  it("subdivide Klein's quartic for medium and hard, every cell still whole", () => {
    // GC(3,0) and GC(4,0): the 24 heptagons survive, hexagons everywhere else
    for (const [difficulty, cells] of [
      ["easy", 80],
      ["medium", 248],
      ["hard", 444],
    ] as const) {
      const board = buildBoard("quartic", difficulty) as Board;
      expect(board.adjacency.size).toBe(cells);
      let heptagons = 0;
      for (const [cell, neighbours] of board.adjacency) {
        const sides = board.quotient!.get(cell)!.length;
        if (sides === 7) heptagons++;
        expect(neighbours.length).toBe(sides);
      }
      expect(heptagons).toBe(24);
    }
  });

  it("give every cell its full count: a hexagon six, a heptagon seven", () => {
    for (const surface of Object.keys(SURFACES)) {
      const board = hurwitzBoard(surface, "zip", 0, 1);
      for (const [cell, neighbours] of board.adjacency) {
        expect(neighbours.length).toBe(board.quotient!.get(cell)!.length);
      }
      const plain = hurwitzBoard(surface, "none", 0, 1);
      expect(new Set([...plain.adjacency.values()].map((n) => n.length))).toEqual(new Set([7]));
    }
  });

  it("draw every cell, named after its copy nearest the centre", () => {
    const board = hurwitzBoard("quartic", "zip", 0, 1);
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
    const board = hurwitzBoard("macbeath", "zip", 0, 1);
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
    for (const surface of Object.keys(SURFACES)) {
      const board = hurwitzBoard(surface, "zip", 0, 1);
      const steps = board.disc!.cover!.steps;
      expect(steps.length).toBe(7);
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
        // the central heptagon goes to one next to it
        expect(Math.hypot(c[0], c[1])).toBeGreaterThan(0.1);
        expect(cells.size).toBe(board.adjacency.size);
        expect(new Set(cells.values()).size).toBe(board.adjacency.size);
        let checked = 0;
        for (const [face, z] of centres) {
          if (Math.hypot(z[0], z[1]) > 0.6) continue;
          // the face the step carries this one onto shows the symmetry's
          // image of what this one shows
          const there = nearest(apply(c, rot, z));
          if (there.d > 1e-6) continue;
          expect(board.faces!.get(there.face)).toBe(cells.get(board.faces!.get(face)!));
          checked++;
        }
        expect(checked).toBeGreaterThan(5);
      }
    }
  });

  it("draw the whole view round anywhere the pan can put its centre", () => {
    // The pan keeps the view's centre on the central heptagon of {7,3}
    // (`discRecentre`) and shows what lies within its view of it (COVER_VIEW,
    // shorter on a subdivision, whose tiles are smaller), so the
    // patch has to cover that circle from every point of the heptagon -- its
    // corners are the worst case. Probed on the circle itself: inside it the
    // patch is a disc, so a covered rim means a covered circle.
    const corners = centralPolygon(7, 3);
    const toward = (a: Cx, z: Cx): Cx => {
      // the disc translation taking 0 to a, applied to z
      const num: Cx = [z[0] + a[0], z[1] + a[1]];
      const den: Cx = [1 + a[0] * z[0] + a[1] * z[1], a[0] * z[1] - a[1] * z[0]];
      const d = den[0] * den[0] + den[1] * den[1];
      return [(num[0] * den[0] + num[1] * den[1]) / d, (num[1] * den[0] - num[0] * den[1]) / d];
    };
    const boards: [string, HurwitzOp][] = [
      ...Object.keys(SURFACES).map((s): [string, HurwitzOp] => [s, "zip"]),
      ["quartic", "gc3"],
      ["quartic", "gc4"],
    ];
    for (const [surface, op] of boards) {
      const board = hurwitzBoard(surface, op, 0, 1);
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
      expect(view).toBeCloseTo(op === "zip" ? COVER_VIEW : COVER_VIEW - Math.log(Number(op.slice(2)) / Math.sqrt(3)), 9);
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
    const card = gcDisc(3, 30, 1);
    const sides = [...card.polygons.keys()].map((f) => card.cornerMask!.get(f)!.filter(Boolean).length);
    expect(new Set(sides)).toEqual(new Set([6, 7]));
    expect(card.polygons.size).toBeGreaterThan(100);
  });

  it("keep the central heptagon's turn as a control", () => {
    for (const surface of Object.keys(SURFACES)) {
      const board = hurwitzBoard(surface, "zip", 0, 1);
      expect(board.symmetries.map((s) => s.id)).toContain("turn");
    }
  });
});
