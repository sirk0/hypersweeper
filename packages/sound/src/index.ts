// `@tiling/sound`: the games' synthesiser — the presets (presets.ts), the
// figures a game's events are voiced as (figures.ts) and the Web Audio player
// (engine.ts). Games import this index alone; each keeps its own events and
// its own pure `voicesFor` (Hypersweeper's src/audio/sound.ts, Rep-tiles'
// src/sound.ts).

export * from "./presets";
export * from "./engine";
export * from "./figures";
