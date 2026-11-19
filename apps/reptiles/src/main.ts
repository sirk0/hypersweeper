import "./styles.css";
import { bandOf, type Band } from "./difficulty";
import { findExtension, levelMid } from "./extension";
import { attachDrag, type DragControl } from "./input/drag";
import type { Laid } from "./hint";
import { Hinter } from "./hintClient";
import { BOARDS, LEVELS, boardKeys, levelByKey, markedOf, type Level } from "./levels";
import { recordStars, starsFor } from "./progress";
import { Puzzle } from "./puzzle";
import { renderCatalog, type Tally } from "./view/catalog";
import {
  groupOfFamily,
  menuGroup,
  MENU_GROUPS,
  TWO_COLUMNS,
  WIDE_QUERY,
  type MenuGroup,
} from "./view/groups";
import { renderHome } from "./view/home";
import { barsIcon, fillGlyphs, trayIcon } from "./view/icons";
import { dropQueued, renderPicker } from "./view/picker";
import { renderSettings } from "./view/settings";
import { SvgBoard } from "./view/svgBoard";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const host = byId("board-host");
const count = byId("count");
const won = byId("won");
const next = byId<HTMLButtonElement>("next");
const hintButton = byId<HTMLButtonElement>("hint");
const thinking = byId("thinking");

/** Works out the hint for the board in play, in the background after every
 * move (hint.worker.ts), so a press of the hint button often finds it ready. */
const hinter = new Hinter();

/** Every level of the tiling `plain` is the first board of — each of its
 * boards plain, then marked each way it is (`markedOf`) — and the stars
 * earned on them: what the catalog shows for it. */
function tallyOf(plain: Level): ReturnType<Tally> {
  const keys = [plain, ...markedOf(plain.key)].flatMap((l) => boardKeys(l.key));
  return {
    levels: keys.length,
    stars: keys.reduce((sum, k) => sum + starsFor(k), 0),
    boards: boardKeys(plain.key).length,
    sets: markedOf(plain.key).length + 1,
  };
}

fillGlyphs(document);

/** The desktop layout (view/groups.ts): a sidebar beside every screen but a
 * level's, Tilings split into its five groups, a tiling's page in two
 * columns. Every screen renders at either width, and crossing it re-renders
 * the one on show (below). */
const wide = matchMedia(WIDE_QUERY);
const twoColumns = matchMedia(TWO_COLUMNS);

// -- the sidebar ----------------------------------------------------------------
// Built once; a screen only moves its highlight. Its icons are tray pictures,
// which build a level each, so they are drawn after the first screen is up.

const sideRows = new Map<string, HTMLButtonElement>();
for (const row of document.querySelectorAll<HTMLButtonElement>("#sidebar [data-side]"))
  sideRows.set(row.dataset["side"]!, row);
byId("side-quick").append(barsIcon(2));
for (const group of MENU_GROUPS) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "side-row";
  row.dataset["side"] = `group:${group.key}`;
  row.title = group.hint;
  const icon = document.createElement("span");
  icon.className = "side-icon";
  const label = document.createElement("span");
  label.className = "side-label";
  label.textContent = group.name;
  const count = document.createElement("span");
  count.className = "side-count";
  count.textContent = String(tilingsOf(group).length);
  row.append(icon, label, count);
  row.addEventListener("click", () => goCatalog(true, group.key));
  byId("side-groups").append(row);
  sideRows.set(row.dataset["side"], row);
  setTimeout(() => {
    const level = levelByKey(group.icon);
    if (level) icon.replaceChildren(trayIcon(level));
  }, 0);
}
sideRows.get("home")?.addEventListener("click", () => goHome());
sideRows.get("settings")?.addEventListener("click", () => goSettings());

/** The tilings a group lists: the first boards of its families, plain. */
function tilingsOf(group: MenuGroup): Level[] {
  return LEVELS.filter((l) => !l.decor && (group.families as readonly string[]).includes(l.group));
}

// -- screens ------------------------------------------------------------------
// Five: home (no query), Tilings — the catalog — (?tilings; old links say
// ?catalog, or ?figures and ?figure=<key> from the Figures screen there was;
// on a desktop one group of it, ?group=<key>), one tiling's boards and tiles
// to pick a level from (?tiling=<key>), the settings (?settings) and a level
// (?level=<key>). Each move between them is a history entry, so the browser's
// Back goes back; a tiling's page keeps its pick in its URL (`&pick=<level>`),
// so Back from a level comes back to the same one.

const SCREENS = ["home", "catalog", "tiling", "settings", "game"] as const;
type Screen = (typeof SCREENS)[number];

/** Show `screen`, and in the sidebar highlight `side` (a `data-side`). */
function show(screen: Screen, side = ""): void {
  dropQueued();
  for (const s of SCREENS) byId(s).hidden = s !== screen;
  document.body.dataset["screen"] = screen;
  for (const [key, row] of sideRows) {
    row.classList.toggle("active", key === side);
    if (key === side) row.setAttribute("aria-current", "page");
    else row.removeAttribute("aria-current");
  }
  if (screen !== "game") won.hidden = true;
}

