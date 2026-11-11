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
  if (mark < LABELS) return null;
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

/** A mark seen in a mirror: an arrow or a label points the other way round the tile
 * (the outline runs backwards along it); any other mark has no handedness. */
export function mirrored(mark: number): number {
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
