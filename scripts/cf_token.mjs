// Is this failure the read-only token, or the query?
//
// The two scripts that talk to Cloudflare's Analytics Engine SQL API
// (metrics.mjs, check_dashboards.mjs) fail in two completely different ways,
// and they look alike from the outside: an HTTP 4xx with a body. One means the
// statement named something the dialect does not have; the other means the
// token behind `Authorization: Bearer` is expired, rolled, deleted, or too
// narrow. Only the body tells them apart, and Grafana — where this is usually
// noticed first — shows the status and nothing else, so every panel on a
// dashboard reads `Query error: 400` and the obvious reading ("the SQL broke")
// is the wrong one.
//
// So the signatures live here, once, and both scripts say which failure it is
// rather than leaving the caller to guess. grafana/README.md, "When the
// dashboards go blank", is the human version of the same table.

/** Cloudflare's authentication and authorization envelopes. `10000` is its
 * generic "Authentication error" (a token that is expired or not a token at
 * all); `9109` is a live token that does not carry Account Analytics: Read, or
 * is scoped to another account. The text forms are matched too because the
 * codes travel inside a JSON body this never parses — a SQL error comes back
 * as plain text, so there is nothing to parse in the case that matters. */
const AUTH = /Authentication error|Invalid API Token|Invalid request headers|Unauthorized to access|"code"\s*:\s*(?:10000|9109)|token.{0,20}expired/i;

/** True when a non-2xx body is about the credentials rather than the SQL. */
export function isAuthError(body) {
  return AUTH.test(String(body ?? ""));
}

/** What to do about it. Printed verbatim by both scripts. The two halves of the
 * Bearer prefix are worth spelling out because the same value is pasted in two
 * places with two different shapes: these scripts add `Bearer ` themselves, so
 * CF_API_TOKEN is the bare token, while Grafana's header field is the whole
 * value and needs the prefix typed in. A token that works here and still fails
 * there is almost always that. */
export const TOKEN_HINT =
  "That is the token, not the SQL: CF_API_TOKEN is expired, rolled, deleted, or\n" +
  "missing 'Account -> Account Analytics: Read' for this account.\n" +
  "CF_API_TOKEN is the bare token — this script adds 'Bearer ' itself.\n" +
  "Grafana's Authorization header is the other shape: the word 'Bearer', a\n" +
  "space, then the token. Pasting the token alone there fails the same way.\n" +
  "Roll or recreate it, then update the Grafana datasource too — the steps are\n" +
  "in grafana/README.md, 'The read-only token'.";
