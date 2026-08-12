import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampVolume,
  DEFAULT_SOUND,
  DEFAULT_VOLUME,
  resolveSound,
  SOUND_CHOICES,
  SOUND_OFF,
  SOUND_PRESETS,
  soundLabel,
  soundPreset,
  type SoundPreset,
} from "../../src/audio/presets";
import {
  noteFor,
  partialsFor,
  voicesFor,
  type CellSound,
  type Voice,
} from "../../src/audio/sound";

// `voicesFor` is the whole of the sound design as a pure function: an event in,
// the grains it sounds as out. Everything asserted here is audible — a pitch, a
// stereo position, a delay — so these tests are the specification of what the
// game sounds like, and the Web Audio side (which cannot run under node) is
// left with nothing but node plumbing.

const CHIME = SOUND_PRESETS["chime"]!;
const BLOCKS = SOUND_PRESETS["blocks"]!;

function cell(sides: number, pan = 0, ring = 0): CellSound {
  return { sides, pan, ring };
}

/** Every preset, so a new row in the table is held to the same rules. */
function eachPreset(fn: (preset: SoundPreset, key: string) => void): void {
  for (const [key, preset] of Object.entries(SOUND_PRESETS)) fn(preset, key);
}

describe("the preset table", () => {
  it("offers three presets and Off, with Off last", () => {
    expect(Object.keys(SOUND_PRESETS)).toHaveLength(3);
    expect(SOUND_CHOICES).toEqual([...Object.keys(SOUND_PRESETS), SOUND_OFF]);
  });

  it("resolves an unknown choice to the default, and Off to silence", () => {
    expect(resolveSound("orchestral")).toBe(DEFAULT_SOUND);
    expect(resolveSound(null)).toBe(DEFAULT_SOUND);
    // Never a prototype key: the choice can come from a stored record.
    expect(resolveSound("toString")).toBe(DEFAULT_SOUND);
    expect(resolveSound(SOUND_OFF)).toBe(SOUND_OFF);
    expect(soundPreset(SOUND_OFF)).toBeNull();
    expect(soundLabel(SOUND_OFF)).toBe("Off");
  });

  it("gives every preset a spelling long enough for the catalog's tiles", () => {
    // The Spectre is a 13-gon; anything past the spelling clamps to its
    // bottom.
    eachPreset((preset, key) => {
      expect(preset.degrees.length, key).toBeGreaterThanOrEqual(11);
      expect(preset.cascade.maxVoices, key).toBeGreaterThan(1);
      expect(preset.win.notes, key).toBeGreaterThan(1);
    });
  });

  it("spells every grid as a collection with no semitone and no tritone", () => {
    // This is the whole guarantee: any two members of an anhemitonic
    // pentatonic are consonant, so voices can be stacked in any combination
    // without one of them landing a semitone or a tritone from another.
    eachPreset((preset, key) => {
      expect(preset.grid[0], key).toBe(0);
      const octave = [...preset.grid, preset.grid[0]! - 12];
      for (let i = 0; i + 1 < octave.length; i++) {
        const step = octave[i]! - octave[i + 1]!;
        expect(step, `${key} step ${i}`).toBeGreaterThanOrEqual(2);
        expect(step, `${key} step ${i}`).toBeLessThanOrEqual(3);
      }
      for (const a of preset.grid) {
        for (const b of preset.grid) {
          const cls = Math.abs(a - b) % 12;
          expect(cls === 1 || cls === 6 || cls === 11, `${key} ${a}/${b}`).toBe(false);
        }
      }
    });
  });

  it("gives the shapes a degree apiece, descending", () => {
    eachPreset((preset, key) => {
      expect(preset.degrees[0], key).toBe(0);
      for (let i = 0; i + 1 < preset.degrees.length; i++) {
        expect(preset.degrees[i + 1]!, `${key} ${i}`).toBeGreaterThan(preset.degrees[i]!);
      }
    });
  });
});

