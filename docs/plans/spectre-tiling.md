# Plan: the Spectre (Tile(1,1)) as an aperiodic flat board

Goal: a third entry in the **Aperiodic** family, mode key `spectre`, label
"The Spectre" — the chiral aperiodic monotile of Smith–Myers–Kaplan–
Goodman-Strauss (2023), next to `penrose` and `hat`. Flat only, both
front-ends (pygame + `web/`), shared `data/*.json` as usual.

Decided: the board uses the **reflection-free (chiral) Spectre tiling** —
the paper's own substitution, in which no tile is ever mirrored — not the
Tile(a,b) continuum deformation of our existing Hat patch. The two differ
in substance: the deformed hat tiling carries ~1 mirrored tile in 7 and its
cell graph is isomorphic to the Hat board's, whereas the chiral tiling is a
genuinely different tiling and a genuinely different puzzle.

## 1. What is already settled

Verified computationally while writing this plan, so the implementation can
start from it rather than re-deriving it.

### 1.1 The tile

Tile(1,1) is the equilateral member of the hat continuum: **14 unit edges**
whose directions are multiples of 30°, read straight off the existing
`_HAT_OUTLINE` in `minesweeper/boards/aperiodic.py` (the hat's 13 corners
carry 6 edges of length √3, 6 of length 1 and one of length 2 — that last
one is two collinear unit edges, which is where the 14th edge hides). Set
every length to 1 and keep the directions:

```
DIRS = [7, 10, 0, 0, 2, 11, 1, 4, 6, 3, 5, 8, 6, 9]     # units of 30°
```

Checked: the walk closes exactly, all 14 edges are unit, and the interior
angles come out as `180, 120, 270, 120, 90, 120, 270, 120, 90, 240, 90,
240, 90, 120` — the published Tile(1,1) angle sequence. The `180` is real:
the Spectre is "a 13-gon that is also an equilateral 14-gon, two of whose
edges are collinear".

**Keep the flat vertex in the polygon.** Neighbouring tiles do plant a
corner there (all edges are unit, the tiling is edge-to-edge), so it must
be a vertex id for `_shared_vertex_adjacency` to find that neighbour. It is
collinear, so the drawn tile is unchanged — exactly the `_insert_t_vertices`
bargain the isogonal tilings already make. `shapeMetrics` (web) and
`_corners` (tests) drop it, so the tile measures as a 13-gon and takes the
same hue as the hat. Fine: the two boards are never on screen together.

### 1.2 Exact vertex ids: ℤ[ζ₁₂]

All edge directions are multiples of 30°, and every placement in a Spectre
tiling is `z ↦ ζᵏz + t` (ζ = e^{iπ/6}), so every vertex lies in the ring
ℤ[ζ₁₂]. Represent a vertex as **4 integer coefficients** over the basis
(1, ζ, ζ², ζ³), with ζ⁴ = ζ² − 1 — the same trick `penrose_board` plays
with ℤ[ζ₅]:

```python
def _zmul(p):            # multiply by ζ, i.e. rotate 30°
    a, b, c, d = p
    return (-d, a, b + d, c)
```

Verified: ζᵏ for k = 0…11 all come out unit-length at exactly 30k°, and
complex conjugation (a reflection) stays in the ring.

Note what this rules out: the hat's trick of running the substitution in
floats and snapping each vertex back to the lattice **cannot work here**,
because ℤ[ζ₁₂] is dense in the plane, not discrete. Instead carry
placements exactly: a placement is `(k, mirrored, t)` with k an integer mod
12 and t a ℤ[ζ₁₂] 4-tuple, composed with integer arithmetic only. Floats
appear only in `_finalize_flat`, at the very end. (`mirrored` stays in the
representation even though the chiral tiling never sets it — it costs
nothing and it is what the fallback in §6 would need.)

## 2. The one input we do not have

