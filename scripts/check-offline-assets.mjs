// Fail the desktop build if the bundle would reach for the network.
//
// "Works with no internet" is the reason the macOS app exists, and it is the
// kind of property that breaks quietly: one CDN font, one analytics snippet,
// one absolute URL left in a stylesheet, and the app still builds, still runs
// on the developer's machine, and shows a blank panel on a plane. So the build
// asserts it instead — every remote URL in the built output has to be one of
// the two kinds that are fine, and anything else stops the build.
//
// Two passes, because a request need not name a host: the app's own analytics
// collector is a *relative* path on whatever origin serves the app, which the
// URL scan cannot see. FORBIDDEN below is the second pass, and the only
// automated proof that the collector really was compiled out of this build.
//
//   node scripts/check-offline-assets.mjs web/dist
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/** Remote URLs that are *not* loads:
 *  - XML namespace identifiers, which name a spec and are never fetched;
 *  - the source-code link on the settings page, which only opens when the
 *    player clicks it (and the desktop shell hands it to the system browser).
 *  - sourcemap/spec references in vendored comments, which ship no request;
 *  - the Capacitor license banner (`/*! Capacitor: https://capacitorjs.com/ …`),
 *    a comment the minifier keeps in the bridge the iOS app talks through. */
const ALLOWED = [
  /^https?:\/\/(www\.)?w3\.org\//,
  /^https?:\/\/github\.com\/sirk0\/hypersweeper/,
  /^https?:\/\/(www\.)?khronos\.org\//,
  /^https?:\/\/(www\.)?capacitorjs\.com\/$/,
];

/** Same-origin paths that must not survive into a packaged bundle even though
 * they name no host. `web/src/analytics.ts` posts anonymous play counts to a
 * Cloudflare Pages Function, behind the build-time constant `__APP_ANALYTICS__`
 * — which `VITE_PACKAGED=1` vetoes outright, so the transport and this string
 * with it are supposed to be gone from the macOS and iOS bundles. This pass is
 * what proves that, and it is the whole reason the app can promise those builds
 * talk to nothing. */
const FORBIDDEN = ["api/tally"];

/** Files whose contents can carry a load. Fonts/images are binary and are
 * checked only by being present. */
const TEXT = new Set([".html", ".css", ".js", ".mjs", ".json", ".svg", ".webmanifest"]);

const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const root = process.argv[2];
if (!root) {
  console.error("usage: node scripts/check-offline-assets.mjs <dist dir>");
  process.exit(2);
}

const problems = [];
let scanned = 0;
let files = 0;

for (const file of walk(root)) {
  files += 1;
  if (!TEXT.has(extname(file))) continue;
  scanned += 1;
  const text = readFileSync(file, "utf8");
  for (const match of text.match(URL_RE) ?? []) {
    if (ALLOWED.some((re) => re.test(match))) continue;
    problems.push(`${relative(root, file)}: ${match}`);
  }
  for (const path of FORBIDDEN) {
    if (text.includes(path)) {
      problems.push(`${relative(root, file)}: same-origin request to ${path}`);
    }
  }
}

// The one thing whose absence is as bad as a remote URL: the fonts the UI and
// the LED counters are drawn in, which must travel with the bundle.
for (const font of ["fonts/Rubik-Bold.ttf", "fonts/DSEG7Classic-Bold.ttf"]) {
  try {
    statSync(join(root, font));
  } catch {
    problems.push(`missing bundled asset: ${font}`);
  }
}

if (problems.length) {
  console.error(
    `offline check FAILED — the build would need the network:\n  ` +
      [...new Set(problems)].join("\n  "),
  );
  process.exit(1);
}

console.log(
  `offline check ok — ${files} files (${scanned} scanned for remote URLs), no external loads`,
);
