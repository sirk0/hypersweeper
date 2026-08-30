# Sound (`src/audio/`)

**Web-only** — the pygame build is silent — and synthesised, never sampled:
there is no audio file in the repo and there is not meant to be, because every
sound here is derived from the move that caused it.

Two files, and the split between them is the point:

- **`presets.ts`** — the table. One `SoundPreset` per character (Chime, Arcade,
  Blocks), in the shape of `cellStyle.ts`: plain numbers the engine reads, so a
  fourth character is a row here and nothing else. `off` is deliberately *not*
  an entry — `soundPreset()` returns `null` for it, and a silenced game never
  builds an audio graph at all. It also holds the guards a stored record has to
  pass before it reaches the engine: `resolveSound` for the key, `clampVolume`
  for the level.
- **`sound.ts`** — `voicesFor(event, preset)` is **pure** (an event in, a list
  of grains out: when, what pitch, how wide, how loud), and `playSound(event)`
  renders those grains onto the shared `AudioContext`. Every rule the feature
  has lives in the pure half, which is why `tests/unit/sound.test.ts` can pin
  what the game sounds like under node with no audio stack at all. The call
  sites (`session.ts`, and the settings preview) name events, never
  oscillators — the same seam `haptics.ts` is for touch.

### One collection, and a spelling measured against the catalog

A move opens *several cells at once* — a chord move, and every flood fill —
so their voices are heard together whether or not anybody tuned them. The
rule that makes that a chord rather than a coincidence: **every pitch the
engine can produce is a degree of the preset's `grid`**, one octave of an
anhemitonic pentatonic repeating in both directions (`gridNote`). No
semitone, no tritone, so members can be stacked in any combination. The
shapes, the cascade's rise, the chord's bass note and the win flourish all
land on it.

Which degree a *shape* takes is `degrees`, and it is deliberately not one
degree per side. One degree per side is what the game shipped with, and it
made the intervals an accident of the indexing: the Blocks preset gave the
truncated-square board a tritone between its squares and its octagons, and
two of the three presets gave a triangle and a square a whole tone — which
on the rhombitrihexagonal board (triangles, squares *and* hexagons) is the
one that gets noticed. So the spelling skips degrees, chosen against the
sets of side counts that genuinely share a board. Measured across every mode
in `data/presets.json` those sets are

    {3,4} {3,5} {3,6} {3,12} {4,8} {5,6} {3,4,6} {3,4,5} {4,6,12} {4,6,10}

and nothing else — never four shapes at once, and every wrapped surface
repeats its flat template's set exactly. `tests/unit/soundHarmony.test.ts`
re-measures them from the boards rather than trusting that list, and fails
on any pair that is not a third, a fourth, a fifth, a sixth or an octave, so
a new tiling cannot quietly introduce a clash. On the three-shape boards the
result is an actual triad (Chime: 1046 / 698 / 440 Hz on `rhombitrihex`);
Arcade rotates the same collection so the same sets come out minor.

Two consequences worth knowing before touching the numbers:

- **The cascade rises by whole degrees, never by semitones.** `cascade.rise`
  used to be a fraction of a semitone per ring (0.8 for Chime), and the rings
  of a flood *overlap* — a grain rings for `open.duration` against a stagger
  of `cascade.step`, so ten rings sound at once. Every ring landed a fifth of
  a tone from the last: beating, not a chord, and it did it on monotile
  boards too. Adding a fixed semitone interval cannot be made safe (a
  consonance plus two semitones is a tritone); transposing *within* the
  collection can, which is the whole reason the grid is a separate field from
  the spelling.
- **The roots are anchored on the boards people play.** Spreading the shapes
  onto chord tones widens each preset's range to about three octaves, so the
  roots were raised to compensate: a plain square board lands within a
  semitone of where it used to ring in all three presets. A hexagon board
  drops a third — that widened square-to-hexagon gap *is* the triad, so it
  cannot be anchored as well. Blocks moved 340 → 415 Hz for a second reason:
  at the old root its 12- and 13-gon boards sat under 50 Hz, which a phone
  cannot reproduce.

`flag.interval` is the one pitch left in semitones. A flag is a lone gesture
rather than part of a chord, so its glide is free to leave the grid.

### Why it does not sound like a machine

Being in tune is not the same as sounding soft, and three of the four things
that made this read as *robotic* are not about pitch at all:

