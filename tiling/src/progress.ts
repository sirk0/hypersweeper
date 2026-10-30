// Which levels this player has finished — the stars in the level list. Kept in
// localStorage, which can be missing or throw (a private window, blocked site
// data), so every access is guarded and the game works without it: the stars
// then last until the page is closed.

const KEY = "tiling-simulator.solved";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const keys: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

const solved = load();

export function isSolved(level: string): boolean {
  return solved.has(level);
}

export function markSolved(level: string): void {
  if (solved.has(level)) return;
  solved.add(level);
  try {
    localStorage.setItem(KEY, JSON.stringify([...solved]));
  } catch {
    // kept in memory only
  }
}
