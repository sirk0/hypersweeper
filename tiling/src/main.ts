import "./styles.css";
import { attachDrag, type DragControl } from "./input/drag";
import { LEVELS, levelByKey, type Level } from "./levels";
import { isSolved, markSolved } from "./progress";
import { Puzzle } from "./puzzle";
import { renderLevelList } from "./view/levelList";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = byId("stage");
const count = byId("count");
const won = byId("won");
const del = byId<HTMLButtonElement>("delete");
const next = byId<HTMLButtonElement>("next");

let puzzle: Puzzle;
let board: SvgBoard;
let control: DragControl;

function nextLevel(): Level | undefined {
  return LEVELS[LEVELS.indexOf(puzzle.level) + 1];
}

function listLevels(): void {
  renderLevelList(byId("levels"), LEVELS, puzzle.level.key, isSolved, open);
}

function changed(): void {
  del.disabled = board.selected === null;
  count.textContent = `${puzzle.tiles.length} / ${puzzle.needed}`;
  won.hidden = !puzzle.won;
  if (!puzzle.won) return;
  byId("won-detail").textContent = `${puzzle.needed} tiles, no gaps, no overlaps.`;
  next.hidden = !nextLevel();
  if (!isSolved(puzzle.level.key)) {
    markSolved(puzzle.level.key);
    listLevels();
  }
}

/** Start `level` afresh: a new puzzle, a new board in the stage. */
function open(level: Level): void {
  puzzle = new Puzzle(level);
  stage.replaceChildren();
  board = new SvgBoard(stage, puzzle);
  control = attachDrag(board, puzzle, changed);
  byId("level").textContent = level.label;
  history.replaceState(null, "", `?level=${level.key}`);
  listLevels();
  changed();
}

function restart(): void {
  open(puzzle.level);
}

function deleteSelected(): void {
  if (board.selected === null) return;
  puzzle.lift(board.selected);
  board.selected = null;
  board.draw();
  changed();
}

byId("restart").addEventListener("click", restart);
byId("again").addEventListener("click", restart);
next.addEventListener("click", () => {
  const level = nextLevel();
  if (level) open(level);
});
del.addEventListener("click", deleteSelected);
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Delete" || ev.key === "Backspace") deleteSelected();
  else if (ev.key === "r" || ev.key === "R") control.turn(-1);
  else if (ev.key === "Escape" && board.selected !== null) {
    board.selected = null;
    board.draw();
    changed();
  }
});
new ResizeObserver(() => board.layout()).observe(stage);

open(levelByKey(new URLSearchParams(location.search).get("level") ?? "") ?? LEVELS[0]!);

// A seam for checking the game by hand or from a script, in dev builds only:
// `__tiling.fill()` finishes the board (backtracking where it must).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __tiling: {
      get puzzle() {
        return puzzle;
      },
      fill(): void {
        puzzle.solve();
        board.draw();
        changed();
      },
    },
  });
}
