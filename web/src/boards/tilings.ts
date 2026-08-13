// Port of the regular flat lattice builders in minesweeper/boards/tilings.py
// (square / triangle / trigrid / hex / hexhex). Integer lattice points, so
// adjacency uses exact vertex keys — no quantization needed here.
import {
  buildLattice,
  cid,
  finalizeFlat,
  type Board,
  type CellId,
  type Vertex,
} from "./core";

const ROOT3 = Math.sqrt(3);
const DEG = Math.PI / 180;

const HEX_VERTEX_OFFSETS: Vertex[] = [
  [0, -2],
  [1, -1],
  [1, 1],
  [0, 2],
  [-1, 1],
  [-1, -1],
];

export function squareBoard(
  rows: number,
  cols: number,
  mineCount: number,
  scale = 32,
): Board {
  const cells = new Map<CellId, Vertex[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.set(cid(r, c), [
        [c, r],
        [c + 1, r],
        [c + 1, r + 1],
        [c, r + 1],
      ]);
    }
  }
  return buildLattice("square", cells, [scale, scale], mineCount);
}

function triangleVertices(x: number, row: number, up: boolean): Vertex[] {
  // A unit triangle spanning lattice x..x+2 within lattice row `row`.
  if (up) {
    return [
      [x, row + 1],
      [x + 2, row + 1],
      [x + 1, row],
    ];
  }
  return [
    [x, row],
    [x + 2, row],
    [x + 1, row + 1],
  ];
}

export function triangleBoard(size: number, mineCount: number, scale = 52): Board {
  // An equilateral triangle of side `size` split into size^2 unit triangles;
  // row r holds 2r+1 alternating up/down triangles.
  const cells = new Map<CellId, Vertex[]>();
  for (let r = 0; r < size; r++) {
    const xStart = size - r - 1;
    for (let i = 0; i < 2 * r + 1; i++) {
      cells.set(cid(r, i), triangleVertices(xStart + i, r, i % 2 === 0));
    }
  }
  return buildLattice("triangle", cells, [scale / 2, (scale * ROOT3) / 2], mineCount);
}

export function hextriBoard(side: number, mineCount: number, scale = 52): Board {
  // A regular hexagon of side `side` cut into 6 * side^2 unit triangles: the
  // triangular tiling on a hexagonal board, as hexhexBoard is the hexagonal
  // one. Going down the 2 * side rows the top edge widens by a triangle side
  // per row until the middle and narrows again; a row whose top edge is t
  // sides wide holds 2t + 1 triangles above the middle (first and last
  // pointing up) and 2t - 1 below it. Rows are centred in the 4 * side lattice
  // columns, which puts the hexagon's centre on a lattice vertex and so keeps
  // the tiling's full six-fold symmetry.
  const cells = new Map<CellId, Vertex[]>();
  for (let r = 0; r < 2 * side; r++) {
    const upper = r < side;
    const count = upper ? 2 * (side + r) + 1 : 2 * (3 * side - r) - 1;
    const xStart = (4 * side - count - 1) / 2;
    for (let i = 0; i < count; i++) {
      cells.set(cid(r, i), triangleVertices(xStart + i, r, (i % 2 === 0) === upper));
    }
  }
  return buildLattice("hextri", cells, [scale / 2, (scale * ROOT3) / 2], mineCount);
}

export function triangleGridBoard(
  rows: number,
  rowWidth: number,
  mineCount: number,
  scale = 52,
): Board {
  const cells = new Map<CellId, Vertex[]>();
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < rowWidth; i++) {
      cells.set(cid(r, i), triangleVertices(i, r, (r + i) % 2 === 0));
    }
  }
  return buildLattice("trigrid", cells, [scale / 2, (scale * ROOT3) / 2], mineCount);
}

export function hexBoard(
  rows: number,
  cols: number,
  mineCount: number,
  scale = 20,
): Board {
  // Pointy-top hexagons in odd-r offset layout; scale = circumradius.
  const cells = new Map<CellId, Vertex[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kx = 2 * c + (r % 2) + 1;
      const ky = 3 * r + 2;
      cells.set(
        cid(r, c),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => [kx + ox, ky + oy] as Vertex),
      );
    }
  }
  return buildLattice("hex", cells, [(scale * ROOT3) / 2, scale / 2], mineCount);
}

export function hexhexBoard(radius: number, mineCount: number, scale = 20): Board {
  // A big hexagon of small hexagons: all axial (q, r) within `radius`.
  const cells = new Map<CellId, Vertex[]>();
  for (let qq = -radius; qq <= radius; qq++) {
    const rLo = Math.max(-radius, -qq - radius);
    const rHi = Math.min(radius, -qq + radius);
    for (let rr = rLo; rr <= rHi; rr++) {
      const kx = 2 * qq + rr + 2 * radius + 1;
      const ky = 3 * rr + 3 * radius + 2;
      cells.set(
        cid(qq, rr),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => [kx + ox, ky + oy] as Vertex),
      );
    }
  }
  return buildLattice("hexhex", cells, [(scale * ROOT3) / 2, scale / 2], mineCount);
}

export function hextriangleBoard(size: number, mineCount: number, scale = 20): Board {
  // A big equilateral triangle of small hexagons: axial (q, r) with
  // q, r >= 0 and q + r <= size, giving (size+1)*(size+2)/2 cells -- the
  // hexagonal tiling on a triangular board, as hextriBoard is the
  // triangular tiling on a hexagonal one. Row r=0 is the widest (size+1
  // cells); flipping it to the bottom (largest ky) reads as a mountain --
  // flat base down, apex up -- rather than balanced on its point.
  const cells = new Map<CellId, Vertex[]>();
  for (let qq = 0; qq <= size; qq++) {
    for (let rr = 0; rr <= size - qq; rr++) {
      const kx = 2 * qq + rr + 1;
      const ky = 3 * (size - rr) + 2;
      cells.set(
        cid(qq, rr),
        HEX_VERTEX_OFFSETS.map(([ox, oy]) => [kx + ox, ky + oy] as Vertex),
      );
    }
  }
  return buildLattice("hextriangle", cells, [(scale * ROOT3) / 2, scale / 2], mineCount);
}

// -- Archimedean (semiregular) tilings + Laves duals -------------------------
//
// Port of the `_ArchTemplate` system in minesweeper/boards/tilings.py. Each of
// the eight non-regular uniform tilings and its Laves (dual) partner is built
// from one rectangular fundamental domain: vertices are canonicalized into the
// domain, cells are references into this or a neighbouring domain copy. The
// same template drives the flat window (`archimedeanBoard`) and the surface
// wraps in surfaces.ts. Tags are the exact-position hashable ids: a string
// `"rx,ry"` of the domain-local coordinates rounded to 1e-6 (Python rounds tag
// tuples the same), so two cells are neighbours iff they share a tag.

/** A tag reference: which vertex (`tag`) in which domain copy (`dm`, `dn`). */
export interface Ref {
  tag: string;
  dm: number;
  dn: number;
}

export interface ArchTemplate {
  config: number[]; // vertex configuration, e.g. [3, 6, 3, 6]
  width: number; // domain size in edge lengths
  height: number;
  verts: Map<string, Vertex>; // tag -> position within the domain
  cells: { name: string; refs: Ref[]; real: boolean[] }[];
  mirror: Map<string, Ref> | null; // tag -> image under y -> height - y
  glide: boolean; // the mirror needs an extra width/2 x-shift (p4g)
  centre: Vertex | null; // rotation centre (domain coords) for the flat window
  cut: number; // where a rim or a seam falls within the repeating rows
  flips: number[]; // the heights, mod height/2, at which the tiling maps onto
  // itself with y reversed -- what a cylinder's two rims need to match
}

// THE CUT. Two surfaces end the tiling on a horizontal line: the cylinder,
// whose strip runs from y = cut to y = cut + rows*height and stops there in two
// rims, and the Mobius strip, which glues those two ends to each other and,
// having *one* edge, needs whatever the tiling does at y = cut to be what it
// does at y = cut + strip as well. Both want the same of the line, and `cut` is
// how a template answers:
//
//   * The strip must be symmetric about its own centre line, or its two ends
//     are different rows of the tiling. Which flips count differs by surface:
//     a Mobius seam reverses y and leaves x running on, so it needs the
//     template's *mirror* (axes y = 0 and y = height/2) composed with whole
//     periods -- `rows + 2*cut/height` a whole number, which archMobiusBoard
//     checks. A cylinder can also be turned upside down about a horizontal
//     axis, which reverses x too, so a **half turn** serves it as well as a
//     mirror -- and a chiral tiling with no mirror still has one. `flips`
//     collects both kinds; archCylinderBoard asks that the strip's centre line
//     land on one. Either way no tile centroid may sit *on* the cut, or that
//     row is kept at one end and its image at the other is not.
//   * Given that, cut where the rim comes out straight if the tiling has a
//     horizontal line of edges at all; otherwise halfway between the two rows
//     the cut separates, which is the least ragged the rim can be.
//
// Most templates want cut 0. Kept in step with `cut` in
// minesweeper/boards/tilings.py by data/conformance.json.

