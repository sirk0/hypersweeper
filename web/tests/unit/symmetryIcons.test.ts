import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/boards/presets";
import { planeLie, symmetryIcon, symmetryPictures } from "../../src/ui/symmetryIcon";

// What a symmetry control's icon says. The drawing itself is 26 pixels of
// glyph and no test can read it, so what is pinned is the measurement behind
// it: the angle a turn turns by, and which way a mirror plane lies.

function pictures(mode: string, difficulty = "easy", quarterTurned = false) {
  return symmetryPictures(buildBoard(mode, difficulty), mode, quarterTurned);
}

describe("what a control's icon is drawn from", () => {
  it("a turn knows its own angle", () => {
    // The thing being asked of the icon: 90 and 60 are different pictures.
    const turns: [string, string, string, number][] = [
      ["square", "easy", "turn", 4], // the classic 9x9 grid: a quarter
      ["square", "hard", "turn", 2], // 30x16 is a rectangle: only a half
      ["hexhex", "easy", "turn", 6], // a hexagonal board: a sixth
      ["triangle", "easy", "turn", 3], // a triangular one: a third
      ["gosper", "easy", "turn", 6], // the flowsnake keeps the hexagon's six
      ["cube", "easy", "ring", 4], // a cube quarters about its axes
      ["cube", "easy", "tube", 4],
      ["octahedron", "easy", "ring", 4],
      ["tetrahedron", "easy", "ring", 3], // and a tetrahedron thirds
      ["icosahedron", "easy", "ring", 5], // an icosahedron fifths
      ["sphere", "easy", "ring", 5],
      ["torus", "easy", "turn", 2], // every wrapped surface's turn is a half
      ["cylinder", "easy", "turn", 2],
    ];
    for (const [mode, difficulty, id, want] of turns) {
      const picture = pictures(mode, difficulty).get(id as never);
      expect(picture?.kind, `${mode}/${difficulty} ${id}`).toBe("turn");
      expect(picture?.turns, `${mode}/${difficulty} ${id}`).toBe(want);
    }
  });

  it("the order is the whole board's, not one cell's", () => {
    // The Gosper island's middle cell sits on the axis and comes home after a
    // single press; asking that one cell would call a sixth-turn a step.
    const picture = pictures("gosper").get("turn");
    expect(picture?.turns).toBe(6);
  });

  it("a wrapped board's translations are steps, with no angle to show", () => {
    for (const mode of ["torus", "klein", "cylinder", "mobius"]) {
      const shown = pictures(mode);
      for (const id of ["ring", "tube"] as const) {
        const picture = shown.get(id);
        if (picture) expect(picture.kind, `${mode} ${id}`).toBe("step");
      }
    }
  });

  it("a mirror knows which way its plane lies", () => {
    // A flat board's mirror stands up on the screen; a donut's swaps the front
    // of the ring for the back, which reads as a horizontal line; a cylinder's
    // swaps its near wall for its far one, a plane square-on to the viewer that
    // no line could describe.
    expect(planeLie(pictures("square").get("mirror-ring")!.normal)).toBe("vertical");
    expect(planeLie(pictures("hexhex").get("mirror-ring")!.normal)).toBe("vertical");
    expect(planeLie(pictures("torus").get("mirror-ring")!.normal)).toBe("horizontal");
    expect(planeLie(pictures("cylinder").get("mirror-ring")!.normal)).toBe("facing");
    expect(planeLie(pictures("cube").get("mirror-ring")!.normal)).toBe("horizontal");
  });

  it("the mirror line turns with a board the viewport turns", () => {
    // A landscape flat board is drawn a quarter round on a portrait viewport,
    // and what was a vertical plane is then a horizontal one on screen.
    expect(planeLie(pictures("square", "hard").get("mirror-ring")!.normal)).toBe("vertical");
    expect(planeLie(pictures("square", "hard", true).get("mirror-ring")!.normal)).toBe(
      "horizontal",
    );
  });

  it("every board's controls have a picture, and only the steps go undrawn", () => {
    for (const mode of ["square", "hexhex", "cube", "sphere", "torus", "klein", "cylinder"]) {
      const board = buildBoard(mode, "easy");
      const shown = pictures(mode);
      expect(shown.size).toBe(board.symmetries.length);
      for (const [id, picture] of shown) {
        const drawn = symmetryIcon(picture, 1);
        if (picture.kind === "step") expect(drawn, `${mode} ${id}`).toBeNull();
        else expect(drawn, `${mode} ${id}`).toContain("<svg");
      }
    }
  });

  it("a quarter turn and a sixth are different drawings, and so are the two ways round", () => {
    const quarter = symmetryIcon(pictures("square").get("turn")!, 1)!;
    const sixth = symmetryIcon(pictures("hexhex").get("turn")!, 1)!;
    const back = symmetryIcon(pictures("square").get("turn")!, -1)!;
    expect(quarter).not.toBe(sixth);
    expect(quarter).not.toBe(back);
  });
});
