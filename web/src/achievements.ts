import {
  FAMILY_LABELS,
  SOLID_GROUPS,
  SURFACE_SPECS,
  familyRows,
  pickerFamilies,
  surfaceMenuModes,
} from "./boards/catalog";
import { blockedModes, fairnessOf } from "./boards/fairness";
import { hasMode } from "./boards/presets";
import { screens } from "./config/screens";
import { sideNoun } from "./ui/boardFacts";
import { readObject, storage } from "./storage";
import { allBestTimes, splitBoardKey } from "./leaderboard";

// Achievements: what a player has seen of the catalogue, and what is left.
//
// The game has 200+ boards across eleven tiling families, eight surfaces and six
// solid groups, and until now finishing one left no trace unless the clock beat
// a record. This is the trace. It is also the only thing in the app that says
// there is more to play than the board in front of you.
//
// **The list is derived, not typed out.** Every registry the menu is built from
// is enumerated here instead — the families from `familyRows`, the surfaces
// from `SURFACE_SPECS`, the solid groups from `SOLID_GROUPS` — so a tiling added
// tomorrow joins its family's achievement the way it joins the menu, the info
// window and the background pattern: with no edit here at all. The one declared
// table is `SHAPE_SIDES`, and a unit test builds every board in the catalogue
// and fails if it drifts (deriving it at runtime costs a second of board
// building, and this module must not build a board).
//
// **Blocked boards are left out of every completion target.** The five triakis
// boards are `blocked` at all three difficulties in `data/difficulty.json`:
// every cell has a look-alike twin, so the menu opens an explanation instead of
// a game and they *cannot be played*. A set containing one could never be
// finished. See `boards/fairness.ts`.
//
// **The stored record is history; unlocking is a pure function of it.** What is
// kept is what was won (and the handful of facts about a win that the mode
// string does not carry); which achievements that earns is recomputed from
// scratch every time by `earned`. The stored `unlocked` map only remembers
// *when*. So an achievement added by a later build unlocks retroactively from
// history already on the device, rather than being unreachable for anyone who
// had already played those boards.

// -- the record ------------------------------------------------------------

const KEY = "ms:achievements";

/** Bump only when a stored field changes *meaning*. Purely additive fields need
 * no bump — an older record simply lacks them. */
export const SCHEMA_VERSION = 1;

/** Total wins at which each milestone tier lands. */
const WIN_TIERS = [10, 50, 250];

/** The distinct tile side counts anywhere in the catalogue.
 *
 * Declared rather than derived: answering it honestly means building all 200+
 * boards and running `classifyShapes` over them, which is about a second — fine
 * in a test, not on a settings page. `tests/unit/achievements.test.ts` does
 * exactly that and fails if this list is wrong, so a tiling with heptagons
 * cannot slip in without a badge. */
export const SHAPE_SIDES = [3, 4, 5, 6, 7, 8, 10, 12, 13];

export interface Progress {
  /** mode -> difficulty -> wins. The history everything else is derived from. */
  wins: Record<string, Record<string, number>>;
  /** Wins in which the player never placed a flag. */
  flagless: number;
  /** Distinct tile side counts of boards won on. Stored rather than derived:
   * recovering it from `wins` means building those boards. */
  shapes: number[];
}

/** One finished game, as the app reports it. */
export interface Win {
  mode: string;
  difficulty: string;
  ms: number;
  /** The player placed no flag all game. Not "no flags on the board": a win
   * auto-flags every remaining mine (see `Game.reveal`). */
  flagless: boolean;
  /** The side counts of this board's tiles. */
  sides: number[];
}

export function emptyProgress(): Progress {
  return { wins: {}, flagless: 0, shapes: [] };
}

// -- the catalogue of achievements -----------------------------------------

/** Game Center points, by kind of achievement.
 *
 * A rule rather than a value per achievement, and a rule over *kinds*, never
 * over how many boards a group has: Game Center fixes an achievement's points
 * once players can see it, and a group grows whenever a tiling is added. So
 * "Laves" is worth the same as "Fractals" — the price of points that cannot
 * drift.
 *
 * Game Center allows 100 points per achievement and 1000 across the game, and
 * achievements are only ever added. Today's 42 spend 625. Points run out
 * first: twenty-five more groups (15 points each) reach exactly 1000 at 67
 * achievements. `tests/unit/achievements.test.ts` checks both caps. */
