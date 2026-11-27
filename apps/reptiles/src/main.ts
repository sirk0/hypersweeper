import "./styles.css";
import { BARS, bandOf, type Band } from "./difficulty";
import { findExtension, levelMid } from "./extension";
import { preferences, type Preferences } from "./preferences";
import { applyScheme } from "./scheme";
import { attachDrag, type DragControl } from "./input/drag";
import type { Laid } from "./hint";
import { Hinter } from "./hintClient";
import { BOARDS, LEVELS, levelByKey, type Level } from "./levels";
import { tilingInPlay, tilingTally } from "./tally";
import { startCloudStars, syncCloudStars } from "./cloudStars";
import { haptic, setHapticsEnabled } from "./haptics";
import {
  allStars,
  bestTimeFor,
  formatTime,
  onStarsMerged,
  recordStars,
  recordTime,
  starsFor,
} from "./progress";
import { forgetBoard, keptCount, keptKeys, loadBoard, saveBoard } from "./saved";
import { noteFinishForReview } from "./review";
import { Puzzle } from "./puzzle";
import { renderCatalog, renderGroupIndex, type GroupTally, type Tally } from "./view/catalog";
import {
  groupOfFamily,
  menuGroup,
  MENU_GROUPS,
  TWO_COLUMNS,
  SIDEWAYS_QUERY,
  WIDE_QUERY,
  type MenuGroup,
} from "./view/groups";
import { throwConfetti } from "./view/confetti";
import { renderHelp, withKeys } from "./view/help";
import { markTutorialSeen, tutorialSeen, tutorialSteps } from "./tutorial";
import { renderHome } from "./view/home";
import { barsIcon, fillGlyphs, trayIcon, vertexFigure } from "./view/icons";
import { dropQueued, renderPicker } from "./view/picker";
import { renderSettings } from "./view/settings";
import { SvgBoard } from "./view/svgBoard";
import { unlockAudio } from "@tiling/sound";
import { applySound, playSound } from "./sound";

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const host = byId("board-host");
const count = byId("count");
const won = byId("won");
const next = byId<HTMLButtonElement>("next");
const hintButton = byId<HTMLButtonElement>("hint");
const randomButton = byId<HTMLButtonElement>("random");
const coach = byId("coach");
const coachNext = byId<HTMLButtonElement>("coach-next");
const coachSkip = byId<HTMLButtonElement>("coach-skip");
const thinking = byId("thinking");

/** Works out the hint for the board in play, in the background after every
 * move (hint.worker.ts), so a press of the hint button often finds it ready. */
const hinter = new Hinter();

/** The tiling `plain` is the first board of, as the catalog counts it: its
 * levels, boards and tile sets, and the stars earned — its boards' and its
 * tile sets' bests summed (tally.ts) — and, given the levels with a board
 * kept (`keptKeys`, read once for the page), whether any is in progress. */
function tallyOf(plain: Level, kept?: ReadonlySet<string>): ReturnType<Tally> {
  const counted = tilingTally(plain, starsFor);
  return kept ? { ...counted, inPlay: tilingInPlay(plain, (k) => kept.has(k)) } : counted;
}

// The colour scheme picked in Settings, before anything is drawn.
applyScheme(preferences().scheme);
// Sound as Settings has it; nothing is heard before the player's first touch
// (a browser starts no audio without a gesture: `unlockAudio`).
applySound(preferences().sound, preferences().volume);
unlockAudio();
// Haptics as Settings has it (src/haptics.ts: only an iPhone in the App Store
// app, or an Android browser, has anything to feel).
setHapticsEnabled(preferences().haptics);
fillGlyphs(document);

/** The desktop layout (view/groups.ts): a sidebar beside every screen but a
 * level's, Tilings split into its five groups, a tiling's page in two
 * columns. Every screen renders at either width, and crossing it re-renders
 * the one on show (below). */