type Polygon = readonly (readonly [number, number])[];

/** Round to 6 decimals and normalise -0 to 0 (matches Python `round(v, 6)`). */
function round6(v: number): number {
  const r = Math.round(v * 1e6) / 1e6;
  return r + 0;
}

/** Build a template from one domain's worth of cell polygons in float
 * coordinates. Each vertex is canonicalized into [0, width) x [0, height); the
 * rounded canonical position doubles as its exact hashable tag. */
function template(
  config: number[],
  width: number,
  height: number,
  polygons: readonly (readonly [string, Polygon])[],
  {
    mirrored = true,
    glide = false,
    centre = null as Vertex | null,
    cut = 0,
  } = {},
): ArchTemplate {
  const reduce = (value: number, size: number): [number, number] => {
    // the slack absorbs tag rounding, so values exactly on a domain edge land
    // on its near side; real vertices are never this close without being on it
    const d = Math.floor(value / size + 1e-5);
    return [round6(value - d * size), d];
  };
  const canonical = (x: number, y: number): { tag: string; xy: Vertex; dm: number; dn: number } => {
    const [rx, dm] = reduce(x, width);
    const [ry, dn] = reduce(y, height);
    return { tag: `${rx},${ry}`, xy: [rx, ry], dm, dn };
  };

  const verts = new Map<string, Vertex>();
  const cells: { name: string; refs: Ref[] }[] = [];
  for (const [name, polygon] of polygons) {
    let refs: Ref[] = [];
    for (const [x, y] of polygon) {
      const c = canonical(x, y);
      verts.set(c.tag, c.xy);
      refs.push({ tag: c.tag, dm: c.dm, dn: c.dn });
    }
    // normalize so the cell's centroid lies in domain copy (0, 0): the Möbius
    // builder selects cell instances by centroid
    let cx = 0;
    let cy = 0;
    for (const r of refs) {
      const v = verts.get(r.tag)!;
      cx += r.dm * width + v[0];
      cy += r.dn * height + v[1];
    }
    cx /= refs.length;
    cy /= refs.length;
    const mshift = Math.floor(cx / width + 1e-9);
    const nshift = Math.floor(cy / height + 1e-9);
    refs = refs.map((r) => ({ tag: r.tag, dm: r.dm - mshift, dn: r.dn - nshift }));
    cells.push({ name, refs });
  }

  const wrapGap = (delta: number, size: number): number => {
    const d = Math.abs(delta) % size;
    return Math.min(d, size - d);
  };
  const distance = (xy: Vertex, x: number, y: number): number =>
    Math.hypot(wrapGap(xy[0] - x, width), wrapGap(xy[1] - y, height));

  let mirror: Map<string, Ref> | null = null;
  if (mirrored) {
    const shift = glide ? width / 2 : 0;
    mirror = new Map();
    for (const [tag, xy] of verts) {
      const x = xy[0] + shift;
      const y = height - xy[1];
      const c = canonical(x, y);
      let image = c.tag;
      if (!verts.has(image)) {
        // tags are rounded; match the closest vertex (wrap-aware)
        let best = Infinity;
        for (const [vt, vxy] of verts) {
          const dd = distance(vxy, x, y);
          if (dd < best) {
            best = dd;
            image = vt;
          }
        }
        if (distance(verts.get(image)!, x, y) > 1e-4) {
          throw new Error(`mirror of ${tag} is not a vertex`);
        }
      }
      mirror.set(tag, { tag: image, dm: c.dm, dn: c.dn });
    }
  }
  return {
    config,
    width,
    height,
    verts,
    cells: insertTVertices(verts, cells, width, height),
    mirror,
    glide,
    centre,
    cut,
    flips: flipLevels(width, height, polygons),
  };
}

/** The heights at which the tiling maps onto itself with y reversed.
 *
 * Two isometries do that and still fit a cylinder, whose own freedom is a turn
 * about its axis (any x shift) and a reflection in a plane through it (x
 * reversed): a horizontal **mirror** or glide line, y -> 2*level - y with x
 * shifted, and a **half turn** about a point at that height, which reverses x
 * too. Either carries a strip's top rim onto its bottom one, so a strip centred
 * on such a height comes out with two rims that are the same curve.
 *
 * Two of them compose to a vertical translation, so the levels repeat every
 * height/2 and are returned reduced into [0, height/2). p3 -- three-scale
 * triangular -- is the one wallpaper group here with neither kind and gets
 * none: no strip of it has matching rims. */
function flipLevels(
  width: number,
  height: number,
  polygons: readonly (readonly [string, Polygon])[],
): number[] {
  // a hair below a period is the same place as the origin; a tile whose
  // vertices are computed (every Laves dual's are) misses by ~1e-6
  const wrapped = (point: readonly [number, number]): [number, number] => {
    let x = point[0] % width;
    let y = point[1] % height;
    if (x < 0) x += width;
    if (y < 0) y += height;
    return [x > width - FLIP_TOL ? 0 : x, y > height - FLIP_TOL ? 0 : y];
  };
  const centre = (points: readonly (readonly [number, number])[]): [number, number] => {
    let cx = 0;
    let cy = 0;
    for (const [x, y] of points) {
      cx += x;
      cy += y;
    }
    return wrapped([cx / points.length, cy / points.length]);
  };
  /** The same tile, allowing for where its outline starts and which way round
   * it runs -- a mirror reverses the winding. Compared as a cycle rather than
   * as a sorted list: two vertices of one tiling can share a coordinate to the
   * last bit and sort either way round. */
  const same = (one: [number, number][], other: [number, number][]): boolean => {
    if (one.length !== other.length) return false;
    for (const turned of [other, [...other].reverse()]) {
      for (let i = 0; i < turned.length; i++) {
        let all = true;
        for (let k = 0; k < one.length && all; k++) {
          const a = one[k]!;
          const b = turned[(i + k) % turned.length]!;
          all = Math.abs(a[0] - b[0]) < FLIP_TOL && Math.abs(a[1] - b[1]) < FLIP_TOL;
        }
        if (all) return true;
      }
    }
    return false;
  };

  const tiles = polygons.map(([, polygon]) => ({
    outline: polygon.map((point) => wrapped(point)),
    centre: centre(polygon),
    polygon,
  }));
  // tiles bucketed by centre, so the image of one is looked up rather than
  // searched for; the bucket is far wider than the tolerance, and its
  // neighbours are swept too, so nothing falls down a rounding crack
  const grid = new Map<string, [number, number][][]>();
  for (const tile of tiles) {
    const key = `${Math.floor(tile.centre[0] * 100)},${Math.floor(tile.centre[1] * 100)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(tile.outline);
    else grid.set(key, [tile.outline]);
  }
  /** Is this polygon one of the tiling's own tiles? */
  const present = (points: readonly (readonly [number, number])[]): boolean => {
    const [cx, cy] = centre(points);
    const want = points.map((point) => wrapped(point));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${Math.floor(cx * 100) + dx},${Math.floor(cy * 100) + dy}`;
        for (const other of grid.get(key) ?? []) {
          if (same(want, other)) return true;
        }
      }
    }
    return false;
  };

  const [ax, ay] = tiles[0]!.centre;
  const levels: number[] = [];
  for (const { centre: [cx, cy] } of tiles) {
    // the flip has to send the first tile onto this one, which fixes it up to
    // the half period between one flip level and the next
    for (const level of [(ay + cy) / 2, (ay + cy) / 2 + height / 2]) {
      for (const reverse of [true, false]) {
        // half turn, or plain mirror
        const shift = reverse ? cx + ax : cx - ax;
        const maps = tiles.every(({ polygon }) =>
          present(
            polygon.map(([x, y]) => [reverse ? shift - x : x + shift, 2 * level - y] as const),
          ),
        );
        if (!maps) continue;
        // rounded only enough to tidy the arithmetic: what the level is *near*
        // was settled by the match above, and archCylinderBoard measures rows
        // against it exactly
        let found = level % (height / 2);
        if (found < 0) found += height / 2;
        found = found > height / 2 - FLIP_TOL ? 0 : Math.round(found * 1e9) / 1e9;
        if (levels.every((seen) => Math.abs(found - seen) > FLIP_TOL)) levels.push(found);
      }
    }
  }
  return levels.sort((a, b) => a - b);
}

