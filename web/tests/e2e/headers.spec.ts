import { expect, test } from "@playwright/test";

// The deployed response headers, and the app's behaviour under them.
//
// public/_headers is a Cloudflare Pages file, so on the real site it is applied
// at the edge and nowhere else. The `securityHeaders` plugin in vite.config.ts
// parses that same file and applies it to `vite preview`, which is what this
// suite runs against — so these tests are about the policy that ships, not a
// restatement of it. A directive that would break the app shows up here as a
// blocked resource rather than as a bug report from a player.
//
// What this file deliberately does NOT cover: the 404 page. Cloudflare answers
// an unknown path with 404.html and a 404 status, but `vite preview` has its
// own SPA fallback and serves index.html with a 200, so the behaviour cannot be
// asserted here. It is checked against the PR preview deployment instead — see
// web/docs/deploy.md.
//
// The one thing this covers that a preview deployment cannot: a preview builds
// with VITE_NO_SW=1, so only here does the policy meet the service worker.

/** CSP violations are reported to the document, not the console, so they have
 * to be collected in the page. Installed before any navigation. */
async function collectViolations(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) => {
      seen.push(`${e.violatedDirective} blocked ${e.blockedURI || "(inline)"}`);
    });
  });
}

const violations = (page: import("@playwright/test").Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);

test.describe("security headers", () => {
  test("the site-wide rule is served, and the app loads clean under it", async ({ page }) => {
    await collectViolations(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.setViewportSize({ width: 900, height: 700 });
    const response = await page.goto("/");
    const headers = response!.headers();

    const csp = headers["content-security-policy"];
    expect(csp).toBeDefined();
    // The directives worth pinning: the ones that would silently stop mattering
    // if someone widened the policy to make an unrelated problem go away.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    // The app must never need these; see AGENTS.md's "reference nothing remote".
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");

    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

    await expect(page.locator("body[data-ready]")).toBeVisible();
    expect(await violations(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a played board raises no violation", async ({ page }) => {
    await collectViolations(page);
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto("/");
    await expect(page.locator("body[data-ready]")).toBeVisible();

    // The same one-mine-in-a-corner board sound.spec.ts uses: one click opens a
    // single cell, the far corner floods the rest and wins. That exercises the
    // renderer, the themes' data: URI backgrounds and the win flourish — the
    // three things most likely to want a source the policy does not allow.
    await page.evaluate(() => window.__ms?.startBoard("square", "easy", { mines: ["0,0"] }));
    const single = await page.evaluate(() => window.__ms?.cellScreenXY("1,1"));
    await page.mouse.click(single!.x, single!.y);
    const flood = await page.evaluate(() => window.__ms?.cellScreenXY("8,8"));
    await page.mouse.click(flood!.x, flood!.y);
    expect(await page.evaluate(() => window.__ms?.state().status)).toBe("won");

    expect(await violations(page)).toEqual([]);
  });

  test("the legacy /next/ shim needs no exception from the policy", async ({ page }) => {
    // This page used to carry an inline <script>, and the file used to carry a
    // looser rule for it. That rule never worked: Cloudflare merges every rule
    // matching a path and the browser enforces both policies, so the loose one
    // was intersected with the strict one and the script stayed blocked. The
    // page has an external script now and takes the site-wide rule like
    // everything else — which is what this asserts, so that a reintroduced
    // inline script fails here rather than on the deployed site.
    const response = await page.request.get("/next/");
    expect(response.status()).toBe(200);
    const headers = response.headers();
    // The site-wide rule, verbatim — not a variant of it. `'unsafe-inline'`
    // survives in style-src, which is why this names the script directive
    // rather than searching the whole policy for the string.
    expect(headers["content-security-policy"]).toContain("script-src 'self'");
    expect(headers["content-security-policy"]).not.toContain("script-src 'unsafe-inline'");
    expect(headers["strict-transport-security"]).toContain("max-age=");

    expect(await response.text()).not.toMatch(/<script(?![^>]*\bsrc=)/);
  });

  test("the /next/ redirect still runs under the policy", async ({ page }) => {
    await collectViolations(page);
    // The redirect is covered in app.spec.ts; this is about it surviving a
    // `script-src 'self'` that would silently do nothing but leave the visitor
    // on a dead page.
    await page.goto("/next/?mode=square&difficulty=easy");
    await page.waitForURL((url) => !url.pathname.startsWith("/next/"));
    await expect(page.locator("body[data-ready]")).toBeVisible();
    // The shared board link has to survive the hop, policy or no policy.
    expect(new URL(page.url()).searchParams.get("mode")).toBe("square");
    expect(await violations(page)).toEqual([]);
  });
});
