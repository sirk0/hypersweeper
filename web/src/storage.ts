// The two things every persisted record in the app needs before it can do
// anything else: reach `localStorage` at all, and turn a key into a plain
// object.
//
// Storage access is wrapped because it is not always there — Safari in private
// mode throws on write, a browser can have storage disabled by policy, and the
// vitest node environment has no `localStorage` at all (the same reason
// haptics.ts guards every global). Reading is *total*: anything unreadable,
// truncated or hand-mangled comes back as `null` and the caller falls back to
// its defaults, rather than throwing on boot.
//
// Shared by `settings.ts` (preferences) and `leaderboard.ts` (best times),
// which otherwise keep their own keys and their own record shapes.

export function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage disabled by policy
  }
}

/** The JSON object stored at `key`, or `null` when there is nothing usable
 * there. Arrays and `null` are objects to `typeof`; neither is a record, so
 * both are rejected here rather than by every caller. */
export function readObject(key: string): Record<string, unknown> | null {
  let raw: string | null;
  try {
    raw = storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null; // truncated or hand-mangled JSON
  }
}
