import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The iMessage sticker pack (ios/App/Stickers) is rendered by
// scripts/make-stickers.mts, which also writes every Contents.json. Nothing
// builds the iOS app in CI, so a sticker missing from disk, a file over Apple's
// size limit or an icon slot with no image would first show up as an Xcode or
// App Store Connect error. These pin what the catalog has to hold.

const CATALOG = resolve(__dirname, "../../../ios/App/Stickers/Stickers.xcassets");
const PACK = resolve(CATALOG, "Sticker Pack.stickerpack");
const ICONSET = resolve(CATALOG, "iMessage App Icon.stickersiconset");

const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

/** A PNG's width, height and colour type, from its IHDR chunk. */
function pngHeader(file: string): { width: number; height: number; colourType: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25]! };
}

describe("iMessage sticker pack", () => {
  const pack = json(resolve(PACK, "Contents.json"));

  it("lists stickers, all the size its grid asks for and within Apple's 500 KB", () => {
    const px = { small: 300, regular: 408, large: 618 }[pack.properties["grid-size"] as string];
    expect(px).toBeDefined();
    expect(pack.stickers.length).toBeGreaterThan(0);
    for (const { filename } of pack.stickers as { filename: string }[]) {
      const dir = resolve(PACK, filename);
      const { properties } = json(resolve(dir, "Contents.json"));
      const png = resolve(dir, properties.filename);
      expect(existsSync(png), png).toBe(true);
      expect(statSync(png).size, png).toBeLessThanOrEqual(500 * 1024);
      const { width, height } = pngHeader(png);
      expect([width, height], png).toEqual([px, px]);
      expect(properties["accessibility-label"], filename).toBeTruthy();
    }
  });

  it("has an image of the right size, with no alpha channel, in every icon slot", () => {
    const { images } = json(resolve(ICONSET, "Contents.json"));
    for (const { filename, size, scale } of images as Record<string, string>[]) {
      const [w, h] = size!.split("x").map(Number) as [number, number];
      const k = parseInt(scale!, 10);
      const { width, height, colourType } = pngHeader(resolve(ICONSET, filename!));
      expect([width, height], filename).toEqual([w * k, h * k]);
      expect(colourType, `${filename} is not opaque RGB`).toBe(2);
    }
  });
});
