import { describe, expect, it } from "vitest";
import {
  mergeCloudStars,
  mergeCloudTimes,
  parseCloudStars,
  parseCloudTimes,
} from "../../src/cloudStars";

// The stars' merge with iCloud (src/cloudStars.ts): each level's most, which
// is idempotent, so a device writes the whole merged map whenever iCloud is
// missing any of it.

const stars = (o: Record<string, number>) => new Map(Object.entries(o));

describe("the stars in iCloud", () => {
  it("reads a stored record, and anything unreadable as none", () => {
    expect([...parseCloudStars('{"a": 2, "b": 3, "c": 0, "d": 4, "e": "3", "f": 2.5}')]).toEqual([
      ["a", 2],
      ["b", 3],
      ["f", 2],
    ]);
    for (const raw of [undefined, "", "{not json", "[1,2]", "3", "null"])
      expect(parseCloudStars(raw).size).toBe(0);
  });

  it("keeps each level's most", () => {
    const { merged } = mergeCloudStars(stars({ a: 1, b: 3 }), stars({ a: 2, c: 1 }));
    expect(Object.fromEntries(merged)).toEqual({ a: 2, b: 3, c: 1 });
  });

  it("says which side is missing something", () => {
    expect(mergeCloudStars(stars({ a: 2 }), stars({ a: 2 }))).toMatchObject({
      localBehind: false,
      cloudBehind: false,
    });
    expect(mergeCloudStars(stars({ a: 3 }), stars({ a: 2 }))).toMatchObject({
      localBehind: false,
      cloudBehind: true,
    });
    expect(mergeCloudStars(stars({}), stars({ a: 1 }))).toMatchObject({
      localBehind: true,
      cloudBehind: false,
    });
  });

  it("is idempotent: merging the merge again changes nothing", () => {
    const { merged } = mergeCloudStars(stars({ a: 1, b: 3 }), stars({ a: 2, c: 1 }));
    expect(mergeCloudStars(merged, merged)).toMatchObject({
      localBehind: false,
      cloudBehind: false,
    });
  });
});

describe("the best times in iCloud", () => {
  it("reads a stored record, and anything unreadable as none", () => {
    expect([...parseCloudTimes('{"a": 61000, "b": 0, "c": -5, "d": "9", "e": 1500.4}')]).toEqual([
      ["a", 61000],
      ["e", 1500],
    ]);
    for (const raw of [undefined, "", "{not json", "[1,2]", "3", "null"])
      expect(parseCloudTimes(raw).size).toBe(0);
  });

  it("keeps each level's least, and says which side is behind", () => {
    const local = stars({ a: 5000, b: 9000 });
    const { merged, localBehind, cloudBehind } = mergeCloudTimes(
      local,
      stars({ a: 4000, b: 9500, c: 7000 }),
    );
    expect(Object.fromEntries(merged)).toEqual({ a: 4000, b: 9000, c: 7000 });
    expect([localBehind, cloudBehind]).toEqual([true, true]);
    // merging the same record again changes nothing
    const again = mergeCloudTimes(merged, merged);
    expect([again.localBehind, again.cloudBehind]).toEqual([false, false]);
    expect(mergeCloudTimes(local, new Map()).cloudBehind).toBe(true);
    expect(mergeCloudTimes(new Map(), local).localBehind).toBe(true);
  });
});
