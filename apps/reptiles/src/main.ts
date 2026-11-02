import "./styles.css";
import { bandOf, type Band } from "./difficulty";
import { attachDrag, type DragControl } from "./input/drag";
import { LEVELS, levelByKey, type Level } from "./levels";
import { recordStars, starsFor } from "./progress";
import { Puzzle } from "./puzzle";
import { renderCatalog } from "./view/catalog";
import { renderHome } from "./view/home";
import { fillGlyphs } from "./view/icons";
import { renderSettings } from "./view/settings";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const host = byId("board-host");
const count = byId("count");
const clock = byId("clock");
const won = byId("won");
const next = byId<HTMLButtonElement>("next");

fillGlyphs(document);

// -- screens ------------------------------------------------------------------
// Four: home (no query), the catalog (?catalog), the settings (?settings) and
// a level (?level=<key>). Each move between them is a history entry, so the
// browser's Back goes back.

const SCREENS = ["home", "catalog", "settings", "game"] as const;
type Screen = (typeof SCREENS)[number];

function show(screen: Screen): void {
  for (const s of SCREENS) byId(s).hidden = s !== screen;
  if (screen !== "game") won.hidden = true;
}

function goHome(push = true): void {
  if (push) history.pushState(null, "", location.pathname);
  renderHome(
    byId("home-picks"),
    tally,
    playBand,
    () => goCatalog(),
    () => goSettings(),
  );
  show("home");
}

function goSettings(push = true): void {
  if (push) history.pushState(null, "", "?settings");
  renderSettings(byId("settings-body"));
  show("settings");
}

function goCatalog(push = true): void {
  if (push) history.pushState(null, "", "?catalog");
  renderCatalog(byId("catalog-list"), LEVELS, starsFor, (level) => open(level));
  show("catalog");
}

function tally(band: Band): { levels: number; stars: number } {
  const levels = LEVELS.filter((l) => bandOf(l.key) === band);
  return { levels: levels.length, stars: levels.reduce((sum, l) => sum + starsFor(l.key), 0) };
}

/** A level of `band`, dealt at random — not the one just played, where there
 * is another. */
function playBand(band: Band): void {
  const pool = LEVELS.filter((l) => bandOf(l.key) === band);
  const fresh = pool.filter((l) => l !== session?.puzzle.level);
  const from = fresh.length > 0 ? fresh : pool;
  const level = from[Math.floor(Math.random() * from.length)];
  if (level) open(level);
}

function route(): void {
  const query = new URLSearchParams(location.search);
  const level = levelByKey(query.get("level") ?? "");
  if (level) open(level, false);
  else if (query.has("catalog")) goCatalog(false);
  else if (query.has("settings")) goSettings(false);
  else goHome(false);
}

// -- a level in play ------------------------------------------------------------

interface Session {
  puzzle: Puzzle;
  board: SvgBoard;
  control: DragControl;
  /** When the first tile went down (performance.now), and when the board was
   * finished — the clock runs between them. */
  started: number | null;
  finished: number | null;
  /** The win card was closed (Exit): it stays shut while the board stays
   * finished. */
  dismissed: boolean;
}

let session: Session | null = null;

function elapsed(s: Session): number {
  if (s.started === null) return 0;
  return ((s.finished ?? performance.now()) - s.started) / 1000;
}

const clockText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function tick(s: Session): void {
  const t = elapsed(s);
  byId("clock-time").textContent = clockText(t);
  byId("clock-limit").textContent = `/ ${clockText(s.puzzle.level.seconds)}`;
  clock.classList.toggle("over", t > s.puzzle.level.seconds);
}

function nextLevel(s: Session): Level | undefined {
  return LEVELS[LEVELS.indexOf(s.puzzle.level) + 1];
}

function changed(): void {
  const s = session;
  if (!s) return;
  const { puzzle } = s;
  if (s.started === null && puzzle.tiles.length > 0) s.started = performance.now();
  count.textContent = `${Math.floor(puzzle.coverage * 100)}%`;
  if (!puzzle.won) s.dismissed = false;
  won.hidden = !puzzle.won || s.dismissed;
  if (!puzzle.won) {
    tick(s);
    return;
  }
  if (s.finished === null) s.finished = performance.now();
  tick(s);
  s.control.setRemoving(false);
  const seconds = elapsed(s);
  const stars = puzzle.stars(seconds);
  const need = puzzle.level.need.reduce((a, b) => a + b, 0);
  const stars3 = byId("won-stars");
  stars3.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  stars3.setAttribute("aria-label", `${stars} of 3 stars`);
  const used = puzzle.tiles.length;
  const lines = [
    "★ Covered, no gaps, no overlaps.",
    used <= need
      ? `★ ${used} tiles — no more than the ${need} needed.`
      : `☆ ${used} tiles — ${need} would do.`,
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
  next.hidden = !nextLevel(s);
  if (stars > starsFor(puzzle.level.key)) recordStars(puzzle.level.key, stars);
}

/** Start `level` afresh: a new puzzle, a new board in the stage. */
function open(level: Level, push = true): void {
  if (push) history.pushState(null, "", `?level=${level.key}`);
  show("game");
  const puzzle = new Puzzle(level);
  host.replaceChildren();
  const board = new SvgBoard(host, puzzle);
  session = {
    puzzle,
    board,
    control: attachDrag(board, puzzle, changed),
    started: null,
    finished: null,
    dismissed: false,
  };
  const name = byId("level");
  name.textContent = level.name;
  name.title = level.label;
  changed();
}

function restart(): void {
  if (session) open(session.puzzle.level, false);
}

/** Close the win card and look at the finished board. */
function dismiss(): void {
  if (session) session.dismissed = true;
  won.hidden = true;
}

byId("restart").addEventListener("click", restart);
// Another level of the same difficulty as this one, however it was picked.
byId("random").addEventListener("click", () => {
  if (session) playBand(bandOf(session.puzzle.level.key));
});
byId("again").addEventListener("click", restart);
byId("exit").addEventListener("click", dismiss);
won.addEventListener("click", (ev) => {
  if (ev.target === won) dismiss();
});
next.addEventListener("click", () => {
  const level = session && nextLevel(session);
  if (level) open(level);
});
for (const button of document.querySelectorAll("[data-go-home]"))
  button.addEventListener("click", () => goHome());
document.addEventListener("keydown", (ev) => {
  if (!session || byId("game").hidden) return;
  const { control, board } = session;
  if (ev.key === "x" || ev.key === "X") control.setRemoving(!board.removing);
  else if (ev.key === "Escape") {
    if (!won.hidden) dismiss();
    else control.setRemoving(false);
  } else if (ev.key === "r" || ev.key === "R") control.turn(ev.shiftKey ? 1 : -1);
  else if (ev.key === "e" || ev.key === "E") control.turn(1);
  else if (ev.key === "f" || ev.key === "F") control.flip();
});
new ResizeObserver(() => session?.board.layout()).observe(host);
setInterval(() => {
  if (session && session.started !== null && session.finished === null) tick(session);
}, 250);
window.addEventListener("popstate", route);

route();
// The first screen is up: the signal the desktop shell's smoke run waits for
// (shells/desktop/main.mjs), as Hypersweeper's main.ts sets it.
requestAnimationFrame(() => document.body.setAttribute("data-ready", "1"));

// A seam for checking the game by hand or from a script, in dev builds only:
// `__reptiles.fill()` finishes the board (backtracking where it must).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __reptiles: {
      get puzzle() {
        return session?.puzzle;
      },
      fill(): void {
        if (!session) return;
        session.puzzle.solve();
        session.board.draw();
        changed();
      },
    },
  });
}