describe("a cell's voice follows its shape", () => {
  it("gives the triangle, square, pentagon and hexagon four different pitches", () => {
    eachPreset((preset, key) => {
      const pitches = [3, 4, 5, 6].map((n) => noteFor(preset, n));
      expect(new Set(pitches).size, key).toBe(4);
      // Descending: more sides read as rounder and heavier.
      expect(pitches, key).toEqual([...pitches].sort((a, b) => b - a));
    });
  });

  it("builds the tone from as many partials as the tile has sides", () => {
    expect(partialsFor(CHIME, 3)).toBe(3);
    expect(partialsFor(CHIME, 6)).toBe(6);
    // Capped, so a 13-gon does not become a buzz.
    expect(partialsFor(CHIME, 13)).toBe(CHIME.timbre.partialCap);
    expect(partialsFor(CHIME, 1)).toBeGreaterThanOrEqual(1);
  });

  it("clamps past the ends of the spelling rather than running off it", () => {
    const bottom = noteFor(CHIME, CHIME.degrees.length + 2);
    expect(bottom).toBe(noteFor(CHIME, CHIME.degrees.length + 40));
    expect(noteFor(CHIME, 3)).toBe(CHIME.rootHz);
  });

  it("carries the shape into the grain a single opened cell sounds as", () => {
    const tri = voicesFor({ kind: "open", cells: [cell(3)] }, CHIME);
    const hex = voicesFor({ kind: "open", cells: [cell(6)] }, CHIME);
    expect(tri).toHaveLength(1);
    expect(hex).toHaveLength(1);
    expect(tri[0]!.freq).toBeGreaterThan(hex[0]!.freq);
    expect(tri[0]!.partials).toBe(3);
    expect(hex[0]!.partials).toBe(6);
  });
});

