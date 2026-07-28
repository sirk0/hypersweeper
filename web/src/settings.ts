import { hasDifficulty, screens } from "./config/screens";
import { DEFAULT_THEME, resolveTheme } from "./ui/theme";

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
// throwing or wiping the rest. Storage access is wrapped throughout because it
// is not always there — Safari in private mode throws on write, a browser can
// have storage disabled by policy, and the vitest node environment has no
// `localStorage` at all (the same reason haptics.ts guards every global).

const KEY = "ms:settings";
/** Keys earlier builds wrote, newest first. Read once, migrated into `KEY`,
 * then removed. */
const LEGACY_KEYS = ["ms:settings:v1"];

/** Bump when a field changes *meaning* (a rename, a different unit). Purely
 * additive fields need no bump: an old record simply lacks them and picks up
 * the default. `migrate` must handle every version below this one. */
export const SCHEMA_VERSION = 2;

export interface Settings {
  /** A key in `screens.themes`. */
  theme: string;
  /** A key in `screens.difficulties` — the board size the menu launches at. */
  difficulty: string;
  /** `null` follows the OS `prefers-reduced-motion` setting; a boolean is an
   * explicit override from the settings screen. */
  animations: boolean | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME,
  difficulty: screens.defaultDifficulty,
  animations: null,
};

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

function readKey(key: string): Record<string, unknown> | null {
  let raw: string | null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Arrays and `null` are objects to `typeof`; neither is a settings record.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null; // truncated or hand-mangled JSON
  }
}

/** Bring a record written by an older build up to the current shape. Every
 * change so far has been additive, so there is nothing to rewrite — the field
 * readers below supply the defaults for whatever is missing. The hook exists so
 * that a future *renaming* change has one obvious place to live, and so the
 * version is checked rather than assumed. */
function migrate(rec: Record<string, unknown>, from: number): Record<string, unknown> {
  if (from >= SCHEMA_VERSION) return rec;
  // v1 (theme + animations) -> v2 (adds difficulty): nothing to rewrite.
  return rec;
}

/** The stored record, already migrated — or `null` when there is nothing
 * readable anywhere. Also the merge base for `saveSettings`. */
function readRecord(): Record<string, unknown> | null {
  const current = readKey(KEY);
  if (current) {
    const version = typeof current["version"] === "number" ? current["version"] : 1;
    return migrate(current, version);
  }
  for (const legacy of LEGACY_KEYS) {
    const rec = readKey(legacy);
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
    difficulty:
      typeof rec["difficulty"] === "string" && hasDifficulty(rec["difficulty"])
        ? rec["difficulty"]
        : DEFAULT_SETTINGS.difficulty,
    animations: typeof rec["animations"] === "boolean" ? rec["animations"] : null,
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
