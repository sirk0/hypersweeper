// The Spectre's tiling with its Mystics whole. Hypersweeper's Spectre board is
// grown by the reflection-free substitution of Smith, Myers, Kaplan and
// Goodman-Strauss, whose clusters are eight Spectres and one Mystic — two
// Spectres, one turned 30° against the other, that the substitution only ever
// lays together (Kaplan's `Gamma1` and `Gamma2`, `spectreExact`'s labels). A
// Mystic glued into one tile is the tiling's second tile: Spectres and
// Mystics, never turned over.
//
// The builder lays a Mystic's second half by turning its first by ζ about the
// origin — the first's corner 0 — and moving it onto the first's corner 8, so
// each `Gamma2` is the one whose corner 0 is its `Gamma1`'s corner 8: an exact
// key, read off the builder's own corner order. The two are glued by their
// outline (`outline`), which drops the edges they share and keeps every other
// corner, the flat ones too: a round Mystic's curves are its halves' curves.

import { spectreExact } from "@tiling/geometry";
import type { Cyc, Ring } from "./cyclotomic";
import { exactPatch } from "./exact";
import { centredWindow } from "./hat";
import { ccw, outline } from "./outline";

export interface MysticPatch {
  ring: Ring;
  /** Each tile's outline, counter-clockwise, every corner kept — a Spectre's
   * fourteen, a Mystic's its halves' less the ones they share inside. */
  cells: Cyc[][];
  /** Each tile's Spectres, counter-clockwise, fourteen corners each, in the
   * builder's order reversed (every one alike, so a corner's place in it is
   * the same corner of the Spectre on every tile): one, or a Mystic's two. */
  parts: Cyc[][][];
}

/** The `keep` tiles nearest the middle of the Spectre cluster `depth`
 * substitutions on, each Mystic one tile (`centredWindow`, as the hat's
 * family is trimmed). */
export function mysticPatch(depth: number, keep: number): MysticPatch {
  const tiles = spectreExact(depth);
  const labels = tiles.labels!;
  const { ring, cells } = exactPatch(tiles, true);
  const seconds = new Map<string, number>();
  labels.forEach((label, i) => {
    if (label === "Gamma2") seconds.set(ring.key(cells[i]![0]!), i);
  });
  const parts: Cyc[][][] = [];
  const outlines: Cyc[][] = [];
  const paired = new Set<number>();
  labels.forEach((label, i) => {
    if (label === "Gamma2") return;
    const first = ccw(ring, cells[i]!);
    if (label !== "Gamma1") {
      parts.push([first]);
      outlines.push(first);
      return;
    }
    const j = seconds.get(ring.key(cells[i]![8]!));
    if (j === undefined) throw new Error("a Mystic's first half has no second");
    paired.add(j);
    const halves = [first, ccw(ring, cells[j]!)];
    const loops = outline(ring, halves);
    if (loops.length !== 1) throw new Error("a Mystic's halves do not meet along an edge");
    parts.push(halves);
    outlines.push(loops[0]!);
  });
  if (paired.size !== seconds.size) throw new Error("a Mystic's second half has no first");
  const kept = centredWindow(ring, outlines, keep);
  return { ring, cells: kept.map((i) => outlines[i]!), parts: kept.map((i) => parts[i]!) };
}
