import { difficulty as difficultySpec, hasDifficulty } from "../config/screens";
import {
  APERIODIC_MODES,
  FAMILY_LABELS,
  FRACTAL_MODES,
  fullModeLabel,
  SHAPED_MODES,
  SOLID_GROUPS,
  SURFACES,
  surfaceOf,
  TILINGS_BY_KEY,
  tilingOf,
} from "../boards/catalog";
import { isBoard3D, type AnyBoard, type CellId } from "../boards/core";
import { fairnessHint, fairnessOf } from "../boards/fairness";
import { ARCH_TILINGS, archTemplate, templateCells } from "../boards/tilings";
import { classifyShapes, corners, type ShapeTone } from "../render/shapePalette";

// What the board on screen actually *is*, in words: the header's info button
// opens this (ui/infoDialog.ts).
//
// The player is dealt a random board by Flat and 3D and a link can drop them on
// any of the 179, so "which tiling is this, and what are its tiles?" is a
// question the game now has to be able to answer. The caption names the board;
// this says what the name means — the family it comes from (Uniform, Laves,
// Isogonal…), the surface it is wrapped on, how many cells there are, and how
// many of each shape.
//
// Everything here is derived, never tabulated: the counts are measured off the
// board that is being played, and the shape names off the tiling's own geometry.
// A new tiling therefore describes itself with no edit to this file.

/** One kind of tile on the board: how it is drawn, and how many there are. */
export interface ShapeFact {
  /** Plural (or singular, at a count of one) name — "Regular hexagons". */
  label: string;
  count: number;
  /** The tone the board paints this shape, for the row's colour swatch. */
  tone: ShapeTone;
}

export interface BoardFacts {
  /** The board's name, as the caption gives it (tiling · surface). */
  name: string;
  difficulty: string;
  /** The family the tiling comes from — "Laves", "Uniform", "Aperiodic" — or
   * the solid group ("Catalan solids") for a board that is a polyhedron. */
  family: string | null;
  /** The tiling, where the name alone does not already say it. */
  tiling: string | null;
  /** The surface the tiling is wrapped on ("Torus"), or null for a solid. */
  surface: string | null;
  cells: number;
  mines: number;
  shapes: ShapeFact[];
  /** Why this board is graded as harder than its difficulty, when it is. */
  warning: string | undefined;
}

/** What a tile looks like, as far as its *name* is concerned. Regularity is two
 * independent halves — a rectangle has four equal angles and a rhombus four
 * equal sides — and keeping them apart is what lets a brick bond say "rectangles"
 * rather than the useless "quadrilaterals". `isosceles` and `kite` are the two
 * further shapes the catalogue is full of and English has a word for: half the
 * Laves triangles are isosceles, and a deltoidal solid is made of kites.
 *
 * Angles are measured unsigned (as `shapeMetrics` measures them), so a reflex
 * corner reads as its complement — which is why nothing here claims a polygon
 * is *equiangular* on angles alone past the quadrilaterals: the chair's
 * L-tromino would qualify, and it is nothing of the sort. Side lengths carry no
 * such ambiguity. */
interface ShapeKind {
  sides: number;
  equalSides: boolean;
  equalAngles: boolean;
  /** Exactly two of a triangle's three sides are equal. */
  isosceles: boolean;
  /** Two pairs of *adjacent* equal sides — a kite, and not a rhombus. */
  kite: boolean;
}

/** How far from equal two sides (relatively) or two angles (in radians) may be
 * and still count as the same. Loose enough to survive a solid's projection —
 * a Catalan face is measured off real geometry — and far tighter than the gap
 * between any tile's own extremes: the flattest "regular" tile in the catalogue
 * is exact, and the roundest irregular one (a 2-to-1 brick) is 50% out. */
const EQUAL_SIDES = 0.01;
const EQUAL_ANGLES = 0.02;

const NOUNS: Record<number, string> = {
  3: "triangle",
  4: "quadrilateral",
  5: "pentagon",
  6: "hexagon",
  7: "heptagon",
  8: "octagon",
  9: "nonagon",
  10: "decagon",
  11: "hendecagon",
  12: "dodecagon",
};

const noun = (sides: number): string => NOUNS[sides] ?? `${sides}-gon`;