const wide = matchMedia(WIDE_QUERY);
const sideways = matchMedia(SIDEWAYS_QUERY);
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
// More games, at the head of the sidebar's foot, a row like How to play and
// Settings under it: only in a web build (null in a packaged one), in a new tab
// so the game stays put. The phone's is under Tilings on the home screen.
if (__GAMES_SITE_URL__) {
  const games = document.createElement("a");
  games.className = "side-row side-small";
  games.href = __GAMES_SITE_URL__;
  games.target = "_blank";
  games.rel = "noopener";
  games.dataset["action"] = "more-games";
  games.title = "Every game, on tiling-games.pages.dev";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset["icon"] = "games";
  const label = document.createElement("span");
  label.className = "side-label";
  label.textContent = "More games ↗";
  games.append(svg, label);
  fillGlyphs(games);
  document.querySelector(".side-footer")?.prepend(games);
}
sideRows.get("home")?.addEventListener("click", () => goHome());
sideRows.get("help")?.addEventListener("click", () => goHelp());
sideRows.get("settings")?.addEventListener("click", () => goSettings());

/** The tilings a group lists: the first boards of its families, plain. */
function tilingsOf(group: MenuGroup): Level[] {
  return LEVELS.filter((l) => !l.decor && (group.families as readonly string[]).includes(l.group));
}

// -- screens ------------------------------------------------------------------
// Six: home (no query), Tilings — the catalog — (?tilings; old links say
// ?catalog, or ?figures and ?figure=<key> from the Figures screen there was;
// on a desktop one group of it, ?group=<key>), one tiling's boards and tiles
// to pick a level from (?tiling=<key>), How to play (?help), the settings
// (?settings) and a level (?level=<key>). The privacy policy, /privacy, is a
// page of its own (public/privacy.html), not a screen of the app. Each move
// between them is a history entry, so the browser's Back goes back; the
// header's Back goes one level up instead (`up`), whatever the way in was. A
// tiling's page keeps its pick in its URL (`&pick=<level>`), so Back from a
// level comes up to the same one.

const SCREENS = ["home", "catalog", "tiling", "help", "settings", "game"] as const;

/** Where a list page's Back goes: the screen one level up from the one on
 * show — Tilings' groups under home, a group's page under them (under home
 * on a desktop, whose sidebar lists the groups), a tiling's page under its
 * group's. */
let up: () => void = () => goHome();
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
  if (screen !== "game") {
    won.hidden = true;
    // the board left as it stands, and the time spent on it so far
    if (session) keep(session);
  }
}

function goHome(push = true): void {
  if (push) history.pushState(null, "", location.pathname);
  renderHome(byId("home-picks"), tally, playBand, () => goCatalog(), wide.matches);
  show("home", "home");
}

function goHelp(push = true): void {
  if (push) history.pushState(null, "", "?help");
  renderHelp(byId("help-body"), () => openTutorial(0));
  show("help", "help");
}

function goSettings(push = true): void {
  if (push) history.pushState(null, "", "?settings");
  renderSettings(byId("settings-body"), settingsChanged);
  show("settings", "settings");
}

/** A group's tilings, the levels they are and the stars earned on them: what
 * its card in the phone's Tilings counts. */
function groupTally(group: MenuGroup): GroupTally {
  const tallies = tilingsOf(group).map((t) => tallyOf(t));
  return {
    tilings: tallies.length,
    levels: tallies.reduce((sum, t) => sum + t.levels, 0),
    stars: tallies.reduce((sum, t) => sum + t.stars, 0),
    max: tallies.reduce((sum, t) => sum + t.max, 0),
  };
}

/** Tilings: one group's families in grids — `groupKey`'s, or on a desktop
 * the first group's; on a phone with no group named, the five groups' index,
 * a card each opening its page. */
