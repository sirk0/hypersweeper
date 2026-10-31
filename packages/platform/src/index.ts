// `@tiling/platform`: what a game needs from the browser it runs in, guarded so
// it works anywhere the game does — a private window, a packaged app, the
// vitest node environment. Games import this index alone.
//
// A module joins this package when a second game needs it (see "Packages" in
// the root AGENTS.md); until then it stays in the game that has it.

export { readObject, storage } from "./storage";
