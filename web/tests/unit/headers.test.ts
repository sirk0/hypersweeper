import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// public/_headers is applied by Cloudflare and by the `securityHeaders` plugin
// in vite.config.ts, and edited by the PR preview job on its way out. Nothing
// typechecks it and a mistake in it is silent — the deployment serves fewer
// headers and says nothing — so the invariants the other two pieces rely on are
// asserted here, in the spirit of dockerE2e.test.ts pinning the Dockerfile
// against package.json.
//
// The e2e suite covers the other half: that the policy the file describes is
// one the app can actually run under.

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const headers = read("../../public/_headers");
const previewWorkflow = read("../../../.github/workflows/pr-preview.yml");

/** The unindented pattern lines — one per rule. */
const patterns = headers
  .split("\n")
  .filter((line) => line.trim() && !line.trimStart().startsWith("#") && !/^\s/.test(line))
  .map((line) => line.trim());

describe("public/_headers", () => {
  it("declares exactly one rule, which is what makes the policy predictable", () => {
    // Cloudflare merges every rule matching a path and sends a header named by
    // two of them twice; browsers then enforce both policies, so a second rule
    // can only ever intersect this one — it cannot widen it for a subpath, and
    // the format has no negation to carve a path out with. A deployment once
    // proved this the expensive way. Adding a rule is not forbidden, but it
    // means reasoning about the intersection, so it should fail here first.
    expect(patterns).toEqual(["/*"]);
  });

  it("carries the headers the deployment is expected to serve", () => {
    for (const name of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
    ]) {
      expect(headers).toContain(`  ${name}: `);
    }
  });

  it("keeps the script directives that make the policy worth having", () => {
    const csp = /^\s*Content-Security-Policy: (.+)$/m.exec(headers)?.[1] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    // The app needs neither, and `check-offline-assets.mjs` plus AGENTS.md's
    // "reference nothing remote" rule are the reasons it never will.
    expect(csp).not.toContain("'unsafe-eval'");
    expect(/script-src[^;]*'unsafe-inline'/.test(csp)).toBe(false);
  });

  it("stays editable by the PR preview job", () => {
    // The preview inserts its noindex rule into the block below with a sed
    // address. If this file's first pattern line ever stops looking like what
    // that sed matches, the preview silently ships without the noindex — or,
    // in the version of this that actually happened, without the policy. The
    // job greps to catch it; this catches it a good deal earlier.
    expect(previewWorkflow).toContain("sed -i 's#^/\\*$#/*\\n  X-Robots-Tag: noindex#' dist/_headers");
    expect(headers).toMatch(/^\/\*$/m);
  });
});
