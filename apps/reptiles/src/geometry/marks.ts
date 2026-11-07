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
//   one across is `other`. Its partner is the pair the other way round.
//
// Like a round edge's bulge (`Bulge` in shape.ts), a mark is a label on an
// exact straight edge, and an edge carrying one is never cut part-way.

export const NONE = 0;
export const LINE = 1;
export const BLANK = 2;

/** The most colours a level is painted in. */
export const MAX_COLOURS = 4;

const PAIRS = 16;

/** The mark of an edge of a tile of colour `own` with a tile of colour
 * `other` across it. */
export function colourMark(own: number, other: number): number {
  if (own < 0 || other < 0 || own >= MAX_COLOURS || other >= MAX_COLOURS)
    throw new Error(`colourMark: colours run 0 to ${MAX_COLOURS - 1}`);
  return PAIRS + own * MAX_COLOURS + other;
}

/** The mark the tile across an edge must have there. */
export function partner(mark: number): number {
  if (mark < PAIRS) return mark;
  const { own, other } = colours(mark)!;
  return colourMark(other, own);
}

/** A colour pair's two colours; null for any other mark. */
export function colours(mark: number): { own: number; other: number } | null {
  if (mark < PAIRS) return null;
  const m = mark - PAIRS;
  return { own: Math.floor(m / MAX_COLOURS), other: m % MAX_COLOURS };
}

/** Whether a line crosses an edge with this mark: a `LINE`, or — where
 * `same` is asked for — a colour pair of one colour, a stripe running on. */
export function crossed(mark: number, same: boolean): boolean {
  if (mark === LINE) return true;
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
