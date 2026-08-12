import { describe, expect, it } from "vitest";
import presets from "@data/presets.json";
import { isBoard3D } from "../../src/boards/core";
import { buildBoard } from "../../src/boards/presets";
import { shapeMetrics } from "../../src/render/shapePalette";
import { SOUND_PRESETS, type SoundPreset } from "../../src/audio/presets";
import { gridNote, noteFor, voicesFor, type CellSound } from "../../src/audio/sound";

// What a board sounds like when several of its cells open at once. A move can
// reveal tiles of more than one shape — a chord on the rhombitrihexagonal
// board opens triangles, squares and hexagons together — and each shape has
// its own pitch, so what the player hears is a chord whether or not anyone
// tuned it. This file is where it is tuned: it *measures* which side counts
// share a board, and asserts that the pitches those shapes take are consonant
// under every preset.
//
// Measured rather than listed, because a new tiling is one row in
// ARCH_TILINGS and nobody adding it would think to come here. If it puts two
// shapes on a board whose voices clash, this fails.

/** Semitone interval classes a pair of simultaneous voices may take: unison
 * and octave, the thirds and sixths, the fourth and fifth. What is excluded
 * is the semitone (1, 11), the whole tone (2, 10) and the tritone (6) — the
 * intervals that beat rather than blend when two tiles ring together. */
const CONSONANT = new Set([0, 3, 4, 5, 7, 8, 9]);

/** Every distinct side count on a board, measured the way the game measures
 * it for sound (`GameSession.sidesOf`): `shapeMetrics`, collinear T-vertices
 * dropped, the 3D boards' authoritative corner mask where there is one. */
function sideCounts(mode: string): number[] {
  const board = buildBoard(mode, "easy");
  const masks = isBoard3D(board) ? board.cornerMask : null;
  const seen = new Set<number>();
  for (const [id, polygon] of board.polygons) {
    seen.add(shapeMetrics(polygon, masks?.get(id)).sides);
  }
  return [...seen].sort((a, b) => a - b);
}

/** The catalog's shape sets, one per distinct combination rather than one per
 * mode: every wrapped surface repeats its flat template's set, so measuring
 * ~130 modes yields a handful of sets. Keyed so a failure names the board. */
function shapeSets(): Map<string, number[]> {
  const sets = new Map<string, number[]>();
  for (const mode of Object.keys(presets.presets)) {
    const sides = sideCounts(mode);
    const key = sides.join(".");
    if (!sets.has(key)) sets.set(key, sides);
  }
  return sets;
}

/** Semitones between two side counts' voices under `preset`, folded into an
 * interval class: an octave and two octaves are the same consonance. */
function intervalClass(preset: SoundPreset, a: number, b: number): number {
  const steps = Math.abs(Math.log2(noteFor(preset, a) / noteFor(preset, b)) * 12);
  const rounded = Math.round(steps);
  // Whole semitones are themselves part of the guarantee — a fractional
  // interval is a detuning, not a chord.
  expect(steps).toBeCloseTo(rounded, 6);
  return rounded % 12;
}

const SETS = shapeSets();