/** The name a tile of this kind goes by. The shapes English has a word for —
 * the rectangle, the rhombus, the kite, the isosceles triangle — are named by
 * it; everything else is the polygon's own noun, qualified by how regular it
 * is. */
export function shapeName(kind: ShapeKind, plural: boolean): string {
  const { sides, equalSides, equalAngles, isosceles, kite } = kind;
  const regular = equalSides && equalAngles;
  let base: string;
  if (sides === 3) {
    if (regular) base = "equilateral triangle";
    else if (isosceles) base = "isosceles triangle";
    else base = "irregular triangle";
  } else if (sides === 4) {
    if (regular) base = "square";
    else if (equalAngles) base = "rectangle";
    else if (equalSides) base = "rhombus";
    else if (kite) base = "kite";
    else base = "quadrilateral";
  } else {
    const qualifier = regular ? "regular" : equalSides ? "equilateral" : "irregular";
    base = `${qualifier} ${noun(sides)}`;
  }
  const word = plural ? pluralise(base) : base;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function pluralise(word: string): string {
  return word.endsWith("us") ? `${word.slice(0, -2)}i` : `${word}s`;
}

const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.sqrt(a.reduce((sum, v, k) => sum + (v - (b[k] ?? 0)) ** 2, 0));

/** Measure one drawn tile. Works in 2D and 3D off the same dot products
 * `shapeMetrics` uses, and drops the collinear T-vertices first for the same
 * reason: a split square is a square, not an irregular pentagon. */
function kindOf(polygon: readonly (readonly number[])[], mask?: readonly boolean[]): ShapeKind {
  const poly = corners(polygon, mask);
  const n = poly.length;
  const plain = { equalSides: true, equalAngles: true, isosceles: false, kite: false };
  if (n < 3) return { sides: n, ...plain };
  const lengths: number[] = [];
  let minAngle = Infinity;
  let maxAngle = 0;
  for (let i = 0; i < n; i++) {
    const prev = poly[(i + n - 1) % n]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % n]!;
    const side = distance(cur, next);
    const back = distance(cur, prev);
    lengths.push(side);
    if (side === 0 || back === 0) continue;
    let dot = 0;
    for (let k = 0; k < cur.length; k++) dot += (prev[k]! - cur[k]!) * (next[k]! - cur[k]!);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot / (back * side))));
    minAngle = Math.min(minAngle, angle);
    maxAngle = Math.max(maxAngle, angle);
  }
  const longest = Math.max(...lengths);
  const same = (a: number, b: number): boolean => Math.abs(a - b) <= EQUAL_SIDES * longest;
  const equalSides = longest - Math.min(...lengths) <= EQUAL_SIDES * longest;
  return {
    sides: n,
    equalSides,
    equalAngles: maxAngle - minAngle <= EQUAL_ANGLES,
    isosceles:
      n === 3 &&
      !equalSides &&
      (same(lengths[0]!, lengths[1]!) ||
        same(lengths[1]!, lengths[2]!) ||
        same(lengths[2]!, lengths[0]!)),
    // A kite's equal sides are adjacent, which is what separates it from a
    // parallelogram's two pairs of opposite ones.
    kite:
      n === 4 &&
      !equalSides &&
      ((same(lengths[0]!, lengths[1]!) && same(lengths[2]!, lengths[3]!)) ||
        (same(lengths[1]!, lengths[2]!) && same(lengths[3]!, lengths[0]!))),
  };
}

/** The smallest corner of a tile, in whole degrees: what tells two tiles of the
 * same name apart where nothing else does (the Penrose rhombi, 36° and 72°). */
function acuteDegrees(polygon: readonly (readonly number[])[], mask?: readonly boolean[]): number {
  const poly = corners(polygon, mask);
  let min = Math.PI;
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const cur = poly[i]!;
    const next = poly[(i + 1) % poly.length]!;
    const back = distance(cur, prev);
    const side = distance(cur, next);
    if (side === 0 || back === 0) continue;
    let dot = 0;
    for (let k = 0; k < cur.length; k++) dot += (prev[k]! - cur[k]!) * (next[k]! - cur[k]!);
    min = Math.min(min, Math.acos(Math.min(1, Math.max(-1, dot / (back * side)))));
  }
  return Math.round((min * 180) / Math.PI);
}

