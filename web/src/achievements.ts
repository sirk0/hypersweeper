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
// The game has 179 boards across seven tiling families, five surfaces and four
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
 * Declared rather than derived: answering it honestly means building all 179
 * boards and running `classifyShapes` over them, which is about a second — fine
 * in a test, not on a settings page. `tests/unit/achievements.test.ts` does
 * exactly that and fails if this list is wrong, so a tiling with heptagons
 * cannot slip in without a badge. */
export const SHAPE_SIDES = [3, 4, 5, 6, 8, 10, 12, 13];

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

/** How far along one achievement is. `need === 1` is a yes/no; anything more is
 * a count the page shows as `have / need`. */
export interface Measure {
  have: number;
  need: number;
}

export interface Achievement {
  /** Stable — it is what the stored `unlocked` map is keyed by. */
  id: string;
  label: string;
  hint: string;
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

/** One named set of boards an achievement pair is built over. */
interface Group {
  key: string;
  label: string;
  modes: string[];
}

/** The seven tiling families, each gathered across every surface it wraps.
 *
 * The *shared* `familyRows` is used rather than the web menu's `menuFamilyRows`
 * so that `regular` holds the three regular tilings as well as the shaped flat
 * boards — the honest classification of a board, and the one `boardFacts`
 * already reports in the info window. The menu's own promotion of those three
 * rows to the top of a picker is a menu decision, not a fact about the tiling. */
function tilingGroups(): Group[] {
  return pickerFamilies("flat").map((family) => {
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

/** "Win one of these" — a yes/no. */
const anyOf = (modes: string[]) => (_p: Progress, won: ReadonlySet<string>): Measure => ({
  have: Math.min(1, done(modes, won)),
  need: 1,
});

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
 * — the group-completion sets run to 174 boards, and asking for all three
 * difficulties on each would make that 522. */
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
      icon: "star",
      group: "milestone",
      measure: (p) => yesNo(totalWins(p) > 0),
    },
  ];

  screens.difficulties.forEach((d, i) => {
    list.push({
      id: `difficulty:${d.key}`,
      label: `${d.label} cleared`,
      hint: `Win any board on ${d.label.toLowerCase()}`,
      // One filled bar per step up the ladder, so the three rows are told apart
      // by their badges and not only by their names.
      icon: `bars:${i + 1}`,
      group: "milestone",
      measure: (p) =>
        yesNo(Object.values(p.wins).some((byDifficulty) => (byDifficulty[d.key] ?? 0) > 0)),
    });
  });

  for (const tier of WIN_TIERS) {
    list.push({
      id: `wins:${tier}`,
      label: `${tier} boards cleared`,
      hint: `Win ${tier} games, on any boards`,
      icon: "trophy",
      group: "milestone",
      measure: (p) => ({ have: Math.min(totalWins(p), tier), need: tier }),
    });
  }

  list.push(
    {
      id: "flagless",
      label: "No flags",
      hint: "Win a board without ever planting a flag",
      icon: "flag",
      group: "milestone",
      measure: (p) => yesNo(p.flagless > 0),
    },
    {
      id: "unfair",
      label: "Against the odds",
      hint: "Win a board marked as harder than its difficulty promises",
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
    icon: `ngon:${sides}`,
    group: "shape" as const,
    measure: (p: Progress) => yesNo(p.shapes.includes(sides)),
  }));
}

/** The two achievements a group of boards earns: win one of them, and win all
 * of them.
 *
 * Both hints are the count rather than a sentence about the group, because the
 * label has already named it and the number is the thing the label cannot say —
 * "Laves" does not tell you it is 33 boards. It also sidesteps a grammar
 * problem the labels would otherwise force: the groups are named "Torus",
 * "Möbius strip", "The plane" and "Catalan solids", and no one preposition and
 * article fits all four. */
function pairFor(group: Group, kind: AchievementGroup): Achievement[] {
  const n = group.modes.length;
  return [
    {
      id: `${kind}:${group.key}`,
      label: group.label,
      hint: `Win any one of its ${n} boards`,
      icon: group.key,
      group: kind,
      measure: anyOf(group.modes),
    },
    {
      id: `${kind}-all:${group.key}`,
      label: `${group.label} complete`,
      hint: `Win all ${n} of them`,
      icon: group.key,
      group: kind,
      measure: allOf(group.modes),
    },
  ];
}

/** The whole list, in the order the page shows it. Built once at module load —
 * pure string work over the catalogue registries, no board is built. */
export const ACHIEVEMENTS: Achievement[] = (() => {
  const every = everyMode();
  return [
    ...milestones(),
    ...shapeAchievements(),
    ...tilingGroups().flatMap((g) => pairFor(g, "tiling")),
    ...surfaceGroups().flatMap((g) => pairFor(g, "surface")),
    ...solidGroups().flatMap((g) => pairFor(g, "solid")),
    {
      id: "all-boards",
      label: "The whole catalogue",
      hint: `Win every one of the ${every.length} playable boards`,
      icon: "custom",
      group: "grand",
      measure: allOf(every),
    },
  ];
})();

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

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

interface Stored {
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
  if (!rec) return null;
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
 * at 0 / 174. It cannot recover `flagless` (never recorded) or `shapes` (that
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
