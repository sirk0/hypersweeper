import { describe, expect, it, vi } from "vitest";
import type { CellId } from "../../src/boards/core";

// Where a held flag's drop goes. The projective plane is drawn as the sphere
// that covers it twice (`Board3D.faces`), so every game cell is painted on two
// antipodal faces, and both mirror its state — but the mesh has room for one
// dropping flag at a time (`CellAnimations.drop`). Handing it both twins left
// the drop on whichever came last, which for about half the cells was the one
// on the far side of the sphere: the pin flew to the wrong place, and since the
// drop does not depth-test, it was drawn there in plain sight. The drop belongs
// on the face under the finger, and only there.
//
// The mesh is stubbed: it needs a canvas for its glyph atlas, which node does
// not have, and what is under test is only which faces the session hands it.

const drops = vi.hoisted(() => [] as CellId[]);

vi.mock("../../src/render/solidBoard", () => ({
  SolidBoard: class {
    constructor() {
      // Every other mesh call is a no-op; `dropFlag` is the one recorded.
      return new Proxy(this, {
        get: (_t, key) =>
          key === "dropFlag"
            ? (cell: CellId) => drops.push(cell)
            : key === "cellAnchor"
              ? () => null
              : () => undefined,
      });
    }
  },
}));

const { GameSession } = await import("../../src/session");

describe("a held flag drops onto the face that was held", () => {
  for (const mode of ["projective", "projectivetri", "projectivehex"]) {
    it(`on every face of ${mode}`, () => {
      // Nothing is revealed, so the game never ends and every flag is taken.
      const session = new GameSession(mode, "easy", { seed: 1 });
      const faces = [...session.board.polygons.keys()];
      // The board really is drawn twice over, or this test proves nothing.
      expect(new Set(faces.map((f) => session.gameFor(f))).size).toBe(faces.length / 2);
      const wrong: string[] = [];
      for (const face of faces) {
        drops.length = 0;
        session.flag(face, 300); // held: plant, with the drop
        if (drops.length !== 1 || drops[0] !== face) {
          wrong.push(`${face} -> [${drops.join(", ")}]`);
        }
        session.flag(face); // and clear it again, unheld
      }
      expect(wrong).toEqual([]);
    });
  }
});