// How far two tiles may sit apart and still be the same tile. Template vertices
// are stored rounded to 1e-6 and a dual's are computed centroids of those, so a
// tiling is only symmetric to about that; the closest two *different* vertices
// in any template here are four orders of magnitude further apart.
const FLIP_TOL = 1e-4;

// Tag coordinates are rounded to 1e-6, so a vertex genuinely on an edge can
// miss it by about 1e-6; the nearest vertex that is *not* on an edge is two
// orders of magnitude further off in every template here.
const T_VERTEX_TOL = 1e-5;

/** Split every cell edge at the vertices lying inside it.
 *
 * A tiling that is not edge-to-edge has vertices landing in the *interior* of a
 * neighbouring tile's edge — a T-vertex. Recording one as a vertex of the tile
 * whose edge it splits leaves the drawn polygon unchanged (the point is
 * collinear) but makes the two tiles share a vertex id, which is what the
 * shared-vertex adjacency rule runs on. It also turns the tiling into an
 * edge-to-edge *mesh* of polygons with 180° corners, so the Euler
 * characteristic and boundary counts stay meaningful. Edge-to-edge tilings have
 * no such vertex, so this is a no-op for the sixteen Archimedean and Laves
 * templates. Port of `_insert_t_vertices` in boards/tilings.py — the two must
 * agree vertex for vertex or the conformance oracle fails. */
function insertTVertices(
  verts: Map<string, Vertex>,
  cells: { name: string; refs: Ref[] }[],
  width: number,
  height: number,
): { name: string; refs: Ref[]; real: boolean[] }[] {
  const at = (tag: string, dm: number, dn: number): Vertex => {
    const v = verts.get(tag)!;
    return [dm * width + v[0], dn * height + v[1]];
  };
  return cells.map(({ name, refs }) => {
    const points = refs.map((r) => at(r.tag, r.dm, r.dn));
    const split: Ref[] = [];
    const real: boolean[] = [];
    for (let i = 0; i < refs.length; i++) {
      const [ax, ay] = points[i]!;
      const [bx, by] = points[(i + 1) % refs.length]!;
      const ex = bx - ax;
      const ey = by - ay;
      const span = Math.hypot(ex, ey);
      const found: { s: number; ref: Ref }[] = [];
      for (
        let dm = Math.floor(Math.min(ax, bx) / width);
        dm <= Math.floor(Math.max(ax, bx) / width);
        dm++
      ) {
        for (
          let dn = Math.floor(Math.min(ay, by) / height);
          dn <= Math.floor(Math.max(ay, by) / height);
          dn++
        ) {
          for (const tag of verts.keys()) {
            const [vx, vy] = at(tag, dm, dn);
            if (Math.abs((vx - ax) * ey - (vy - ay) * ex) > T_VERTEX_TOL * span) {
              continue; // not on the edge's line
            }
            const s = ((vx - ax) * ex + (vy - ay) * ey) / (span * span);
            if (s > 1e-9 && s < 1 - 1e-9) found.push({ s, ref: { tag, dm, dn } });
          }
        }
      }
      found.sort((a, b) => a.s - b.s);
      split.push(refs[i]!, ...found.map((f) => f.ref));
      real.push(true, ...found.map(() => false));
    }
    return { name, refs: split, real };
  });
}

function regularPolygon(
  cx: number,
  cy: number,
  sides: number,
  circumradius: number,
  offsetDeg: number,
): Vertex[] {
  const out: Vertex[] = [];
  for (let k = 0; k < sides; k++) {
    const a = (offsetDeg + (360 * k) / sides) * DEG;
    out.push([cx + circumradius * Math.cos(a), cy + circumradius * Math.sin(a)]);
  }
  return out;
}

/** The unit square sitting outside the edge whose outward normal is
 * `normalDeg` at distance `apothem` from (cx, cy). */
function squareOnEdge(cx: number, cy: number, apothem: number, normalDeg: number): Vertex[] {
  const phi = normalDeg * DEG;
  const ux = Math.cos(phi);
  const uy = Math.sin(phi);
  const tx = -uy;
  const ty = ux; // along the edge
  const mx = cx + apothem * ux;
  const my = cy + apothem * uy;
  const a: Vertex = [mx + 0.5 * tx, my + 0.5 * ty];
  const b: Vertex = [mx - 0.5 * tx, my - 0.5 * ty];
  return [a, b, [b[0] + ux, b[1] + uy], [a[0] + ux, a[1] + uy]];
}

/** Assemble one rectangular domain of a tiling built on a triangular lattice of
 * hexagon (or dodecagon) centres. `hexagonAt` is the central polygon around a
 * lattice point and `decorate` yields the polygons hung off it; everything is
 * deduplicated by rounded centroid and kept when its centroid lands in
 * [0, width) x [0, height). */
function hexLatticePolygons(
  centreAt: (m: number, n: number) => Vertex,
  hexagonAt: (cx: number, cy: number) => Vertex[],
  decorate: (cx: number, cy: number) => [string, Vertex[]][],
  width: number,
  height: number,
): [string, Vertex[]][] {
  const centroid = (polygon: Polygon): Vertex => {
    let x = 0;
    let y = 0;
    for (const p of polygon) {
      x += p[0];
      y += p[1];
    }
    return [x / polygon.length, y / polygon.length];
  };
  const polygons = new Map<string, Vertex[]>();
  for (let m = -2; m < 4; m++) {
    for (let n = -2; n < 4; n++) {
      const [cx, cy] = centreAt(m, n);
      const entries: [string, Vertex[]][] = [["c", hexagonAt(cx, cy)], ...decorate(cx, cy)];
      for (const [name, polygon] of entries) {
        const [gx, gy] = centroid(polygon);
        if (-1e-9 <= gx && gx < width - 1e-9 && -1e-9 <= gy && gy < height - 1e-9) {
          polygons.set(`${name},${round3(gx)},${round3(gy)}`, polygon);
        }
      }
    }
  }
  let i = 0;
  const out: [string, Vertex[]][] = [];
  for (const [key, polygon] of polygons) {
    const name = key.slice(0, key.indexOf(","));
    out.push([`${name}${i}`, polygon]);
    i++;
  }
  return out;
}

function round3(v: number): number {
  return Math.round(v * 1e3) / 1e3 + 0;
}

// -- the eight uniform template factories ------------------------------------

function trihexTemplate(): ArchTemplate {
  // Trihexagonal (3.6.3.6): hexagon centres on a side-2 triangular lattice, cell
  // vertices at the lattice edge midpoints.
  const h = ROOT3 / 2;
  const hexagon = (cx: number, cy: number): Vertex[] => [
    [cx + 1, cy],
    [cx + 0.5, cy + h],
    [cx - 0.5, cy + h],
    [cx - 1, cy],
    [cx - 0.5, cy - h],
    [cx + 0.5, cy - h],
  ];
  const polygons: [string, Vertex[]][] = [
    ["hex0", hexagon(0, 0)],
    ["hex1", hexagon(1, ROOT3)],
    ["tri0", [[1, 0], [1.5, h], [0.5, h]]],
    ["tri1", [[1.5, h], [2, ROOT3], [2.5, h]]],
    ["tri2", [[2, ROOT3], [2.5, ROOT3 + h], [1.5, ROOT3 + h]]],
    ["tri3", [[1.5, ROOT3 + h], [1, 2 * ROOT3], [0.5, ROOT3 + h]]],
  ];
  // kagome: the horizontal family of straight lines runs along y = sqrt(3)/2,
  // so the Mobius band cut there keeps a straight edge (cut 0 would put a
  // hexagon centre on the seam).
  return template([3, 6, 3, 6], 2, 2 * ROOT3, polygons, { cut: h });
}

function truncsquareTemplate(): ArchTemplate {
  // Truncated square (4.8.8): octagons on a square lattice of pitch 1 + sqrt(2),
  // tilted unit squares filling the corners.
  const a = 1 + Math.SQRT2;
  const p = a / 2;
  const q = Math.SQRT2 / 2;
  const octagon: Vertex[] = [
    [0.5, p],
    [p, 0.5],
    [p, -0.5],
    [0.5, -p],
    [-0.5, -p],
    [-p, -0.5],
    [-p, 0.5],
    [-0.5, p],
  ];
  const square: Vertex[] = [
    [p - q, p],
    [p, p - q],
    [p + q, p],
    [p, p + q],
  ];
  // no horizontal line runs through this tiling, so the Mobius band is cut
  // midway between the octagon and square courses.
  return template([4, 8, 8], a, a, [["oct", octagon], ["sq", square]], { cut: a / 4 });
}

