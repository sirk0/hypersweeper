import "./styles.css";
import { bandOf, type Band } from "./difficulty";
import { attachDrag, type DragControl } from "./input/drag";
import { figureSetByKey, figureSets, type FigureSet } from "./figures";
import { BOARDS, LEVELS, boardKeys, levelByKey, markedOf, type Level } from "./levels";
import { recordStars, starsFor } from "./progress";
import { Puzzle } from "./puzzle";
import { renderCatalog } from "./view/catalog";
import { renderFigure, renderFigures } from "./view/figures";
import { renderHome } from "./view/home";
import { fillGlyphs } from "./view/icons";
import { dropQueued, renderPicker } from "./view/picker";
import { renderSettings } from "./view/settings";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const host = byId("board-host");
const count = byId("count");
const clock = byId("clock");
const won = byId("won");
const next = byId<HTMLButtonElement>("next");
const boardButton = byId<HTMLButtonElement>("board");

/** Every level of the tiling `plain` is the first board of — each of its
 * boards plain, then marked each way it is (`markedOf`) — and the stars
 * earned on them: what the catalog and Figures show for it. */
function tallyOf(plain: Level): { levels: number; stars: number } {
  const keys = [plain, ...markedOf(plain.key)].flatMap((l) => boardKeys(l.key));
  return { levels: keys.length, stars: keys.reduce((sum, k) => sum + starsFor(k), 0) };
}

fillGlyphs(document);

// -- screens ------------------------------------------------------------------
// Seven: home (no query), Tilings — the catalog — (?tilings; old links say
// ?catalog), one tiling's boards and tiles to pick a level from
// (?tiling=<key>), Figures (?figures), one figure set's (?figure=<key>), the
// settings (?settings) and a level (?level=<key>). Each move between them is a
// history entry, so the browser's Back goes back; a tiling's or figure set's
// page keeps its pick in its URL (`&pick=<level>`), so Back from a level
// comes back to the same one.

const SCREENS = ["home", "catalog", "tiling", "figures", "figure", "settings", "game"] as const;
type Screen = (typeof SCREENS)[number];

function show(screen: Screen): void {
  dropQueued();
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
    () => goFigures(),
  );
  show("home");
}

function goSettings(push = true): void {
  if (push) history.pushState(null, "", "?settings");
  renderSettings(byId("settings-body"));
  show("settings");
}

function goCatalog(push = true): void {
  if (push) history.pushState(null, "", "?tilings");
  renderCatalog(
    byId("catalog-list"),
    LEVELS.filter((l) => !l.decor),
    tallyOf,
    (level) => open(level),
    (level) => goTiling(level),
  );
  show("catalog");
}

/** Keep a page's pick in its URL, in place: Back from a level comes back to
 * it. */
const keepPick =
  (page: string) =>
  (key: string): void =>
    history.replaceState(null, "", `?${page}&pick=${key}`);

/** A tiling's page: its boards and its tiles — plain, matching rules,
 * colourings — to pick a level from (view/picker.ts). */
function goTiling(level: Level, push = true, pick: string | null = null): void {
  if (push) history.pushState(null, "", `?tiling=${level.key}`);
  show("tiling");
  byId("tiling-title").textContent = level.name;
  renderPicker(byId("tiling-list"), {
    tilings: [level],
    stars: starsFor,
    play: (l) => open(l),
    initial: pick,
    remember: keepPick(`tiling=${level.key}`),
  });
}

function goFigures(push = true): void {
  if (push) history.pushState(null, "", "?figures");
  renderFigures(byId("figures-list"), figureSets(), tallyOf, (set) => goFigure(set));
  show("figures");
}

function goFigure(set: FigureSet, push = true, pick: string | null = null): void {
  if (push) history.pushState(null, "", `?figure=${set.key}`);
  show("figure");
  byId("figure-title").textContent = set.name;
  renderFigure(
    byId("figure-list"),
    set,
    starsFor,
    (level) => open(level),
    pick,
    keepPick(`figure=${set.key}`),
  );
}

/** Per band, how many boards — every board of every tiling is a level of its
 * own — and the stars earned on them. */
function tally(band: Band): { levels: number; stars: number } {
  const boards = BOARDS.filter((b) => bandOf(b.key) === band);
  return { levels: boards.length, stars: boards.reduce((sum, b) => sum + starsFor(b.key), 0) };
}

/** A board of `band`, dealt at random from every tiling's boards — not the
 * one just played, where there is another. */
function playBand(band: Band): void {
  const pool = BOARDS.filter((b) => bandOf(b.key) === band);
  const fresh = pool.filter((b) => b.key !== session?.puzzle.level.key);
  const from = fresh.length > 0 ? fresh : pool;
  const pick = from[Math.floor(Math.random() * from.length)];
  const level = pick && levelByKey(pick.key);
  if (level) open(level);
}

function route(): void {
  const query = new URLSearchParams(location.search);
  const level = levelByKey(query.get("level") ?? "");
  if (level) open(level, false);
  else if (query.has("tilings") || query.has("catalog")) goCatalog(false);
  else if (query.has("tiling")) {
    const tiling = levelByKey(query.get("tiling") ?? "");
    if (tiling && !tiling.decor && tiling.board === 1) goTiling(tiling, false, query.get("pick"));
    else goCatalog(false);
  } else if (query.has("figure")) {
    const set = figureSetByKey(query.get("figure") ?? "");
    if (set) goFigure(set, false, query.get("pick"));
    else goFigures(false);
  } else if (query.has("figures")) goFigures(false);
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

/** The next board `level`'s tiles are laid on — its tiling's next board,
 * plain or marked as it is — round to the first after the last. */
function nextBoard(level: Level): Level | undefined {
  const keys = boardKeys(level.base);
  return levelByKey(keys[(keys.indexOf(level.key) + 1) % keys.length]!);
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
  const boardOf = byId("board-of");
  boardOf.hidden = level.boards < 2;
  boardOf.textContent = `board ${level.board}/${level.boards}`;
  boardButton.hidden = boardKeys(level.base).length < 2;
  boardButton.title = `The next board of this tiling (this is ${level.board} of ${level.boards})`;
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
boardButton.addEventListener("click", () => {
  const level = session && nextBoard(session.puzzle.level);
  if (level) open(level);
});
document
  .querySelector("#home [data-action=settings]")
  ?.addEventListener("click", () => goSettings());
// Another level of the same difficulty as this one, however it was picked.
byId("random").addEventListener("click", () => {
  if (session) playBand(bandOf(session.puzzle.level.key));
});
byId("again").addEventListener("click", restart);
byId("exit").addEventListener("click", dismiss);
won.addEventListener("click", (ev) => {
  if (ev.target === won) dismiss();
});
// Next level: another of the same difficulty, dealt at random — as the die is.
next.addEventListener("click", () => {
  if (session) playBand(bandOf(session.puzzle.level.key));
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
  else if ((ev.key === "b" || ev.key === "B") && !boardButton.hidden) boardButton.click();
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
// `__reptiles.fill()` finishes the board: the board's own tiles that still
// fit, then a search (backtracking where it must).
if (import.meta.env.DEV) {
  Object.assign(window, {
    __reptiles: {
      get puzzle() {
        return session?.puzzle;
      },
      fill(): void {
        if (!session) return;
        session.puzzle.layOwn();
        session.puzzle.solve();
        session.board.draw();
        changed();
      },
    },
  });
}
