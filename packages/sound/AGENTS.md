# `@tiling/sound` (`packages/sound/`)

The synthesiser the games' sound effects play through. Synthesised, never
sampled: there is no audio file in the repo, because every sound is derived
from the move that caused it (a tile's side count sets its pitch and timbre).
Games import the index (`@tiling/sound`) alone.

- `src/presets.ts` — the table: one `SoundPreset` per character (Chime,
  Arcade, Blocks), plain numbers the engine reads; `off` is the absence of
  one. Also the guards a stored record passes before it reaches the engine,
  `resolveSound` and `clampVolume`.
- `src/figures.ts` — the voices a game's events are built from, each a pure
  function of a preset: `strikeVoice` (a tile struck, and by `ring` a grain
  of a cascade), `glideVoice` (a short glide up, or the same figure down),
  `flourishVoices` (a finished board's rising run), and `swatchLevels`, a
  preset's spectrum for a settings swatch.
- `src/engine.ts` — the pitch helpers (`gridNote`, `noteFor`, `partialsFor`)
  and the player: `setSoundPreset`, `setSoundVolume`, `unlockAudio` (the
  `AudioContext` is built on the first gesture, never before) and
  `playVoices(build)`, which does nothing while sound is off, the tab is
  hidden or there is no audio stack.

Each game keeps its own events and a **pure** `voicesFor(event, preset)` that
composes the figures, and calls `playVoices((p) => voicesFor(event, p))`:
Hypersweeper's `apps/hypersweeper/src/audio/sound.ts`, Rep-tiles'
`apps/reptiles/src/sound.ts`. The preset knobs are named for Hypersweeper's
events, which used them first (`open`, `flag`, `win`, …). Why the numbers are
what they are — one pentatonic collection, the spelling of shapes onto chord
tones, brightness falling faster than loudness — is in
[`apps/hypersweeper/docs/audio.md`](../../apps/hypersweeper/docs/audio.md),
and Hypersweeper's `tests/unit/sound.test.ts` and `soundHarmony.test.ts` pin
it; a change here is heard in both games.

Users: Hypersweeper (every event, and its Settings › Sound preset picker and
volume); Rep-tiles (a tile landing, a turn, a win; Settings › Sound, the same
three presets and Off with a volume, Blocks by default).

```sh
cd packages/sound && npm run typecheck && npm run test
```