describe("stereo", () => {
  it("pans a grain where its cell is", () => {
    const [left] = voicesFor({ kind: "open", cells: [cell(4, -0.8)] }, CHIME);
    const [right] = voicesFor({ kind: "open", cells: [cell(4, 0.8)] }, CHIME);
    expect(left!.pan).toBeCloseTo(-0.8);
    expect(right!.pan).toBeCloseTo(0.8);
  });

  it("clamps a pan from off the edge of a zoomed board", () => {
    const events = [
      { kind: "open", cells: [cell(4, -4)] },
      { kind: "flag", on: true, sides: 4, pan: 9 },
      { kind: "lose", pan: -7 },
      { kind: "win", pan: 5 },
    ] as const;
    for (const event of events) {
      for (const v of voicesFor(event, CHIME)) {
        expect(v.pan, event.kind).toBeGreaterThanOrEqual(-1);
        expect(v.pan, event.kind).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("a click versus a recursive opening", () => {
  const flood: CellSound[] = [
    cell(4, 0, 0),
    cell(4, -0.2, 1),
    cell(4, 0.2, 1),
    cell(4, -0.6, 2),
    cell(4, 0.6, 3),
  ];

  it("sounds one cell as one grain, right away", () => {
    const voices = voicesFor({ kind: "open", cells: [cell(4, 0.3)] }, CHIME);
    expect(voices).toHaveLength(1);
    expect(voices[0]!.delay).toBe(0);
  });

  it("sounds a flood as a cascade staggered outward from the click", () => {
    const voices = voicesFor({ kind: "open", cells: flood }, CHIME);
    expect(voices).toHaveLength(flood.length);
    const delays = voices.map((v) => v.delay);
    // Ordered by ring, and strictly spread out in time.
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays[0]).toBe(0);
    expect(delays.at(-1)).toBeGreaterThan(0);
    // The wave lifts as it spreads and fades as it goes, so an opening running
    // away from the click is heard as one gesture rather than as five clicks.
    expect(voices.at(-1)!.freq).toBeGreaterThan(voices[0]!.freq);
    expect(voices.at(-1)!.gain).toBeLessThan(voices[0]!.gain);
    // Each grain keeps its own cell's stereo position, so the cascade sweeps.
    expect(new Set(voices.map((v) => v.pan)).size).toBeGreaterThan(1);
  });

  it("thins a huge flood to the preset's budget, keeping its spread", () => {
    const huge = Array.from({ length: 600 }, (_, i) =>
      cell(4, (i % 21) / 10 - 1, Math.floor(i / 20)),
    );
    eachPreset((preset, key) => {
      const voices = voicesFor({ kind: "open", cells: huge }, preset);
      expect(voices.length, key).toBeLessThanOrEqual(preset.cascade.maxVoices);
      // The nearest ring and the farthest are both still heard...
      expect(voices[0]!.delay, key).toBe(0);
      expect(voices.at(-1)!.delay, key).toBeGreaterThan(voices[0]!.delay);
      // ...and the whole wave stays inside a bounded window of time.
      for (const v of voices) expect(v.delay, key).toBeLessThanOrEqual(1.1);
    });
  });

  it("marks a chord with a low grain the plain click does not have", () => {
    const plain = voicesFor({ kind: "open", cells: flood }, CHIME);
    const chord = voicesFor({ kind: "open", cells: flood, chord: true }, CHIME);
    expect(chord.length).toBe(plain.length + 1);
    expect(chord[0]!.freq).toBeLessThan(Math.min(...plain.map((v) => v.freq)));
    expect(chord[0]!.delay).toBe(0);
  });

  it("says nothing when a move opened nothing", () => {
    expect(voicesFor({ kind: "open", cells: [] }, CHIME)).toEqual([]);
  });

  it("lands the cascade off the beat rather than on a metronome", () => {
    // Rings on an exact grid of `step` ms at an exact level curve is the
    // sound of a sequencer. The wobble is deterministic — same board, same
    // flood, same result — but low-discrepancy, so it never becomes a pattern
    // of its own.
    eachPreset((preset, key) => {
      // Exactly the preset's budget, so nothing is thinned and grain `i` is
      // ring `i`.
      const wide = Array.from({ length: preset.cascade.maxVoices }, (_, ring) => cell(4, 0, ring));
      const voices = voicesFor({ kind: "open", cells: wide }, preset);
      const beats = voices.map((v) => (v.delay * 1000) / preset.cascade.step);
      // The click itself is exactly on time — it is under the finger.
      expect(beats[0], key).toBe(0);
      const off = beats.filter((b) => Math.abs(b - Math.round(b)) > 1e-9);
      expect(off.length, key).toBeGreaterThan(voices.length / 2);
      // ...but never by so much that the wave arrives out of order, or early.
      expect(beats, key).toEqual([...beats].sort((a, b) => a - b));
      for (const b of beats) expect(b, key).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < beats.length; i++) {
        expect(Math.abs(beats[i]! - i), `${key} ring ${i}`).toBeLessThan(0.5);
      }
      // The levels wander too, so no two rings are struck exactly alike.
      const gains = new Set(voices.map((v) => v.gain));
      expect(gains.size, key).toBe(voices.length);
    });
  });

  it("makes a tile's noise a strike rather than a hiss under the note", () => {
    // Noise held flat under the whole grain reads as hum; given its own fast
    // decay it reads as the mallet making contact.
    eachPreset((preset, key) => {
      const [open] = voicesFor({ kind: "open", cells: [cell(4)] }, preset);
      expect(open!.noiseDecay, key).toBe(preset.strike);
      expect(open!.noiseDecay!, key).toBeLessThan(open!.duration);
      const [flag] = voicesFor({ kind: "flag", on: true, sides: 4, pan: 0 }, preset);
      expect(flag!.noiseDecay, key).toBe(preset.strike);
      // The mine's blast and the Klein scroll's rush are textures, not
      // contacts: their noise holds for the whole grain.
      for (const v of voicesFor({ kind: "lose", pan: 0 }, preset)) {
        expect(v.noiseDecay, key).toBeUndefined();
      }
      for (const v of voicesFor({ kind: "scroll", direction: 1 }, preset)) {
        expect(v.noiseDecay, key).toBeUndefined();
      }
    });
  });
});

describe("flags, mines and wins", () => {
  it("inverts the flag figure when the flag comes off again", () => {
    const on = voicesFor({ kind: "flag", on: true, sides: 4, pan: 0.2 }, CHIME)[0]!;
    const off = voicesFor({ kind: "flag", on: false, sides: 4, pan: 0.2 }, CHIME)[0]!;
    expect(on.freq).toBe(off.freq);
    expect(on.endFreq!).toBeGreaterThan(on.freq); // placed: glides up
    expect(off.endFreq!).toBeLessThan(off.freq); // cleared: glides down
    expect(off.gain).toBeLessThan(on.gain);
  });

  it("pitches a flag by the shape it lands on", () => {
    const tri = voicesFor({ kind: "flag", on: true, sides: 3, pan: 0 }, CHIME)[0]!;
    const hex = voicesFor({ kind: "flag", on: true, sides: 6, pan: 0 }, CHIME)[0]!;
    expect(tri.freq).toBeGreaterThan(hex.freq);
  });

  it("blows a mine up as a noise blast over a falling tone, both at the mine", () => {
    const voices = voicesFor({ kind: "lose", pan: -0.5 }, CHIME);
    expect(voices).toHaveLength(2);
    const blast = voices[0]!;
    const drop = voices[1]!;
    expect(blast.noise).toBe(1);
    expect(blast.cutoff).toBeGreaterThan(0);
    expect(drop.endFreq!).toBeLessThan(drop.freq);
    for (const v of voices) expect(v.pan).toBeCloseTo(-0.5);
  });

  it("celebrates a win with a rising arpeggio that sweeps the field", () => {
    const voices = voicesFor({ kind: "win", pan: 0 }, CHIME);
    expect(voices).toHaveLength(CHIME.win.notes);
    const freqs = voices.map((v) => v.freq);
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b));
    expect(voices[0]!.pan).toBeLessThan(0);
    expect(voices.at(-1)!.pan).toBeGreaterThan(0);
    const delays = voices.map((v) => v.delay);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(new Set(delays).size).toBe(delays.length);
  });
});

describe("the two Klein scroll directions are opposites", () => {
  function mirror(v: Voice): Voice {
    return { ...v, freq: v.endFreq!, endFreq: v.freq, pan: v.endPan!, endPan: v.pan };
  }

  it("reflects one direction into the other in both pitch and pan", () => {
    eachPreset((preset, key) => {
      const fwd = voicesFor({ kind: "scroll", direction: 1 }, preset);
      const back = voicesFor({ kind: "scroll", direction: -1 }, preset);
      expect(fwd, key).toHaveLength(1);
      expect(back, key).toHaveLength(1);
      // Forward rises while it sweeps left to right...
      expect(fwd[0]!.endFreq!, key).toBeGreaterThan(fwd[0]!.freq);
      expect(fwd[0]!.pan, key).toBeLessThan(fwd[0]!.endPan!);
      // ...and back is exactly that figure reversed, not merely a different one.
      expect(mirror(fwd[0]!), key).toEqual(back[0]);
    });
  });
});

describe("the settings preview", () => {
  it("plays a short figure of more than one shape", () => {
    eachPreset((preset, key) => {
      const voices = voicesFor({ kind: "preview" }, preset);
      expect(voices.length, key).toBeGreaterThan(2);
      expect(new Set(voices.map((v) => v.partials)).size, key).toBeGreaterThan(1);
      const last = Math.max(...voices.map((v) => v.delay + v.duration));
      expect(last, key).toBeLessThan(1);
    });
  });
});

describe("every grain is playable", () => {
  const events = [
    { kind: "open", cells: [cell(3, -1, 0), cell(7, 1, 4)] },
    { kind: "flag", on: true, sides: 5, pan: 0 },
    { kind: "lose", pan: 0 },
    { kind: "win", pan: 0.4 },
    { kind: "scroll", direction: -1 },
    { kind: "preview" },
  ] as const;

  it("emits finite, positive, audible numbers for every event and preset", () => {
    eachPreset((preset, key) => {
      for (const event of events) {
        for (const v of voicesFor(event, preset)) {
          const where = `${key}/${event.kind}`;
          expect(v.freq, where).toBeGreaterThan(20);
          expect(v.freq, where).toBeLessThan(20000);
          if (v.endFreq != null) expect(v.endFreq, where).toBeGreaterThan(20);
          expect(v.duration, where).toBeGreaterThan(0);
          expect(v.attack, where).toBeGreaterThan(0);
          expect(v.attack, where).toBeLessThan(v.duration);
          expect(v.gain, where).toBeGreaterThan(0);
          expect(v.gain, where).toBeLessThanOrEqual(1);
          expect(v.delay, where).toBeGreaterThanOrEqual(0);
          expect(v.partials, where).toBeGreaterThanOrEqual(1);
          expect(v.noise, where).toBeGreaterThanOrEqual(0);
          expect(v.noise, where).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});

// -- the player ---------------------------------------------------------------

// `playSound` is the half that touches Web Audio, which node has none of. A
// fake context records what was built and what was scheduled on it, which is
// enough to pin the wiring the pure half cannot: that a grain is panned where
// its cell is, that the preset choice gates the graph entirely, and that a
// backgrounded tab stays quiet. The module caches its context in a
// module-level singleton, so each test re-imports it fresh (as the haptics
// tests do).

interface FakeParam {
  value: number;
  events: { kind: string; value: number; time: number }[];
}

function param(value = 0): FakeParam {
  const p: FakeParam = { value, events: [] };
  const record = (kind: string) => (v: number, t: number) => {
    p.events.push({ kind, value: v, time: t });
    p.value = v;
  };
  return Object.assign(p, {
    setValueAtTime: record("set"),
    linearRampToValueAtTime: record("linear"),
    exponentialRampToValueAtTime: record("exp"),
    cancelScheduledValues: (t: number) => p.events.push({ kind: "cancel", value: 0, time: t }),
  });
}

interface FakeAudio {
  oscillators: { frequency: FakeParam; started: number[]; stopped: number[] }[];
  panners: FakeParam[];
  /** Every gain node built, in order — the first is the engine's master. */
  gains: FakeParam[];
  /** Every low-pass built, in order: one per grain. */
  filters: { type: string; frequency: FakeParam }[];
  buffers: number;
}

function fakeAudio(): FakeAudio {
  const state: FakeAudio = {
    oscillators: [],
    panners: [],
    gains: [],
    filters: [],
    buffers: 0,
  };
  class FakeContext {
    currentTime = 1;
    state = "running";
    destination = { connect: vi.fn() };
    sampleRate = 48000;
    createGain = () => {
      const gain = param(1);
      state.gains.push(gain);
      return { gain, connect: vi.fn() };
    };
    createBiquadFilter = () => {
      const filter = { type: "", frequency: param(1000), connect: vi.fn() };
      state.filters.push(filter);
      return filter;
    };
    createStereoPanner = () => {
      const pan = param(0);
      state.panners.push(pan);
      return { pan, connect: vi.fn() };
    };
    createOscillator = () => {
      const osc = {
        type: "",
        frequency: param(440),
        started: [] as number[],
        stopped: [] as number[],
        connect: vi.fn(),
        setPeriodicWave: vi.fn(),
        onended: null,
        start(t: number) {
          osc.started.push(t);
        },
        stop(t: number) {
          osc.stopped.push(t);
        },
      };
      state.oscillators.push(osc);
      return osc;
    };
    createPeriodicWave = () => ({});
    createBuffer = (_ch: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    });
    createBufferSource = () => {
      state.buffers++;
      return {
        buffer: null,
        loop: false,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    };
    resume = vi.fn(() => Promise.resolve());
  }
  vi.stubGlobal("window", { AudioContext: FakeContext });
  vi.stubGlobal("document", { hidden: false });
  return state;
}

async function loadEngine(): Promise<typeof import("../../src/audio/sound")> {
  vi.resetModules();
  return import("../../src/audio/sound");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("clampVolume", () => {
  it("holds a stored level inside 0..1, and rejects what is not a number", () => {
    expect(clampVolume(0.4)).toBe(0.4);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(4)).toBe(1);
    expect(clampVolume(-2)).toBe(0);
    // A NaN would poison a Web Audio ramp for good, so it never reaches one.
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME);
  });
});

describe("playSound", () => {
  it("builds an oscillator per grain and pans it where the cell is", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({ kind: "open", cells: [cell(4, -0.75)] });

    expect(audio.oscillators).toHaveLength(1);
    const osc = audio.oscillators[0]!;
    expect(osc.frequency.value).toBeCloseTo(noteFor(CHIME, 4));
    expect(osc.started).toHaveLength(1);
    expect(osc.stopped[0]!).toBeGreaterThan(osc.started[0]!);
    expect(audio.panners).toHaveLength(1);
    expect(audio.panners[0]!.value).toBeCloseTo(-0.75);
  });

  it("closes each grain's brightness as it rings, but not its attack", async () => {
    // The one rule that separates a struck thing from an oscillator: a real
    // bar sheds its high partials long before its fundamental. Held under one
    // gain envelope the eighth harmonic rings exactly as long as the first,
    // and the ear hears a machine.
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({ kind: "open", cells: [cell(6)] });

    expect(audio.filters).toHaveLength(1);
    const { type, frequency } = audio.filters[0]!;
    expect(type).toBe("lowpass");
    const [opens, closes] = frequency.events;
    const hex = noteFor(CHIME, 6);
    // Open enough at the strike to pass all six of a hexagon's partials, so
    // the tile's shape is still read from its attack...
    expect(opens!.value).toBeGreaterThan(hex * 6);
    // ...and shut to a couple of harmonics by the time it has rung out.
    expect(closes!.value).toBeCloseTo(hex * CHIME.timbre.close);
    expect(closes!.time).toBeGreaterThan(opens!.time);
  });

  it("lets the strike's noise go before the note it started", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("blocks"); // the noisiest of the three
    engine.playSound({ kind: "open", cells: [cell(4)] });

    expect(audio.buffers).toBe(1);
    // The noise gain is the one that opens at full level and ramps away to
    // nothing. The grain's own envelope also ends at nothing, but it *starts*
    // there too — it has to rise through the attack first.
    const noiseGain = audio.gains.find(
      (g) => g.events.length > 1 && g.events[0]!.value > 0.01 && g.events.at(-1)!.value < 0.001,
    );
    expect(noiseGain, "the strike's noise decays").toBeDefined();
    const span = noiseGain!.events.at(-1)!.time - noiseGain!.events[0]!.time;
    expect(span).toBeCloseTo(BLOCKS.strike);
    expect(span).toBeLessThan(BLOCKS.open.duration);
  });

  it("schedules a flood's grains in the future, spread out", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({
      kind: "open",
      cells: [cell(4, 0, 0), cell(4, -0.5, 1), cell(4, 0.5, 2)],
    });
    const starts = audio.oscillators.map((o) => o.started[0]!);
    expect(starts).toHaveLength(3);
    expect(new Set(starts).size).toBe(3);
    expect(Math.max(...starts)).toBeGreaterThan(Math.min(...starts));
  });

  it("sweeps the pan across a Klein scroll, opposite ways per direction", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({ kind: "scroll", direction: 1 });
    engine.playSound({ kind: "scroll", direction: -1 });
    const [fwd, back] = audio.panners;
    // Each panner is given a start value and a ramp to the far side.
    expect(fwd!.events[0]!.value).toBeLessThan(0);
    expect(fwd!.events[1]!.value).toBeGreaterThan(0);
    expect(back!.events[0]!.value).toBeGreaterThan(0);
    expect(back!.events[1]!.value).toBeLessThan(0);
  });

  it("builds nothing at all when sound is off", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset(SOUND_OFF);
    expect(engine.soundEnabled()).toBe(false);
    engine.playSound({ kind: "open", cells: [cell(4)] });
    engine.playSound({ kind: "lose", pan: 0 });
    expect(audio.oscillators).toHaveLength(0);
  });

  it("silences a cascade already in flight when Off is chosen", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    // A flood's grains are scheduled up to a second out, so turning sound off
    // has to reach the master gain, not merely stop new events.
    engine.playSound({
      kind: "open",
      cells: Array.from({ length: 12 }, (_, k) => cell(4, 0, k)),
    });
    engine.setSoundPreset(SOUND_OFF);
    expect(audio.gains[0]!.value).toBe(0);
    // ...and choosing a preset again lifts the mute back to the volume in
    // force, not to full blast.
    engine.setSoundPreset("chime");
    expect(audio.gains[0]!.value).toBe(DEFAULT_VOLUME);
  });

  it("scales the master gain to the volume, and holds it under Off", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({ kind: "open", cells: [cell(4)] });
    const master = audio.gains[0]!;
    expect(master.value).toBe(DEFAULT_VOLUME);

    engine.setSoundVolume(0.25);
    expect(engine.soundVolume()).toBe(0.25);
    expect(master.value).toBe(0.25);

    // Off wins over the level while it is chosen, and the level is what the
    // gain comes back to.
    engine.setSoundPreset(SOUND_OFF);
    expect(master.value).toBe(0);
    engine.setSoundVolume(0.75);
    expect(master.value).toBe(0);
    engine.setSoundPreset("chime");
    expect(master.value).toBe(0.75);
  });

  it("stays quiet while the tab is in the background", async () => {
    const audio = fakeAudio();
    vi.stubGlobal("document", { hidden: true });
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    engine.playSound({ kind: "open", cells: [cell(4)] });
    expect(audio.oscillators).toHaveLength(0);
  });

  it("survives a browser with no Web Audio at all", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { hidden: false });
    const engine = await loadEngine();
    engine.setSoundPreset("chime");
    expect(() => engine.playSound({ kind: "win", pan: 0 })).not.toThrow();
    expect(() => engine.previewSound()).not.toThrow();
  });

  it("is safe to import and call with no window at all (node, SSR)", async () => {
    const engine = await loadEngine();
    expect(() => engine.unlockAudio()).not.toThrow();
    expect(() => engine.playSound({ kind: "lose", pan: 0 })).not.toThrow();
    expect(engine.soundChoice()).toBe(DEFAULT_SOUND);
  });

  it("caps how many grains may sound at once", async () => {
    const audio = fakeAudio();
    const engine = await loadEngine();
    engine.setSoundPreset("blocks");
    // Blocks has the biggest cascade budget; four floods back to back would be
    // ~72 grains without the cap.
    for (let i = 0; i < 4; i++) {
      engine.playSound({
        kind: "open",
        cells: Array.from({ length: 40 }, (_, k) => cell(4, 0, k)),
      });
    }
    expect(audio.oscillators.length).toBeLessThanOrEqual(24);
  });
});
