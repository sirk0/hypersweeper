// The page: one board from the shared geometry, drawn as SVG, pressed by
// clicking. The best score is kept with the shared storage guard, which works
// with or without localStorage (a private window, a packaged app).
import { hexBoard } from "@tiling/geometry";
import { readObject, storage } from "@tiling/platform";
import { newGame, press, solved, type Game } from "./game";
import "./styles.css";

const BEST_KEY = "__KEY__.best";
const SVG = "http://www.w3.org/2000/svg";
const stage = document.getElementById("stage")!;
const status = document.getElementById("status")!;

let game: Game;

function best(): number | null {
  const value = readObject(BEST_KEY)?.["presses"];
  return typeof value === "number" ? value : null;
}

function draw(): void {
  const { board } = game;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "board");
  // Framed on the polygons themselves, with room for the stroke: a builder's
  // width and height need not cover every corner it draws.
  const points = [...board.polygons.values()].flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const pad = 4;
  const [x0, y0] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const [x1, y1] = [Math.max(...xs) + pad, Math.max(...ys) + pad];
  svg.setAttribute("viewBox", `${x0} ${y0} ${x1 - x0} ${y1 - y0}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Board");
  for (const [id, verts] of board.polygons) {
    const cell = document.createElementNS(SVG, "polygon");
    cell.setAttribute("points", verts.map(([x, y]) => `${x},${y}`).join(" "));
    cell.setAttribute("class", game.lit.has(id) ? "cell lit" : "cell");
    cell.dataset["cell"] = id;
    cell.addEventListener("click", () => {
      if (solved(game)) return;
      press(game, id);
      if (solved(game)) record();
      draw();
    });
    svg.appendChild(cell);
  }
  stage.replaceChildren(svg);
  const top = best();
  status.textContent = solved(game)
    ? `Solved in ${game.presses} presses.`
    : `${game.lit.size} lit · ${game.presses} presses${top === null ? "" : ` · best ${top}`}`;
}

function record(): void {
  const previous = best();
  if (previous !== null && previous <= game.presses) return;
  try {
    storage()?.setItem(BEST_KEY, JSON.stringify({ presses: game.presses }));
  } catch {
    // kept for this page only
  }
}

function restart(): void {
  game = newGame(hexBoard(5, 6, 24), 6);
  draw();
}

document.getElementById("restart")!.addEventListener("click", restart);
restart();
// The first screen is up: the signal the desktop shell's smoke run waits for.
requestAnimationFrame(() => document.body.setAttribute("data-ready", "1"));
