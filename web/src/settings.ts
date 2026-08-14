import { clampVolume, DEFAULT_SOUND, DEFAULT_VOLUME, resolveSound } from "./audio/presets";
import { hasDifficulty, screens } from "./config/screens";
import { readObject, storage } from "./storage";
import {
  DEFAULT_SCHEME,
  DEFAULT_THEME,
  resolveScheme,
  resolveTheme,
  type SchemePref,
} from "./ui/theme";

// Persisted user preferences — the app's only stored state. Gameplay state
// (flag mode, zoom, which menu page you are on, the board in progress) stays in
// memory and resets on reload, as it always has.
//
// Storage layout: one key holding one JSON object that carries its own
// `version`. The version is deliberately *not* in the key name — a versioned
// key ("…:v1", "…:v2") silently resets everyone's preferences on every schema
// change, because the new build looks up a key that has never been written.
// Keeping the key stable and versioning the record lets `migrate` upgrade an
// old record instead, and `LEGACY_KEYS` still picks up records written under
// the old scheme.
//
// Reading is total: every field is validated on its own, so a partial, stale,
// hand-edited or corrupt record degrades to defaults field by field rather than
// throwing or wiping the rest. Reaching storage at all, and parsing a key into
// a record, are `storage.ts`'s job — storage is not always there (Safari in
// private mode, a policy-disabled store, the vitest node environment), and both
// stored records answer that the same way.
//
// Best times are *not* here: they are game history rather than a preference,
// they grow with every board played, and they have their own key
// (`leaderboard.ts`). Keeping them apart is what lets this record stay small
// enough to re-read and rewrite on every settings change and to mirror across
// tabs on a `storage` event.

const KEY = "ms:settings";
/** Keys earlier builds wrote, newest first. Read once, migrated into `KEY`,
 * then removed. */
const LEGACY_KEYS = ["ms:settings:v1"];

/** Bump when a field changes *meaning* (a rename, a different unit). Purely
 * additive fields need no bump: an old record simply lacks them and picks up
 * the default. `migrate` must handle every version below this one. */
export const SCHEMA_VERSION = 4;

export interface Settings {
  /** A key in `THEME_KEYS` — how the board's cells are cut and what the page is
   * made of (see ui/theme.ts). Until v3 this was a chrome palette alone, with a
   * separate `cellStyle` beside it; until v4 it was that *and* the colour
   * scheme, which is now `scheme` below. */
  theme: string;
  /** `"auto"`, `"light"` or `"dark"` — which palette the theme paints its
   * chrome with. `auto` follows the device's `prefers-color-scheme`, resolved
   * at paint time by `activeScheme`, the same way `animations: null` defers to
   * `prefers-reduced-motion`. Read on every repaint, so an OS switch reaches a
   * board already in play. */
  scheme: SchemePref;
  /** A key in `screens.difficulties` — the board size the menu launches at. */
  difficulty: string;
  /** `null` follows the OS `prefers-reduced-motion` setting; a boolean is an
   * explicit override from the settings screen. */
  animations: boolean | null;
  /** A key in `SOUND_PRESETS`, or `"off"` — what the game sounds like. Read on
   * every event, so a change applies to the board already in play. */
  sound: string;
  /** How loud that is, 0..1 — the ceiling every voice is scaled by. Separate
   * from `sound` because it is a level rather than a character: turning it down
   * keeps the preset, and `off` is still the only silence with no audio graph
   * behind it. */
  volume: number;
  /** Whether the game buzzes: the Taptic Engine in the iOS app, the Vibration
   * API elsewhere. Read on every event, like `sound`. */
  haptics: boolean;
  /** Whether the page behind the board is patterned with that board's own
   * tiling (Settings › Appearance, and only the Realistic theme has one at
   * all — see ui/backgroundPattern.ts). Off by default: it is a flourish, and
   * a flourish is something to turn on rather than something to discover
   * already running. */
  backgrounds: boolean;
  /** Whether anonymous play counts are reported (Settings › Privacy). Read on
   * every event too, so turning it off silences the game already in progress.
   * Meaningless in the packaged builds, which carry no collector at all. */
  analytics: boolean;
  /** Whether the player has already been shown how to open and flag a cell.
   * Set the first time a board is opened, so the hint over the board is a
   * first-run thing and never appears again. Not a preference the settings
   * page offers — it is a fact about this browser, kept here because this is
   * the record that already survives a reload. */
  seenHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  scheme: DEFAULT_SCHEME,
  difficulty: screens.defaultDifficulty,
  animations: null,
  sound: DEFAULT_SOUND,
  volume: DEFAULT_VOLUME,
  haptics: true,
  backgrounds: false,
  analytics: true,
  seenHint: false,
};