function elongatedTemplate(): ArchTemplate {
  // Elongated triangular (3.3.3.4.4): rows of squares separated by rows of
  // triangles, consecutive square rows offset by half a square.
  const h = ROOT3 / 2;
  const polygons: [string, Vertex[]][] = [
    ["sq0", [[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]]],
    ["tri0", [[0, 0.5], [1, 0.5], [0.5, 0.5 + h]]],
    ["tri1", [[0.5, 0.5 + h], [1, 0.5], [1.5, 0.5 + h]]],
    ["sq1", [[0.5, 0.5 + h], [1.5, 0.5 + h], [1.5, 1.5 + h], [0.5, 1.5 + h]]],
    ["tri2", [[0.5, 1.5 + h], [1.5, 1.5 + h], [1, 1.5 + 2 * h]]],
    ["tri3", [[1, 1.5 + 2 * h], [1.5, 1.5 + h], [2, 1.5 + 2 * h]]],
  ];
  // a square course's own bottom edge runs straight across the tiling, so the
  // Mobius band is cut there and comes out flat-edged at both rims.
  return template([3, 3, 3, 4, 4], 1, 2 + ROOT3, polygons, { cut: -0.5 });
}

function snubsquareTemplate(): ArchTemplate {
  // Snub square (3.3.4.3.4): squares alternately rotated +-15 degrees, pairs of
  // triangles between them. p4g has only a glide (mirror plus half a period).
  const a = Math.sqrt(2 + ROOT3);
  const r = Math.SQRT1_2;
  const square = (cx: number, cy: number, firstCorner: number): Vertex[] => {
    const out: Vertex[] = [];
    for (let k = 0; k < 4; k++) {
      const ang = (firstCorner + 90 * k) * DEG;
      out.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return out;
  };
  const triOn = (points: Vertex[], center: Vertex, k: number): Vertex[] => {
    // the equilateral triangle on edge k of a square, apex away from it
    const [x1, y1] = points[k]!;
    const [x2, y2] = points[(k + 1) % 4]!;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const apex: Vertex = [mx + ROOT3 * (mx - center[0]), my + ROOT3 * (my - center[1])];
    return [[x1, y1], [x2, y2], apex];
  };
  const plus = square(0, a / 4, 60); // rotated +15
  const minus = square(a / 2, (3 * a) / 4, 30); // rotated -15
  const polygons: [string, Vertex[]][] = [
    ["sq0", plus],
    ["sq1", minus],
    ["tri0", triOn(plus, [0, a / 4], 0)],
    ["tri1", triOn(plus, [0, a / 4], 2)],
    ["tri2", triOn(minus, [a / 2, (3 * a) / 4], 0)],
    ["tri3", triOn(minus, [a / 2, (3 * a) / 4], 2)],
  ];
  return template([3, 3, 4, 3, 4], a, a, polygons, { glide: true });
}

function snubhexTemplate(): ArchTemplate {
  // Snub hexagonal (3.3.3.3.6) on the rotated rectangle spanned by the
  // orthogonal superlattice vectors (5,1) and (3,-5): sqrt(7) x sqrt(21) edge
  // lengths holding two hexagons and sixteen triangles. Chiral (p6): no mirror.
  const width = Math.sqrt(7);
  const height = Math.sqrt(21);
  const uv = (x: number, row: number): Vertex => [
    (5 * x + 3 * row) / (4 * width),
    (3 * (x - 5 * row)) / (4 * height),
  ];
  const isHexCentre = (x: number, row: number): boolean => {
    const m = 3 * (x - 1) - row;
    const n = 5 * row - (x - 1);
    return m % 14 === 0 && n % 14 === 0;
  };
  const inDomain = (points: Vertex[]): boolean => {
    let cu = 0;
    let cv = 0;
    for (const [u, v] of points) {
      cu += u;
      cv += v;
    }
    cu /= points.length;
    cv /= points.length;
    return -1e-9 <= cu && cu < width - 1e-9 && -1e-9 <= cv && cv < height - 1e-9;
  };
  const polygons: [string, Vertex[]][] = [];
  for (let row = -7; row < 4; row++) {
    for (let i = -3; i < 11; i++) {
      const corners = triangleVertices(i, row, (row + i) % 2 === 0);
      if (corners.some(([x, r]) => isHexCentre(x, r))) continue; // part of a hexagon
      const points = corners.map(([x, r]) => uv(x, r));
      if (inDomain(points)) polygons.push([`t${row},${i}`, points]);
    }
  }
  const ring: [number, number][] = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];
  for (let m = -3; m < 4; m++) {
    for (let n = -3; n < 4; n++) {
      const cx = 1 + 5 * m + n;
      const crow = m + 3 * n;
      const points = ring.map(([ox, oy]) => uv(cx + ox, crow + oy));
      if (inDomain(points)) polygons.push([`h${m},${n}`, points]);
    }
  }
  return template([3, 3, 3, 3, 6], width, height, polygons, {
    mirrored: false,
    cut: height / 7,
  });
}

