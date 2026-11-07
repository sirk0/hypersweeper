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
// - `LINE` and `BLANK`: a one-colour tile with lines on it — a line meets a
//   line, a blank edge a blank one. Each is its own partner.
// - a colour pair, `colourMark(own, other)`: this tile is colour `own`, the
//   one across is `other`. Its partner is the pair the other way round. How
//   a board whose colours alternate — no two tiles of a colour touching — is
//   marked: a red tile's bands say blue goes there, a blue one's red.
// - a shared edge colour, `sharedMark(x, y)`, and `SAME`: on a board where
//   tiles of one colour do touch (stripes, pairs), an edge's mark belongs to
//   the edge, not to either tile — the two colours it lies between, in no
//   order, or `SAME` between two of one colour — and each is its own
//   partner: a band meets the same band. So tiles whose edges read alike are
//   one tile, whatever colour they were (red and blue squares striped across
//   are one square, banded on two sides), and only turning tells them apart.
//
// Like a round edge's bulge (`Bulge` in shape.ts), a mark is a label on an
// exact straight edge, and an edge carrying one is never cut part-way.

export const NONE = 0;
export const LINE = 1;
export const BLANK = 2;
export const SAME = 3;

/** The most colours a level is painted in. */
export const MAX_COLOURS = 4;

const PAIRS = 16;
const SHARED = 64;

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
  if (mark < SHARED) return null;
  const m = mark - SHARED;
  return { lo: Math.floor(m / MAX_COLOURS), hi: m % MAX_COLOURS };
}

/** The mark the tile across an edge must have there. */
export function partner(mark: number): number {
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

/** Whether a line crosses an edge with this mark: a `LINE`, or — where
 * `same` is asked for — an edge between two tiles of one colour, a stripe
 * running on. */
export function crossed(mark: number, same: boolean): boolean {
  if (mark === LINE) return true;
  if (mark === SAME) return same;
  const pair = colours(mark);
  return same && pair !== null && pair.own === pair.other;
}

/** A piece's marks as a mirror lists them: the edges backwards, as
 * `posedCurve` lists a curve. A mark has no handedness, so each keeps. */
export function posedMarks(marks: number[] | undefined, flip: boolean): number[] | undefined {
  if (!marks || !flip) return marks;
  const m = marks.length;
  return marks.map((_, j) => marks[(((m - 2 - j) % m) + m) % m]!);
}