/** What a pre-v3 `theme` (a chrome palette) becomes once a theme carries the
 * board's look too. Two keys survive unchanged because the v3 themes named after
 * them kept them; the other four palettes have no theme of their own any more
 * and land on the v3 default.
 *
 * These are **v3** keys, not current ones — the two tables run in series, so
 * this one may only ever speak v3. */
const V2_THEMES: Record<string, string> = {
  ios: "light",
  flat: "light",
  neumorph: "light",
  glass: "light",
  paper: "light",
  classic: "classic",
  dark: "dark",
};

/** The v3 default, written out rather than read from `DEFAULT_THEME`. It was the
 * same constant when v2 -> v3 was the only migration, and letting it drift with
 * the current default would silently re-aim every v2 record: a `glass` player
 * would land on today's default (Realistic) instead of passing through `light`
 * to Flat. */
const V3_DEFAULT = "light";

/** What a v3 `theme` (a look *and* a colour scheme) becomes now that the scheme
 * is its own setting. Light and Dark were the same look — both cut their cells
 * with the `flat` style — so both are Flat, and the scheme half is not
 * recovered: everyone lands on `auto` by simply not having the key. */
const V3_THEMES: Record<string, string> = {
  light: "flat",
  dark: "flat",
  classic: "classic",
  realistic: "realistic",
};

/** Bring a record written by an older build up to the current shape.
 *
 * v1 (theme + animations) -> v2 (adds difficulty) was purely additive, so there
 * was nothing to rewrite and the field readers below supplied the defaults.
 *
 * v2 -> v3 is the first change that is not: `theme` used to name a chrome
 * palette, with `cellStyle` a separate setting beside it, and now it names a
 * finished look carrying both. So the old pair is translated into the one theme
 * that best matches it — which is why the *pair* is read here rather than each
 * field on its own, and why a v2 player who had chosen the glossy cells lands on
 * Realistic rather than being flattened to Light with everyone else. The stale
 * `cellStyle` key is left in the record: `saveSettings` carries unknown keys
 * over anyway, and a downgrade to a v2 build should find its setting intact.
 *
 * v3 -> v4 splits that theme in two: `theme` keeps the look and the new `scheme`
 * takes the colour. Light and Dark were one look on two palettes, so both become
 * Flat. The scheme itself is *not* carried over — the key is simply absent, and
 * an absent key is `auto`, so everyone comes out following their device. That is
 * a deliberate product call rather than a limitation: `auto` is the new default
 * and it is the setting most people would have picked had it existed.
 *
 * The branches run in **series**, not as alternatives: a v1 record passes
 * through both, so each may only speak the vocabulary of the version it is
 * upgrading *to*. */
function migrate(rec: Record<string, unknown>, from: number): Record<string, unknown> {
  if (from >= SCHEMA_VERSION) return rec;
  if (from < 3) {
    const palette = typeof rec["theme"] === "string" ? rec["theme"] : "";
    const cells = typeof rec["cellStyle"] === "string" ? rec["cellStyle"] : "";
    const mapped = Object.hasOwn(V2_THEMES, palette) ? V2_THEMES[palette]! : V3_DEFAULT;
    // A palette that named a theme of its own wins — "classic" meant the
    // classic look then and means it now. Otherwise the cell style is the
    // better evidence of what the player was after.
    rec = { ...rec, theme: mapped === V3_DEFAULT && cells === "gloss" ? "realistic" : mapped };
  }
  if (from < 4) {
    const look = typeof rec["theme"] === "string" ? rec["theme"] : "";
    rec = { ...rec, theme: Object.hasOwn(V3_THEMES, look) ? V3_THEMES[look]! : DEFAULT_THEME };
  }
  return rec;
}

/** The stored record, already migrated — or `null` when there is nothing
 * readable anywhere. Also the merge base for `saveSettings`. */
function readRecord(): Record<string, unknown> | null {
  const current = readObject(KEY);
  if (current) {
    const version = typeof current["version"] === "number" ? current["version"] : 1;
    return migrate(current, version);
  }
  for (const legacy of LEGACY_KEYS) {
    const rec = readObject(legacy);
    if (rec) return migrate(rec, typeof rec["version"] === "number" ? rec["version"] : 1);
  }
  return null;
}