function goCatalog(push = true, groupKey: string | null = null): void {
  const named = menuGroup(groupKey);
  const group = wide.matches ? (named ?? MENU_GROUPS[0]!) : named;
  if (push) history.pushState(null, "", group && groupKey ? `?group=${group.key}` : "?tilings");
  // an old group's link (`?group=aperiodic`) reads as the group it is now in
  else if (named && groupKey !== named.key) history.replaceState(null, "", `?group=${named.key}`);
  const list = byId("catalog-list");
  const links = byId("catalog-links");
  links.replaceChildren();
  if (!group) {
    up = () => goHome();
    renderGroupIndex(list, MENU_GROUPS, groupTally, (key) => goCatalog(true, key));
    byId("catalog-title").textContent = "Tilings";
    show("catalog", "");
    list.scrollTop = 0;
    return;
  }
  // a group's page is under the phone's index of them; on a desktop the
  // sidebar lists the groups, so it is under home
  up = wide.matches ? () => goHome() : () => goCatalog(true);
  const kept = keptKeys();
  renderCatalog(
    list,
    LEVELS.filter((l) => !l.decor),
    (l) => tallyOf(l, kept),
    (level) => open(level),
    (level) => goTiling(level),
    group.families,
  );
  // a group of one family: the page's title already names it
  if (group.families.length === 1)
    for (const head of list.querySelectorAll<HTMLElement>(".family > h2, .family-hint"))
      head.hidden = true;
  byId("catalog-title").textContent = group.name;
  // the group's hint and its families, each a jump to its section
  if (wide.matches) {
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
  show("catalog", `group:${group.key}`);
  list.scrollTop = 0;
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
  up = () => goCatalog(true, group?.key ?? null);
  show("tiling", group ? `group:${group.key}` : "");
  byId("tiling-title").textContent = level.name;
  // the levels in progress, read once for the page's cards
  const kept = keptKeys();
  renderPicker(byId("tiling-list"), {
    tilings: [level],
    stars: starsFor,
    best: bestTimeFor,
    inPlay: (k) => kept.has(k),
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
  else if (query.has("tutorial")) openTutorial(Number(query.get("tutorial")) || 0, false);
  else if (location.search === "" && firstRun()) {
    // a player with nothing to show yet: the tutorial, once, in place of home
    history.replaceState(null, "", "?tutorial");
    openTutorial(0, false);
  } else if (["tilings", "catalog", "figures", "figure"].some((q) => query.has(q)))
    goCatalog(false);
  else if (query.has("group")) goCatalog(false, query.get("group"));
  else if (query.has("tiling")) {
    const tiling = levelByKey(query.get("tiling") ?? "");
    if (tiling && !tiling.decor && tiling.board === 1) goTiling(tiling, false, query.get("pick"));
    else goCatalog(false);
  } else if (query.has("help")) goHelp(false);
  else if (query.has("settings")) goSettings(false);
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
   * finished — the board is locked then (drag.ts), so only a restart can
   * unfinish it. */
  dismissed: boolean;
  /** How many hints have been shown on this board — any costs the third
   * star; the win card says how many. */
  hints: number;
  /** The tiles down when the hint was last asked for, by id — a hint on show
   * goes once they change. */
  laidKey: string;
  /** The tiling round the finished board has been asked for (src/extension.ts):
   * once a finish. */
  extending: boolean;
  /** The board was finished at the last change — so the flourish plays once,
   * as it is finished. */
  wasWon: boolean;
  /** The layout last kept (saved.ts): a move since is kept again. */
  kept: unknown;
  /** The level's best time before this finish, and whether this finish beat
   * it — what the win card says of the time. */
  bestBefore: number | null;
  newBest: boolean;
  /** The tutorial's step this board is (src/tutorial.ts), or null for a
   * level: a step is not starred, timed, kept or hinted — finishing it moves
   * the coach on. */
  tutorial: number | null;
}

let session: Session | null = null;

/** The time spent on the board, in milliseconds: from the first tile down to
 * the finish, or to now. */
function elapsed(s: Session): number {
  if (s.started === null) return 0;
  return (s.finished ?? performance.now()) - s.started;
}

/** Keep the board in play as it stands (saved.ts) — or, finished, forget it:
 * finished, it opens afresh. */
function keep(s: Session): void {
  s.kept = s.puzzle.layout;
  if (s.tutorial !== null) return;
  if (s.puzzle.won) forgetBoard(s.puzzle.level.key);
  else saveBoard(s.puzzle.level, s.puzzle.layout, elapsed(s), s.hints);
}

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
    if (!puzzle.won && s.tutorial === null) hinter.update(puzzle.level, laidOf(s));
  }
  hintButton.disabled = puzzle.won;
  // a move since the board was last kept: keep it again
  if (puzzle.layout !== s.kept) keep(s);
  // finished, the label says so — with the stars on a level — in place of 100%
  count.textContent = !puzzle.won
    ? `${Math.floor(puzzle.coverage * 100)}%`
    : s.tutorial !== null
      ? "Tiled"
      : `Tiled ${starRow(puzzle.stars(s.hints > 0))}`;
  s.board.svg.classList.toggle("finished", puzzle.won);
  if (puzzle.won && !s.wasWon) {
    playSound({ kind: "win", pan: s.control.lastPan() });
    haptic("win");
    if (s.tutorial === null) {
      noteFinishForReview();
      // Hypersweeper's confetti, from the last tile laid (view/confetti.ts)
      const room = byId("stage").getBoundingClientRect();
      throwConfetti(
        s.control.lastAt() ?? [room.left + room.width / 2, room.top + room.height / 2],
        room,
      );
    }
  }
  s.wasWon = puzzle.won;
  won.hidden = !puzzle.won || s.dismissed || s.tutorial !== null;
  if (s.tutorial !== null) {
    drawCoach(s.tutorial, puzzle.won);
    return;
  }
  if (!puzzle.won) {
    // a tile taken off a finished board: the tiling round it goes with it
    s.extending = false;
    if (s.board.extended) s.board.showBeyond(null);
    return;
  }
  extendTiling(s);
  if (s.finished === null) {
    s.finished = performance.now();
    s.bestBefore = bestTimeFor(puzzle.level.key);
    s.newBest = recordTime(puzzle.level.key, elapsed(s));
    if (s.newBest) syncCloudStars();
  }
  s.control.setRemoving(false);
  const ms = elapsed(s);
  const stars = puzzle.stars(s.hints > 0);
  const stars3 = byId("won-stars");
  stars3.textContent = starRow(stars);
  stars3.setAttribute("aria-label", `${stars} of 3 stars`);
  // the piles not at 0: past it (extra tiles) or short of it (another kind
  // laid in their place)
  const off = puzzle.level.need.filter((n, kind) => puzzle.used(kind) !== n).length;
  const lines = [
    "★ Covered, no gaps, no overlaps.",
    s.hints > 0 ? `☆ ${s.hints} ${s.hints === 1 ? "hint" : "hints"} used.` : "★ No hints.",
    off === 0
      ? "★ Every pile in the tray down to 0."
      : `☆ ${off} ${off === 1 ? "pile" : "piles"} in the tray not at 0.`,
    `Time: ${formatTime(ms)}${
      s.newBest
        ? s.bestBefore === null
          ? ""
          : " — a new best!"
        : s.bestBefore === null
          ? ""
          : ` · best ${formatTime(s.bestBefore)}`
    }`,
  ];
  byId("won-detail").replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }),
  );
  if (stars > starsFor(puzzle.level.key)) {
    recordStars(puzzle.level.key, stars);
    syncCloudStars();
  }
}

