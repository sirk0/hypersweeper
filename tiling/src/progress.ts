// The best this player has done on each level — the stars in the level list,
// 1 to 3. Kept in localStorage, which can be missing or throw (a private
// window, blocked site data), so every access is guarded and the game works
// without it: the stars then last until the page is closed.

const KEY = "tiling-simulator.stars";
/** Before stars were earned in threes, finishing a level was stored as a bare
 * list of level keys; each of those counts as one star. */
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
  const stars = read(KEY);
  if (stars && typeof stars === "object") {
    for (const [k, n] of Object.entries(stars)) {
      if (typeof n === "number" && n >= 1 && n <= 3) best.set(k, Math.max(best.get(k) ?? 0, Math.floor(n)));
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
