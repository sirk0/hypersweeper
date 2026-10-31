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
    const tags = [
      ...read("../../Dockerfile.e2e").matchAll(/mcr\.microsoft\.com\/playwright:(\S+)/g),
    ].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toBe(`v${pin}-noble`);
  });
});

// The image installs the npm workspace from manifests alone, so it has to copy
// every workspace's package.json, and the root .dockerignore — which keeps the
// build context down to those manifests — has to let each one through. A
// workspace added to the root package.json and not here fails `npm ci` in the
// image, which nobody on Linux would notice until a Mac developer ran it.
describe("the Docker e2e runner installs the whole workspace", () => {
  const workspaces = (
    JSON.parse(read("../../../../package.json")) as {
      workspaces: string[];
    }
  ).workspaces;
  const dockerfile = read("../../Dockerfile.e2e");
  const ignore = read("../../../../.dockerignore").split("\n");

  it("copies the root manifest and lockfile", () => {
    expect(dockerfile).toMatch(/^COPY package\.json package-lock\.json \.\/$/m);
    expect(ignore).toEqual(expect.arrayContaining(["!package.json", "!package-lock.json"]));
  });

  it.each(workspaces)("copies %s/package.json", (ws) => {
    expect(dockerfile).toContain(`COPY ${ws}/package.json ${ws}/`);
    expect(ignore).toContain(`!${ws}/package.json`);
  });
});