const POINTS = {
  firstWin: 5,
  /** Per rung of the difficulty ladder: medium 10, hard 15. (Easy has no
   * achievement of its own — see `milestones`.) */
  difficultyRung: 5,
  /** The first win tier; each later tier doubles it: 10, 20, 40. */
  winTier: 10,
  flagless: 10,
  unfair: 10,
  shape: 5,
  /** Win every board of a group. */
  groupAll: 15,
  everything: 100,
} as const;

/** How far along one achievement is. `need === 1` is a yes/no; anything more is
 * a count the page shows as `have / need`. */
export interface Measure {
  have: number;
  need: number;
}

export interface Achievement {
  /** Stable — it is what the stored `unlocked` map is keyed by, and what
   * `gameCenterId` turns into the permanent Game Center id. */
  id: string;
  label: string;
  /** What the page says about it. May quote a board count, which changes as
   * boards are added. */
  hint: string;
  /** What Game Center says before it is earned: `hint` with no board count in
   * it, because Game Center's text is registered once and not rebuilt with the
   * catalogue. */
  brief: string;
  /** What Game Center says once it is earned. */
  done: string;
  /** Game Center points. Set by kind, never by a board count — see
   * `POINTS`. */
  points: number;
  /** A key `ui/icons.ts` `menuIcon` draws. */
  icon: string;
  group: AchievementGroup;
  measure(progress: Progress, won: ReadonlySet<string>): Measure;
}

export type AchievementGroup = "milestone" | "shape" | "tiling" | "surface" | "solid" | "grand";

export const GROUP_LABELS: Record<AchievementGroup, string> = {
  milestone: "Milestones",
  shape: "Shapes",
  tiling: "Tilings",
  surface: "Surfaces",
  solid: "Solids",
  grand: "Everything",
};

/** Every board this build actually ships and a player can actually finish.
 * Both filters matter: `hasMode` drops a catalogue row this deploy did not
 * build, and `blockedModes` drops the boards whose menu row opens an
 * explanation instead of a game. */
const BLOCKED = new Set(blockedModes());
const playable = (modes: Iterable<string>): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const mode of modes) {
    if (seen.has(mode) || !hasMode(mode) || BLOCKED.has(mode)) continue;
    seen.add(mode);
    out.push(mode);
  }
  return out;
};

/** One named set of boards a completion achievement is built over. */
interface Group {
  key: string;
  label: string;
  modes: string[];
}

/** Tiling families with no achievement of their own. "Other" is the catch-all
 * for tilings that fit no named family, and "Other" is not a name to award.
 * Its boards still count towards their surface and the whole catalogue. */
const UNAWARDED_FAMILIES = new Set(["other"]);

/** The tiling families, each gathered across every surface it wraps.
 *
 * The *shared* `familyRows` is used rather than the web menu's `menuFamilyRows`
 * so that `regular` holds the three regular tilings as well as the shaped flat
 * boards — the honest classification of a board, and the one `boardFacts`
 * already reports in the info window. The menu's own promotion of those three
 * rows to the top of a picker is a menu decision, not a fact about the tiling. */
function tilingGroups(): Group[] {
  return pickerFamilies("flat").filter((family) => !UNAWARDED_FAMILIES.has(family)).map((family) => {
    const modes: string[] = [];
    for (const surface of SURFACE_SPECS) {
      for (const row of familyRows(family, surface.key)) modes.push(row.mode);
    }
    return { key: family, label: FAMILY_LABELS[family] ?? family, modes: playable(modes) };
  });
}

function surfaceGroups(): Group[] {
  return SURFACE_SPECS.map((surface) => ({
    key: surface.key,
    label: surface.key === "flat" ? "The plane" : surface.label,
    modes: playable(surfaceMenuModes(surface.key)),
  }));
}

function solidGroups(): Group[] {
  return SOLID_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    modes: playable(group.modes),
  }));
}

