# Shared configuration (`data/*.json`) — single source of truth

Two front-ends read this config: the Python/pygame game and the
TypeScript/Three.js app in `web/`. To keep them from drifting, the *pure-data
leaves* live in repo-root JSON that **both** read — so a value is never written
twice.

- `data/catalog.json` — `SURFACE_SPECS`, the regular `TilingSpec` rows,
  `DIFFICULTIES`, `SOLO_LABELS`, and the menu taxonomy/labels (including
  `menu.solidGroups`, the four solid pages). `catalog.py`
  loads these via `boards/_data.py`; the *derivations* stay in code.
- `data/presets.json` — the difficulty presets for the **ported** modes
  (the flat regular ones — square/triangle/trigrid/hex/hexhex/hextriangle —
  the solids, the regular-tiling surface wraps, every Archimedean/Laves
  tiling × surface, and the three aperiodic tilings — penrose/spectre/phyllotaxis), as
  `{mode: {builder, args}}`. The Archimedean/Laves rows carry the tiling
  key as their first arg. `presets.py` loads every row into `_PRESETS`
  via `_JSON_BUILDERS`; `_PRESETS` starts empty and holds only any
  still-unported one-offs. The Archimedean rows are generated from the
  compact `ARCH_PRESETS` table by `scripts/export_data.py`, so that table
  is their authoring source.
- `data/conformance.json` — board statistics (cell/mine/euler/boundary/…)
  per ported mode × difficulty, the TypeScript conformance oracle.

`scripts/export_data.py` and `scripts/export_conformance.py` regenerate
these from the Python side; the CI `data-sync` job re-runs them and fails
on any diff. `make web-prepare` copies `data/` into the pygbag stage so
the Python web build finds it at runtime.

A **mode** is the string `build_board` takes. For a periodic tiling it is
`surface.prefix + tiling.key` (e.g. `torustrihex`); `catalog.mode_for`
is the only place that convention lives. Solids/aperiodic/shaped modes
are one-offs listed directly in the `SOLID_GROUP_MEMBERS` /
`APERIODIC_MODES` tuples (and `SHAPED_MODES`, which maps a regular tiling
key to the shaped flat boards cut from it) with labels in `SOLO_LABELS`.


## UI chrome (`data/ui/screens.json`)

UI-screen chrome (header slots, menu structure, difficulty rows, themes, smiley
faces) is declared once in **`data/ui/screens.json`** at the repo root and read
by both front-ends, so the pygame and TypeScript UIs can be kept in sync from a
single source rather than hand-matched. `web/src/config/screens.ts` gives the TS app
compile-time types over it. The same shared-`data/` approach covers the board
catalog and presets above.

Shared does not mean identical. `web/src/boards/catalog.ts` is a faithful port of
`minesweeper/boards/catalog.py` over `data/catalog.json` — and where the two
menus deliberately differ (the promoted regular tilings, the shaped-board
family's own label, the home page's random pools), the difference is *derived*
in that file's "web menu" section rather than pushed into the shared JSON. So
`data/catalog.json` keeps describing the pygame menu, its exporter still
round-trips (`tests/test_data_sync.py`), and `web/tests/unit/catalog.test.ts` pins
the port while `web/tests/unit/menu.test.ts` pins the web shape.


## The conformance oracle, and the one rule it cannot see

Both front-ends build their boards from the **same** `data/*.json`, and a
conformance oracle (`data/conformance.json`) asserts the two implementations
produce identical boards.

That oracle is **combinatorial** — cell, edge and vertex counts, Euler
characteristic, boundary components — which is everything the two ports can
disagree about *structurally* and nothing they can disagree about
*positionally*. One rule moves points without changing any of those counts:
`straightVertices` / `straightenPositions` put a vertex the tiling runs
*through* (a neighbour's corner sitting inside a tile's edge) back onto the
chord its line has become, so a three-brick basket-weave block is drawn as one
flat patch rather than three strips each cutting its own chord. The oracle is
blind to it, so `scripts/export_straighten_fixture.py` dumps the rules and the
resulting geometry into `web/tests/unit/straighten.fixture.json` and
`web/tests/unit/straighten.test.ts` compares the TypeScript port against them coordinate by
coordinate. Regenerate the fixture whenever the rule or a basket-weave preset
changes. See "Recipe: add an isogonal (non-edge-to-edge) tiling" in
[`board-recipes.md`](board-recipes.md) for why the rule skips unbroken lines
and rim vertices.