/** The tiles of a *flat* tiling, by side count — the shape a wrapped board's
 * cells would have if the surface were unrolled.
 *
 * A curved immersion bends every tile: a hexagonal torus measures nowhere near
 * regular, and naming its cells off the drawn geometry would call the hexagonal
 * tiling irregular. So a wrapped board is named from the tiling's own periodic
 * domain instead — one template, no board to build. Side count is enough to
 * match the two up: the immersion never changes it, and `classifyShapes` gives
 * a curved board one class per side count anyway.
 *
 * Null when the tiling has no template here (the three regular tilings, whose
 * tiles are regular by definition — see `REGULAR_KIND`). */
function templateKinds(tilingKey: string): Map<number, ShapeKind | null> | null {
  if (!ARCH_TILINGS.some((t) => t.key === tilingKey)) return null;
  const kinds = new Map<number, ShapeKind | null>();
  for (const cell of templateCells(archTemplate(tilingKey), 0, 0)) {
    const kind = kindOf(cell.pts);
    if (!kinds.has(kind.sides)) kinds.set(kind.sides, kind);
    else if (!sameKind(kinds.get(kind.sides), kind)) kinds.set(kind.sides, null);
  }
  return kinds;
}

function sameKind(a: ShapeKind | null | undefined, b: ShapeKind): boolean {
  return (
    a != null &&
    a.equalSides === b.equalSides &&
    a.equalAngles === b.equalAngles &&
    a.isosceles === b.isosceles &&
    a.kite === b.kite
  );
}

/** The fallback when a class's tiles do not agree on what they are: the shape
 * claims nothing beyond its side count. */
function anyShape(sides: number): ShapeKind {
  return { sides, equalSides: false, equalAngles: false, isosceles: false, kite: false };
}

/** A regular tiling's tile is the regular polygon it is named for. */
const REGULAR_KIND: Record<string, number> = { tri: 3, square: 4, hex: 6 };

/** One class of tile, as `classifyShapes` groups them (see its comment: on a
 * curved board that is one class per side count, on a flat one it also splits
 * the Penrose rhombi and the isogonal tilings' two sizes apart). */
interface ShapeGroup {
  tone: ShapeTone;
  count: number;
  cells: CellId[];
}

function groupCells(board: AnyBoard): ShapeGroup[] {
  const masks = isBoard3D(board) ? board.cornerMask : null;
  const tones = classifyShapes(board.polygons, masks);
  const groups = new Map<string, ShapeGroup>();
  for (const [cell] of board.polygons) {
    const tone = tones.get(cell);
    if (!tone) continue;
    const key = `${tone.sides}|${tone.variant ?? 0}|${tone.size ?? 0}`;
    const group = groups.get(key);
    if (group) {
      group.count++;
      group.cells.push(cell);
    } else groups.set(key, { tone, count: 1, cells: [cell] });
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.tone.sides - b.tone.sides ||
      (a.tone.size ?? 0) - (b.tone.size ?? 0) ||
      (a.tone.variant ?? 0) - (b.tone.variant ?? 0),
  );
}

/** Where a size class sits among its shape's sizes, in words. The isogonal
 * tilings put two or three sizes of one polygon on a board, and "Squares" twice
 * over is no use to anyone. */
function sizeWord(size: number, count: number): string {
  if (count === 2) return size === 0 ? "small" : "large";
  if (count === 3) return ["small", "medium", "large"][size] ?? `#${size + 1}`;
  return `#${size + 1}`;
}

