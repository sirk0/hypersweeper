import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isScheme, SCHEMES } from "../../src/scheme";

// The dark scheme is written twice in styles.css (src/scheme.ts says why):
// under `prefers-color-scheme: dark` for Auto, and on `[data-scheme="dark"]`
// for Dark picked in Settings. The two must say the same, or Dark would look
// one way picked and another followed.

const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

/** The declarations of the first rule whose selector is `selector`, from `from`
 * on, one per line, trimmed. */
function declarations(selector: string, from = 0): string[] {
  const start = css.indexOf(`${selector} {`, from);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css
    .slice(open + 1, close)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("the dark colour scheme", () => {
  const media = css.indexOf("@media (prefers-color-scheme: dark)");
  const followed = declarations(':root:not([data-scheme="light"])', media);
  const picked = declarations(':root[data-scheme="dark"]');

  it("is one media block, and one picked block", () => {
    expect(media).toBeGreaterThanOrEqual(0);
    expect(css.indexOf("@media (prefers-color-scheme: dark)", media + 1)).toBe(-1);
    expect(css.split(':root[data-scheme="dark"] {').length).toBe(2);
  });

  it("says the same followed from the device as picked in Settings", () => {
    expect(followed[0]).toBe("color-scheme: dark;");
    expect(followed.length).toBeGreaterThan(20);
    expect(picked).toEqual(followed);
  });

  it("sets every colour the light scheme does that it changes", () => {
    // Each property the dark block names is one `:root` declares in light (a
    // value's continuation lines are not properties).
    const names = (lines: string[]): string[] =>
      lines.filter((l) => /^[-a-z]+:/.test(l)).map((l) => l.split(":")[0]!);
    const light = names(declarations(":root"));
    for (const name of names(followed)) expect(light).toContain(name);
  });
});

describe("the stored choice", () => {
  it("is Auto, Light or Dark, and nothing else", () => {
    expect(SCHEMES).toEqual(["auto", "light", "dark"]);
    for (const s of SCHEMES) expect(isScheme(s)).toBe(true);
    for (const s of ["", "Dark", null, 1, undefined]) expect(isScheme(s)).toBe(false);
  });
});
