import { handleTally } from "./_tally";

// The collector endpoint: one Analytics Engine data point per game event, and
// the only server-side code in the repo. Everything it does lives in
// `_tally.ts` — this file is just the Cloudflare shape around it, so the logic
// can be unit-tested without Worker types.
//
// One `onRequest` switching on the method inside, rather than `onRequestPost`
// beside a catch-all: mixing method-specific and catch-all exports in a file
// has precedence rules not worth depending on.

interface Env {
  /** Declared in web/wrangler.toml. Undefined if the binding did not reach the
   * deployed project, which `handleTally` survives — see the README. */
  GAME_EVENTS?: AnalyticsEngineDataset;
}

export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  handleTally(request, env.GAME_EVENTS);
