// The best this player has done on each level — the stars in the level list,
// 1 to 3. Kept in localStorage, which can be missing or throw (a private
// window, blocked site data), so every access is guarded and the game works
// without it: the stars then last until the page is closed.

const KEY = "rep-tiles.stars";
/** Where the stars were kept while the game was called Tiling Simulator, and,
 * before stars were earned in threes, the bare list of finished levels — each
 * of those counts as one star. Read once more, never written. */
const RENAMED_KEY = "tiling-simulator.stars";
const OLD_KEY = "tiling-simulator.solved";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function load(): Map<string, number> {
  const best = new Map<string, number>();
  const old = read(OLD_KEY);
  if (Array.isArray(old)) for (const k of old) if (typeof k === "string") best.set(k, 1);
  for (const stars of [read(RENAMED_KEY), read(KEY)]) {
    if (!stars || typeof stars !== "object") continue;
    for (const [k, n] of Object.entries(stars)) {
      if (typeof n === "number" && n >= 1 && n <= 3)
        best.set(k, Math.max(best.get(k) ?? 0, Math.floor(n)));
    }
  }
  return best;
}

const best = load();

/** The most stars earned on a level so far, 0 if it has never been finished. */
export function starsFor(level: string): number {
  return best.get(level) ?? 0;
}

/** Record a finish; only an improvement is kept. */
export function recordStars(level: string, stars: number): void {
  if (stars <= starsFor(level)) return;
  best.set(level, stars);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(best)));
  } catch {
    // kept in memory only
  }
}
