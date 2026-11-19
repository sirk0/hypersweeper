import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flourishVoices,
  glideVoice,
  noteFor,
  SOUND_PRESETS,
  strikeVoice,
  type SoundPreset,
} from "../src/index";

const CHIME: SoundPreset = SOUND_PRESETS["chime"]!;

describe("the figures", () => {
  it("strikes a tile on its shape's note, where it is", () => {
    for (const sides of [3, 4, 6]) {
      const v = strikeVoice(CHIME, { sides, pan: -0.5 }, 0);
      expect(v.delay).toBe(0);
      expect(v.freq).toBeCloseTo(noteFor(CHIME, sides));
      expect(v.pan).toBe(-0.5);
      expect(v.partials).toBe(sides);
    }
    // more sides, lower
    expect(noteFor(CHIME, 6)).toBeLessThan(noteFor(CHIME, 3));
  });

  it("glides up one way and down the other, from the same note", () => {
    const up = glideVoice(CHIME, 4, 0, true);
    const down = glideVoice(CHIME, 4, 0, false);
    expect(up.freq).toBeCloseTo(down.freq);
    expect(up.endFreq!).toBeGreaterThan(up.freq);
    expect(down.endFreq!).toBeLessThan(down.freq);
  });

  it("makes the flourish a rising run, note after note", () => {
    const run = flourishVoices(CHIME, 0);
    expect(run.length).toBe(CHIME.win.notes);
    for (let i = 1; i < run.length; i++) {
      expect(run[i]!.delay).toBeGreaterThan(run[i - 1]!.delay);
      expect(run[i]!.freq).toBeGreaterThan(run[i - 1]!.freq);
    }
  });
});

/** Stands in for Web Audio: counts the oscillators the engine builds. */
function fakeAudio(): { oscillators: number } {
  const state = { oscillators: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), gain: param(), pan: param(), frequency: param() });
  class FakeContext {
    currentTime = 0;
    sampleRate = 48000;
    state = "running";
    destination = {};
    createGain = node;
    createBiquadFilter = node;
    createStereoPanner = node;
    createPeriodicWave = () => ({});
    createBuffer = () => ({ getChannelData: () => new Float32Array(8) });
    createBufferSource = () => ({ ...node(), start: vi.fn(), stop: vi.fn() });
    createOscillator = () => {
      state.oscillators++;
      return { ...node(), setPeriodicWave: vi.fn(), start: vi.fn(), stop: vi.fn() };
    };
    resume = vi.fn(() => Promise.resolve());
  }
  vi.stubGlobal("window", { AudioContext: FakeContext });
  vi.stubGlobal("document", { hidden: false });
  return state;
}

async function loadEngine(): Promise<typeof import("../src/index")> {
  vi.resetModules();
  return import("../src/index");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playVoices", () => {
  it("builds an oscillator per tone grain from the preset in force", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playVoices((p) => engine.flourishVoices(p, 0));
    expect(audio.oscillators).toBe(CHIME.win.notes);
  });

  it("builds nothing, and asks for nothing, when sound is off", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("off");
    const build = vi.fn(() => [] as never[]);
    engine.playVoices(build);
    expect(engine.soundEnabled()).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(audio.oscillators).toBe(0);
  });
});
