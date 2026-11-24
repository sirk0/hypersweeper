// Edge marks: what a coloured or lined tile says about the tile across each
// of its edges. A level of plain tiles has none. A level of coloured tiles
// (see src/colourings.ts) puts a mark on every edge of every tile, and two
// tiles may share an edge only where their marks there are partners — so a
// colouring of the board, which no single tile can check, is checked edge by
// edge as tiles go down.
//
// A mark is a small whole number:
//
// - `NONE` (0): no mark — a plain tile's edge, or the region's rim, which
//   takes any mark: a stripe may run off the board.
// - `LINE`, `END` and `BLANK`: a one-colour tile with lines on it — a line
//   meets a line, a blank edge a blank one, and `END`, a line cut back to a
//   half disc where it would end (src/colourings.ts), a half disc: so a half
//   disc never meets a line. Each is its own partner.
// - a colour pair, `colourMark(own, other)`: this tile is colour `own`, the
//   one across is `other`. Its partner is the pair the other way round. How
//   a board whose colours alternate — no two tiles of a colour touching — is
//   marked: a red tile's bands say blue goes there, a blue one's red.
// - a shared edge colour, `sharedMark(x, y)`, and `SAME`: an edge as the two
//   colours it lies between, in no order, or `SAME` between two of one
//   colour — each its own partner. No level is marked with these: the
//   colourings read them to find the ones whose tiles all read alike but for
//   their colour (src/colourings.ts, `Painting.alike`), which play as their
//   lined boards do.
// - an arrow, `arrowMark(kind, forward)`: the Penrose rhombi's matching
//   rule — each edge carries a single or a double arrow, pointing one way
//   along it, and two tiles meet only where their arrows there are the same
//   kind and point the same way. `forward`: it points the way the tile's
//   outline runs along the edge (counter-clockwise); its partner points the
//   other way round the other tile, and a mirror turns it round too.
// - a label, `labelMark(cls, forward)`: a matching rule read off an
//   aperiodic tiling's own patch (src/patchMarks.ts) — each of a tile's
//   edges one of a few classes, most pointing one way along the edge as an
//   arrow does (its partner the same class pointing the other way round the
//   other tile, a mirror turning it round), the rest without a way (`null`:
//   its own partner).
// - a jigsaw edge, `knobMark(shape, out)`: a colouring's marks drawn as the
//   edge's own outline instead of in colour (`jigsawOf` in src/levels.ts) —
//   a knob of one of `KNOBS` shapes standing out of the tile (`out`), or the
//   socket it fits, which is its partner; or a seam, `seamMark`, its own
//   partner: `SEAM_FLAT` (a straight edge that, unlike `NONE`, meets only its
//   like), `SEAM_S` (a knob on the edge's first half, a socket on its
//   second) and `SEAM_Z`, the S seen in a mirror. A knob is symmetric along
//   its edge, so a mirror leaves it as it is.
// - an arc, `arcMark(out, depth)`: the Spectre's round edge as a mark (a
//   curved level, `curvedOf` in src/levels.ts) — one symmetric arc bulging
//   out of the tile (`out`) or into it, its partner the other; drawn at
//   `ARC_DEPTHS[depth]` of the Spectre's depth. Symmetric along its edge, so
//   a mirror leaves it as it is. Unlike `Bulge`, a mark is counted by
//   `turnsOnto` and `selfTurns`, so a curved symmetric tile turns as its
//   curves say.
//
// Like a round edge's bulge (`Bulge` in shape.ts), a mark is a label on an
// exact straight edge, and an edge carrying one is never cut part-way.

export const NONE = 0;
export const LINE = 1;
export const BLANK = 2;
export const SAME = 3;
export const END = 4;

/** The most colours a level is painted in. */
export const MAX_COLOURS = 4;

const PAIRS = 16;
const SHARED = 64;
const ARROWS = 128;
const LABELS = 256;
/** The most classes a label runs to. */
export const MAX_LABELS = 64;
const EDGES = 512;
/** How many shapes of knob a jigsaw edge comes in (view/curve.ts draws
 * them): one per pair of colours, six for four colours. */
export const KNOBS = 6;
/** The sizes a level's knobs are drawn at, as a share of the full size: the
 * largest that keeps every tray tile's outline clear of itself
 * (`jigsawOf`). Every mark of a level is one size, so a size is no part of
 * what meets what — it rides in the mark only so a tile is drawn from its
 * marks alone. */