- **Brightness has to fall faster than loudness.** A periodic wave under one
  gain envelope holds its eighth harmonic exactly as long as its first, which
  no struck object does — a bar, a bead or a block sheds its high partials in
  the first few tens of milliseconds and rings on at the fundamental. Every
  grain now runs through a low-pass that *tracks its own pitch*: open at
  `freq * (partials + 1.5)` so the attack still passes every partial the side
  count asked for, closing to `timbre.close` times the fundamental by the end.
  Rendering a click through an `OfflineAudioContext` and measuring the
  1.8–9 kHz band against the 200–900 Hz one: before, the ratio *rose* from
  0.017 at the strike to 0.035 as the note decayed; now it falls to 0.005,
  with the strike unchanged. The shape is still heard, because the attack is
  where a timbre is read.
- **Noise is a strike, not a hiss.** `preset.noise` used to hold flat under the
  whole grain, which is the sound of circuit hum. `strike` gives it its own
  fast decay, so it reads as the mallet making contact and is gone long before
  the tone it started. The mine's blast and the Klein scroll's rush leave
  `noiseDecay` off, because those two really are sustained textures.
- **A cascade on an exact grid is a metronome.** `cascade.swing` wanders each
  ring's arrival off the beat, and its level with it. It is deterministic — a
  golden-ratio sequence on the ring number, so `voicesFor` stays pure and its
  tests can pin it, and low-discrepancy, so it never settles into a rhythm of
  its own. Ring 0 stays exactly on the beat (that grain is under the finger,
  and a click has to answer at once) and the wobble stays under half a step,
  so the wave still arrives in order. Arcade's is deliberately near zero: a
  chiptune is *supposed* to sound sequenced.
- **Attacks were clicks.** 1–4 ms onsets on a short grain read as a beep;
  the soft presets are now 5–16 ms.

Things that will bite:

- **Audio cannot start without a user gesture.** A context built at load time
  stays suspended on iOS *forever*, and everything scheduled into it is lost
  silently. `unlockAudio()` (called once from `App`) builds and resumes it on
  the first `pointerdown`/`keydown`/`touchend`. Nothing is audible before the
  player's first touch, by construction — do not "fix" that by building the
  context earlier.
- **Pan comes from the renderer, not the mesh.** `BoardRenderer.panFor(cell)`
  projects the cell anchor through the board's world matrix and the camera, so
  it carries the zoom, the pan, the portrait quarter-turn and a solid's
  rotation. `GameSession` takes it as the `panOf` option and falls back to the
  cell's mesh-local x (the same answer for an unframed flat board) when there
  is none — which is what keeps the session constructible in a test.
- **Volume is the master gain, not a preset number.** A preset's own gains are
  the *balance* between the game's sounds (a flag against a cascade);
  Settings › Sound › **Volume** is how loud that whole balance plays, so
  `setSoundVolume` scales the one master `GainNode` and `voicesFor` stays pure
  and preset-only. `off` is still a different thing from a volume of zero: it
  mutes the same gain, but it is also what stops the engine building voices at
  all. Both moves are 30 ms ramps — stepping a gain discontinuously clicks —
  and the slider is deliberately the one settings control that does **not**
  re-render its page, because the player is still holding it: dragging feeds
  the engine live (audible in the cascade already ringing), and only letting go
  persists the value and plays the preview.
- **A cascade is bounded, twice.** `cascade.maxVoices` thins the cells at an
  even stride across the whole ring range (so the first ring and the last are
  always heard), and `MAX_CASCADE_S` clamps the delay. Beyond that
  `MAX_ACTIVE_VOICES` drops grains rather than letting a loss over a flood turn
  into a wall. Raising any of them is a decision about the worst board (a 500+
  cell flood on `hard`), not the average one.
- **The shape map is lazy.** `GameSession.sidesOf` measures every cell's
  polygon on the first sound a board plays, and never when sound is off — the
  `soundEnabled()` guard at each call site is what keeps a silenced game from
  paying for the feature.
- **Testing it.** A synthesised sound leaves nothing in the DOM, so the e2e
  suite counts the oscillators the page creates
  (`tests/e2e/sound.spec.ts`, an init script wrapping
  `AudioContext.prototype.createOscillator`) and reads the engine's active
  choice back through `window.__ms.state().sound` (and the level through
  `state().volume`). Counting *scheduled* nodes
  needs no output device and no autoplay policy, which is what makes it stable
  in CI.