The chiral substitution's **geometry**: nine collared cluster types (Γ, the
Mystic, plus Δ Θ Λ Ξ Π Σ Φ Ψ, the collared Spectres), where a Spectre
cluster expands to a Mystic and seven Spectres and a Mystic cluster to a
Mystic and six, each child placed by a specific rigid motion. We need, per
cluster type, the ordered list of `(child label, rotation index 0–11,
translation)` — plus the Mystic's own internal two-tile placement.

That data is not derivable from what is in this repo, and this sandbox
cannot fetch it: the agent proxy returns 403 for `raw.githubusercontent.com`,
`arxiv.org`, `cs.uwaterloo.ca` and `chiark.greenend.org.uk`, and neither npm
nor PyPI ships a package containing it. Any of these unblocks it:

1. **Vendor the reference** — drop Craig S. Kaplan's `spectre.js`
   (github.com/isohedral/spectre, BSD 3-Clause) into the repo or paste it
   into the session. This is the same provenance as the hat's substitution,
   which we already port with attribution in `aperiodic.py`.
2. **Allowlist a host** in the environment's network policy (one of the
   four above) and the implementation fetches it itself.
3. **Paste the tables** — only `buildSupertiles`'s rules and the per-cluster
   quads are needed, not the whole file.

Everything else below is independent of that data and can be written first;
only §3.2 blocks.

## 3. Implementation

### 3.1 `minesweeper/boards/aperiodic.py` — the exact-arithmetic core

New section after the Hat, in the module's existing style:

- `_Z12` helpers: `_zmul`, `_zadd`, `_zsub`, `_zpow`, `_zconj`, `_z12_to_xy`.
- `_SPECTRE_DIRS` / `_SPECTRE_OUTLINE`: the 14 exact vertices from §1.1.
- `_Placement = (rot, mirrored, trans)` with `_place_compose` and
  `_place_points`, all integer arithmetic.

### 3.2 The substitution (blocked on §2)

Port the nine-rule system as a table of exact placements, mirroring how
`_HAT_RULES` / `_construct_patch` / `_construct_metatiles` port hatviz.
Two differences from the hat port, both simplifications:

- No `_aff_*` float layer and no `_hat_snap`: the rule table is converted
  to exact `(rot, trans)` **once, at load**, by taking the reference's
  float transform, rounding its angle to the nearest multiple of 30° and
  solving the translation exactly against the corresponding tile vertices,
  then asserting the exact transform reproduces the float one. After that
  every inflation is integer arithmetic.
- The Mystic is a *cluster*, not a cell: it contributes **two** cells to the
  board. Cell ids follow the hat's convention — `(label, index)`, with the
  label recording the cluster type the tile came from, so a future
  "highlight the Mystics" idea stays cheap.

`spectre_board(levels, mine_count, keep=None, scale=…) -> Board`, positional
args exactly like `hat_board`, trimming to the `keep` centremost tiles by
Chebyshev distance (reuse the hat's trim verbatim — it is what keeps the
board a square block rather than a ragged star) and finishing through
`_finalize_flat("spectre", …)`.

Self-checks to write as tests rather than asserts (§5), because they are
what tells us the port is right:

- **No mirrored placement anywhere** — the whole point of the chiral tiling.
- Every cell is the same equilateral 14-gon (congruence up to rotation).
- Edge-to-edge: every tile edge is shared by at most two tiles.
- Tile counts per level follow the substitution matrix `[[7, 6], [1, 1]]`
  (Perron root 4 + √15 ≈ 7.873), so levels give roughly 8 → 63 → 496 →
  3900 tiles; expect `levels=2` to cover easy and `levels=3` medium/hard.
- Coverage/no overlap: the tiles' areas sum to the patch's area (shoelace
  over the union boundary), which catches a wrong placement immediately.

### 3.3 Registration (no menu code changes anywhere)

