import { describe, expect, it, vi } from "vitest";
import { shareBoard, shareTextFor, shareUrlFor, type ShareBoard } from "../../src/share";
import { parseBoardLink } from "../../src/link";

// The rules a share follows, pinned without a document, a clipboard permission
// or a share sheet — the same pure/impure split `sound.ts` and
// `analyticsEvent.ts` are tested through.

const BASE = { origin: "https://example.test", pathname: "/hypersweeper/" };
const BOARD: ShareBoard = { mode: "kleintriakis", difficulty: "easy", seed: 42 };

describe("shareUrlFor", () => {
  it("names the exact board, seed and all", () => {
    expect(shareUrlFor(BOARD, BASE)).toBe(
      "https://example.test/hypersweeper/?mode=kleintriakis&difficulty=easy&seed=42",
    );
  });

  it("round-trips through the link parser", () => {
    const url = new URL(shareUrlFor(BOARD, BASE));
    expect(parseBoardLink(url.search)).toEqual({
      mode: "kleintriakis",
      difficulty: "easy",
      seed: 42,
    });
  });

  it("omits the seed for a board that has none", () => {
    // The test seam builds boards from an explicit mine layout; no seed
    // reproduces one, so the link must not claim a wrong board rather than
    // carrying "null" through as a number.
    expect(shareUrlFor({ ...BOARD, seed: null }, BASE)).toBe(
      "https://example.test/hypersweeper/?mode=kleintriakis&difficulty=easy",
    );
  });

  it("replaces the current query rather than appending to it", () => {
    // The address bar already carries the *current* board's parameters, so a
    // link built by appending would end up with two modes and two seeds.
    const url = shareUrlFor(BOARD, { ...BASE, pathname: "/hypersweeper/" });
    expect(url.match(/mode=/g)).toHaveLength(1);
    expect(url.match(/seed=/g)).toHaveLength(1);
  });

  it("keeps a seed of 0", () => {
    // `mulberry32` takes it, so it is a real board and not an absent seed.
    expect(shareUrlFor({ ...BOARD, seed: 0 }, BASE)).toContain("seed=0");
  });
});

describe("shareTextFor", () => {
  it("names the tiling and the surface, not the tiling alone", () => {
    // "Triakis triangular" alone names five boards; the surface is what makes
    // it one — the same reason the best-times page uses `fullModeLabel`.
    const text = shareTextFor(BOARD);
    expect(text).toContain("Hypersweeper");
    expect(text).toContain("Klein bottle");
    expect(text).toContain("Easy");
  });

  it("adds the time when the share is of a win", () => {
    expect(shareTextFor({ ...BOARD, elapsedMs: 93_400 })).toContain("93s");
  });

  it("leaves the time out otherwise", () => {
    expect(shareTextFor(BOARD)).not.toMatch(/\d+s/);
  });
});

describe("shareBoard", () => {
  it("uses the share sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { share } as unknown as Navigator;
    await expect(shareBoard(BOARD, nav, BASE)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0]![0].url).toBe(shareUrlFor(BOARD, BASE));
  });

  it("falls back to the clipboard where there is none", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nav = { clipboard: { writeText } } as unknown as Navigator;
    await expect(shareBoard(BOARD, nav, BASE)).resolves.toBe("copied");
    expect(writeText.mock.calls[0]![0]).toContain(shareUrlFor(BOARD, BASE));
  });

  it("falls back to the clipboard when the sheet is cancelled", async () => {
    // Dismissing a share sheet rejects. That is a normal outcome, not a broken
    // button — the link should still be offered.
    const writeText = vi.fn().mockResolvedValue(undefined);
    const nav = {
      share: vi.fn().mockRejectedValue(new Error("AbortError")),
      clipboard: { writeText },
    } as unknown as Navigator;
    await expect(shareBoard(BOARD, nav, BASE)).resolves.toBe("copied");
  });

  it("reports failure rather than throwing when neither works", async () => {
    const nav = {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    } as unknown as Navigator;
    await expect(shareBoard(BOARD, nav, BASE)).resolves.toBe("failed");
  });

  it("reports failure when the platform offers nothing at all", async () => {
    await expect(shareBoard(BOARD, {} as Navigator, BASE)).resolves.toBe("failed");
  });
});
