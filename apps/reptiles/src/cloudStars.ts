import { cloudRead, cloudStoreSupported, cloudWrite, onCloudChange } from "@tiling/native";
import { allStars, allTimes, isTime, mergeStars, mergeTimes } from "./progress";

// The stars in iCloud, and the best times, where the App Store app keeps them
// in step across the player's iPhone and iPad and through a reinstall.
//
// The stars live in `localStorage` (progress.ts), one device's. In the App
// Store app the native `CloudRecord` plugin
// (ios/App/App/CloudRecordPlugin.swift) hands the page iCloud's key-value
// store, reached through `@tiling/native`; this mirrors the stars there and
// merges back what the other devices wrote. Everywhere else — the website, the
// PWA, Android, the Electron Mac app — the plugin is not there and nothing here
// runs.
//
// **One key, `stars`**: every level's best, `{ level: 1..3 }`. The merge keeps
// the most stars per level, which is idempotent — merging the same record
// twice changes nothing — so each device writes the whole merged map, and when
// two writes cross (iCloud keeps the later) the other device hears of it,
// merges again and writes back what was lost. Stars are never taken away, so
// there is nothing a merge cannot express. A thousand-odd levels at a few
// characters each is well inside iCloud's 1 MB.
//
// **And one key, `times`**: every level's fastest finish, `{ level: ms }`,
// merged the same way but keeping the least per level — idempotent too, and a
// best time is never made slower.

const KEY = "stars";
const TIMES_KEY = "times";

/** The stars a stored string holds; anything unreadable is none. */
export function parseCloudStars(raw: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const [level, n] of Object.entries(parsed)) {
      if (typeof n === "number" && n >= 1 && n <= 3) out.set(level, Math.floor(n));
    }
  } catch {
    // unreadable: none
  }
  return out;
}

/** The two records merged — each level's most — and whether either side is
 * missing any of it. */
export function mergeCloudStars(
  local: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
): { merged: Map<string, number>; localBehind: boolean; cloudBehind: boolean } {
  const merged = new Map(local);
  for (const [level, n] of cloud) merged.set(level, Math.max(merged.get(level) ?? 0, n));
  let localBehind = false;
  let cloudBehind = false;
  for (const [level, n] of merged) {
    if ((local.get(level) ?? 0) < n) localBehind = true;
    if ((cloud.get(level) ?? 0) < n) cloudBehind = true;
  }
  return { merged, localBehind, cloudBehind };
}

/** The best times a stored string holds; anything unreadable is none. */
export function parseCloudTimes(raw: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
    for (const [level, ms] of Object.entries(parsed))
      if (isTime(ms)) out.set(level, Math.round(ms));
  } catch {
    // unreadable: none
  }
  return out;
}

/** The two records of best times merged — each level's least — and whether
 * either side is missing any of it. */
export function mergeCloudTimes(
  local: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
): { merged: Map<string, number>; localBehind: boolean; cloudBehind: boolean } {
  const merged = new Map(local);
  for (const [level, ms] of cloud) merged.set(level, Math.min(merged.get(level) ?? Infinity, ms));
  let localBehind = false;
  let cloudBehind = false;
  for (const [level, ms] of merged) {
    if ((local.get(level) ?? Infinity) > ms) localBehind = true;
    if ((cloud.get(level) ?? Infinity) > ms) cloudBehind = true;
  }
  return { merged, localBehind, cloudBehind };
}

async function runSync(): Promise<void> {
  const record = await cloudRead();
  const stars = mergeCloudStars(allStars(), parseCloudStars(record[KEY]));
  const times = mergeCloudTimes(allTimes(), parseCloudTimes(record[TIMES_KEY]));
  if (stars.localBehind) mergeStars(stars.merged);
  if (times.localBehind) mergeTimes(times.merged);
  const write: Record<string, string> = {};
  if (stars.cloudBehind) write[KEY] = JSON.stringify(Object.fromEntries(stars.merged));
  if (times.cloudBehind) write[TIMES_KEY] = JSON.stringify(Object.fromEntries(times.merged));
  if (Object.keys(write).length > 0) await cloudWrite(write);
}

let queue: Promise<void> = Promise.resolve();
let started = false;

/** Merge the stars here with iCloud's. Syncs run one at a time, in order; each
 * is fire-and-forget, and one that fails changes nothing — the next redoes it,
 * since every write is worked out by comparing with what iCloud holds. */
export function syncCloudStars(): void {
  if (!started) return;
  queue = queue.then(runSync).catch(() => {});
}

/** Sync now, whenever iCloud brings another device's change, and whenever the
 * app comes back to the foreground (iCloud's change event is not certain to
 * come). Called once, at launch; a no-op outside the App Store app. */
export function startCloudStars(): void {
  if (started || !cloudStoreSupported()) return;
  started = true;
  onCloudChange(() => syncCloudStars());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncCloudStars();
  });
  syncCloudStars();
}