1. `data/catalog.json`: `menu.aperiodic += ["spectre"]`,
   `soloLabels.spectre = "The Spectre"`.
2. `data/presets.json`: a `spectre` row, `builder: "spectre_board"`, args
   per difficulty `[levels, mines, keep, scale]`, tuned to land near the
   hat's sizes — easy ≈ 64 cells / 10 mines, medium ≈ 150 / 28, hard ≈
   430 / 65 — and `scale` set so the board reads as a roughly square block
   at each difficulty.
3. `minesweeper/boards/presets.py`: import + one `_JSON_BUILDERS` entry.
4. `minesweeper/boards/__init__.py`: re-export `spectre_board`.
5. Run `PYTHONPATH=. python scripts/export_data.py` and
   `scripts/export_conformance.py`; commit the regenerated JSON.

The menu, the picker's Aperiodic submenu, mode strings, the random pool and
the link parser all derive from those two JSON files.

### 3.4 Icons

One `elif key == "spectre":` branch in `_render_icon` (`minesweeper/gui.py`)
and the matching branch in `web/src/ui/icons.ts` — a single tile silhouette,
built from `DIRS` the same way the hat's branch builds its outline from its
`ab` list, scaled to fit the icon box. `tests/test_gui.py`'s
`test_menu_icons_render_for_every_menu_key` covers it as soon as the mode
exists.

### 3.5 TypeScript port

`web/src/boards/aperiodic.ts` gains `spectreBoard`, a line-for-line port
(the file is already written to stay diffable against the Python), and
`web/src/boards/presets.ts` one builder-map entry. The integer-only
arithmetic ports cleanly; the only care needed is that the ℤ[ζ₁₂]
coefficients stay safe integers — add the same `import.meta.env.DEV`
overflow guard the Penrose port carries. `data/conformance.json` then
proves the two implementations agree cell for cell.

## 4. Files touched

| File | Change |
|---|---|
| `minesweeper/boards/aperiodic.py` | ℤ[ζ₁₂] helpers, outline, substitution, `spectre_board` |
| `minesweeper/boards/__init__.py`, `presets.py` | export + `_JSON_BUILDERS` row |
| `data/catalog.json`, `data/presets.json`, `data/conformance.json` | regenerated |
| `minesweeper/gui.py` | icon branch |
| `web/src/boards/aperiodic.ts`, `presets.ts`, `web/src/ui/icons.ts` | port + icon |
| `tests/test_boards.py` | `TestSpectre` |
| `web/tests/e2e/gallery.spec.ts` | `"spectre"` in `MODES` |
| `CLAUDE.md`, `AGENTS.md`, `README.md` | one line each |

## 5. Tests

- `TestSpectre` in `tests/test_boards.py`, mirroring `TestHat`: cell counts
  per level, every cell the same equilateral 14-gon, **no mirrored tiles**,
  exact ids (distinct keys never closer than half the shortest edge),
  edge-to-edge, and the area/coverage check from §3.2.
- `TestInvariants` and `TestPresets` pick the mode up automatically once it
  is in `data/presets.json`; the TS `conformance.test.ts` likewise.
- `web/tests/unit/shapePalette.test.ts`: one shape class, measured as a
  13-gon.
- `gallery.spec.ts` screenshot, plus a headless pygame shot (recipe in
  `CLAUDE.md`) — look at both before calling it done.

## 6. Fallback, if the reference never arrives

Ship the Tile(a,b) **continuum deformation** instead: re-embed the patch
`hat_board` already builds with all 14 edges set to unit length, solving
each tile's placement by BFS over the hat patch's edge matchings (exact,
same ℤ[ζ₁₂] representation; a cycle-consistency assert is the proof). It is
fully self-contained and produces a real Tile(1,1) tiling — but with ~1
mirrored tile in 7, and its cell graph is isomorphic to the Hat board's, so
it is the Hat re-skinned. Marked here only as a fallback; the chosen board
is the chiral one.