/** The stored settings, with every field validated independently. */
export function loadSettings(): Settings {
  const rec = readRecord();
  if (!rec) return { ...DEFAULT_SETTINGS };
  return {
    // A theme or difficulty that has since been removed (or was never valid)
    // falls back rather than propagating an unknown key into the UI.
    theme: resolveTheme(typeof rec["theme"] === "string" ? rec["theme"] : null),
    // Same treatment, and it doubles as the additive-field reader: a record
    // from before the split has no `scheme` at all and lands on `auto`.
    scheme: resolveScheme(typeof rec["scheme"] === "string" ? rec["scheme"] : null),
    difficulty:
      typeof rec["difficulty"] === "string" && hasDifficulty(rec["difficulty"])
        ? rec["difficulty"]
        : DEFAULT_SETTINGS.difficulty,
    animations: typeof rec["animations"] === "boolean" ? rec["animations"] : null,
    // Same treatment: an unknown preset (or a `null` from a build that had no
    // sound) falls back rather than silencing the game by accident. `"off"` is
    // a valid stored value and survives.
    sound: resolveSound(typeof rec["sound"] === "string" ? rec["sound"] : null),
    // Additive field, and a number rather than a key: anything that is not a
    // finite 0..1 level (a string, a NaN, a record from a build without it)
    // falls back to full volume, which is what every earlier build played at.
    volume:
      typeof rec["volume"] === "number"
        ? clampVolume(rec["volume"])
        : DEFAULT_SETTINGS.volume,
    // Additive field: a record from a build without haptics simply lacks it and
    // takes the default (on), which is what a device that can buzz should do
    // out of the box.
    haptics:
      typeof rec["haptics"] === "boolean" ? rec["haptics"] : DEFAULT_SETTINGS.haptics,
    // Additive, and defaulting *off*: a record from a build before the page
    // could be patterned lacks the key, and should look the way it did.
    backgrounds:
      typeof rec["backgrounds"] === "boolean"
        ? rec["backgrounds"]
        : DEFAULT_SETTINGS.backgrounds,
    // Additive in the same way: a record from a build before the collector
    // existed lacks the key and takes the default (on), which is what the
    // hosted game does out of the box and what the Privacy row then shows.
    analytics:
      typeof rec["analytics"] === "boolean" ? rec["analytics"] : DEFAULT_SETTINGS.analytics,
    // Purely additive, so it needs no schema bump: a record written by an older
    // build simply lacks it and the player gets the hint once, which is right.
    seenHint:
      typeof rec["seenHint"] === "boolean" ? rec["seenHint"] : DEFAULT_SETTINGS.seenHint,
  };
}

/** Persist `settings`. Unrecognised keys already in the record are carried
 * over: if a newer build wrote fields this one does not know about, opening the
 * app in an older tab must not throw them away. A write the browser refuses is
 * not worth failing a click over — the choice still applies for this session. */
export function saveSettings(settings: Settings): void {
  const store = storage();
  if (!store) return;
  const existing = readRecord() ?? {};
  const record = { ...existing, ...settings, version: SCHEMA_VERSION };
  try {
    store.setItem(KEY, JSON.stringify(record));
    // Only once the new key holds the data, so an interrupted migration cannot
    // lose it.
    for (const legacy of LEGACY_KEYS) store.removeItem(legacy);
  } catch {
    /* quota exceeded, or storage disabled mid-session */
  }
}

/** Call `onChange` when another tab or window changes the stored settings —
 * two tabs open (or a tab beside the installed PWA) should not disagree about
 * the theme. Returns an unsubscribe function. */
export function subscribeSettings(onChange: (settings: Settings) => void): () => void {
  if (typeof window === "undefined" || !window.addEventListener) return () => {};
  const handler = (e: StorageEvent): void => {
    // `key === null` is a `localStorage.clear()` from another tab, which resets
    // us to the defaults just as it reset the store.
    if (e.key !== null && e.key !== KEY && !LEGACY_KEYS.includes(e.key)) return;
    onChange(loadSettings());
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

/** Whether animations should run, given a stored preference and the OS
 * setting. `null` (the default) defers to the OS. */
export function animationsEnabled(pref: boolean | null): boolean {
  if (pref !== null) return pref;
  if (typeof window === "undefined") return true;
  return !(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
}