/** The board's tiles, counted and named. */
export function shapeFacts(mode: string, board: AnyBoard): ShapeFact[] {
  const masks = isBoard3D(board) ? board.cornerMask : null;
  const surface = surfaceOf(mode);
  const tilingKey = tilingOf(mode);
  // A wrapped board is named from the flat tiling it is cut from; everything
  // else — a flat board, a solid, an aperiodic or fractal patch — is what it is
  // drawn as, and is measured directly.
  const wrapped = surface !== null && surface.key !== "flat";
  // A wrapped regular tiling needs no template: its tile is the regular polygon
  // the tiling is named for.
  const regular = wrapped && tilingKey !== null && REGULAR_KIND[tilingKey] !== undefined;
  const kinds = wrapped && tilingKey && !regular ? templateKinds(tilingKey) : null;

  const groups = groupCells(board);
  const kindOfGroup = (group: ShapeGroup): ShapeKind => {
    const sides = group.tone.sides;
    if (regular) {
      return { sides, equalSides: true, equalAngles: true, isosceles: false, kite: false };
    }
    if (kinds) return kinds.get(sides) ?? anyShape(sides);
    return measuredKind(group, board, masks);
  };

  // Two classes that come out with the same name need telling apart: by size
  // where they are two sizes of one tile, by their sharpest corner otherwise
  // (the Penrose rhombi, which differ in nothing else).
  const names = groups.map((group) => shapeName(kindOfGroup(group), group.count !== 1));
  return groups.map((group, i) => {
    let label = names[i]!;
    if (names.filter((n) => n === label).length > 1) {
      const { size, sizeCount } = group.tone;
      if (size !== undefined && (sizeCount ?? 1) > 1) {
        label = `${label} · ${sizeWord(size, sizeCount ?? 1)}`;
      } else {
        const cell = group.cells[0]!;
        label = `${label} · ${acuteDegrees(board.polygons.get(cell)!, masks?.get(cell))}°`;
      }
    }
    return { label, count: group.count, tone: group.tone };
  });
}

/** The kind a class of drawn tiles is. Where its cells do not agree — a
 * geodesic sphere's triangles, twenty of the eighty left exact by the
 * projection — the honest answer is the irregular one. */
function measuredKind(
  group: ShapeGroup,
  board: AnyBoard,
  masks: Map<CellId, readonly boolean[]> | null,
): ShapeKind {
  const sides = group.tone.sides;
  let kind: ShapeKind | null = null;
  for (const cell of group.cells) {
    const poly = board.polygons.get(cell);
    if (!poly) continue;
    const measured = kindOf(poly, masks?.get(cell));
    if (kind === null) kind = measured;
    else if (!sameKind(kind, measured)) return anyShape(sides);
  }
  return kind ?? anyShape(sides);
}

/** Which family a mode belongs to, by label: an `ARCH_TILINGS` family for a
 * periodic tiling, the flat-only families for the one-off boards, and the solid
 * group for a polyhedron. */
function familyOf(mode: string): string | null {
  const tilingKey = tilingOf(mode) ?? shapedTiling(mode);
  if (tilingKey) {
    const family = ARCH_TILINGS.find((t) => t.key === tilingKey)?.family ?? "regular";
    return FAMILY_LABELS[family] ?? null;
  }
  if (APERIODIC_MODES.includes(mode)) return FAMILY_LABELS["aperiodic"] ?? null;
  if (FRACTAL_MODES.includes(mode)) return FAMILY_LABELS["fractal"] ?? null;
  return SOLID_GROUPS.find((g) => g.modes.includes(mode))?.label ?? null;
}

/** The regular tiling a shaped flat board (the triangle, the hex-hex) is cut
 * from — those are modes of their own, so `tilingOf` does not know them. */
function shapedTiling(mode: string): string | null {
  for (const [key, modes] of Object.entries(SHAPED_MODES)) {
    if (modes.includes(mode)) return key;
  }
  return null;
}

/** Everything the info window says about a board. `board` is the live one, so
 * the counts are of the board actually being played rather than of a rebuild. */
export function boardFacts(
  mode: string,
  difficulty: string,
  board: AnyBoard,
  mines: number,
): BoardFacts {
  const surface = surfaceOf(mode);
  const tilingKey = tilingOf(mode) ?? shapedTiling(mode);
  const tiling = tilingKey ? (TILINGS_BY_KEY.get(tilingKey)?.label ?? null) : null;
  return {
    name: fullModeLabel(mode),
    difficulty: hasDifficulty(difficulty) ? difficultySpec(difficulty).label : difficulty,
    family: familyOf(mode),
    // The name already carries the tiling wherever there is one to carry; the
    // row exists for the shaped boards, whose name ("Hexagonal hexagon") does
    // not say which tiling they are cut from.
    tiling: tilingOf(mode) === null ? tiling : null,
    // A shaped, aperiodic or fractal board is a mode of its own with no
    // `SurfaceSpec` behind it, and it is still on the plane; a solid is not on
    // any of these surfaces at all, and its family row names what it is.
    surface: surface?.label ?? (isBoard3D(board) ? null : (SURFACES.get("flat")?.label ?? null)),
    cells: board.polygons.size,
    mines,
    shapes: shapeFacts(mode, board),
    warning: fairnessHint(fairnessOf(mode, difficulty)),
  };
}