/** Three stars, `n` of them filled: ★★☆. */
const starRow = (n: number): string => "★".repeat(n) + "☆".repeat(3 - n);

/** Open `level`: as it was left, where a board of it is kept (saved.ts),
 * unless `fresh` — else a new puzzle, a new board in the stage. Given
 * `tutorial`, the level is that step of the tutorial: opened with its own
 * tiles down, and never kept. */
function open(level: Level, push = true, fresh = false, tutorial: number | null = null): void {
  if (session) keep(session);
  if (push) history.pushState(null, "", `?level=${level.key}`);
  show("game");
  placeName();
  const puzzle = new Puzzle(level);
  const saved = fresh || tutorial !== null ? null : loadBoard(level);
  if (fresh && tutorial === null) forgetBoard(level.key);
  if (tutorial !== null) puzzle.resume(tutorialSteps()[tutorial]!.laid);
  if (saved) {
    try {
      puzzle.resume(saved.tiles);
    } catch {
      // not a board of this level as it is now: start afresh
      forgetBoard(level.key);
    }
  }
  const resumed = saved !== null && puzzle.tiles.length === saved.tiles.length;
  host.replaceChildren();
  const board = new SvgBoard(host, puzzle);
  const now = performance.now();
  session = {
    puzzle,
    board,
    control: attachDrag(board, puzzle, changed),
    started: resumed && (saved.ms > 0 || saved.tiles.length > 0) ? now - saved.ms : null,
    finished: null,
    dismissed: false,
    hints: resumed ? saved.hints : 0,
    // not the empty board's, so `changed` starts on its hint
    laidKey: "-",
    extending: false,
    wasWon: false,
    kept: puzzle.layout,
    bestBefore: null,
    newBest: false,
    tutorial,
  };
  // the tutorial has its coach in place of the hint and the die
  coach.hidden = tutorial === null;
  hintButton.hidden = tutorial !== null;
  randomButton.hidden = tutorial !== null;
  setThinking(false);
  const name = byId("level");
  name.textContent = level.name;
  name.title = level.label;
  // how hard it is, as the three bars a tiling's page shows (none in the
  // tutorial, whose boards are not measured)
  const bandMark = byId("level-band");
  const band = tutorial === null ? bandOf(level.key) : null;
  bandMark.replaceChildren(...(band ? [barsIcon(BARS[band])] : []));
  bandMark.hidden = !band;
  if (band) bandMark.setAttribute("aria-label", band);
  else bandMark.removeAttribute("aria-label");
  // a vertex rule's sign: its tray is the plain one, so the name says it
  const rule = byId("level-rule");
  rule.replaceChildren(...(level.rule ? [vertexFigure(level)] : []));
  rule.hidden = !level.rule;
  const boardOf = byId("board-of");
  boardOf.hidden = level.boards < 2;
  boardOf.textContent = `board ${level.board}/${level.boards}`;
  changed();
}

