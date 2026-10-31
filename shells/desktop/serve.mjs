// Mapping an `app://` request onto a file in the packaged web build.
//
// The desktop shell does *not* load the app over `file://`: the web app is
// written for an origin, and a file URL has none — `localStorage` (every
// setting and every best time), `history.replaceState` (the share link a board
// writes) and the absolute `/fonts/…` URLs in styles.css all break there. So
// `main.mjs` registers `app://` as a standard, secure scheme and serves the
// build through it; the app then runs exactly as it does on the web, with no
// network and no rewriting of the bundle.
//
// This module is the one security-sensitive part of that — turning a URL the
// renderer asked for into a path on disk — so it is kept separate from the
// Electron plumbing and unit-tested in test/serve.test.mjs.
import { normalize, posix, resolve, sep } from "node:path";

/** The scheme and host the packaged app is served from. */
export const APP_SCHEME = "app";
export const APP_HOST = "local";
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** Paths that get the index page: the root, and any extension-less path (the
 * app routes by query string, not by path, so this only ever catches a stray
 * navigation — but answering it with the app beats answering with a 404). */
function isDocumentPath(pathname) {
  return pathname.endsWith("/") || !posix.basename(pathname).includes(".");
}

/**
 * Resolve an `app://` URL to an absolute path inside `root`.
 *
 * Returns `null` when the URL is not ours or points outside the root — the
 * caller answers those with a 404. Containment is checked after normalising,
 * so `..` segments (which a standard scheme's URL parser usually folds away
 * anyway, but this must not depend on that) cannot escape.
 *
 * @param {string} url  the request URL, e.g. "app://local/assets/index.js"
 * @param {string} root directory holding the built web app
 * @returns {string | null}
 */
export function resolveAssetPath(url, root) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.hostname !== APP_HOST) {
    return null;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null; // malformed percent-encoding
  }
  if (pathname.includes("\0")) return null;
  if (isDocumentPath(pathname)) pathname = "/index.html";

  const base = resolve(root);
  const full = normalize(resolve(base, `.${pathname}`));
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}
