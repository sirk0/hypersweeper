import { MeshBasicMaterial, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  patchTexture,
  resolveTexture,
  TILE_TEXTURE_HINTS,
  TILE_TEXTURE_LABELS,
  TILE_TEXTURES,
} from "../../src/render/tileTexture";

describe("tile textures", () => {
  it("lists None first, with a label and a hint for every entry", () => {
    expect(TILE_TEXTURES[0]).toBe("none");
    for (const key of TILE_TEXTURES) {
      expect(TILE_TEXTURE_LABELS[key], key).toBeTruthy();
      expect(TILE_TEXTURE_HINTS[key], key).toBeTruthy();
    }
  });

  it("resolves an unknown key to None", () => {
    expect(resolveTexture("wood")).toBe("wood");
    expect(resolveTexture("velvet")).toBe("none");
    expect(resolveTexture(null)).toBe("none");
    expect(resolveTexture(undefined)).toBe("none");
  });

  it("leaves an untextured material exactly as it was", () => {
    // The default board must compile the shaders it always did.
    const m = new MeshStandardMaterial();
    const before = m.onBeforeCompile;
    patchTexture(m, "none", true);
    patchTexture(m, undefined, true);
    expect(m.onBeforeCompile).toBe(before);
  });

  it("keys the program cache on the texture and the lighting", () => {
    // Two boards textured differently must never share a compiled program.
    const keys = new Set<string>();
    for (const key of TILE_TEXTURES.filter((k) => k !== "none")) {
      for (const lit of [true, false]) {
        const m = lit ? new MeshStandardMaterial() : new MeshBasicMaterial();
        patchTexture(m, key, lit);
        keys.add(m.customProgramCacheKey());
      }
    }
    expect(keys.size).toBe((TILE_TEXTURES.length - 1) * 2);
  });
});
