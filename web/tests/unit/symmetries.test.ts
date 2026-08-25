import { describe, expect, it } from "vitest";
import { SOLID_MODES, surfaceOf } from "../../src/boards/catalog";
import {
  isAutomorphism,
  isBoard3D,
  symmetryOf,
  SYMMETRY_IDS,
  type BoardSymmetry,
  type CellId,
  type SymmetryId,
} from "../../src/boards/core";
import { buildBoard, MODES } from "../../src/boards/presets";
import { screens } from "../../src/config/screens";
import { boardConditions, ICONS, slotVisible } from "../../src/ui/hud";

// The board symmetries, over the whole catalogue rather than one board at a
// time (tests/unit/surfaces.test.ts does that). Two things are being pinned:
// that every symmetry a board ships really is an automorphism of its own
// adjacency — the numbers still count the mines around them however far the
// contents have been moved — and that which surfaces have which is the answer
// the gluing gives, not one anybody chose.

/** The surface family a mode wraps onto, or null for a flat board or a solid. */
function surfaceKey(mode: string): string | null {
  return surfaceOf(mode)?.key ?? null;
}

const WRAPPED = MODES.filter((mode) => {
  const key = surfaceKey(mode);
  return key !== null && key !== "flat";
});

/** The closed solids: the spheres, the Platonic and Catalan solids, the frames
 * and the polycubes — every board the menu's solid groups deal. */
const SOLIDS = SOLID_MODES.filter((mode) => MODES.includes(mode));

/** Applying a permutation twice. */
function squared(cycle: Map<CellId, CellId>): Map<CellId, CellId> {
  return new Map([...cycle].map(([cell, image]) => [cell, cycle.get(image)!]));
}

function measuredInvolution(cycle: Map<CellId, CellId>): boolean {
  return [...squared(cycle)].every(([cell, image]) => cell === image);
}

/** How many steps take a cell back to where it started. */
function cycleOrder(cycle: Map<CellId, CellId>): number {
  const start = cycle.keys().next().value as CellId;
  let at = cycle.get(start)!;
  let order = 1;
  while (at !== start) {
    at = cycle.get(at)!;
    order++;
  }
  return order;
}

/** Every power of the ring translation, the identity first — the subgroup a
 * board's contents can be turned into by pressing one arrow. */
function ringPowers(ring: Map<CellId, CellId>): Map<CellId, CellId>[] {
  const identity = new Map([...ring.keys()].map((cell) => [cell, cell]));
  const powers = [identity];
  for (let power = new Map(ring); ; power = new Map([...power].map(([c, i]) => [c, ring.get(i)!]))) {
    if ([...power].every(([cell, image]) => cell === image)) return powers;
    powers.push(power);
  }
}