/** Start the level again, from an empty board: what was kept of it goes. A
 * tutorial step starts again as it opened. */
function restart(): void {
  if (!session) return;
  if (session.tutorial !== null) openTutorial(session.tutorial, false);
  else open(session.puzzle.level, false, true);
}

// -- the first-run tutorial (src/tutorial.ts) --------------------------------

/** Whether the tutorial should open by itself: never opened before, and the
 * player has nothing to show yet — no stars, no board in play. */
function firstRun(): boolean {
  return !tutorialSeen() && allStars().size === 0 && keptCount() === 0;
}

/** Open the tutorial at step `step` — a history entry of its own only when
 * it is first opened; its steps follow each other in place. */
function openTutorial(step: number, push = true): void {
  const steps = tutorialSteps();
  const at = Math.min(Math.max(0, Math.floor(step)), steps.length - 1);
  markTutorialSeen();
  const query = at === 0 ? "?tutorial" : `?tutorial=${at}`;
  if (push) history.pushState(null, "", query);
  else history.replaceState(null, "", query);
  open(steps[at]!.level, false, true, at);
}

/** The coach card for step `step`: what to do, or, the board covered, that it
 * is done and Next — after the last, a level to play or home. */
function drawCoach(step: number, done: boolean): void {
  const steps = tutorialSteps();
  const { title, body, done: said } = steps[step]!;
  const last = step === steps.length - 1;
  byId("coach-step").textContent = `${step + 1} of ${steps.length} · ${title}`;
  const text =
    done && last
      ? `${said} That's all you need. The bulb shows a hint when you are stuck, ` +
        "and restart clears the board."
      : done
        ? said
        : body;
  byId("coach-body").replaceChildren(...withKeys(text));
  coachNext.hidden = !done;
  coachNext.textContent = last ? "Play a level" : "Next";
  coachSkip.textContent = done && last ? "Home" : "Skip tutorial";
}

coachNext.addEventListener("click", () => {
  const s = session;
  if (!s || s.tutorial === null) return;
  if (s.tutorial < tutorialSteps().length - 1) openTutorial(s.tutorial + 1, false);
  else playBand("easy");
});
coachSkip.addEventListener("click", () => goHome());

function setThinking(on: boolean): void {
  hintButton.classList.toggle("thinking", on);
  hintButton.setAttribute("aria-busy", String(on));
  thinking.hidden = !on;
}

/** Show the hint for the board as it stands: worked out already, often, in
 * the background; else "thinking" until it is. Exact however long it takes —
 * and, once shown, this board's no-hint star is gone. */