/** Every board in the game, once.
 *
 * The geometry groups (five surfaces plus four solid groups) partition it. The
 * tiling families partition what is left after the solids: a Catalan solid is
 * not a tiling of the plane wrapped onto something, it is a solid whose faces
 * were cut up, and it has no family. `tests/unit/achievements.test.ts` pins
 * both, which is what stops a board falling between two groups or being counted
 * by both halves of one. */
function everyMode(): string[] {
  return playable([
    ...SURFACE_SPECS.flatMap((s) => surfaceMenuModes(s.key)),
    ...SOLID_GROUPS.flatMap((g) => g.modes),
  ]);
}

/** How many of `modes` have been won. */
function done(modes: string[], won: ReadonlySet<string>): number {
  let n = 0;
  for (const mode of modes) if (won.has(mode)) n++;
  return n;
}

/** "Win all of these" — a count, so the page can show how far along it is. */
const allOf = (modes: string[]) => (_p: Progress, won: ReadonlySet<string>): Measure => ({
  have: done(modes, won),
  need: modes.length,
});

const yesNo = (ok: boolean): Measure => ({ have: ok ? 1 : 0, need: 1 });

/** Total wins across every board and difficulty. */
export function totalWins(p: Progress): number {
  let n = 0;
  for (const byDifficulty of Object.values(p.wins)) {
    for (const count of Object.values(byDifficulty)) n += count;
  }
  return n;
}

/** Every board won at least once, at any difficulty. One win ticks a board off
 * — the group-completion sets run to 200+ boards, and asking for all three
 * difficulties on each would triple that. */
export function wonModes(p: Progress): Set<string> {
  const out = new Set<string>();
  for (const [mode, byDifficulty] of Object.entries(p.wins)) {
    for (const count of Object.values(byDifficulty)) {
      if (count > 0) {
        out.add(mode);
        break;
      }
    }
  }
  return out;
}

function milestones(): Achievement[] {
  const list: Achievement[] = [
    {
      id: "first-win",
      label: "First clear",
      hint: "Win your first board",
      brief: "Win your first board",
      done: "You won your first board",
      points: POINTS.firstWin,
      icon: "star",
      group: "milestone",
      measure: (p) => yesNo(totalWins(p) > 0),
    },
  ];

  screens.difficulties.forEach((d, i) => {
    // Easy has no achievement of its own: a win on easy is the first win
    // almost every player makes, so it would only say what "First clear" says.
    if (i === 0) return;
    list.push({
      id: `difficulty:${d.key}`,
      label: `${d.label} cleared`,
      hint: `Win any board on ${d.label.toLowerCase()}`,
      brief: `Win any board on ${d.label.toLowerCase()}`,
      done: `You won a board on ${d.label.toLowerCase()}`,
      points: POINTS.difficultyRung * (i + 1),
      // One filled bar per step up the ladder, so the three rows are told apart
      // by their badges and not only by their names.
      icon: `bars:${i + 1}`,
      group: "milestone",
      measure: (p) =>
        yesNo(Object.values(p.wins).some((byDifficulty) => (byDifficulty[d.key] ?? 0) > 0)),
    });
  });

  WIN_TIERS.forEach((tier, i) => {
    list.push({
      id: `wins:${tier}`,
      label: `${tier} boards cleared`,
      hint: `Win ${tier} games, on any boards`,
      brief: `Win ${tier} games, on any boards`,
      done: `You won ${tier} games`,
      points: POINTS.winTier * 2 ** i,
      icon: "trophy",
      group: "milestone",
      measure: (p) => ({ have: Math.min(totalWins(p), tier), need: tier }),
    });
  });

  list.push(
    {
      id: "flagless",
      label: "No flags",
      hint: "Win a board without ever planting a flag",
      brief: "Win a board without ever planting a flag",
      done: "You won a board without planting a single flag",
      points: POINTS.flagless,
      icon: "flag",
      group: "milestone",
      measure: (p) => yesNo(p.flagless > 0),
    },
    {
      id: "unfair",
      label: "Against the odds",
      hint: "Win a board marked as harder than its difficulty promises",
      brief: "Win a board marked as harder than its difficulty promises",
      done: "You won a board that was harder than its difficulty promised",
      points: POINTS.unfair,
      icon: "warning",
      group: "milestone",
      // Derived rather than stored: `wins` already says which board at which
      // difficulty, and `data/difficulty.json` says which of those are graded.
      measure: (p) =>
        yesNo(
          Object.entries(p.wins).some(([mode, byDifficulty]) =>
            Object.entries(byDifficulty).some(
              ([difficulty, count]) => count > 0 && fairnessOf(mode, difficulty) === "warn",
            ),
          ),
        ),
    },
  );
  return list;
}

