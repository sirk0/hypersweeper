import "./styles.css";
import { attachDrag, type DragControl } from "./input/drag";
import { LEVELS, levelByKey, type Level } from "./levels";
import { recordStars, starsFor } from "./progress";
import { Puzzle } from "./puzzle";
import { renderLevelList } from "./view/levelList";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const stage = byId("stage");
const count = byId("count");
const clock = byId("clock");
const won = byId("won");
const next = byId<HTMLButtonElement>("next");

let puzzle: Puzzle;
let board: SvgBoard;
let control: DragControl;
/** When the first tile went down (performance.now), and when the board was
 * finished — the clock runs between them. */
let started: number | null = null;
let finished: number | null = null;

function elapsed(): number {
  if (started === null) return 0;
  return ((finished ?? performance.now()) - started) / 1000;
}

const clockText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function tick(): void {
  const t = elapsed();
  clock.textContent = `${clockText(t)} / ${clockText(puzzle.level.seconds)}`;
  clock.classList.toggle("over", t > puzzle.level.seconds);
}

function nextLevel(): Level | undefined {
  return LEVELS[LEVELS.indexOf(puzzle.level) + 1];
}

function listLevels(): void {
  renderLevelList(byId("levels"), LEVELS, puzzle.level.key, starsFor, open);
}

function changed(): void {
  if (started === null && puzzle.tiles.length > 0) started = performance.now();
  count.textContent = `${Math.floor(puzzle.coverage * 100)}% covered`;
  won.hidden = !puzzle.won;
  if (!puzzle.won) {
    tick();
    return;
  }
  if (finished === null) finished = performance.now();
  tick();
  control.setRemoving(false);
  const seconds = elapsed();
  const stars = puzzle.stars(seconds);
  const need = puzzle.level.need.reduce((a, b) => a + b, 0);
  const stars3 = byId("won-stars");
  stars3.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  stars3.setAttribute("aria-label", `${stars} of 3 stars`);
  const used = puzzle.tiles.length;
  const lines = [
    "★ Covered, no gaps, no overlaps.",
    used <= need ? `★ ${used} tiles — no more than the ${need} needed.` : `☆ ${used} tiles — ${need} would do.`,
    stars === 3
      ? `★ ${clockText(seconds)} — inside ${clockText(puzzle.level.seconds)}.`
      : used <= need
        ? `☆ ${clockText(seconds)} — over ${clockText(puzzle.level.seconds)}.`
        : `☆ Time counts once the tiles are no more than needed.`,
  ];
  byId("won-detail").replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
  next.hidden = !nextLevel();
  if (stars > starsFor(puzzle.level.key)) {
    recordStars(puzzle.level.key, stars);
    listLevels();
  }
}

/** Start `level` afresh: a new puzzle, a new board in the stage. */
function open(level: Level): void {
  puzzle = new Puzzle(level);
  started = null;
  finished = null;
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


byId("restart").addEventListener("click", restart);
byId("again").addEventListener("click", restart);
next.addEventListener("click", () => {
  const level = nextLevel();
  if (level) open(level);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "x" || ev.key === "X") control.setRemoving(!board.removing);
  else if (ev.key === "Escape") control.setRemoving(false);
  else if (ev.key === "r" || ev.key === "R") control.turn(-1);
});
new ResizeObserver(() => board.layout()).observe(stage);
setInterval(() => {
  if (started !== null && finished === null) tick();
}, 250);

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
