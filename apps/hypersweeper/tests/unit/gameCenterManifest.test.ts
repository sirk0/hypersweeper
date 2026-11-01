import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GAME_CENTER_DIR,
  IMAGE_PX,
  LOCALE,
  MANIFEST_PATH,
  buildManifest,
  manifestJson,
} from "../../scripts/gamecenter-lib";

// The Game Center list is registered by hand in App Store Connect from
// apps/hypersweeper/ios/GameCenter/, and a live achievement can never be taken back. So the
// committed list has to be exactly what the code would report: an achievement
// the catalogue grows has to show up as a diff to this file, where somebody
// decides to register it, rather than be reported to a Game Center that has
// never heard of it.

const REGENERATE =
  "run `npm run gamecenter` in apps/hypersweeper/ and commit apps/hypersweeper/ios/GameCenter/";

/** A PNG's width, height and colour type, off its IHDR chunk. */
function pngHeader(file: string): { width: number; height: number; colourType: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 8).toString("hex"), file).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii"), file).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25]! };
}

describe("the committed Game Center list", () => {
  it("is exactly what the code generates", () => {
    expect(existsSync(MANIFEST_PATH), REGENERATE).toBe(true);
    expect(readFileSync(MANIFEST_PATH, "utf8"), REGENERATE).toBe(manifestJson());
  });

  it("names every achievement once, in App Store Connect's terms", () => {
    const { achievements } = buildManifest();
    const ids = achievements.map((a) => a.vendorIdentifier);
    const names = achievements.map((a) => a.referenceName);
    const titles = achievements.map((a) => a.localizations[LOCALE]!.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    // Two achievements with one title would read as a duplicate in Game Center.
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("rings every group completion, and the whole catalogue apart", () => {
    // A completion's badge is its group's menu icon; on its own in Game Center,
    // the ring is what says "all of these".
    const { achievements } = buildManifest();
    const rings = new Map(achievements.map((a) => [a.referenceName, a.ring]));
    for (const [id, ring] of rings) {
      const expected =
        id === "all-boards" ? "catalogue" : /^[a-z]+-all:/.test(id) ? "complete" : null;
      expect(ring, id).toBe(expected);
    }
    expect([...rings.values()].filter((r) => r === "complete")).toHaveLength(28);
  });

  it("has a 1024 px RGB image for each achievement, and no others", () => {
    const { achievements } = buildManifest();
    const named = new Set<string>();
    for (const a of achievements) {
      const image = a.localizations[LOCALE]!.image;
      named.add(path.basename(image));
      const file = path.join(GAME_CENTER_DIR, image);
      expect(existsSync(file), `${image}: ${REGENERATE}`).toBe(true);
      // App Store Connect asks for RGB; colour type 2 is RGB with no alpha.
      expect(pngHeader(file), image).toEqual({ width: IMAGE_PX, height: IMAGE_PX, colourType: 2 });
    }
    const onDisk = readdirSync(path.join(GAME_CENTER_DIR, "images"));
    expect(
      onDisk.filter((f) => !named.has(f)),
      REGENERATE,
    ).toEqual([]);
  });
});
