import { describe, expect, it } from "vitest";
import { noteFor, SOUND_PRESETS, type SoundPreset } from "@tiling/sound";
import { voicesFor } from "../../src/sound";

const CHIME: SoundPreset = SOUND_PRESETS["chime"]!;

describe("what a move sounds like", () => {
  it("a tile landing is one click, on its shape's note, where it landed", () => {
    for (const sides of [3, 4, 6, 13]) {
      const voices = voicesFor({ kind: "place", sides, pan: 0.5 }, CHIME);
      expect(voices).toHaveLength(1);
      expect(voices[0]!.delay).toBe(0);
      expect(voices[0]!.freq).toBeCloseTo(noteFor(CHIME, sides));
      expect(voices[0]!.pan).toBe(0.5);
    }
  });

  it("a turn is one short centred beep, gliding opposite ways for the two directions", () => {
    const [anti] = voicesFor({ kind: "turn", dir: 1 }, CHIME);
    const [clock] = voicesFor({ kind: "turn", dir: -1 }, CHIME);
    for (const v of [anti!, clock!]) {
      expect(v.pan).toBe(0);
      expect(v.duration).toBeLessThan(0.3);
    }
    expect(anti!.freq).toBeCloseTo(clock!.freq);
    expect(anti!.endFreq!).toBeGreaterThan(anti!.freq);
    expect(clock!.endFreq!).toBeLessThan(clock!.freq);
  });

  it("a finished board is a rising flourish", () => {
    const run = voicesFor({ kind: "win", pan: 0 }, CHIME);
    expect(run.length).toBeGreaterThan(2);
    for (let i = 1; i < run.length; i++) {
      expect(run[i]!.delay).toBeGreaterThan(run[i - 1]!.delay);
      expect(run[i]!.freq).toBeGreaterThan(run[i - 1]!.freq);
    }
  });
});