function trunchexTemplate(): ArchTemplate {
  // Truncated hexagonal (3.12.12): dodecagons on a hexagonal lattice of pitch
  // 2 + sqrt(3), up/down triangles between them.
  const a = 2 + ROOT3;
  const r = (Math.sqrt(6) + Math.SQRT2) / 2; // dodecagon circumradius, side 1
  const e = 0.5 + ROOT3 / 2;
  const around = (cx: number, cy: number, suffix: string): [string, Vertex[]][] => {
    const dodecagon: Vertex[] = [];
    for (let k = 0; k < 12; k++) {
      const ang = (15 + 30 * k) * DEG;
      dodecagon.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
    return [
      ["dod" + suffix, dodecagon],
      ["up" + suffix, [[cx + a / 2, cy + 0.5], [cx + a - e, cy + e], [cx + e, cy + e]]],
      ["down" + suffix, [[cx + a / 2, cy - 0.5], [cx + e, cy - e], [cx + a - e, cy - e]]],
    ];
  };
  const polygons = [...around(0, 0, "0"), ...around(a / 2, (a * ROOT3) / 2, "1")];
  // the triangles hang below every dodecagon course, so there is no horizontal
  // line; the Mobius band is cut midway between the two courses.
  return template([3, 12, 12], a, a * ROOT3, polygons, { cut: (a * ROOT3) / 4 });
}

function rhombitrihexTemplate(): ArchTemplate {
  // Rhombitrihexagonal (3.4.6.4): hexagons on a triangular lattice of pitch
  // 1 + sqrt(3), a square across every hexagon edge and a triangle in each gap.
  const a = 1 + ROOT3;
  const centreAt = (m: number, n: number): Vertex => [m * a + (n * a) / 2, (n * a * ROOT3) / 2];
  const hexagonAt = (cx: number, cy: number): Vertex[] => regularPolygon(cx, cy, 6, 1, 30);
  const decorate = (cx: number, cy: number): [string, Vertex[]][] => {
    const out: [string, Vertex[]][] = [];
    for (let k = 0; k < 6; k++) {
      out.push(["sq", squareOnEdge(cx, cy, ROOT3 / 2, 60 * k)]);
      const vx = cx + Math.cos((30 + 60 * k) * DEG);
      const vy = cy + Math.sin((30 + 60 * k) * DEG);
      const u1: Vertex = [Math.cos(60 * k * DEG), Math.sin(60 * k * DEG)];
      const u2: Vertex = [Math.cos((60 * k + 60) * DEG), Math.sin((60 * k + 60) * DEG)];
      out.push(["tri", [[vx, vy], [vx + u1[0], vy + u1[1]], [vx + u2[0], vy + u2[1]]]]);
    }
    return out;
  };
  const width = a;
  const height = a * ROOT3;
  // courses of hexagon+square, triangle, square, triangle, ... and no
  // horizontal line; the Mobius band is cut midway between a triangle course
  // and the hexagon course above it.
  return template([3, 4, 6, 4], width, height, hexLatticePolygons(centreAt, hexagonAt, decorate, width, height), {
    cut: (5 * height) / 12,
  });
}

function trunctrihexTemplate(): ArchTemplate {
  // Truncated trihexagonal (4.6.12): dodecagons on a triangular lattice of pitch
  // 3 + sqrt(3), a square across every second edge and a hexagon in each gap.
  const a = 3 + ROOT3;
  const r12 = (Math.sqrt(6) + Math.SQRT2) / 2; // dodecagon circumradius, side 1
  const apothem = (2 + ROOT3) / 2;
  const centreAt = (m: number, n: number): Vertex => [m * a + (n * a) / 2, (n * a * ROOT3) / 2];
  const dodecagonAt = (cx: number, cy: number): Vertex[] => regularPolygon(cx, cy, 12, r12, 15);
  const decorate = (cx: number, cy: number): [string, Vertex[]][] => {
    // this dodecagon's lattice indices, to locate its triangular holes
    const n0 = Math.round(cy / ((a * ROOT3) / 2));
    const m0 = Math.round((cx - (n0 * a) / 2) / a);
    const out: [string, Vertex[]][] = [];
    for (let k = 0; k < 6; k++) out.push(["sq", squareOnEdge(cx, cy, apothem, 60 * k)]);
    const cornerSets: [number, number][][] = [
      [[0, 0], [1, 0], [0, 1]],
      [[1, 0], [0, 1], [1, 1]],
    ];
    for (const corners of cornerSets) {
      const centres = corners.map(([dm, dn]) => centreAt(m0 + dm, n0 + dn));
      let hx = 0;
      let hy = 0;
      for (const [x, y] of centres) {
        hx += x;
        hy += y;
      }
      out.push(["hex", regularPolygon(hx / 3, hy / 3, 6, 1, 0)]);
    }
    return out;
  };
  const width = a;
  const height = a * ROOT3;
  // courses of dodecagon+square, hexagon, square, hexagon, ... and no
  // horizontal line; the Mobius band is cut midway between the square course
  // and the hexagon course above it.
  return template([4, 6, 12], width, height, hexLatticePolygons(centreAt, dodecagonAt, decorate, width, height), {
    cut: (7 * height) / 24,
  });
}

// -- Laves (dual / Catalan) tilings ------------------------------------------
//
// Each Laves tiling is the dual of one Archimedean tiling: a vertex at every
// tile centre, joined across every shared edge. `dualTemplate` builds it
// mechanically from the primal template. Its second argument is the dual's own
// Mobius cut (see THE MOBIUS CUT above), measured on the dual rather than
// inherited: Cairo pentagonal and rhombille both have a tile centre on y = 0
// and are cut midway between two courses instead, the other six duals want the
// default 0.

function dualTemplate(primal: () => ArchTemplate, cut = 0): ArchTemplate {
  const p = primal();
  const { width, height } = p;
  const centroidOf = (refs: Ref[]): Vertex => {
    let cx = 0;
    let cy = 0;
    for (const r of refs) {
      const v = p.verts.get(r.tag)!;
      cx += r.dm * width + v[0];
      cy += r.dn * height + v[1];
    }
    return [cx / refs.length, cy / refs.length];
  };
  const centres = new Map<string, Vertex>();
  const sides = new Map<string, number>();
  for (const { name, refs } of p.cells) {
    centres.set(name, centroidOf(refs));
    sides.set(name, refs.length);
  }

  // dual vertex = primal tile centre; dual face = the ring of tile centres
  // around a primal vertex, ordered by angle
  const polygons: [string, Vertex[]][] = [];
  let i = 0;
  for (const [vertex, [vx, vy]] of p.verts) {
    const ring: Vertex[] = [];
    for (const { name, refs } of p.cells) {
      const [cx, cy] = centres.get(name)!;
      for (const r of refs) {
        if (r.tag === vertex) ring.push([cx - r.dm * width, cy - r.dn * height]);
      }
    }
    ring.sort((a, b) => Math.atan2(a[1] - vy, a[0] - vx) - Math.atan2(b[1] - vy, b[0] - vx));
    polygons.push([`d${i}`, ring]);
    i++;
  }

  // centre the flat window on the primal's largest tile (its centre is the
  // highest-order rotation/mirror centre shared by both tilings)
  let widest = 0;
  for (const s of sides.values()) widest = Math.max(widest, s);
  let centre: Vertex | null = null;
  let best = Infinity;
  for (const [name, [cx, cy]] of centres) {
    if (sides.get(name) !== widest) continue;
    const wx = round6(((cx % width) + width) % width);
    const wy = round6(((cy % height) + height) % height);
    const d = wx * wx + wy * wy;
    if (d < best) {
      best = d;
      centre = [wx, wy];
    }
  }
  // The dual's tiles sit where the primal's vertices are, so its courses are
  // not the primal's and its Mobius cut is measured afresh rather than
  // inherited from `p`.
  return template(p.config, width, height, polygons, {
    mirrored: p.mirror !== null,
    glide: p.glide,
    centre,
    cut,
  });
}

// -- isogonal (non-edge-to-edge) tilings -------------------------------------
//
// Convex regular polygons also tile the plane *without* meeting edge to edge: a
// tile's corner can land in the interior of its neighbour's edge, a T-vertex.
// Wikipedia's "Euclidean tilings by convex regular polygons" pictures six
// isogonal (vertex-transitive) families of these — every vertex alike, and each
// family carrying one free real parameter: a row offset, or the ratio between
// two tile sizes. The six built below are their most symmetric members (offset
// 1/2, size ratio 1/2). A seventh family exists — square rows offset in a
// zig-zag rather than progressively — but at the half-square offset it is the
// same tiling as the running bond below, so it is not built separately.
//
// They need no new machinery: each is periodic, so one rectangular domain
// describes it, and `insertTVertices` records the T-vertices so the shared-
// vertex adjacency rule still sees the neighbours across a split edge. The
// extra vertex is collinear, so it is invisible when the tile is drawn;
// `shapeMetrics` drops it before measuring, and a square with a split edge is
// still a square. All six are flat-only (TilingSpec.flatOnly): wrapping one
// onto a manifold needs its own preset windows per surface.

function rotate2(point: Vertex, degrees: number): Vertex {
  if (!degrees) return point;
  const a = degrees * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
}

function polar(degrees: number, radius = 1): Vertex {
  const a = degrees * DEG;
  return [radius * Math.cos(a), radius * Math.sin(a)];
}

/** The tiles of a doubly periodic pattern whose centroids land in the
 * `width` x `height` domain. `v1`/`v2` generate the pattern's translation
 * lattice and `polygons` are the tiles hung off one lattice point, both in the
 * pattern's own frame; everything is rotated by `turn` degrees into the
 * domain's frame. Tiles are deduplicated by rounded centroid, so one shared
 * between lattice points is kept (and named) once. */
function periodicDomain(
  v1: Vertex,
  v2: Vertex,
  width: number,
  height: number,
  polygons: [string, Vertex[]][],
  turn = 0,
  span = 8,
): [string, Vertex[]][] {
  interface Kept {
    name: string;
    gx: number;
    gy: number;
    points: Vertex[];
  }
  const kept = new Map<string, Kept>();
  for (let m = -span; m <= span; m++) {
    for (let n = -span; n <= span; n++) {
      const ox = m * v1[0] + n * v2[0];
      const oy = m * v1[1] + n * v2[1];
      for (const [name, polygon] of polygons) {
        const points = polygon.map((p) => rotate2([p[0] + ox, p[1] + oy], turn));
        let gx = 0;
        let gy = 0;
        for (const p of points) {
          gx += p[0];
          gy += p[1];
        }
        gx /= points.length;
        gy /= points.length;
        if (-1e-9 <= gx && gx < width - 1e-9 && -1e-9 <= gy && gy < height - 1e-9) {
          const [kx, ky] = [round6(gx), round6(gy)];
          kept.set(`${name},${kx},${ky}`, { name, gx: kx, gy: ky, points });
        }
      }
    }
  }
  // sorted by (name, x, y) exactly as the Python `sorted(kept.items())` is:
  // the cell names have to come out in the same order in both ports
  return [...kept.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.gx - b.gx || a.gy - b.gy))
    .map(({ name, points }, i) => [`${name}${i}`, points]);
}

/** One rectangular domain of a pattern on the triangular lattice generated by
 * `c1` and its 60° rotation: the |c1| x |c1|*sqrt(3) rectangle (two lattice
 * points), in the frame where `c1` lies along the x axis. */
function triangularDomain(
  c1: Vertex,
  polygons: [string, Vertex[]][],
): { width: number; height: number; cells: [string, Vertex[]][] } {
  const pitch = Math.hypot(c1[0], c1[1]);
  const turn = -Math.atan2(c1[1], c1[0]) / DEG;
  const width = pitch;
  const height = pitch * ROOT3;
  return {
    width,
    height,
    cells: periodicDomain(c1, rotate2(c1, 60), width, height, polygons, turn),
  };
}