function shapeAchievements(): Achievement[] {
  return SHAPE_SIDES.map((sides) => ({
    id: `shape:${sides}`,
    label: capitalise(plural(sideNoun(sides))),
    hint: `Win a board whose tiles have ${sides} sides`,
    brief: `Win a board whose tiles have ${sides} sides`,
    done: `You won a board whose tiles have ${sides} sides`,
    points: POINTS.shape,
    icon: `ngon:${sides}`,
    group: "shape" as const,
    measure: (p: Progress) => yesNo(p.shapes.includes(sides)),
  }));
}

type GroupKind = "tiling" | "surface" | "solid";

/** How Game Center's text names a group's boards, by the kind of group. */
const GROUP_WORDS: Record<GroupKind, string> = {
  tiling: "tiled this way",
  surface: "on this surface",
  solid: "in this group of solids",
};

/** The one achievement a group of boards earns: win every one of them.
 *
 * There used to be a "win any one" half beside it, which a first win handed
 * out three of at once (its tiling, its surface, and its solid group). Those
 * are gone: they said nothing a player had not just done, and they doubled
 * the list Game Center has to be told about.
 *
 * The id keeps its `-all:` form, so a record from before carries no stamp that
 * could be mistaken for this one, and the label is the group's plain name.
 *
 * The page's hint is the count, because the label has already named the group
 * and the number is the thing it cannot say — "Laves" does not tell you it is
 * 33 boards. Game Center's text cannot carry the count (see `brief`), so it
 * names what the boards share instead, in words that fit every group of that
 * kind. */
function groupAchievement(group: Group, kind: GroupKind): Achievement {
  const which = GROUP_WORDS[kind];
  const n = group.modes.length;
  return {
    id: `${kind}-all:${group.key}`,
    label: group.label,
    hint: n === 1 ? "Win its one board" : `Win all ${n} of its boards`,
    brief: `Win every board ${which}`,
    done: `You won every board ${which}`,
    points: POINTS.groupAll,
    icon: group.key,
    group: kind,
    measure: allOf(group.modes),
  };
}

/** The whole list, in the order the page shows it. Built once at module load —
 * pure string work over the catalogue registries, no board is built. */
export const ACHIEVEMENTS: Achievement[] = (() => {
  const every = everyMode();
  return [
    ...milestones(),
    ...shapeAchievements(),
    ...tilingGroups().map((g) => groupAchievement(g, "tiling")),
    ...surfaceGroups().map((g) => groupAchievement(g, "surface")),
    ...solidGroups().map((g) => groupAchievement(g, "solid")),
    {
      id: "all-boards",
      label: "The whole catalogue",
      hint: `Win every one of the ${every.length} playable boards`,
      brief: "Win every playable board in the game",
      done: "You won every playable board in the game",
      points: POINTS.everything,
      icon: "custom",
      group: "grand",
      measure: allOf(every),
    },
  ];
})();

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// -- Game Center -------------------------------------------------------------
//
// The App Store builds report these achievements to Game Center. Game Center
// keeps its own list, registered in App Store Connect, and once an achievement
// is live there its id and points are permanent and it cannot be deleted. So
// everything below is a fixed function of the achievement's own stable id and
// kind, never of the catalogue's current size.

/** Game Center's own limits: points per achievement, points across the game,
 * achievements per game, and characters in an id. */
export const GAME_CENTER_LIMITS = {
  pointsEach: 100,
  pointsTotal: 1000,
  achievements: 100,
  idLength: 100,
} as const;

