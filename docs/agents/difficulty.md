# Choosing a size and a mine count

**Difficulty is measured, not assumed.** A board's easy/medium/hard sizes track
the classic Windows boards (81 / 256 / 480 cells, within ±15%), and its mine
count is *calibrated* so the probability of winning under optimal play matches
the classic board's at that difficulty. **Never pick a mine count from a
density.**

The numbers come from `scripts/difficulty/` — a reference solver (single-point
deduction plus exact frontier probabilities by a memoised DP) plays each board a
few thousand times while a search moves the mine count onto the target.
`scripts/difficulty/report.md` is the audit trail and `targets.json` the
measured classic yardstick. Rerun the search for a new board rather than
guessing.

## Board-shape convention

Applies to all future flat boards: a finite flat board should read as a roughly *square* rectangle, not a round
disc, and a symmetric tiling should give a symmetric board. (The named
shaped boards — `triangle`, `hexhex`, `hextri`, `hextriangle` — are the
deliberate exception: each is a polygon of the tiling's own symmetry,
exactly filled, never a trimmed disc.) For periodic
tilings take a rectangular window of whole periods centred on a rotation
centre (`archimedean_board` keeps an `nx`×`ny` domain block of the
`_ArchTemplate` centred on the tiling's biggest tile, so the window maps
onto itself under the tiling's point group); for the aperiodic ones built by
substitution or by wedge (`penrose_board`, `spectre_board`,
`phyllotaxis_board`) grow generously and trim
to the `keep` centremost cells by Chebyshev distance (`max(|dx|, |dy|)`)
— generously enough that `keep` is a small fraction of the patch, or the
substitution's own star-shaped outline is what the board reads as. The brick
rings need neither: the rings build the whole board, so their count is
both the size knob and the window. See
the `AGENT NOTE` in `boards/tilings.py`.

## Measuring the size and the mine count

**Do not invent either.** Both are measured, by `scripts/difficulty/`, and a
hand-picked density is the one thing this game cannot get right by eye.

1. **Size** — easy/medium/hard track the classic Windows boards, 81 / 256 /
   480 cells, within ±15%. `scripts/difficulty/resize.py` searches a
   builder's size knobs for a window that hits the count, keeps the right
   topology, and (on the wrapped surfaces) leaves cells least distorted;
   declare the new builder's knobs in its `SPEC` table. `--only <modes>`
   searches those rows alone and leaves every other row of `geometry.json`
   as it was, which is how one family is re-measured without disturbing the
   rest. A knob that is not free says so there rather than in the presets:
   a cylinder's row count comes from `_cylinder_rows`, the values that
   centre its strip on a height where the tiling reverses y, and a Möbius
   band's row count stops where the immersion would have to narrow the band
   to draw it (`_mobius_band_clamped`) — past that the extra rows buy no
   width, only stretched tiles. Boards with no size
   knob — the sphere family — and the fractals, which quantise by whole
   substitution steps, keep their geometry and are listed as exceptions in
   `tests/test_presets.py`.

   **A knob that cannot distort anything must say so** (`rigid` in `SPEC`).
   The shape half of this search measures *roundness*, which is only the same
   thing as "closest to its planar shape" for a tiling of regular polygons --
   `planar_shape` fixes that for the brick bonds by measuring against the
   template's own tile. The Catalan solids are the case it cannot fix: their
   cells lie flat on a face of the solid at every frequency, so nothing is
   distorted at any setting, and a Catalan face is by definition not round (a
   golden rhombus, a kite, a 30-30-120 sliver). Left switched on, the shape
   term read "subdivide further" as "less distorted" and chose the size for it
   -- a 300-cell pentagonal hexecontahedron and a 240-cell triakis icosahedron
   on the easy row against a target of 81. With nothing for shape to say, size
   decides alone.

   **A knob's floor is not always 1** (`floor` in `SPEC`). The two chiral
   Catalan solids take `frequency=0`, meaning "do not fan the pentagons at
   all", and that is their whole small end: fanned once, a pentagonal
   hexecontahedron is already 300 cells against the 60 it ships at easy.

   **A tiling that is not edge to edge needs its T-vertices dropped before any
   tile of it is measured** (`resize.corner_indices`, the same thing
   `tests/test_boards._corners` and the renderer's shape colouring drop). A
   T-vertex splits an edge in two, so counted as a corner it turns the shape
   bar upside down: an *undistorted* staggered-triangular donut measured 2.05
   on it — a whole edge against its neighbour's half — where the 3.3-to-1
   stretched window measured 1.13, because the stretch happens to even the two
   out. The bar is a no-regression bar, so it then defended the stretched
   window against every good one, which is how six isogonal wraps came to be
   too distorted to put on the menu.

   **A tiling whose tile is not near-regular needs measuring against its own
   tile, not against a circle** (`resize.planar_shape`, read by both the score
   and that same bar). Cell distortion scores a tile against the regular
   polygon of its side count and the edge ratio against one with equal sides,
   so for a tiling of regular polygons "closest to its planar shape" and
   "roundest" are the same instruction — and for the congruent-rectangle bonds
   they are opposite ones. A 2-to-1 brick scores 1.13 undistorted, so the
   search read *squaring it off* as an improvement and spent the surface's
   free axis doing exactly that: the stacked-bond donut drew its rectangles at
   1.48 to 1, squarer than the plane, which on a tiling whose adjacency is the
   square tiling's is a torus with nothing left to tell apart from `torus`.
   Measured against the template's own tile the same donut keeps them (2.11 to
   1 at 21x11), which is what put the family on all four manifolds.

   **No cell-shape measure can see a fold, so a window needs the three bars
   that can.** Cell distortion asks whether each tile is the shape it should
   be, and a flat plate cutting through a donut's axis passes that with room to
   spare. `MIN_WRAP_DOMAINS` keeps enough domains round the *ring*;
   `MAX_TILE_TURN` keeps any one **tile** to at most a quarter of a direction
   that closes, which is the same sentence measured on the thing that actually
   bends. They catch different windows: the three-brick basket weave puts
   twelve cells in a 2x2 domain and six of them are a whole domain long, so
   `torusbasketweave3` and `kleinbasketweave3` easy had seven and thirteen
   domains round the ring — plenty — and one row across the tube, which handed
   those six tiles **half the turn each** and drew both boards as a broken ring
   of slabs. Twenty more donut and bottle easy rows were folded the same way,
   one row of domains across the tube apiece, and moved when the bar arrived —
   mostly from 84 cells to 96, which is the step the geometry forces once the
   tube costs a whole second domain, and twice much further
   (`toruskisrhombille` and `kleinkisrhombille` easy cannot be built under 192,
   `torussnubhex` under 144, so those three are `EXEMPT_ROWS` in
   `tests/test_presets.py`).

   `MIN_WRAP_DOMAINS` counts **whole** domains (`_wrap_copies`), which is not
   the ring knob where the seam glues through a glide: `kleinbasketweave3`
   easy passed it at five, and five halves is two and a half copies round a
   Klein bottle, which is the crumpled sheet the bar exists to forbid. Four
   whole domains of a 12-cell domain two deep is 108 cells against a target of
   81, so that row is an `EXEMPT_ROWS` entry — reading as a surface outranks
   the size band, and a bigger board that looks right beats a
   correctly-sized one that does not.

   The third bar is the same fold seen from the *side*, and it is what a
   quarter turn alone still let through. `MAX_FACET_STEP` asks not how deep one
   tile cuts but whether the tiles beside it cut as deep: a tile spanning
   `2*pi*f` of a closing direction is a chord, so its middle sits
   `1 - cos(pi*f)` of the radius in, and the board reads as a surface while
   every tile sags alike (`torusstackedbond` easy is four equal facets round
   its tube, chunky and whole) and as loose slabs when they do not. A fifth of
   the radius is where the shipped catalogue stops looking like a surface, so
   that is the bar. `kleinbasketweave3` medium is what it was written for: a
   2x2 domain of bricks a third of a domain tall against bricks a whole domain
   tall, two domains round the tube, one course sagging 0.29 of the radius
   beside a course sagging 0.03, so a quarter-turn plate jutted through three
   fine ones and the bottle came out a stack of warped slats. It moved from
   21x2 to 15x3 and eight more donut and bottle rows with it. (The two basket
   weaves are off that list now, and not because their windows moved again:
   the step is measured to a tile's **anchors**, so once `_straight_vertices`
   draws a block flat
   its three bricks are strips of one facet rather than three facets a third
   the depth of the ones beside them.) Unlike the other
   two this bar **gives way**: a domain of a dozen cells has seven copies to
   spend on an 81-cell donut and no arrangement of seven is smooth, so held
   hard it answered `torustriakis` and `torustrunctrihex` easy with 180- and
   216-cell boards, which is not an easier outcome than a chunky one. Inside
   the band it is a bar; outside it, a term (`FOLD_WEIGHT`, on the excess
   only), and the thirteen rows that still miss it are listed in
   `TestWrappedWindowsDoNotFold.CHUNKY` with what they measure.

   **A glide seam's ring knob counts half-domains, and every measure here has
   to fold it back** (`resize._wrap_copies`, switched on by `halves` in
   `SPEC`). A Möbius strip and a Klein bottle glue their seam through the
   template's horizontal mirror, and p4g (snub square, Cairo, staggered
   triangular, both basket weaves) has only a *glide* — mirror plus half a
   domain — so `arch_mobius_board`/`arch_klein_board` take `ring` in halves and
   want it odd. Read straight, the knob said those ten boards' loops were twice
   as long as they are, which halved the turn and the facet step and doubled
   the window aspect: the aspect term then paid for length it was not getting
   and drew `mobiusstaggeredtri` easy as a band so wide its hole had nearly
   closed. Corrected, it is an open ribbon, and ten more Möbius and bottle rows
   moved with it.

   Look at a new wrapped board before believing its numbers; a fold photographs
   much worse than it measures — `web/scripts/fold-shots.mjs` takes the shots
   against a running preview server.
   `TestWrappedWindowsDoNotFold` reads both rules back off the shipped presets,
   so a hand-edited window cannot put one back.