function offsetsquareTemplate(): ArchTemplate {
  // Offset square, the running bond of a brick wall (cmm): rows of unit
  // squares, each row shifted half a square against the one below, so every
  // vertex is two square corners meeting the middle of a third square's edge
  // (90 + 90 + 180). The domain runs from a square row's centreline, so the
  // template midline is a mirror line. A row's own top edge runs straight
  // across the tiling, so the Mobius band is cut there rather than along the
  // midline, which would leave a square centre on the seam.
  return template([4, 4, 4], 1, 2, [
    ["sq0", [[0, -0.5], [1, -0.5], [1, 0.5], [0, 0.5]]],
    ["sq1", [[-0.5, 0.5], [0.5, 0.5], [0.5, 1.5], [-0.5, 1.5]]],
  ], { cut: 0.5 });
}

function staggeredtriTemplate(): ArchTemplate {
  // Staggered triangular (cmm): strips of unit triangles, each strip shifted
  // half an edge against the one below — half a step off the triangular
  // tiling's own alignment, so every strip vertex lands in the middle of the
  // neighbouring strip's edge (60 + 60 + 60 + 180). The strip mirror is a
  // glide (reflect plus half a period).
  const h = ROOT3 / 2;
  return template([3, 3, 3, 3], 1, 2 * h, [
    ["up0", [[0, 0], [1, 0], [0.5, h]]],
    ["down0", [[-0.5, h], [0.5, h], [0, 0]]],
    ["up1", [[0, h], [1, h], [0.5, 2 * h]]],
    ["down1", [[-0.5, 2 * h], [0.5, 2 * h], [0, h]]],
  ], { glide: true });
}