/** The Game Center id of an achievement: `hs.` and the app's id with `:` as
 * `.` and `-` as `_`, because Game Center ids are letters, digits, `.` and `_`.
 * `tiling-all:2-uniform` is `hs.tiling_all.2_uniform`.
 *
 * A pure rewrite of an id that is already stable, so it is stable too. It is
 * one-to-one as long as app ids use only lowercase letters, digits, `:` and
 * `-`, which the unit tests check. */
export function gameCenterId(id: string): string {
  return `hs.${id.replaceAll(":", ".").replaceAll("-", "_")}`;
}

/** One achievement as Game Center is told about it. */
export interface GameCenterAchievement {
  /** The app's own id, which the stored record and the page use. */
  id: string;
  gameCenterId: string;
  points: number;
  title: string;
  /** Pre-earned description. */
  brief: string;
  /** Earned description. */
  done: string;
  /** The `ui/icons.ts` key its image is drawn from. */
  icon: string;
}

/** Every achievement as Game Center sees it, in list order. */
export const GAME_CENTER_ACHIEVEMENTS: GameCenterAchievement[] = ACHIEVEMENTS.map((a) => ({
  id: a.id,
  gameCenterId: gameCenterId(a.id),
  points: a.points,
  title: a.label,
  brief: a.brief,
  done: a.done,
  icon: a.icon,
}));

/** The boards a completion target leaves out, for the line the page shows. */
export const EXCLUDED_MODES: string[] = blockedModes().filter(hasMode);

// -- earning ---------------------------------------------------------------

/** One win folded into a progress record. Pure: the input is not mutated, so a
 * caller can diff before against after. */
export function applyWin(p: Progress, win: Win): Progress {
  const byDifficulty = { ...(p.wins[win.mode] ?? {}) };
  byDifficulty[win.difficulty] = (byDifficulty[win.difficulty] ?? 0) + 1;

  const shapes = new Set(p.shapes);
  for (const sides of win.sides) if (Number.isInteger(sides) && sides >= 3) shapes.add(sides);

  return {
    wins: { ...p.wins, [win.mode]: byDifficulty },
    flagless: p.flagless + (win.flagless ? 1 : 0),
    shapes: [...shapes].sort((a, b) => a - b),
  };
}

/** Every achievement this progress record earns, recomputed from scratch. */
export function earned(p: Progress): string[] {
  const won = wonModes(p);
  return ACHIEVEMENTS.filter((a) => {
    const { have, need } = a.measure(p, won);
    return have >= need;
  }).map((a) => a.id);
}

/** How far along one achievement is, for the page. */
export function measureOf(a: Achievement, p: Progress, won = wonModes(p)): Measure {
  return a.measure(p, won);
}

// -- storage ---------------------------------------------------------------
//
// Shaped exactly like `leaderboard.ts`: one stable key holding a record that
// carries its own version, reads that are total (anything unreadable degrades
// to a default rather than throwing on boot), a re-read immediately before the
// write so a game finished in another tab survives, and unknown keys carried
// through untouched.

export interface Stored {
  progress: Progress;
  unlocked: Record<string, number>;
}

function parseWins(raw: unknown): Record<string, Record<string, number>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [mode, byDifficulty] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof byDifficulty !== "object" || byDifficulty === null) continue;
    const counts: Record<string, number> = {};
    for (const [difficulty, n] of Object.entries(byDifficulty as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n > 0) counts[difficulty] = Math.floor(n);
    }
    if (Object.keys(counts).length > 0) out[mode] = counts;
  }
  return out;
}

function parseCounts(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
  }
  return out;
}

function parseNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const n of raw) if (typeof n === "number" && Number.isInteger(n) && n >= 3) out.add(n);
  return [...out].sort((a, b) => a - b);
}

function readStored(): Stored | null {
  const rec = readObject(KEY);
  return rec ? parseStored(rec) : null;
}

/** A stored record, validated the way every read is. Exported for
 * `cloudRecord.ts`, which reads the other devices' records out of iCloud in
 * this same shape. */
