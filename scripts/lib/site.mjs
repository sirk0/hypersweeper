// The pure half of scripts/build-site.mjs: turning the games' own files into
// the shared site's, and writing the redirect site a game leaves behind. No
// file system here, so scripts/test/site.test.mjs can check each piece.

/** The folder a game is served from on the shared site, as a URL prefix
 * ("/rep-tiles"). */
export function folderOf(game) {
  return `/${game.web.path}`;
}

/** A game's Cloudflare `_headers` moved under its folder: every rule's pattern
 * gains the prefix, so a game's `/*` becomes `/rep-tiles/*` and cannot reach
 * the landing page or another game. Only the site's root `_headers` is read by
 * Cloudflare, which is why a game's own file has to be rewritten into it.
 * Comments and blank lines are dropped; header lines are kept as they are. */
export function prefixHeaders(text, prefix) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      out.push(line);
      continue;
    }
    const pattern = line.trim();
    if (!pattern.startsWith("/")) {
      throw new Error(`a game's _headers rule must be a path, not ${pattern}`);
    }
    if (out.length) out.push("");
    out.push(`${prefix}${pattern}`);
  }
  return out.join("\n");
}

/** A game's Cloudflare `_redirects` moved under its folder: the source of every
 * rule gains the prefix, and so does a destination that is a path on the site
 * (an absolute URL is left alone). */
export function prefixRedirects(text, prefix) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const [from, to, ...rest] = line.trim().split(/\s+/);
    if (!from.startsWith("/") || !to) {
      throw new Error(`cannot move this _redirects rule under ${prefix}: ${line}`);
    }
    out.push([`${prefix}${from}`, to.startsWith("/") ? `${prefix}${to}` : to, ...rest].join(" "));
  }
  return out.join("\n");
}

/** The shared site's rules for a game deployed to a Pages project of its own:
 * its folder redirects to where it is. A 302, because this is meant to move —
 * a browser caches a 301 for good, and would keep following it after the game
 * comes to live in the folder itself. The query string is carried over by
 * Cloudflare, so a shared board link (?mode=…) still opens its board. */
export function standaloneRedirects(game) {
  const url = game.web.url.replace(/\/*$/, "/");
  const folder = folderOf(game);
  return [`${folder} ${url} 302`, `${folder}/* ${url}:splat 302`].join("\n");
}

/** The rule a PR preview adds, keeping the preview out of search results. Its
 * own `/*` pattern, setting a header no other rule sets: Cloudflare merges
 * rules with different patterns, where a second rule for the same header would
 * be joined to the first with a comma. */
export const NOINDEX_HEADERS = "/*\n  X-Robots-Tag: noindex";

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

/** One landing-page card per game with a site, in the template's
 * `<!-- games -->` slot, and a privacy link per game in `<!-- privacy -->`.
 * Every link is relative to the site root, so a PR preview's page leads to
 * that preview's builds. `icons` is the set of game keys whose favicon was
 * copied to icons/<key>.svg. */
export function renderLanding(template, games, icons = new Set()) {
  const listed = games.filter((g) => g.web);
  const cards = listed.map((g) => {
    const href = `${g.web.path}/`;
    const name = escapeHtml(g.productName);
    const lines = [`<li class="game">`];
    if (icons.has(g.key))
      lines.push(`  <img src="icons/${g.key}.svg" alt="" width="72" height="72" />`);
    lines.push(`  <h2><a href="${href}">${name}</a></h2>`);
    if (g.description) lines.push(`  <p>${escapeHtml(g.description)}</p>`);
    lines.push(`  <div class="links">`);
    lines.push(`    <a class="button play" href="${href}">Play in the browser</a>`);
    if (g.appStore) {
      lines.push(
        `    <a class="button" href="${escapeHtml(g.appStore)}">Get it on the App Store</a>`,
      );
    }
    lines.push(`  </div>`, `</li>`);
    return lines.join("\n");
  });
  const privacy = listed
    .map((g) => `<a href="${g.web.path}/privacy">${escapeHtml(g.productName)}</a>`)
    .join(" · ");
  const fill = (html, slot, content) => {
    if (!html.includes(slot)) throw new Error(`the landing template has no ${slot} slot`);
    return html.replace(slot, content);
  };
  return fill(
    fill(template, "<!-- games -->", cards.join("\n")),
    "<!-- privacy -->",
    listed.length ? `Privacy policies: ${privacy}` : "",
  );
}

/** The paths a moved project still answers with a 301 to the game's new home.
 * Listed one by one rather than as a `/*` splat: Cloudflare applies a matching
 * redirect even where a file exists, and a splat would take /sw.js too — the
 * one path that must stay a file (see `KILL_SWITCH_WORKER`). */
export const MOVED_PATHS = [
  ["/", ""],
  ["/index.html", ""],
  ["/privacy", "privacy"],
  ["/privacy.html", "privacy"],
];

export function movedRedirects(url) {
  const to = url.replace(/\/*$/, "/");
  return MOVED_PATHS.map(([from, rest]) => `${from} ${to}${rest} 301`).join("\n");
}

/** The service worker a moved project serves at /sw.js, where the game's own
 * used to be. An installed copy of the game keeps answering from its precache
 * until its worker is replaced, and a worker update never follows a redirect —
 * so without a file here, a returning visitor would be shown the old game
 * forever. This one takes over, deletes the caches, unregisters itself and
 * reloads every open tab, which then reaches the redirect. */
export const KILL_SWITCH_WORKER = `// Replaces the service worker this site used to serve: the game has moved
// (scripts/build-site.mjs). Clears its caches, unregisters, and reloads every
// open tab so it reaches the redirect to the new address.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key);
      await self.registration.unregister();
      const tabs = await self.clients.matchAll({ type: "window" });
      for (const tab of tabs) tab.navigate(tab.url);
    })(),
  );
});
`;

/** The moved project's page for every other path. */
export function movedNotFound(url, productName) {
  const to = escapeHtml(url.replace(/\/*$/, "/"));
  const name = escapeHtml(productName);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name} has moved</title>
    <link rel="canonical" href="${to}" />
    <meta http-equiv="refresh" content="0; url=${to}" />
    <style>
      html { color-scheme: light dark; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; text-align: center; padding: 1.5rem; }
    </style>
  </head>
  <body>
    <main>
      <p>${name} has moved to <a href="${to}">${to}</a>.</p>
    </main>
  </body>
</html>
`;
}
