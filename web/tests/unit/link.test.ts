import { describe, expect, it } from "vitest";
import { boardLinkQuery, parseBoardLink } from "../../src/link";
import { hasMode, MODES } from "../../src/boards/presets";
import { screens } from "../../src/config/screens";

// Shared links are untrusted input. The rule under test throughout: a parameter
// is read only when its value is one this build knows, an unusable value is
// dropped rather than repaired, and dropping one never costs the others.

describe("parseBoardLink", () => {
  it("reads a full link", () => {
    expect(parseBoardLink("?mode=kleintriakis&difficulty=easy")).toEqual({
      mode: "kleintriakis",
      difficulty: "easy",
      seed: null,
    });
  });

  it("reads a seeded link", () => {
    expect(parseBoardLink("?mode=hex&difficulty=hard&seed=42").seed).toBe(42);
  });

  it("works with or without the leading ?", () => {
    expect(parseBoardLink("mode=hex").mode).toBe("hex");
    expect(parseBoardLink("?mode=hex").mode).toBe("hex");
  });

  it("returns nothing for an empty query", () => {
    expect(parseBoardLink("")).toEqual({ mode: null, difficulty: null, seed: null });
  });

  it("ignores parameters it does not know", () => {
    const link = parseBoardLink("?mode=hex&utm_source=chat&theme=dark&fbclid=x");
    expect(link.mode).toBe("hex");
    expect(link.difficulty).toBeNull();
  });

  it("tolerates case and stray whitespace from a chat client", () => {
    expect(parseBoardLink("?mode=KleinTriakis&difficulty=+EASY+")).toEqual({
      mode: "kleintriakis",
      difficulty: "easy",
      seed: null,
    });
  });
});

describe("parseBoardLink drops values this build does not have", () => {
  it("drops a board that does not exist", () => {
    // The floret pentagonal is chiral, so it has no Klein bottle wrap — the
    // canonical 'shared a link to a board this build cannot build' case.
    expect(hasMode("kleinfloret")).toBe(false);
    expect(parseBoardLink("?mode=kleinfloret&difficulty=easy")).toEqual({
      mode: null,
      difficulty: "easy", // the known key is still read
      seed: null,
    });
  });

  it("drops an unknown difficulty but keeps the mode", () => {
    expect(parseBoardLink("?mode=hex&difficulty=nightmare")).toEqual({
      mode: "hex",
      difficulty: null,
      seed: null,
    });
  });

  it("never resolves a mode through the prototype chain", () => {
    // `mode in PRESETS` would say yes to all of these and then hand the board
    // builder a function.
    for (const attack of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(parseBoardLink(`?mode=${attack}`).mode, attack).toBeNull();
    }
  });

  it("drops a seed the RNG could not reproduce", () => {
    for (const raw of ["abc", "1.5", "Infinity", "-Infinity", "NaN", "1e999", "", "  "]) {
      expect(parseBoardLink(`?seed=${encodeURIComponent(raw)}`).seed, raw).toBeNull();
    }
    // 0 and negatives are whole numbers, so they are usable.
    expect(parseBoardLink("?seed=0").seed).toBe(0);
    expect(parseBoardLink("?seed=-7").seed).toBe(-7);
  });

  it("drops empty values rather than treating them as choices", () => {
    expect(parseBoardLink("?mode=&difficulty=")).toEqual({
      mode: null,
      difficulty: null,
      seed: null,
    });
  });

  it("takes the first of a repeated parameter", () => {
    expect(parseBoardLink("?mode=hex&mode=square").mode).toBe("hex");
  });
});

describe("boardLinkQuery", () => {
  it("round-trips through the parser", () => {
    const q = boardLinkQuery("kleintriakis", "easy");
    expect(q).toBe("?mode=kleintriakis&difficulty=easy");
    expect(parseBoardLink(q)).toEqual({
      mode: "kleintriakis",
      difficulty: "easy",
      seed: null,
    });
  });

  it("carries a seed only when the board had one", () => {
    expect(boardLinkQuery("hex", "easy")).not.toContain("seed");
    expect(parseBoardLink(boardLinkQuery("hex", "easy", 9)).seed).toBe(9);
  });

  it("round-trips every board in the catalog at every difficulty", () => {
    // Every board the menu can launch is therefore shareable: no mode name
    // needs escaping, and none survives the round trip as a different board.
    expect(MODES.length).toBeGreaterThan(100);
    for (const mode of MODES) {
      for (const d of screens.difficulties) {
        const link = parseBoardLink(boardLinkQuery(mode, d.key));
        expect(link.mode, mode).toBe(mode);
        expect(link.difficulty, `${mode}/${d.key}`).toBe(d.key);
      }
    }
  });
});