function goHome(push = true): void {
  if (push) history.pushState(null, "", location.pathname);
  renderHome(byId("home-picks"), tally, playBand, () => goCatalog(), wide.matches);
  show("home", "home");
}

function goSettings(push = true): void {
  if (push) history.pushState(null, "", "?settings");
  renderSettings(byId("settings-body"));
  show("settings", "settings");
}

/** Tilings: on a phone every family, a row each (scrolled to `groupKey`'s
 * first, where one is named); on a desktop one group's families in grids —
 * `groupKey`'s, or the first group's. */
function goCatalog(push = true, groupKey: string | null = null): void {
  const named = menuGroup(groupKey);
  const group = wide.matches ? (named ?? MENU_GROUPS[0]!) : named;
  if (push) history.pushState(null, "", group && groupKey ? `?group=${group.key}` : "?tilings");
  const list = byId("catalog-list");
  renderCatalog(
    list,
    LEVELS.filter((l) => !l.decor),
    tallyOf,
    (level) => open(level),
    (level) => goTiling(level),
    wide.matches ? group?.families : undefined,
  );
  // a group of one family: the page's title already names it
  if (wide.matches && group?.families.length === 1)
    for (const head of list.querySelectorAll<HTMLElement>(".family > h2, .family-hint"))
      head.hidden = true;
  byId("catalog-title").textContent = wide.matches && group ? group.name : "Tilings";
  // the group's hint and its families, each a jump to its section
  const links = byId("catalog-links");
  links.replaceChildren();
  if (wide.matches && group) {
    const several = group.families.length > 1;
    const hint = document.createElement("span");
    hint.className = "pane-hint";
    hint.textContent = group.hint;
    links.append(hint);
    for (const section of several ? list.querySelectorAll<HTMLElement>("section.family") : []) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "pane-link";
      jump.textContent = section.querySelector("h2")?.textContent ?? "";
      jump.addEventListener("click", () =>
        list.scrollTo({ top: section.offsetTop - list.offsetTop, behavior: "smooth" }),
      );
      links.append(jump);
    }
  }
  show("catalog", group ? `group:${group.key}` : "");
  list.scrollTop = 0;
  if (!wide.matches && group) {
    const first = list.querySelector<HTMLElement>(`[data-family="${group.families[0]}"]`);
    if (first) list.scrollTop = first.offsetTop - list.offsetTop;
  }
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
  const group = groupOfFamily(level.group);
  show("tiling", group ? `group:${group.key}` : "");
  byId("tiling-title").textContent = level.name;
  renderPicker(byId("tiling-list"), {
    tilings: [level],
    stars: starsFor,
    play: (l) => open(l),
    initial: pick,
    remember: keepPick(`tiling=${level.key}`),
    wide: wide.matches && twoColumns.matches,
  });
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
  else if (["tilings", "catalog", "figures", "figure"].some((q) => query.has(q))) goCatalog(false);
  else if (query.has("group")) goCatalog(false, query.get("group"));
  else if (query.has("tiling")) {
    const tiling = levelByKey(query.get("tiling") ?? "");
    if (tiling && !tiling.decor && tiling.board === 1) goTiling(tiling, false, query.get("pick"));
    else goCatalog(false);
  } else if (query.has("settings")) goSettings(false);
  else goHome(false);
}

// -- a level in play ------------------------------------------------------------

interface Session {
  puzzle: Puzzle;
  board: SvgBoard;
  control: DragControl;
  /** When the first tile went down (performance.now), and when the board was
   * finished: the time taken, shown only on the win card — no clock runs in
   * the header. */
  started: number | null;
  finished: number | null;
  /** The win card was closed (Exit): it stays shut while the board stays
   * finished. */
  dismissed: boolean;
  /** How many hints have been shown on this board — any costs the third
   * star; the win card says how many. */
  hints: number;
  /** The tiles down when the hint was last asked for, by id — a hint on show
   * goes once they change. */
  laidKey: string;
  /** The tiling round the finished board has been asked for (src/extension.ts):
   * once a finish, again only after a tile is taken off and it is finished
   * anew. */
  extending: boolean;
}

let session: Session | null = null;

function elapsed(s: Session): number {
  if (s.started === null) return 0;
  return ((s.finished ?? performance.now()) - s.started) / 1000;
}

const clockText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const laidOf = (s: Session): Laid[] =>
  s.puzzle.tiles.map(({ id, kind, pieces }) => ({ id, kind, pieces }));

