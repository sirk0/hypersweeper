import { payloadFor, type GameEvent } from "./analyticsEvent";

// Anonymous play counts: which boards get opened, and how often they get won.
// The whole feature is two events per game (a `start` when a board opens, an
// `end` when it finishes) posted to a Pages Function on this app's own origin,
// which writes one row per event to Cloudflare Workers Analytics Engine. There
// is no third-party script, no cookie, no identifier of any kind, and nothing
// here ever reads a response.
//
// This is the transport half; `analyticsEvent.ts` is the pure half that decides
// what an event *is*, exactly as `audio/sound.ts` splits `voicesFor` from the
// player. The call sites (main.ts) name events, never requests.
//
// Three properties the code below is arranged to keep:
//
//   - It cannot break a move. Every global is reached defensively, the whole
//     post is wrapped, nothing is awaited and no failure is surfaced. A 404
//     (the GitHub Pages host has no Functions), a blocked request (an
//     adblocker) and a 204 are all the same to the game.
//   - It is absent, not merely idle, from every build that has nowhere to
//     report to. `__APP_ANALYTICS__` is a build-time constant (vite.config.ts),
//     so in the packaged apps, the GitHub Pages build and `npm run dev` every
//     branch below folds away and the endpoint string never reaches the output
//     — which scripts/check-offline-assets.mjs asserts for the packaged case.
//     This is not tidiness: a post to a host with no Pages Function 404s, and
//     the *browser* logs that to the console, which no care taken here can
//     swallow. A build with no collector must not carry a client for one.
//   - The switch is live. `enabled` is read on every event, like the sound
//     preset and the haptics flag, so turning it off in Settings stops the game
//     already in progress rather than the next one.

/** Same-origin and base-aware — the Pages Function is served from the same
 * origin as the app, whatever path that app is mounted at. The path is
 * deliberately not called "event", "track" or "collect": those are the words
 * filter lists match on, and a blocked request is a lost count. */
const ENDPOINT = `${import.meta.env.BASE_URL}api/tally`;

/** Whether this *build* carries a collector at all: `VITE_ANALYTICS=1`, and
 * never in a packaged app. A `define` constant, so when it is false everything
 * below — the endpoint string included — is removed by the compiler rather than
 * shipped and skipped. */
const COLLECTING = __APP_ANALYTICS__;

let enabled = true;

/** Turn reporting on or off (Settings › Privacy). Validated by the caller —
 * this is a plain boolean preference, like the haptics flag. */
export function setAnalyticsEnabled(on: boolean): void {
  enabled = on;
}

/** Whether anything would be sent — the setting *and* the build. */
export function analyticsEnabled(): boolean {
  return COLLECTING && enabled;
}

/** Report a game event. Fire and forget: returns immediately, never throws,
 * never retries. */
export function trackGame(event: GameEvent): void {
  if (!COLLECTING || !enabled) return;
  const payload = payloadFor(event);
  if (!payload) return;
  post(JSON.stringify(payload));
}

function post(body: string): void {
  try {
    const nav = typeof navigator === "undefined" ? null : navigator;
    // sendBeacon first: it survives the page going away, so an event fired by
    // the move that also closes the tab still lands. It answers false when its
    // queue is full, which falls through to fetch rather than dropping the
    // event.
    if (nav?.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      return;
    }
    if (typeof fetch !== "function") return;
    // `keepalive` gives fetch the same survive-the-unload property. The result
    // is never read and a rejection is swallowed: there is nothing the game
    // would do differently either way.
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      keepalive: true,
      credentials: "omit",
      mode: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  } catch {
    /* no navigator, no fetch, a CSP, an extension that replaced either */
  }
}
