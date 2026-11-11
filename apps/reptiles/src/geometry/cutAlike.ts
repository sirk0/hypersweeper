// Cutting every tile of a one-tile tiling alike, so that its sides meet one
// for one. A tiling that is not edge to edge — a pentagonal tiling's corner
// lands part-way along its neighbour's side — cannot carry a mark per side:
// the side runs past two tiles. Cut it at that corner, and the side becomes
// two pieces, each meeting one piece across. But a mark belongs to the tile,
// not the place, so every copy of the tile must be cut at the same points
// of its own outline, wherever it lies, or the tray would hold two tiles.
//
// So the cuts are gathered on one copy, the prototile: wherever any copy has
// a corner of another tile strictly inside one of its pieces of side, that
// point is carried back onto the prototile (with every turn and mirror that
// carries the prototile onto itself, so each way a copy can lie gives the
// same cut), and every copy is cut again — round and round until no corner
// lies inside any piece of side. Exact: a copy's pose is a turn ζᵏ, a mirror
// and a move, found by matching corners; points are compared by key and
// tested with `strictlyBetween`; floats only order points already known to be
// on one side.

import { strictlyBetween, type Cyc, type Ring } from "./cyclotomic";
import { ccw } from "./outline";

interface Pose {
  rot: number;
  flip: boolean;
  t: Cyc;
}

/** Every pose that carries `proto` onto `cell` — every corner on a corner —
 * none when it is not that shape. A mirror reverses the winding, which the
 * corner sets do not see. */
function poseOnto(ring: Ring, proto: readonly Cyc[], cell: readonly Cyc[]): Pose[] {
  if (proto.length !== cell.length) return [];
  const keys = new Set(cell.map((v) => ring.key(v)));
  const out: Pose[] = [];
  for (const flip of [false, true])
    for (let rot = 0; rot < ring.n; rot++) {
      const z = ring.zeta(rot);
      const turned = proto.map((v) => ring.mul(z, flip ? ring.conj(v) : v));
      for (const p of turned) {
        const t = ring.sub(cell[0]!, p);
        if (turned.every((q) => keys.has(ring.key(ring.add(q, t))))) out.push({ rot, flip, t });
      }
    }
  return out;
}

const apply = (ring: Ring, pose: Pose, v: Cyc): Cyc =>
  ring.add(ring.mul(ring.zeta(pose.rot), pose.flip ? ring.conj(v) : v), pose.t);

const unapply = (ring: Ring, pose: Pose, v: Cyc): Cyc => {
  const back = ring.mul(ring.zeta(-pose.rot), ring.sub(v, pose.t));
  return pose.flip ? ring.conj(back) : back;
};

/** `proto` (counter-clockwise, real corners only) with `cuts` added along
 * its sides, each side's in order from its start. */
function cutProto(ring: Ring, proto: readonly Cyc[], cuts: Map<string, Cyc>): Cyc[] {
  const out: Cyc[] = [];
  proto.forEach((a, i) => {
    const b = proto[(i + 1) % proto.length]!;
    const [ax, ay] = ring.toXY(a);
    const on = [...cuts.values()]
      .filter((p) => strictlyBetween(ring, a, b, p))
      .map((p) => {
        const [px, py] = ring.toXY(p);
        return { p, d: Math.hypot(px - ax, py - ay) };
      })
      .sort((x, y) => x.d - y.d);
    out.push(a, ...on.map(({ p }) => p));
  });
  return out;
}

/**
 * How to cut any copy of the one tile of `cells` (each a polygon, real
 * corners only, all one shape up to a turn and a mirror) so that, cut so,
 * the patch meets piece of side to piece of side: the prototile cut, and a
 * function giving any copy's corners with its cuts (counter-clockwise).
 * Throws if a cell is not the prototile, or if the cuts do not settle within
 * `rounds` — a tiling whose cuts would run on for ever.
 */
export function cutAlike(
  ring: Ring,
  cells: readonly Cyc[][],
  rounds = 12,
): { proto: Cyc[]; cut: (cell: readonly Cyc[]) => Cyc[] } {
  const proto = ccw(ring, [...cells[0]!]);
  const symmetries = poseOnto(ring, proto, proto);
  const poseOf = (cell: readonly Cyc[]): Pose => {
    const pose = poseOnto(ring, proto, ccw(ring, [...cell]))[0];
    if (!pose) throw new Error("cutAlike: a cell is not the prototile");
    return pose;
  };
  const poses = cells.map(poseOf);
  const cuts = new Map<string, Cyc>();
  const cutCell = (pose: Pose, cutAt: Cyc[]): Cyc[] =>
    ccw(
      ring,
      cutAt.map((v) => apply(ring, pose, v)),
    );
  for (let round = 0; ; round++) {
    const shaped = cutProto(ring, proto, cuts);
    const cut = cells.map((_, i) => cutCell(poses[i]!, shaped));
    const corners = new Map<string, { p: Cyc; xy: [number, number] }>();
    for (const c of cut) for (const p of c) corners.set(ring.key(p), { p, xy: ring.toXY(p) });
    const all = [...corners.values()];
    let added = 0;
    cut.forEach((c, i) => {
      c.forEach((a, j) => {
        const b = c[(j + 1) % c.length]!;
        const [ax, ay] = ring.toXY(a);
        const [bx, by] = ring.toXY(b);
        const eps = 1e-9;
        for (const { p, xy } of all) {
          // floats only prefilter by bounding box
          if (
            xy[0] < Math.min(ax, bx) - eps ||
            xy[0] > Math.max(ax, bx) + eps ||
            xy[1] < Math.min(ay, by) - eps ||
            xy[1] > Math.max(ay, by) + eps
          )
            continue;
          if (!strictlyBetween(ring, a, b, p)) continue;
          const back = unapply(ring, poses[i]!, p);
          for (const s of symmetries) {
            const q = apply(ring, s, back);
            const k = ring.key(q);
            if (!cuts.has(k)) {
              cuts.set(k, q);
              added++;
            }
          }
        }
      });
    });
    if (added === 0) {
      const settled = shaped;
      return {
        proto: settled,
        cut: (cell) => cutCell(poseOf(cell), settled),
      };
    }
    if (round + 1 >= rounds)
      throw new Error(`cutAlike: the cuts have not settled after ${rounds} rounds`);
  }
}