async function showHint(): Promise<void> {
  const s = session;
  if (!s || s.tutorial !== null || s.puzzle.won || hintButton.classList.contains("thinking"))
    return;
  if (!hinter.ready) setThinking(true);
  const hint = await hinter.hint();
  if (session !== s) return;
  setThinking(false);
  if (!hint || s.puzzle.won) return;
  // a press again while this board's hint is on show shows nothing new
  if (!s.board.hint) {
    s.hints++;
    keep(s);
  }
  s.board.hint = hint;
  s.board.draw();
}

/** Carry a finished board's tiling on past its edge, as outlines out to the
 * screen's edges, and let it zoom out past the fit (`SvgBoard.showBeyond`) —
 * where the player has turned it on in Settings (off by default).
 * Worked out off the page (src/extension.ts), so it arrives a moment after
 * the win — and only if the board is still on screen, and still finished. */
function extendTiling(s: Session): void {
  if (s.extending || !preferences().tilingPastBoard) return;
  s.extending = true;
  const { level } = s.puzzle;
  void findExtension(level).then((ext) => {
    if (ext && session === s && s.extending && s.puzzle.won) {
      s.board.showBeyond(ext, levelMid(level));
    }
  });
}

/** A choice made in Settings, while a level may still be open behind them:
 * the colour scheme repaints the page, and the tiling round a finished board
 * comes or goes with its switch. */
function settingsChanged(now: Preferences): void {
  applyScheme(now.scheme);
  setHapticsEnabled(now.haptics);
  const s = session;
  if (!s || !s.puzzle.won) return;
  if (now.tilingPastBoard) extendTiling(s);
  else {
    s.extending = false;
    if (s.board.extended) s.board.showBeyond(null);
  }
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
document.querySelector("#home [data-action=help]")?.addEventListener("click", () => goHelp());
// Another level of the same difficulty as this one, however it was picked.
randomButton.addEventListener("click", () => {
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
// Back from a level: one level up, however it was opened — the page of its
// tiling, with this level picked; a tiling of one level has no page (Tilings
// opens the level itself), so its group's. The tutorial is under home.
byId("back").addEventListener("click", () => {
  const s = session;
  const level = s?.puzzle.level;
  const tiling = level && levelByKey(level.decor?.of ?? level.base);
  if (!s || s.tutorial !== null || !level || !tiling) goHome();
  else if (tallyOf(tiling).levels > 1) goTiling(tiling, true, level.key);
  else goCatalog(true, groupOfFamily(tiling.group)?.key ?? null);
});
// Back from a list page: one level up, never where the player came from —
// set by the screen on show.
for (const button of document.querySelectorAll("[data-go-back]"))
  button.addEventListener("click", () => up());
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
// Leaving the page, or the app going to the background (where an iPhone may
// close it): the board in play is kept with the time spent on it so far.
const keepNow = (): void => {
  if (session && !byId("game").hidden) keep(session);
};
window.addEventListener("pagehide", keepNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") keepNow();
});
window.addEventListener("popstate", route);

/** The level's name: on a phone held upright a faint label on the page
 * behind the board; on a desktop, or a phone held sideways, the header's
 * title, between its two clusters of buttons — the one element, moved. */
function placeName(): void {
  const name = document.querySelector<HTMLElement>(".board-name")!;
  const header = document.querySelector<HTMLElement>("#game .hud")!;
  if (wide.matches || sideways.matches) {
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
// Turning a phone sideways or back moves the name the same way; any other
// screen lays itself out by the stylesheet alone.
sideways.addEventListener("change", () => {
  if (session && !byId("game").hidden) {
    placeName();
    session.board.layout();
  }
});
twoColumns.addEventListener("change", () => {
  if (!byId("tiling").hidden) route();
});

route();
// The stars in iCloud (the App Store app only): another device's arrive at
// launch and later, and a screen that counts them is drawn again.
onStarsMerged(() => {
  const screen = document.body.dataset["screen"];
  if (screen === "home" || screen === "catalog" || screen === "tiling") route();
});
startCloudStars();
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
        session.puzzle.commit();
        session.board.draw();
        changed();
      },
      /** Lay `n` of the board's own tiles, from its bottom-left: a board in
       * play, for the store screenshots (scripts/make-store-screenshots.mts). */
      lay(n: number): void {
        if (!session) return;
        session.puzzle.layOwn(n);
        session.puzzle.commit();
        session.board.draw();
        changed();
      },
    },
  });
}