function pythagoreanTemplate(ratio = 0.5): ArchTemplate {
  // Pythagorean, the two-squares tiling (p4): squares of side 1 and `ratio`
  // laid so that four small squares surround each large one and every vertex
  // is a large corner, a small corner and a large edge passing through
  // (90 + 90 + 180). Its translation lattice (1, r) / (-r, 1) is tilted
  // against the squares, so the domain is the axis-aligned superlattice square
  // of side (1 + r*r) / r — 2.5 at r = 1/2, holding five squares of each size.
  // p4 has no reflection at all.
  const r = ratio;
  const side = (1 + r * r) / r;
  const big: Vertex[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const small: Vertex[] = [[1 - r, 1], [1, 1], [1, 1 + r], [1 - r, 1 + r]];
  const polygons = periodicDomain([1, r], [-r, 1], side, side, [
    ["big", big],
    ["small", small],
  ]);
  // every quarter of a domain is a row of square centres, so the cut goes an
  // eighth up: on the centres themselves a row is kept at one rim of a cylinder
  // and dropped at the other
  return template([4, 4, 4], side, side, polygons, { mirrored: false, cut: side / 20 });
}

function rotatedhexTemplate(gap = 0.5): ArchTemplate {
  // Rotated hexagonal (p6), the tiling whose triangles are each ringed by
  // three hexagons: unit hexagons slid along their shared edges until
  // triangles of side `gap` open between them, so every vertex is a triangle
  // corner, a hexagon corner and a hexagon edge passing through
  // (60 + 120 + 180). One of the two one-parameter families running between
  // the hexagonal tiling (gap 0) and the trihexagonal one (gap 1); the hexagon
  // centres stay on a triangular lattice, of pitch sqrt(3 + gap^2), turned
  // against the hexagons — which is what makes it chiral.
  const corners: Vertex[] = [];
  for (let k = 0; k < 6; k++) corners.push(polar(60 * k));
  const n = polar(30);
  const u = polar(120);
  const c1: Vertex = [ROOT3 * n[0] + gap * u[0], ROOT3 * n[1] + gap * u[1]];
  const c2 = rotate2(c1, 60);
  const polygons: [string, Vertex[]][] = [["hex", corners]];
  const gaps: [string, Vertex[]][] = [
    ["up", [[0, 0], c1, c2]],
    ["down", [c1, c2, [c1[0] + c2[0], c1[1] + c2[1]]]],
  ];
  for (const [name, triple] of gaps) {
    const gx = (triple[0]![0] + triple[1]![0] + triple[2]![0]) / 3;
    const gy = (triple[0]![1] + triple[1]![1] + triple[2]![1]) / 3;
    polygons.push([
      name,
      triple.map((o) => {
        let best = corners[0]!;
        let bestD = Infinity;
        for (const c of corners) {
          const d = (o[0] + c[0] - gx) ** 2 + (o[1] + c[1] - gy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        return [o[0] + best[0], o[1] + best[1]] as Vertex;
      }),
    ]);
  }
  const { width, height, cells } = triangularDomain(c1, polygons);
  // a quarter domain up: the hexagon rows sit every sixth of it, and this is
  // the gap whose rim runs flattest (see THE CUT)
  return template([3, 6, 6], width, height, cells, { mirrored: false, cut: height / 4 });
}

function rotatedtriTemplate(hexagon = 0.5): ArchTemplate {
  // Rotated triangular (p6), the tiling whose hexagons are each ringed by six
  // triangles: unit triangles slid past each other until hexagons of side
  // `hexagon` open at the triangular tiling's vertices, so every vertex is a
  // hexagon corner, a triangle corner and a triangle edge passing through
  // (60 + 120 + 180). The other family between the triangular tiling
  // (hexagon 0) and the trihexagonal one (hexagon 1), with the roles of the
  // two tiles swapped against rotatedhexTemplate; pitch sqrt(3*hexagon^2 + 1).
  const h = hexagon;
  const corners: Vertex[] = [];
  for (let k = 0; k < 6; k++) corners.push(polar(60 * k, h));
  const polygons: [string, Vertex[]][] = [["hex", corners]];
  corners.forEach(([vx, vy], k) => {
    // the triangle with a corner on this hexagon corner, its edge running
    // along the hexagon's edge and out past the next corner
    const a = polar(120 + 60 * k);
    const b = polar(60 + 60 * k);
    polygons.push(["tri", [[vx, vy], [vx + a[0], vy + a[1]], [vx + b[0], vy + b[1]]]]);
  });
  const c1: Vertex = [1.5 * h - 0.5, (ROOT3 / 2) * (1 + h)];
  const { width, height, cells } = triangularDomain(c1, polygons);
  // the 6-fold centre; the biggest-tile rule would pick either tile here, both
  // having six vertices once the T-vertices are in, and a triangle centre is
  // only 3-fold
  let centre: Vertex | null = null;
  let best = Infinity;
  for (const [name, points] of cells) {
    if (!name.startsWith("hex")) continue;
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p[0];
      cy += p[1];
    }
    cx /= points.length;
    cy /= points.length;
    if (cx * cx + cy * cy < best) {
      best = cx * cx + cy * cy;
      centre = [round6(cx), round6(cy)];
    }
  }
  return template([3, 3, 6], width, height, cells, { mirrored: false, centre, cut: height / 4 });
}

function threescaletriTemplate(ratio = 0.5): ArchTemplate {
  // Three-scale triangular (p3): triangles of side `ratio`, 1 and 1 + `ratio`,
  // one of each per lattice cell. Every edge of a big triangle is covered by a
  // medium and a small one end to end, so every vertex is a small, a medium
  // and a big corner against the big edge running through (60 + 60 + 60 + 180).
  const t = ratio;
  const bigSide = 1 + t;
  const corners: Vertex[] = [[0, 0], [1, 0], [0.5, ROOT3 / 2]];
  const polygons: [string, Vertex[]][] = [["med", corners]];
  for (let i = 0; i < 3; i++) {
    const [px, py] = corners[i]!;
    const [qx, qy] = corners[(i + 1) % 3]!;
    const [rx, ry] = corners[(i + 2) % 3]!;
    const out = Math.atan2(qy - py, qx - px) / DEG;
    const on = Math.atan2(ry - qy, rx - qx) / DEG;
    // the big triangle outside this edge, running from p past q
    const b1 = polar(out, bigSide);
    const b2 = polar(out - 60, bigSide);
    polygons.push(["big", [[px, py], [px + b1[0], py + b1[1]], [px + b2[0], py + b2[1]]]]);
    // the small triangle in the wedge at q, between those two big ones
    const s1 = polar(out, t);
    const s2 = polar(on - 60, t);
    polygons.push(["small", [[qx, qy], [qx + s1[0], qy + s1[1]], [qx + s2[0], qy + s2[1]]]]);
  }
  // The translation to the medium triangle on the big triangle's next edge
  // round: that edge leaves the origin at -60°, carrying the small triangle
  // first and the medium one behind it.
  const near = polar(-60, t);
  const far = polar(-60, bigSide);
  const back = polar(-120);
  const third: Vertex = [near[0] + back[0], near[1] + back[1]];
  const c1: Vertex = [
    (near[0] + far[0] + third[0]) / 3 - (corners[0]![0] + corners[1]![0] + corners[2]![0]) / 3,
    (near[1] + far[1] + third[1]) / 3 - (corners[0]![1] + corners[1]![1] + corners[2]![1]) / 3,
  ];
  const { width, height, cells } = triangularDomain(c1, polygons);
  return template([3, 3, 3, 3], width, height, cells, { mirrored: false });
}

// -- congruent-rectangle (brick bond) tilings ---------------------------------
//
// Drop the "regular polygon" requirement and one congruent *rectangle* tiles
// the plane in as many ways as the rows can be staggered — the bonds a brick
// wall or a parquet floor is laid in. Five are built below, all with bricks of
// length 1 and height `r`, so the preset `scale` is px per brick length.
//
// Only the stacked bond is edge to edge; in the other four a brick corner lands
// in the middle of a neighbour's edge, which `insertTVertices` records exactly
// as it does for the isogonal family. They are flat-only for now (no wrap
// builders or per-surface windows). Port of the same section in
// boards/tilings.py — the conformance oracle compares them cell for cell.

/** The rectangle with its lower-left corner at (x, y). */
function brick(x: number, y: number, length: number, height: number): Vertex[] {
  return [[x, y], [x + length, y], [x + length, y + height], [x, y + height]];
}

function stackedbondTemplate(ratio = 0.5): ArchTemplate {
  // Stacked bond (pmm): bricks of length 1 and height `ratio` in a plain grid,
  // every row aligned with the one below. One brick per domain, and the only
  // bond here that *is* edge to edge — four brick corners at every vertex, the
  // square tiling stretched. Both midlines are mirror lines.
  return template([4], 1, ratio, [["brick", brick(0, 0, 1, ratio)]]);
}

function runningbondTemplate(ratio = 0.5): ArchTemplate {
  // Running bond (cmm), the brick wall: rows of bricks, each row shifted half
  // a brick against the one below, so every vertex is two brick corners
  // against the middle of a third brick's edge (90 + 90 + 180). The offset
  // square tiling stretched; like it, the domain runs from a row's centreline
  // so the template midline is a mirror line.
  // Cut on a course's top edge, as the offset square tiling is: the Mobius
  // band wants a straight rim, and the midline runs through a brick.
  const r = ratio;
  return template([4], 1, 2 * r, [
    ["brick0", brick(0, -r / 2, 1, r)],
    ["brick1", brick(-0.5, r / 2, 1, r)],
  ], { cut: r / 2 });
}

function basketweaveTemplate(group = 2): ArchTemplate {
  // Basket weave (p4g): `group` bricks of height 1/`group` laid side by side
  // make a unit square block, and the blocks alternate direction on a
  // checkerboard — the woven look, each pair of bricks crossing the pair it
  // lies against. The 2 x 2 domain holds four blocks, so 4*`group` bricks.
  // p4g has no plain horizontal mirror: reflecting the checkerboard swaps the
  // two block directions, and only the extra half-period shift of a glide puts
  // them back (hence glide). A brick centre is not a rotation centre here (a
  // half-turn about one carries its block half a block off), so the flat
  // window is pinned to a block *corner*, where four blocks meet: the
  // quarter-turn centre that takes each block to the perpendicular one.
  const r = 1 / group;
  const polygons: [string, Vertex[]][] = [];
  for (let bx = 0; bx < 2; bx++) {
    for (let by = 0; by < 2; by++) {
      for (let k = 0; k < group; k++) {
        const polygon =
          (bx + by) % 2 === 0
            ? brick(bx, by + k * r, 1, r) // a block of horizontal bricks
            : brick(bx + k * r, by, r, 1); // ... of vertical ones
        polygons.push([`b${bx}${by}_${k}`, polygon]);
      }
    }
  }
  return template([4], 2, 2, polygons, { glide: true, centre: [0, 0] });
}

function herringboneTemplate(): ArchTemplate {
  // Herringbone (pgg): each brick's end butts against the side of the next, so
  // the bricks run in two perpendicular directions and the pattern advances
  // along the diagonals in chevrons. Its unit is the L-shaped pair of one
  // horizontal and one vertical brick, on the translation lattice
  // (r, -r) / (3r, r) — diagonal, which is why the chevrons are; the
  // axis-aligned superlattice of that is the 4r x 4r (= 2 x 2) domain, holding
  // eight bricks. The 2:1 brick is what makes the L pair tile, so unlike the
  // other bonds this one has no free ratio. pgg has only glide reflections and
  // no mirror at all; every brick centre is a half-turn centre, so the default
  // biggest-tile window rule already lands on one.
  const r = 0.5;
  const polygons: [string, Vertex[]][] = [
    ["h", brick(0, 0, 1, r)],
    ["v", brick(1, 0, r, 1)],
  ];
  const cells = periodicDomain([r, -r], [3 * r, r], 2, 2, polygons);
  // brick centres lie every quarter domain, so the cut goes an eighth up
  return template([4], 2, 2, cells, { mirrored: false, cut: 0.125 });
}

// -- registry ----------------------------------------------------------------

export type ArchFamily = "uniform" | "dual" | "isogonal" | "rectangle";

export interface ArchTiling {
  key: string;
  label: string;
  config: number[];
  edgeDirections: number;
  template: () => ArchTemplate;
  /** "uniform" (Archimedean), "dual" (Laves), "isogonal" (not edge to edge) or
   * "rectangle" (a bond of congruent rectangles, not edge to edge either). The
   * uniform and isogonal families are vertex-transitive; the duals and the
   * bonds are face-transitive instead. */
  family: ArchFamily;
  /** The tiling maps onto itself under some 180° rotation — true of every
   * wallpaper group here except p3 (three-scale triangular). */
  halfTurn: boolean;
}

// Listed in vertex-configuration order, the order Wikipedia's "List of
// Euclidean uniform tilings" uses, so the menu's Uniform page reads the same
// way; the Laves block repeats it, each dual next to the position its uniform
// tiling holds above. Mirrors ARCH_TILINGS in boards/tilings.py.
export const ARCH_TILINGS: ArchTiling[] = [
  { key: "snubhex", label: "Snub hexagonal", config: [3, 3, 3, 3, 6], edgeDirections: 12, template: snubhexTemplate, family: "uniform", halfTurn: true },
  { key: "elongated", label: "Elongated triangular", config: [3, 3, 3, 4, 4], edgeDirections: 12, template: elongatedTemplate, family: "uniform", halfTurn: true },
  { key: "snubsquare", label: "Snub square", config: [3, 3, 4, 3, 4], edgeDirections: 12, template: snubsquareTemplate, family: "uniform", halfTurn: true },
  { key: "rhombitrihex", label: "Rhombitrihexagonal", config: [3, 4, 6, 4], edgeDirections: 12, template: rhombitrihexTemplate, family: "uniform", halfTurn: true },
  { key: "trihex", label: "Trihexagonal", config: [3, 6, 3, 6], edgeDirections: 12, template: trihexTemplate, family: "uniform", halfTurn: true },
  { key: "trunchex", label: "Truncated hexagonal", config: [3, 12, 12], edgeDirections: 12, template: trunchexTemplate, family: "uniform", halfTurn: true },
  { key: "trunctrihex", label: "Truncated trihexagonal", config: [4, 6, 12], edgeDirections: 12, template: trunctrihexTemplate, family: "uniform", halfTurn: true },
  { key: "truncsquare", label: "Truncated square", config: [4, 8, 8], edgeDirections: 8, template: truncsquareTemplate, family: "uniform", halfTurn: true },
  // the Laves (dual / Catalan) tilings -- face-transitive
  { key: "floret", label: "Floret pentagonal", config: [3, 3, 3, 3, 6], edgeDirections: 12, template: () => dualTemplate(snubhexTemplate, (15 * Math.sqrt(21)) / 28), family: "dual", halfTurn: true },
  { key: "prismaticpent", label: "Prismatic pentagonal", config: [3, 3, 3, 4, 4], edgeDirections: 12, template: () => dualTemplate(elongatedTemplate), family: "dual", halfTurn: true },
  { key: "cairo", label: "Cairo pentagonal", config: [3, 3, 4, 3, 4], edgeDirections: 12, template: () => dualTemplate(snubsquareTemplate, Math.sqrt(2 + ROOT3) / 4), family: "dual", halfTurn: true },
  { key: "deltoidal", label: "Deltoidal trihexagonal", config: [3, 4, 6, 4], edgeDirections: 12, template: () => dualTemplate(rhombitrihexTemplate), family: "dual", halfTurn: true },
  { key: "rhombille", label: "Rhombille", config: [3, 6, 3, 6], edgeDirections: 12, template: () => dualTemplate(trihexTemplate, (3 * ROOT3) / 4), family: "dual", halfTurn: true },
  { key: "triakis", label: "Triakis triangular", config: [3, 12, 12], edgeDirections: 12, template: () => dualTemplate(trunchexTemplate), family: "dual", halfTurn: true },
  { key: "kisrhombille", label: "Kisrhombille", config: [4, 6, 12], edgeDirections: 12, template: () => dualTemplate(trunctrihexTemplate), family: "dual", halfTurn: true },
  { key: "tetrakis", label: "Tetrakis square", config: [4, 8, 8], edgeDirections: 8, template: () => dualTemplate(truncsquareTemplate), family: "dual", halfTurn: true },
  // the isogonal tilings that are not edge to edge: vertex-transitive like the
  // uniform ones, but a tile's corner may land in the middle of its neighbour's
  // edge. config counts that neighbour, so it is the tiles meeting at a vertex
  // rather than a corner sequence.
  { key: "offsetsquare", label: "Offset square", config: [4, 4, 4], edgeDirections: 2, template: offsetsquareTemplate, family: "isogonal", halfTurn: true },
  { key: "staggeredtri", label: "Staggered triangular", config: [3, 3, 3, 3], edgeDirections: 3, template: staggeredtriTemplate, family: "isogonal", halfTurn: true },
  { key: "pythagorean", label: "Pythagorean", config: [4, 4, 4], edgeDirections: 2, template: pythagoreanTemplate, family: "isogonal", halfTurn: true },
  { key: "rotatedhex", label: "Rotated hexagonal", config: [3, 6, 6], edgeDirections: 6, template: rotatedhexTemplate, family: "isogonal", halfTurn: true },
  { key: "rotatedtri", label: "Rotated triangular", config: [3, 3, 6], edgeDirections: 6, template: rotatedtriTemplate, family: "isogonal", halfTurn: true },
  { key: "threescaletri", label: "Three-scale triangular", config: [3, 3, 3, 3], edgeDirections: 3, template: threescaletriTemplate, family: "isogonal", halfTurn: false },
  // the bonds tiled by one congruent rectangle. What tells these apart is the
  // stagger of their rows, not a vertex or tile symbol — neither is even well
  // defined across the family (the three-brick basket weave has two tile
  // orbits, its middle brick sitting differently from the outer two) — so
  // config is just the tile: one quadrilateral.
  { key: "stackedbond", label: "Stacked bond", config: [4], edgeDirections: 2, template: stackedbondTemplate, family: "rectangle", halfTurn: true },
  { key: "runningbond", label: "Running bond", config: [4], edgeDirections: 2, template: runningbondTemplate, family: "rectangle", halfTurn: true },
  { key: "basketweave", label: "Basket weave", config: [4], edgeDirections: 2, template: basketweaveTemplate, family: "rectangle", halfTurn: true },
  { key: "basketweave3", label: "Basket weave 3x3", config: [4], edgeDirections: 2, template: () => basketweaveTemplate(3), family: "rectangle", halfTurn: true },
  { key: "herringbone", label: "Herringbone", config: [4], edgeDirections: 2, template: herringboneTemplate, family: "rectangle", halfTurn: true },
];

const ARCH_BY_KEY = new Map(ARCH_TILINGS.map((t) => [t.key, t]));
const TEMPLATE_CACHE = new Map<string, ArchTemplate>();

/** The memoized fundamental-domain template for a tiling key. */
export function archTemplate(tiling: string): ArchTemplate {
  let t = TEMPLATE_CACHE.get(tiling);
  if (!t) {
    const spec = ARCH_BY_KEY.get(tiling);
    if (!spec) throw new Error(`unknown tiling ${tiling}`);
    t = spec.template();
    TEMPLATE_CACHE.set(tiling, t);
  }
  return t;
}

/** Copy `(m, n)` of a template's repeat, as absolute polygons in template
 * (edge-length) units. The one expression that turns a cell's tag references
 * into geometry; `archimedeanBoard` below needs the vertex *keys* as well and
 * so keeps its own loop, but everything that only wants the shapes — the menu
 * icons, the page pattern — goes through here. */
export function templateCells(
  t: ArchTemplate,
  m: number,
  n: number,
): { name: string; pts: Vertex[] }[] {
  return t.cells.map((cell) => ({
    name: cell.name,
    pts: cell.refs.map((r): Vertex => {
      const v = t.verts.get(r.tag)!;
      return [v[0] + (r.dm + m) * t.width, v[1] + (r.dn + n) * t.height];
    }),
  }));
}

/** A flat, roughly `nx` by `ny` domain rectangle of an Archimedean tiling,
 * built from the tiling's periodic domain (the same template that wraps the
 * donut/cylinder/Möbius/Klein). The window is centred on the larger tile
 * nearest the middle so the patch is symmetric under the tiling's point group. */
export function archimedeanBoard(
  tiling: string,
  nx: number,
  ny: number,
  mineCount: number,
  scale = 40,
): Board {
  const t = archTemplate(tiling);
  const W = t.width;
  const H = t.height;
  const position = (m: number, n: number, tag: string): Vertex => {
    const v = t.verts.get(tag)!;
    return [m * W + v[0], n * H + v[1]];
  };

  // grow two extra domains all round so the centred window is fully populated
  interface Grown {
    verts: { m: number; n: number; tag: string }[];
    centroid: Vertex;
    size: number;
  }
  const grown = new Map<CellId, Grown>();
  for (let m = 0; m < nx + 2; m++) {
    for (let n = 0; n < ny + 2; n++) {
      for (const { name, refs } of t.cells) {
        const verts = refs.map((r) => ({ m: m + r.dm, n: n + r.dn, tag: r.tag }));
        let cx = 0;
        let cy = 0;
        for (const v of verts) {
          const [x, y] = position(v.m, v.n, v.tag);
          cx += x;
          cy += y;
        }
        grown.set(cid(m, n, name), {
          verts,
          centroid: [cx / verts.length, cy / verts.length],
          size: verts.length,
        });
      }
    }
  }

  const midX = ((nx + 2) * W) / 2;
  const midY = ((ny + 2) * H) / 2;
  let cx0 = 0;
  let cy0 = 0;
  let best = Infinity;
  if (t.centre) {
    const [ccx, ccy] = t.centre;
    for (let m = 0; m < nx + 2; m++) {
      for (let n = 0; n < ny + 2; n++) {
        const x = ccx + m * W;
        const y = ccy + n * H;
        const d = (x - midX) ** 2 + (y - midY) ** 2;
        if (d < best) {
          best = d;
          cx0 = x;
          cy0 = y;
        }
      }
    }
  } else {
    let biggest = 0;
    for (const g of grown.values()) biggest = Math.max(biggest, g.size);
    for (const g of grown.values()) {
      if (g.size !== biggest) continue;
      const d = (g.centroid[0] - midX) ** 2 + (g.centroid[1] - midY) ** 2;
      if (d < best) {
        best = d;
        cx0 = g.centroid[0];
        cy0 = g.centroid[1];
      }
    }
  }

  const halfW = (nx * W) / 2;
  const halfH = (ny * H) / 2;
  // The window is closed at both ends, so a row of centroids landing exactly
  // on it is kept on *both* sides and the patch stays symmetric about the
  // centre. That makes the tolerance load-bearing rather than cosmetic: a
  // template's `centre` is stored rounded to six decimals, so the window edge
  // can miss a centroid by ~5e-7 -- far more than a 1e-9 slack -- and dropping
  // the row at one edge while keeping the row at the other is exactly the
  // half-column offset that leaves stray tiles down one side. Must match
  // `archimedean_board` in `minesweeper/boards/tilings.py` exactly, or
  // `conformance.test.ts` will see a different cell count.
  const slack = 1e-6 * Math.max(1, W, H);
  const cells = new Map<CellId, string[]>();
  const positions = new Map<string, Vertex>();
  for (const [cell, g] of grown) {
    if (
      Math.abs(g.centroid[0] - cx0) <= halfW + slack &&
      Math.abs(g.centroid[1] - cy0) <= halfH + slack
    ) {
      const keys = g.verts.map((v) => {
        const ks = `${v.m},${v.n},${v.tag}`;
        if (!positions.has(ks)) positions.set(ks, position(v.m, v.n, v.tag));
        return ks;
      });
      cells.set(cell, keys);
    }
  }
  return finalizeFlat(tiling, cells, positions, mineCount, scale);
}