export const KNOB_SIZES = [1, 0.8, 0.64, 0.5] as const;
/** The jigsaw seams, each its own partner (see above). */
export const SEAM_FLAT = 0;
export const SEAM_S = 1;
export const SEAM_Z = 2;
const PER_SIZE = 2 * KNOBS + 3;
const EDGES_END = EDGES + KNOB_SIZES.length * PER_SIZE;

const ARCS = EDGES_END;
/** How deep a level's arcs are drawn, as a share of the Spectre's (`LIFT` in
 * view/curve.ts): the deepest that keeps every tray tile's outline clear of
 * itself (`curvedOf`) — the Spectre's own crosses itself at a triangle's
 * corner. Like a knob's size, no part of what meets what. */
export const ARC_DEPTHS = [1, 0.75, 0.55, 0.4, 0.3] as const;
const ARCS_END = ARCS + 2 * ARC_DEPTHS.length;

/** An arc out of the tile (`out`) or into it, drawn at `ARC_DEPTHS[depth]`. */
export function arcMark(out: boolean, depth = 0): number {
  if (!Number.isInteger(depth) || depth < 0 || depth >= ARC_DEPTHS.length)
    throw new Error(`arcMark: an arc's depth runs 0 to ${ARC_DEPTHS.length - 1}`);
  return ARCS + 2 * depth + (out ? 1 : 0);
}

/** An arc's way and depth; null for any other mark. */
export function arc(mark: number): { out: boolean; depth: number } | null {
  if (mark < ARCS || mark >= ARCS_END) return null;
  return { out: (mark - ARCS) % 2 === 1, depth: Math.floor((mark - ARCS) / 2) };
}

function jigsawSize(size: number): number {
  if (!Number.isInteger(size) || size < 0 || size >= KNOB_SIZES.length)
    throw new Error(`a knob's size runs 0 to ${KNOB_SIZES.length - 1}`);
  return size;
}

/** A jigsaw edge's knob of `shape`, standing out of the tile if `out`, else
 * the socket it fits, drawn at `KNOB_SIZES[size]`. */
export function knobMark(shape: number, out: boolean, size = 0): number {
  if (!Number.isInteger(shape) || shape < 0 || shape >= KNOBS)
    throw new Error(`knobMark: a knob's shape runs 0 to ${KNOBS - 1}`);
  return EDGES + jigsawSize(size) * PER_SIZE + shape * 2 + (out ? 1 : 0);
}

/** A jigsaw seam (`SEAM_FLAT`, `SEAM_S` or `SEAM_Z`) at `KNOB_SIZES[size]`. */
export function seamMark(seam: number, size = 0): number {
  if (seam !== SEAM_FLAT && seam !== SEAM_S && seam !== SEAM_Z)
    throw new Error("seamMark: a seam is flat, S or Z");
  return EDGES + jigsawSize(size) * PER_SIZE + 2 * KNOBS + seam;
}

/** A jigsaw edge as drawn — a knob's shape and whether it stands out, or a
 * seam — and its size (an index into `KNOB_SIZES`); null for any other
 * mark. */
export function jigsaw(
  mark: number,
): (({ knob: number; out: boolean } | { seam: number }) & { size: number }) | null {
  if (mark < EDGES || mark >= EDGES_END) return null;
  const size = Math.floor((mark - EDGES) / PER_SIZE);
  const m = (mark - EDGES) % PER_SIZE;
  if (m >= 2 * KNOBS) return { seam: m - 2 * KNOBS, size };
  return { knob: Math.floor(m / 2), out: m % 2 === 1, size };
}

/** The mark of an edge of a tile of colour `own` with a tile of colour
 * `other` across it. */
export function colourMark(own: number, other: number): number {
  if (own < 0 || other < 0 || own >= MAX_COLOURS || other >= MAX_COLOURS)
    throw new Error(`colourMark: colours run 0 to ${MAX_COLOURS - 1}`);
  return PAIRS + own * MAX_COLOURS + other;
}

/** The mark of an edge shared by a tile of colour `x` and one of colour
 * `y`, the same from both sides: `SAME` where they are one colour. */
export function sharedMark(x: number, y: number): number {
  if (x === y) return SAME;
  if (x < 0 || y < 0 || x >= MAX_COLOURS || y >= MAX_COLOURS)
    throw new Error(`sharedMark: colours run 0 to ${MAX_COLOURS - 1}`);
  return SHARED + Math.min(x, y) * MAX_COLOURS + Math.max(x, y);
}

