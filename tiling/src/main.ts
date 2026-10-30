import "./styles.css";
import { attachDrag } from "./input/drag";
import { LEVELS, levelByKey } from "./levels";
import { Puzzle } from "./puzzle";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const level = levelByKey(new URLSearchParams(location.search).get("level") ?? "") ?? LEVELS[0]!;
const puzzle = new Puzzle(level);
const board = new SvgBoard(byId("stage"), puzzle);

const count = byId("count");
const won = byId("won");
byId("level").textContent = level.label;

function changed(): void {
  count.textContent = `${puzzle.tiles.length} / ${puzzle.needed}`;
  won.hidden = !puzzle.won;
  if (puzzle.won) byId("won-detail").textContent = `${puzzle.needed} tiles, no gaps, no overlaps.`;
}

function restart(): void {
  puzzle.reset();
  board.draw();
  changed();
}

attachDrag(board, puzzle, changed);
byId("restart").addEventListener("click", restart);
byId("again").addEventListener("click", restart);
new ResizeObserver(() => board.layout()).observe(board.svg);
changed();

// A seam for checking the game by hand or from a script, in dev builds only:
// `__tiling.fill()` places tiles greedily until the board is done.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __tiling: {
      puzzle,
      fill(): void {
        while (!puzzle.won) {
          const spot = puzzle.snap(0, puzzle.openEdges[0]!.axy, 2);
          if (!spot) break;
          puzzle.place(0, spot);
        }
        board.draw();
        changed();
      },
    },
  });
}