describe("board symmetries", () => {
  it("the catalogue has wrapped boards to check", () => {
    // a guard on the filter above: a typo there would empty every sweep below
    expect(WRAPPED.length).toBeGreaterThan(100);
  });

  it("every symmetry every wrapped board ships is a graph automorphism", () => {
    for (const mode of WRAPPED) {
      const board = buildBoard(mode, "easy");
      expect(isBoard3D(board)).toBe(true);
      if (!isBoard3D(board)) continue;
      for (const symmetry of board.symmetries) {
        expect(
          isAutomorphism(board.adjacency, symmetry.cycle),
          `${mode}: ${symmetry.id} is not an automorphism`,
        ).toBe(true);
        expect(
          symmetry.involution,
          `${mode}: ${symmetry.id} involution flag`,
        ).toBe(measuredInvolution(symmetry.cycle));
        // a symmetry that moves nothing is a button that does nothing
        expect([...symmetry.cycle].some(([c, image]) => c !== image)).toBe(true);
      }
      // listed in the order the controls are drawn, at most one of each
      const ids = board.symmetries.map((s) => s.id);
      expect(ids).toEqual([...SYMMETRY_IDS].filter((id) => ids.includes(id)));
    }
  });

  it("every wrapped board turns about its own axis", () => {
    // the ring translation is the one motion every one of the four surfaces
    // keeps: it is what the Klein bottle shipped with, and the other three glue
    // their ring seam the same way
    for (const mode of WRAPPED) {
      const board = buildBoard(mode, "easy");
      const ids = isBoard3D(board) ? board.symmetries.map((s) => s.id) : [];
      expect(ids, `${mode} has no ring step`).toContain("ring");
    }
  });

  it("only the closed surfaces translate round the tube", () => {
    // a cylinder and a Möbius band are open across, so there is nothing to
    // translate into; a torus and a Klein bottle wrap both ways
    for (const mode of WRAPPED) {
      const board = buildBoard(mode, "easy");
      const ids = isBoard3D(board) ? board.symmetries.map((s) => s.id) : [];
      const open = ["cylinder", "mobius"].includes(surfaceKey(mode)!);
      if (open) expect(ids, `${mode} translates across an open band`).not.toContain("tube");
    }
  });

  it("a Klein bottle's tube step is never more than half way round", () => {
    // The ring seam reverses the tube, so conjugating a whole-tube step by it
    // gives that step back inverted and it does not descend to the bottle. What
    // does is the *half* step, which is its own inverse — or, where an odd
    // number of rows would land the tiling off its own lattice, that step with
    // a glide along the ring. Either way, twice is no further round the tube:
    // the square is a ring translation (the identity, for the plain half turn).
    let checked = 0;
    for (const mode of WRAPPED) {
      if (surfaceKey(mode) !== "klein") continue;
      const board = buildBoard(mode, "easy");
      if (!isBoard3D(board)) continue;
      const tube = board.symmetries.find((s) => s.id === "tube");
      if (!tube) continue;
      const ring = board.symmetries.find((s) => s.id === "ring")!.cycle;
      expect(ringPowers(ring), `${mode}: tube twice is a further tube move`)
        .toContainEqual(squared(tube.cycle));
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("every solid has a point group of its own, and it is measured", () => {
    // Thirteen Catalan solids, five Platonic ones, the frames, the pyramids and
    // the brick cubes: every one gets whatever its own shape has, found by
    // measuring rather than out of a table (boards/symmetry.ts solidSymmetries).
    for (const mode of SOLIDS) {
      const board = buildBoard(mode, "easy");
      expect(isBoard3D(board), mode).toBe(true);
      if (!isBoard3D(board)) continue;
      expect(board.symmetries.length, `${mode} has no symmetry at all`).toBeGreaterThan(0);
      const ids = board.symmetries.map((s) => s.id);
      // a solid has no translation: every control it carries is a rotation or a
      // reflection, and `ring`/`tube` name axes rather than steps along a seam
      expect(ids).toEqual([...SYMMETRY_IDS].filter((id) => ids.includes(id)));
      for (const symmetry of board.symmetries) {
        expect(
          isAutomorphism(board.adjacency, symmetry.cycle),
          `${mode}: ${symmetry.id} is not an automorphism`,
        ).toBe(true);
        expect(symmetry.involution, `${mode}: ${symmetry.id}`).toBe(
          measuredInvolution(symmetry.cycle),
        );
      }
    }
  });

  it("no board offers the same move under two names", () => {
    // A patch with a single mirror line answers to both mirror ids, and a solid
    // with a single axis to all three rotation ids; two buttons that do the same
    // thing are one button and a puzzle.
    for (const mode of MODES) {
      const board = buildBoard(mode, "easy");
      const cycles = board.symmetries.map((s) => s.cycle);
      for (let i = 0; i < cycles.length; i++) {
        for (let j = i + 1; j < cycles.length; j++) {
          const same = [...cycles[i]!].every(([cell, image]) => cycles[j]!.get(cell) === image);
          expect(same, `${mode}: ${board.symmetries[i]!.id} = ${board.symmetries[j]!.id}`).toBe(
            false,
          );
        }
      }
    }
  });

  it("the cube turns a quarter about three axes and mirrors in two planes", () => {
    // What anyone would say about a cube if asked, and what the measurement has
    // to come back with.
    const board = buildBoard("cube", "easy");
    expect(isBoard3D(board)).toBe(true);
    if (!isBoard3D(board)) return;
    expect(board.symmetries.map((s) => s.id)).toEqual([
      "ring",
      "tube",
      "turn",
      "mirror-ring",
      "mirror-tube",
    ]);
    for (const id of ["ring", "tube", "turn"] as const) {
      expect(cycleOrder(symmetryOf(board, id)!.cycle), `${id} is not a quarter turn`).toBe(4);
    }
    for (const id of ["mirror-ring", "mirror-tube"] as const) {
      expect(symmetryOf(board, id)!.involution).toBe(true);
    }
  });

  it("each solid gets its own group, not the cube's", () => {
    // The orders the shapes themselves have: a tetrahedron thirds where a cube
    // quarters, an icosahedron fifths, and a *chiral* solid — the pentagonal
    // hexecontahedron is the snub operation's dual — has no mirror anywhere.
    const spin = (mode: string) => cycleOrder(symmetryOf(buildBoard(mode, "easy"), "ring")!.cycle);
    expect(spin("tetrahedron")).toBe(3);
    expect(spin("octahedron")).toBe(4);
    expect(spin("icosahedron")).toBe(5);
    expect(spin("dodecahedron")).toBe(5);
    // a square pyramid has one axis and no second kind of mirror at all
    const pyramid = buildBoard("steppedpyramid", "easy");
    expect(pyramid.symmetries.map((s) => s.id)).toEqual(["ring", "mirror-ring"]);
    expect(spin("steppedpyramid")).toBe(4);
    for (const chiral of ["sphere", "snubdodec", "pentagonalicositetra"]) {
      const ids = buildBoard(chiral, "easy").symmetries.map((s) => s.id);
      expect(ids, `${chiral} should have no mirror`).not.toContain("mirror-ring");
      expect(ids, `${chiral} should have no mirror`).not.toContain("mirror-tube");
      expect(ids).toContain("ring");
    }
  });

  it("a cube frame finds the axes through the holes in its faces", () => {
    // Its four-fold axes pass through the middle of each face, where the frame
    // has no cell, no corner and no edge — nothing pointing at them. They are
    // found as the line two of its mirror planes meet in.
    expect(cycleOrder(symmetryOf(buildBoard("cubeframe", "easy"), "ring")!.cycle)).toBe(4);
  });

  it("a flat board has its own rotations and mirrors, and no translation", () => {
    // A finite patch cannot be slid onto itself, so `ring` and `tube` never
    // appear (on a solid they name rotation axes instead); what a flat board
    // has is its point group, measured off the drawing.
    for (const mode of MODES) {
      const board = buildBoard(mode, "easy");
      if (isBoard3D(board)) continue;
      const ids = board.symmetries.map((s) => s.id);
      expect(ids, mode).not.toContain("ring");
      expect(ids, mode).not.toContain("tube");
      for (const symmetry of board.symmetries) {
        expect(
          isAutomorphism(board.adjacency, symmetry.cycle),
          `${mode}: ${symmetry.id} is not an automorphism`,
        ).toBe(true);
        expect(symmetry.involution, `${mode}: ${symmetry.id}`).toBe(
          measuredInvolution(symmetry.cycle),
        );
      }
    }
  });

  it("the classic square board turns a quarter and the wide one only a half", () => {
    // The board the player knows: 9x9 and 16x16 are square, so a quarter turn
    // lands on the board itself; 30x16 is not, and only the half turn does.
    const quarter = buildBoard("square", "easy").symmetries.find((s) => s.id === "turn")!;
    expect(quarter).toBeDefined();
    expect(quarter.involution).toBe(false);
    expect(cycleOrder(quarter.cycle)).toBe(4);
    // the corner opposite, a quarter of the way round
    expect(quarter.cycle.get("0,0")).toBeDefined();
    expect(quarter.cycle.get(quarter.cycle.get("0,0")!)).not.toBe("0,0");

    const half = buildBoard("square", "hard").symmetries.find((s) => s.id === "turn")!;
    expect(half).toBeDefined();
    expect(half.involution).toBe(true);
    // and both mirrors, which a rectangle keeps
    expect(buildBoard("square", "hard").symmetries.map((s) => s.id)).toEqual([
      "turn",
      "mirror-ring",
      "mirror-tube",
    ]);
  });

  it("a chiral flat board has rotations and no mirror", () => {
    // The Gosper island: its inflation is a spiral similarity, so the patch
    // keeps the hexagon's six-fold turn and never a mirror past level 1 (see
    // boards/fractal.ts). Measured here, not declared there.
    const ids = buildBoard("gosper", "easy").symmetries.map((s) => s.id);
    expect(ids).toEqual(["turn"]);
  });
});

describe("the board bar's symmetry controls", () => {
  const slots = screens.hud.boardBar;

  it("offers a control for every symmetry there is, and a back one per translation", () => {
    for (const id of SYMMETRY_IDS) {
      expect(slots.some((s) => s.action === `symmetry:${id}:1`), id).toBe(true);
      // a mirror is its own undo and gets no second button
      expect(slots.some((s) => s.action === `symmetry:${id}:-1`), id).toBe(
        !id.startsWith("mirror-"),
      );
    }
  });

  it("no board ships a mirror that is not its own undo", () => {
    // what a p4g template offers across the tube is a *glide* reflection, and
    // one button cannot honestly be both that and a mirror — see keepSymmetries
    for (const mode of WRAPPED) {
      const board = buildBoard(mode, "easy");
      if (!isBoard3D(board)) continue;
      for (const symmetry of board.symmetries) {
        if (!symmetry.id.startsWith("mirror-")) continue;
        expect(symmetry.involution, `${mode}: ${symmetry.id}`).toBe(true);
      }
    }
  });

  it("every slot draws an icon this build has and names a real symmetry", () => {
    for (const slot of slots) {
      expect(slot.icon && ICONS[slot.icon], slot.slot).toBeTruthy();
      expect(slot.label, slot.slot).toBeTruthy();
      const [kind, id, direction] = slot.action!.split(":");
      expect(kind).toBe("symmetry");
      expect(SYMMETRY_IDS).toContain(id as SymmetryId);
      expect(["1", "-1"]).toContain(direction);
      // the back half of a pair is the one that hides on an involution
      const want = direction === "-1" ? "symmetry-pair" : "symmetry";
      expect(slot.visibleWhen).toBe(`${want}:${id}`);
    }
  });

  it("a reflection gets one button and a translation two", () => {
    const symmetry = (id: SymmetryId, involution: boolean): BoardSymmetry => ({
      id,
      involution,
      cycle: new Map(),
    });
    const shown = (conditions: Set<string>) =>
      slots.filter((s) => slotVisible(s.visibleWhen, conditions)).map((s) => s.slot);

    expect(shown(boardConditions([symmetry("ring", false)]))).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
    ]);
    expect(shown(boardConditions([symmetry("mirror-tube", true)]))).toEqual([
      "symmetry-mirror-tube-fwd",
    ]);
    expect(shown(boardConditions([]))).toEqual([]);
  });

  it("the Klein bottle shows its ring pair and one tube button", () => {
    const board = buildBoard("klein", "easy");
    expect(isBoard3D(board)).toBe(true);
    if (!isBoard3D(board)) return;
    const conditions = boardConditions(board.symmetries);
    const shown = slots.filter((s) => slotVisible(s.visibleWhen, conditions));
    expect(shown.map((s) => s.slot)).toEqual([
      "symmetry-ring-back",
      "symmetry-ring-fwd",
      // the tube step is a half turn, so it is its own undo — as is `turn`
      // itself on every wrapped surface
      "symmetry-tube-fwd",
      "symmetry-turn-fwd",
      "symmetry-mirror-ring-fwd",
      "symmetry-mirror-tube-fwd",
    ]);
  });
});