function changed(): void {
  const s = session;
  if (!s) return;
  const { puzzle } = s;
  if (s.started === null && puzzle.tiles.length > 0) s.started = performance.now();
  // A tile laid or taken off: any hint on show is out of date, and the new
  // board's is worked out in the background.
  const laidKey = puzzle.tiles.map((t) => t.id).join(",");
  if (laidKey !== s.laidKey) {
    s.laidKey = laidKey;
    if (s.board.hint) {
      s.board.hint = null;
      s.board.draw();
    }
    if (!puzzle.won) hinter.update(puzzle.level, laidOf(s));
  }
  hintButton.disabled = puzzle.won;
  count.textContent = `${Math.floor(puzzle.coverage * 100)}%`;
  if (!puzzle.won) s.dismissed = false;
  won.hidden = !puzzle.won || s.dismissed;
  if (!puzzle.won) {
    // a tile taken off a finished board: the tiling round it goes with it
    s.extending = false;
    if (s.board.extended) s.board.showBeyond(null);
    return;
  }
  extendTiling(s);
  if (s.finished === null) s.finished = performance.now();
  s.control.setRemoving(false);
  const seconds = elapsed(s);
  const stars = puzzle.stars(s.hints > 0);
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
      ? "★ No hints."
      : s.hints > 0
        ? `☆ ${s.hints} ${s.hints === 1 ? "hint" : "hints"} used.`
        : "☆ No hints — that counts once the tiles are no more than needed.",
    `Time: ${clockText(seconds)}`,
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
  placeName();
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
    hints: 0,
    // not the empty board's, so `changed` starts on its hint
    laidKey: "-",
    extending: false,
  };
  setThinking(false);
  const name = byId("level");
  name.textContent = level.name;
  name.title = level.label;
  const boardOf = byId("board-of");
  boardOf.hidden = level.boards < 2;
  boardOf.textContent = `board ${level.board}/${level.boards}`;
  changed();
}

function restart(): void {
  if (session) open(session.puzzle.level, false);
}

function setThinking(on: boolean): void {
  hintButton.classList.toggle("thinking", on);
  hintButton.setAttribute("aria-busy", String(on));
  thinking.hidden = !on;
}

/** Show the hint for the board as it stands: worked out already, often, in
 * the background; else "thinking" until it is. Exact however long it takes —
 * and, once shown, no third star on this board. */
async function showHint(): Promise<void> {
  const s = session;
  if (!s || s.puzzle.won || hintButton.classList.contains("thinking")) return;
  if (!hinter.ready) setThinking(true);
  const hint = await hinter.hint();
  if (session !== s) return;
  setThinking(false);
  if (!hint || s.puzzle.won) return;
  // a press again while this board's hint is on show shows nothing new
  if (!s.board.hint) s.hints++;
  s.board.hint = hint;
  s.board.draw();
}

/** Carry a finished board's tiling on past its edge, as outlines out to the
 * screen's edges, and let it zoom out past the fit (`SvgBoard.showBeyond`).
 * Worked out off the page (src/extension.ts), so it arrives a moment after
 * the win — and only if the board is still on screen, and still finished. */
function extendTiling(s: Session): void {
  if (s.extending) return;
  s.extending = true;
  const { level } = s.puzzle;
  void findExtension(level).then((ext) => {
    if (ext && session === s && s.extending && s.puzzle.won) {
      s.board.showBeyond(ext, levelMid(level));
    }
  });
}

/** Close the win card and look at the finished board. */
function dismiss(): void {
  if (session) session.dismissed = true;
  won.hidden = true;
}

byId("restart").addEventListener("click", restart);
hintButton.addEventListener("click", () => void showHint());
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
// Back from a level: the page of its tiling, with this level picked.
byId("back").addEventListener("click", () => {
  const level = session?.puzzle.level;
  const tiling = level && levelByKey(level.decor?.of ?? level.base);
  if (level && tiling) goTiling(tiling, true, level.key);
  else goHome();
});
// Back from a list page: wherever the player came from, else home.
for (const button of document.querySelectorAll("[data-go-back]"))
  button.addEventListener("click", () => (history.length > 1 ? history.back() : goHome()));
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
  else if (ev.key === "h" || ev.key === "H") void showHint();
});
new ResizeObserver(() => session?.board.layout()).observe(host);
window.addEventListener("popstate", route);

/** The level's name: on a phone a faint label on the page behind the board;
 * on a desktop the header's title, between its two clusters of buttons — the
 * one element, moved. */
function placeName(): void {
  const name = document.querySelector<HTMLElement>(".board-name")!;
  const header = document.querySelector<HTMLElement>("#game .hud")!;
  if (wide.matches) {
    if (name.parentElement !== header)
      header.insertBefore(name, header.querySelector(".hud-right"));
  } else if (name.parentElement !== byId("stage")) byId("stage").prepend(name);
}

// Crossing the desktop's width redraws the screen on show for the layout it
// is now in — but a level in play only moves its name and refits, keeping
// its tiles.
function crossed(): void {
  if (session && !byId("game").hidden) {
    placeName();
    session.board.layout();
  } else route();
}
wide.addEventListener("change", crossed);
twoColumns.addEventListener("change", () => {
  if (!byId("tiling").hidden) route();
});

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
