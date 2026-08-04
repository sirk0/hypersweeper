// The `app://` → file mapping is the shell's only attack surface: whatever the
// renderer asks for, it must never reach outside the packaged build. These
// pin that, plus the two conveniences (index for document paths, percent
// decoding) the app itself depends on.
//
//   node --test desktop/test/
import assert from "node:assert/strict";
import { sep } from "node:path";
import { test } from "node:test";

import { resolveAssetPath } from "../serve.mjs";

const ROOT = `${sep}srv${sep}app`;

test("serves a plain asset", () => {
  assert.equal(
    resolveAssetPath("app://local/assets/index-abc123.js", ROOT),
    `${ROOT}${sep}assets${sep}index-abc123.js`,
  );
});

test("root and extension-less paths get the index page", () => {
  const index = `${ROOT}${sep}index.html`;
  assert.equal(resolveAssetPath("app://local/", ROOT), index);
  assert.equal(resolveAssetPath("app://local/settings", ROOT), index);
});

test("a share link's query and hash are not part of the path", () => {
  assert.equal(
    resolveAssetPath("app://local/index.html?mode=hexhex&difficulty=easy#x", ROOT),
    `${ROOT}${sep}index.html`,
  );
});

test("percent-encoded paths are decoded", () => {
  assert.equal(
    resolveAssetPath("app://local/fonts/DSEG7%20Classic.ttf", ROOT),
    `${ROOT}${sep}fonts${sep}DSEG7 Classic.ttf`,
  );
});

test("traversal cannot escape the build directory", () => {
  for (const url of [
    "app://local/../../etc/passwd",
    "app://local/assets/../../../../etc/passwd",
    "app://local/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
    "app://local/..%2f..%2fetc%2fpasswd",
  ]) {
    const got = resolveAssetPath(url, ROOT);
    assert.ok(
      got === null || got.startsWith(ROOT + sep),
      `${url} escaped to ${got}`,
    );
  }
});

test("other schemes and hosts are refused", () => {
  assert.equal(resolveAssetPath("file:///etc/passwd", ROOT), null);
  assert.equal(resolveAssetPath("https://example.com/index.html", ROOT), null);
  assert.equal(resolveAssetPath("app://evil/index.html", ROOT), null);
  assert.equal(resolveAssetPath("not a url", ROOT), null);
});

test("malformed encoding and NUL bytes are refused", () => {
  assert.equal(resolveAssetPath("app://local/a%ZZb.js", ROOT), null);
  assert.equal(resolveAssetPath("app://local/a%00b.js", ROOT), null);
});
