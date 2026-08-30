import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Docker runner (docker-compose.e2e.yml) is only trustworthy because its
// base image tag *is* the @playwright/test pin: that is what puts the same
// Chromium — and so the same SwiftShader, which draws every baseline pixel —
// in the container and in CI. A dependency bump that moves one and not the
// other leaves a runner that quietly rasterises the gallery with a different
// binary, which is the one failure this whole arrangement exists to prevent.
// A caret range does the same thing more slowly, by floating the pin itself.
//
// Both are cheap to catch on strings, so they fail here rather than as a red
// visual suite. The stronger check is in Dockerfile.e2e itself, which resolves
// the pin's executable inside the image and fails the build if it is absent.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const pin = (
  JSON.parse(read("../../package.json")) as {
    devDependencies: Record<string, string>;
  }
).devDependencies["@playwright/test"];

describe("the Docker e2e runner tracks the Playwright pin", () => {
  it("pins @playwright/test exactly, not to a range", () => {
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it(`names playwright:v${pin}-noble in Dockerfile.e2e`, () => {
    const tags = [...read("../../Dockerfile.e2e").matchAll(/mcr\.microsoft\.com\/playwright:(\S+)/g)].map(
      (m) => m[1],
    );
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toBe(`v${pin}-noble`);
  });
});