/** A shared edge colour's two colours, lower first; null for any other
 * mark. */
export function shared(mark: number): { lo: number; hi: number } | null {
  if (mark < SHARED || mark >= ARROWS) return null;
  const m = mark - SHARED;
  return { lo: Math.floor(m / MAX_COLOURS), hi: m % MAX_COLOURS };
}

/** An arrow of `kind` along an edge, pointing the way the tile's outline
 * runs there if `forward`: 1 and 2 the rhombi's single and double arrows,
 * 3 and 4 the kites' and darts' on their long and short edges — kinds apart
 * so each is drawn as it fits its tiles (view/decor.ts). */
export function arrowMark(kind: number, forward: boolean): number {
  if (!Number.isInteger(kind) || kind < 1 || kind > 4)
    throw new Error("arrowMark: an arrow's kind runs 1 to 4");
  return ARROWS + kind * 2 + (forward ? 1 : 0);
}

/** An arrow's kind and way; null for any other mark. */
export function arrow(mark: number): { kind: number; forward: boolean } | null {
  if (mark < ARROWS || mark >= LABELS) return null;
  const m = mark - ARROWS;
  return { kind: Math.floor(m / 2), forward: m % 2 === 1 };
}

/** A label of class `cls` on an edge, pointing the way the tile's outline
 * runs there if `forward`, the other way if not, or no way at all (`null`). */
export function labelMark(cls: number, forward: boolean | null): number {
  if (!Number.isInteger(cls) || cls < 0 || cls >= MAX_LABELS)
    throw new Error(`labelMark: a label's class runs 0 to ${MAX_LABELS - 1}`);
  return LABELS + cls * 3 + (forward === null ? 2 : forward ? 1 : 0);
}

/** A label's class and way (`null` for none); null for any other mark. */
export function label(mark: number): { cls: number; forward: boolean | null } | null {
  if (mark < LABELS || mark >= EDGES) return null;
  const m = mark - LABELS;
  const way = m % 3;
  return { cls: Math.floor(m / 3), forward: way === 2 ? null : way === 1 };
}

/** A label turned round: its partner, and how a mirror sees it. */
function turnedLabel(mark: number): number | null {
  const l = label(mark);
  if (!l) return null;
  return l.forward === null ? mark : labelMark(l.cls, !l.forward);
}

/** The mark the tile across an edge must have there. */
export function partner(mark: number): number {
  const round = arc(mark);
  if (round) return arcMark(!round.out, round.depth);
  const jig = jigsaw(mark);
  if (jig) return "knob" in jig ? knobMark(jig.knob, !jig.out, jig.size) : mark;
  const turned = turnedLabel(mark);
  if (turned !== null) return turned;
  const way = arrow(mark);
  if (way) return arrowMark(way.kind, !way.forward);
  if (mark < PAIRS || mark >= SHARED) return mark;
  const { own, other } = colours(mark)!;
  return colourMark(other, own);
}

/** A colour pair's two colours; null for any other mark. */
export function colours(mark: number): { own: number; other: number } | null {
  if (mark < PAIRS || mark >= SHARED) return null;
  const m = mark - PAIRS;
  return { own: Math.floor(m / MAX_COLOURS), other: m % MAX_COLOURS };
}

/** A mark seen in a mirror: an arrow or a label points the other way round
 * the tile (the outline runs backwards along it), and an S seam is a Z; any
 * other mark has no handedness. */
export function mirrored(mark: number): number {
  const jig = jigsaw(mark);
  if (jig && "seam" in jig && jig.seam !== SEAM_FLAT)
    return seamMark(jig.seam === SEAM_S ? SEAM_Z : SEAM_S, jig.size);
  const turned = turnedLabel(mark);
  if (turned !== null) return turned;
  const way = arrow(mark);
  return way ? arrowMark(way.kind, !way.forward) : mark;
}

/** A piece's marks as a mirror lists them: the edges backwards, as
 * `posedCurve` lists a curve, each mark `mirrored`. */
export function posedMarks(marks: number[] | undefined, flip: boolean): number[] | undefined {
  if (!marks || !flip) return marks;
  const m = marks.length;
  return marks.map((_, j) => mirrored(marks[(((m - 2 - j) % m) + m) % m]!));
}