export function parseStored(rec: Record<string, unknown>): Stored {
  const count = rec["flagless"];
  return {
    progress: {
      wins: parseWins(rec["wins"]),
      flagless: typeof count === "number" && Number.isFinite(count) && count > 0
        ? Math.floor(count)
        : 0,
      shapes: parseNumbers(rec["shapes"]),
    },
    unlocked: parseCounts(rec["unlocked"]),
  };
}

function write(next: Stored): void {
  const store = storage();
  if (!store) return;
  const rec = readObject(KEY) ?? {};
  try {
    store.setItem(
      KEY,
      JSON.stringify({ ...rec, version: SCHEMA_VERSION, ...next.progress, unlocked: next.unlocked }),
    );
  } catch {
    /* quota exceeded, or storage disabled mid-session */
  }
}

/** The stored record, or a seeded one the first time this build runs.
 *
 * Seeding is why this is not simply `emptyProgress()`: `allBestTimes()` is
 * already a complete list of every board and difficulty this device has ever
 * won, so a player who has cleared eighty boards should not meet this feature
 * at 0 / 200-odd. It cannot recover `flagless` (never recorded) or `shapes` (that
 * needs the boards themselves — see `seedShapes`), so those start where the
 * history genuinely is: empty. */
function loadStored(now: number = Date.now()): Stored {
  const stored = readStored() ?? { progress: seedFromBestTimes(), unlocked: {} };
  // Everything the record already earns counts as earned *now* rather than on
  // the next win: it is true of the history as it stands, and a card announcing
  // it later would be announcing something the Achievements page has been
  // showing as unlocked all along. On a seeded record that is the whole of what
  // the best times were worth; on an ordinary one it is nothing at all, and
  // this costs a walk of the list.
  let fresh = false;
  for (const id of earned(stored.progress)) {
    if (stored.unlocked[id] === undefined) {
      stored.unlocked[id] = Number.isFinite(now) && now > 0 ? Math.floor(now) : 0;
      fresh = true;
    }
  }
  if (fresh) write(stored);
  return stored;
}

/** A progress record built from the best-times list. Runs at most once per
 * device (the write in `loadStored` means the next call reads a record). */
function seedFromBestTimes(): Progress {
  let progress = emptyProgress();
  for (const [key, entries] of allBestTimes()) {
    const split = splitBoardKey(key);
    if (!split || !hasMode(split.mode)) continue;
    for (const entry of entries) {
      // A seeded win says nothing about flags or shapes, and claims neither.
      progress = applyWin(progress, { ...split, ms: entry.ms, flagless: false, sides: [] });
    }
  }
  return progress;
}

/** The whole record, progress and unlock dates — what `cloudRecord.ts` merges
 * with the other devices'. Seeds it, like every read, the first time. */
export function loadRecord(): Stored {
  return loadStored();
}

/** Replace the stored record with the iCloud merge's result. */
export function replaceRecord(next: Stored): void {
  write(next);
}

export function loadProgress(): Progress {
  return loadStored().progress;
}

/** id -> when it was unlocked (epoch ms), for the dates on the page. */
export function unlockedAt(): Record<string, number> {
  return loadStored().unlocked;
}

/** File a win and return the ids it newly unlocked, in list order.
 *
 * A write the browser refuses (private mode, quota) still reports them: the
 * player did just earn them, and the card saying so is the truth about the game
 * they played. It simply will not be there next launch — the bargain
 * `recordTime` and `saveSettings` both make. */
export function recordWin(win: Win, now: number = Date.now()): string[] {
  const stored = loadStored(now);
  const progress = applyWin(stored.progress, win);
  const unlocked = { ...stored.unlocked };
  const at = Number.isFinite(now) && now > 0 ? Math.floor(now) : 0;
  const fresh: string[] = [];
  for (const id of earned(progress)) {
    if (unlocked[id] === undefined) {
      unlocked[id] = at;
      fresh.push(id);
    }
  }
  write({ progress, unlocked });
  return fresh;
}

/** Forget everything (the page's clear action). Only this app's own key is
 * touched — and note that the next read re-seeds from the best times, which is
 * the honest answer: those wins did happen. */
export function clearAchievements(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* storage disabled mid-session */
  }
}

// -- words -----------------------------------------------------------------

function plural(word: string): string {
  return `${word}s`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