describe("the shapes that share a board sound a chord", () => {
  it("finds the catalog's shape sets, and only ever a handful of them", () => {
    // A guard on the sweep itself: if this stops finding the mixed boards,
    // the tests below are asserting nothing. Four shapes have never yet met
    // on one board; if that changes, the spellings need re-measuring.
    const keys = [...SETS.keys()].sort();
    expect(keys).toContain("3.4.6"); // rhombitrihexagonal — triangles, squares, hexagons
    expect(keys).toContain("4.8"); // truncated square
    expect(keys).toContain("5.6"); // the football spheres
    expect(keys).toContain("4.6.10"); // truncated icosidodecahedron
    for (const sides of SETS.values()) expect(sides.length).toBeLessThanOrEqual(3);
  });

  it("puts every pair of shapes on one board a consonant interval apart", () => {
    for (const [key, preset] of Object.entries(SOUND_PRESETS)) {
      for (const [name, sides] of SETS) {
        for (let i = 0; i < sides.length; i++) {
          for (let j = i + 1; j < sides.length; j++) {
            const cls = intervalClass(preset, sides[i]!, sides[j]!);
            expect(CONSONANT.has(cls), `${key} ${name}: ${sides[i]}/${sides[j]} = ${cls}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it("spells the three-shape boards as triads rather than as clusters", () => {
    // Three distinct pitch classes with no two of them adjacent — the
    // difference between a chord and a handful of notes at once.
    for (const [key, preset] of Object.entries(SOUND_PRESETS)) {
      for (const [name, sides] of SETS) {
        if (sides.length < 3) continue;
        const classes = sides.map((n) => intervalClass(preset, n, sides[0]!));
        for (const a of classes) {
          for (const b of classes) {
            if (a === b) continue;
            const gap = Math.abs(a - b) % 12;
            expect(gap >= 3 && gap <= 9, `${key} ${name}: ${a}/${b}`).toBe(true);
          }
        }
      }
    }
  });
});

describe("a flood stays inside the collection", () => {
  /** A cascade wide enough to run the rise off the end of its cap. */
  function flood(preset: SoundPreset, sides: number[]): number[] {
    const cells: CellSound[] = [];
    for (let ring = 0; ring < 24; ring++) {
      for (const n of sides) cells.push({ sides: n, pan: 0, ring });
    }
    return voicesFor({ kind: "open", cells, chord: true }, preset).map((v) => v.freq);
  }

  it("gives every grain of a cascade an exact degree of the grid", () => {
    // The rise used to be a fraction of a semitone per ring, which put the
    // rings of one flood a fifth of a tone apart — audible as beating, since
    // a grain rings for `open.duration` against a stagger of `cascade.step`
    // and so overlaps the ten rings after it. Whole degrees or nothing.
    for (const [key, preset] of Object.entries(SOUND_PRESETS)) {
      const members = new Set<number>();
      for (let degree = -12; degree <= 40; degree++) {
        members.add(Number(gridNote(preset, degree).toFixed(6)));
      }
      for (const [name, sides] of SETS) {
        for (const freq of flood(preset, sides)) {
          const steps = Math.log2(freq / preset.rootHz) * 12;
          expect(members.has(Number(steps.toFixed(6))), `${key} ${name}: ${steps}`).toBe(true);
        }
      }
    }
  });

  it("rises through the collection as the flood spreads, and stops at an octave", () => {
    for (const [key, preset] of Object.entries(SOUND_PRESETS)) {
      // One square per ring, far enough out to run the rise into its cap.
      // `thin` samples the ring range evenly and always keeps both ends, so
      // the last grain is the outermost ring's.
      const cells: CellSound[] = Array.from({ length: 41 }, (_, ring) => ({
        sides: 4,
        pan: 0,
        ring,
      }));
      const freqs = voicesFor({ kind: "open", cells }, preset).map((v) => v.freq);
      const base = noteFor(preset, 4);
      for (const freq of freqs) {
        expect(freq, key).toBeGreaterThanOrEqual(base - 1e-9);
        // The cap: no ring, however far out, is more than an octave above the
        // shape's own note.
        expect(freq, key).toBeLessThanOrEqual(base * 2 + 1e-9);
      }
      expect(freqs[0], key).toBeCloseTo(base, 6);
      expect(freqs.at(-1), key).toBeCloseTo(base * 2, 6);
    }
  });
});

describe("the win flourish is a chord too", () => {
  it("walks up the grid instead of stacking a constant interval", () => {
    // Its notes overlap — `duration` is several times `step` — so the whole
    // arpeggio is sounding by the end of it. Stacking a fixed interval made
    // that an augmented triad.
    for (const [key, preset] of Object.entries(SOUND_PRESETS)) {
      const freqs = voicesFor({ kind: "win", pan: 0 }, preset).map((v) => v.freq);
      expect(freqs.length, key).toBe(preset.win.notes);
      for (let i = 0; i + 1 < freqs.length; i++) {
        expect(freqs[i + 1]!, key).toBeGreaterThan(freqs[i]!);
      }
      // Every note a member of the collection, which is the whole of the fix:
      // stacking a constant interval walked *off* the grid and spelled an
      // augmented triad. Within a pentatonic the seconds and sevenths that
      // remain are the added-ninth colour of a six-nine voicing — so the
      // assertion here is that no pair is a semitone or a tritone, and that
      // the run's own steps are thirds or wider. Two *tiles* get the stricter
      // set above; they can ring in the same register.
      const members = new Set<number>();
      for (let degree = -12; degree <= 12; degree++) {
        members.add(Number(gridNote(preset, degree).toFixed(6)));
      }
      const steps = freqs.map((f) => Math.log2(f / preset.rootHz) * 12);
      for (const s of steps) expect(members.has(Number(s.toFixed(6))), `${key}: ${s}`).toBe(true);
      for (let i = 0; i + 1 < steps.length; i++) {
        expect(steps[i + 1]! - steps[i]!, key).toBeGreaterThanOrEqual(3);
      }
      for (const a of steps) {
        for (const b of steps) {
          const cls = Math.round(Math.abs(a - b)) % 12;
          expect(cls === 1 || cls === 6 || cls === 11, `${key}: ${cls}`).toBe(false);
        }
      }
    }
  });
});
