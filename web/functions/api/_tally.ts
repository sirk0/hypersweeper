import {
  DATASET_BLOBS,
  DATASET_DOUBLES,
  parseEvent,
} from "../../src/analyticsEvent";

// The collector's actual logic, in standard web types only — a `Request` in, a
// `Response` out, and one hand-written interface for the Analytics Engine
// binding. `tally.ts` is the thin Cloudflare wrapper around it.
//
// Split out for two reasons. A leading underscore keeps a file out of Pages
// routing, so this is a module rather than a second endpoint; and with no
// Cloudflare types in it, `tests/unit/tally.test.ts` can drive the whole
// request path under vitest's node environment, which the `PagesFunction`
// signature would put out of reach.
//
// The behaviour is deliberately dull:
//
//   - It stores nothing about the request. No IP, no country, no colo, no user
//     agent, no referrer, none of `request.cf`. A rare board plus a country is
//     an identifier, and not being one is the entire promise of this feature.
//   - Anything that is not a well-formed event this build knows about is
//     dropped. Junk and success both answer 204 with an empty body, so the
//     endpoint is no oracle for what the validator accepts.
//   - It has no CORS headers, because same-origin is all it is for. (A missing
//     Access-Control-Allow-Origin would not stop a cross-site POST anyway —
//     the Sec-Fetch-Site check below is what declines one.)
//
// Dataset schema. It is not written here: `DATASET_BLOBS` and
// `DATASET_DOUBLES` in src/analyticsEvent.ts are the column layout, and the
// write below maps over them, so a column's position and its meaning cannot
// drift apart. The table, the rules and the queries are in
// docs/agents/metrics.md.
//
// The one rule worth repeating where the write happens: **append only, never
// renumber.** Every dashboard and scripts/metrics.mjs read these by number.

/** The one method used off Cloudflare's `AnalyticsEngineDataset`. Written out
 * here so this file needs no Worker types, and so the shape the collector
 * depends on is stated rather than inherited. */
export interface AnalyticsDataset {
  writeDataPoint(point: {
    indexes?: string[];
    blobs?: string[];
    doubles?: number[];
  }): void;
}

/** Longest body worth reading. The widest real `end` event is about 210
 * bytes; the headroom is for the next field, not for a body worth parsing. */
const MAX_BODY = 1024;

const NO_CONTENT: ResponseInit = {
  status: 204,
  headers: { "cache-control": "no-store" },
};

export async function handleTally(
  request: Request,
  dataset: AnalyticsDataset | undefined,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }
  // A cross-site POST has no use for this endpoint. Browsers that send the
  // header get declined; ones that do not are let through rather than losing
  // their events, since the header is advisory either way.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new Response(null, NO_CONTENT);
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) {
    return new Response(null, NO_CONTENT);
  }

  let event: ReturnType<typeof parseEvent> = null;
  try {
    const text = await request.text();
    // The declared length is a claim; this is the measurement.
    if (text.length > MAX_BODY) return new Response(null, NO_CONTENT);
    event = parseEvent(JSON.parse(text) as unknown);
  } catch {
    return new Response(null, NO_CONTENT);
  }
  if (!event) return new Response(null, NO_CONTENT);

  try {
    dataset?.writeDataPoint({
      // At most one index, 96 bytes. The mode: 179 possible values, and
      // indexing on it means Analytics Engine samples per board, so a board
      // nobody plays keeps its fidelity while a popular one is being sampled.
      indexes: [event.mode],
      blobs: DATASET_BLOBS.map((column) => column.get(event)),
      doubles: DATASET_DOUBLES.map((column) => column.get(event)),
    });
  } catch {
    // A missing or misbehaving binding must not become a 500 in the player's
    // console. If the report stays empty, the binding is the first thing to
    // check — see "Analytics" in web/README.md.
  }
  return new Response(null, NO_CONTENT);
}