2. **Mine count** — `scripts/difficulty/calibrate.py` plays the board a few
   thousand times with a reference solver and moves the mine count until the
   win rate matches the classic board's at that difficulty. Run it for the
   one new mode: `PYTHONPATH=. python -m scripts.difficulty.calibrate
   --only <mode>`, then `python -m scripts.difficulty.apply`.

Why not a density: adjacency is shared-vertex, so degree runs from 4 to 21
across the zoo, and a number spread over 21 cells says far less than the same
number over 6. At one density a hexagonal board plays much easier than a
triangular one, and a seamless torus easier than the flat board it wraps
(a corner constrains less than an interior cell). The calibrated densities
span 2–36% as a result: on 84 cells a hexagonal torus still wins every game
at 8 mines where a square one is already down to 90% at 6.

**The one floor is the opening, and it is measured too.** The first click is
guaranteed to open a *zero*, not merely to miss a mine (`Game._place_mines`,
with a fallback when a board is too dense to allow one), so a board sparse
enough for that flood to reach every safe cell is won by clicking once — a real
win rate, and not a game.
`calibrate.opening_floor` bisects for the fewest mines at which the opening
alone finishes under 1% of games and starts the search there. Do not
substitute a density: what makes an opening a walkover is size and degree
together, and the flat 10% floor this replaced left a 36-cell pentaflake
winnable on the first click 8% of the time while needlessly overmining a
512-cell carpet by 20 mines.

**Check the board is playable at all.** `metrics.indistinguishable_cells`
counts cells sharing a closed neighbourhood with another cell: no sequence of
numbers can ever separate those, so a mine landing alone in such a pair forces
a coin flip. A board mostly made of them cannot be calibrated to any target —
its win rate is 0.5^mines whatever the density. The five triakis boards are
exactly that and ship uncalibrated and flagged. If a new tiling scores above
zero here, say so in its preset comment; above half its cells and the board is
not a puzzle. Every row the calibration cannot bring on target lands in the
generated `data/difficulty.json`, which the TypeScript app reads
(`web/src/boards/fairness.ts`) to mark the menu row and to deal the board less
often at random — so a new unfair board needs no front-end edit, only a
`scripts/difficulty/report.py` re-run.

