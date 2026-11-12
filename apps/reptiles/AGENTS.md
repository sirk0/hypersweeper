# Rep-tiles (`apps/reptiles/`)

The second game in this repo. The player gets a bounded flat region and a tray
of tiles and must cover the region exactly, dragging tiles in. **Any exact
cover wins** — the board a level was cut from is one way to finish it, not the
only one (six triangles where a hexagon was are fine) — so a player can also
lay tiles into a corner the board cannot be finished from, and has to take
some back off.

- A dropped tile sticks to a corner of what is still uncovered — never
  part-way along a straight edge. While it would stick, a ✓ shows where it
  will land and a dot marks each of its corners that meets the edge (the rim
  or a placed tile), wherever along it. Only a tile's real corners stick or
  get a dot — never a point part-way along one of its sides, where a marked
  tile's edge is cut (`sidesOf` in `frontier.ts`).
- Every tray tile starts resting on a flat side. A tile lands only as it is
  held, and there is **one** rotate step, with a control for each direction at
  the end of the tray (R clockwise; Shift+R or E anticlockwise): it turns
  *every* tray tile, and the one in hand, by the level's step — the largest
  that reaches, from flat, every way any kind sits: 60° for triangles, 30° for
  the pointy-top hexagons, 30° on 3.4.6.4, where the squares need it too, so
  its triangles and hexagons pass through turns they fit nowhere at. Turning
  one kind into place can turn another out of it. Each control draws its step
  as an axis, a fixed ray, the ray turned one step and the arrow between, and
  both are left out where nothing ever needs turning.
- Where a board uses a tile both ways round (the kisrhombille's triangles,
  five of the 2-isohedral levels' tiles, the hat and the turtle),
  a flip control (or F) mirrors every tray tile and the one in hand; a tile
  lands only on its own side.
- Taking tiles off: drag a placed tile back over the tray (it turns red on
  the way), or turn on ✕ remove, the control beside rotate (or X), and tap
  tiles — Escape, the control again, or picking up a tray tile ends that mode.
  A lifted tile dropped anywhere else it cannot land goes back where it was.
- **Matching rules and colourings** — listed with the tiling they mark,
  not as families of their own (`markedOf` in `levels.ts`; their `group` is
  `rules` or `colourings`, not one of `GROUPS`), and laid on **every board**
  of it that they make the same tray on (Boards, below): a level is a board
  by a marking — plain, a matching rule or a colouring — so a tiling's page
  picks the two apart (Screens, below). Each tile carries a **mark** on each edge, and a tile lands only
  where its marks meet their partners (the rim takes any), so a pattern no one
  tile can check is checked edge by edge. Every mark is drawn so that two
  tiles meeting as they should make one shape across their edge
  (`src/view/decor.ts`).
  - *Matching rules* (`?level=squares.lines`, `?level=penrose.rules`,
    `?level=kitedart.rules`): a *lined* board is a colouring (below) in one
    colour, with a line across every edge between two tiles that were one
    colour — a line meets a line, a blank edge a blank one. A line runs from
    edge to edge, square on to each and ending on it, straight across or
    round the corner two lined edges share. A line never ends in a tile:
    where one would (a tile with one lined edge), it is cut back to a half
    disc each side of that edge, and again from the tile across while that
    leaves a tile one line — so a half disc meets only a half disc, and the
    lines left run on unbroken (3.12²'s dodecagons keep their line across,
    its triangles a half disc each). **Penrose's tilings** carry his arrows: on the
    rhombi a single or a double arrow on each edge, on the kites and darts
    his two-colour vertex rule (every edge pointing from one colour of corner
    to the other, so a kite never fills a dart's notch to make a rhombus).
    Each arrow is drawn as an arc about one of the tile's corners, crossing
    its edge a share of the way back from the arrow's head, so the arcs run
    on unbroken only where the arrows agree — Ammann's on the rhombi,
    Conway's on the kites and darts. **Every other aperiodic level** —
    Ammann–Beenker, Tile(1,1), the Spectre, the hat, the turtle, the hat's
    metatiles and the Socolar–Taylor tile (`?level=ammannbeenker.rules`,
    `?level=hatmetatiles.rules`) — has a rule read off its builder's own
    patch (`src/patchMarks.ts`): each edge of the prototile is a *slot*,
    slots that meet anywhere in the patch are one class, and a class whose
    meetings all agree on a way along the edge is an arrow. That is the
    finest rule of that shape every shared edge of the patch keeps:
    Ammann–Beenker's comes out as his arrows, one kind on every edge; the
    Spectre's one kind, the hat's and the turtle's two (their short and
    long edges), the metatiles' five (one with no way), the Socolar–Taylor
    tile's ten. A label is a point a third of the way back from its head (on
    the middle where it has no way), and a tile's points of one class are
    joined by a line in the class's colour, leaving each edge square on
    there — two by one curve, more paired as they come round the outline,
    three at a hub — so two tiles meeting as they should run one line on
    across their edge. A class with one point on a tile is a half disc there
    (two tiles make one disc), and a tile of several pieces, the
    Socolar–Taylor tile, keeps half discs throughout: lines across its
    pieces tangle. An edge is cut first
    wherever a corner of the tile across lands on it, every copy of its slot
    alike — the metatiles and the Socolar–Taylor tile's pieces — so a mark
    always lies on a whole edge.
    **The spirals** (`?level=phyllotaxis.rules`, `?level=pentaspiral5.rules`)
    are read off their builder's patch the same way, untrimmed — a spiral is
    no more periodic than an aperiodic tiling, its centre a point unlike any
    other — each tile framed as the patch's first turned (`spiralFrames`).
    The phyllotactic hexagon's comes out as one kind of arrow, every one
    pointing the same way across the tile, so it is told from itself turned
    half round; the pentagonal spirals' as three classes on the cut-up edges,
    one with a way. Klaassen's heptagon's patch asks nothing — every edge
    meets every other either way along it — so it has no rule
    (`NO_PATCH_RULES`): its seed and its shape force the spiral.
    **The rep-tiles** (`?level=sphinx.rules`, `?level=fish.rules`), the
    twelve and the five of several pieces, are read off a patch too, but
    the patch is the board itself: a rep-tile's board is the whole big
    copy, with nothing past its rim (and the right-angled fish cannot be
    grown again). Each tile is framed as its substitution lays it
    (`repTilePatch`, `piecePatchFrames`), so the rule is the finest every
    shared edge of the board keeps, from one class with a way (the chair)
    to six (the right-angled fish). The P-pentomino's board asks nothing, so
    it has no rule level (`NO_PATCH_RULES`).
  - *Colourings* (`?level=squares.2apart`, `?level=hexagons.2oneinthree2`): a
    colouring repeats more coarsely than the tiling — squares as a
    checkerboard, or in rows of three colours, or hexagons a third of them
    blue. Each mark is a half disc on the middle of its edge, inside the
    tile, in the colour that must lie across it — a red tile's blue half
    disc against a blue tile — and an edge with a tile of its own colour
    across has none. A colouring whose tiles all read alike but for their
    colour (a striped one: `Painting.alike`) plays as its lined board does,
    so it is left to the lined boards; and a coloured board never draws
    lines.
  - *The aperiodic levels* (`?level=ammannbeenker.3apart`): each is
    coloured properly — no two tiles of a colour share an edge — in three colours
    where the window and the tiles round it can be (Penrose's two tilings
    and Ammann–Beenker), else four (the Spectre's, the hat's family's and
    the Socolar–Taylor tile's windows have none in three: a test searches
    exhaustively), every colour among the window's own tiles, not only at
    its rim. No colouring of an aperiodic tiling reads alike
    everywhere — a tile's neighbours differ from place to place — so the
    tray holds one tile per distinct marked tile, and `npm run colourings`
    searches for the colouring with the fewest (`chooseColouring`), from 5
    on Ammann–Beenker to 26 on the hat, and writes it to
    `src/aperiodicColourings.json`. The spirals are coloured the same way
    (none reads alike either: its centre is unlike its arms), from 5 tray
    tiles on Klaassen's heptagon to 19 on the five-fold pentagons. A
    colouring is a level only with at most five tray tiles
    (`MAX_COLOURED_TRAY`): past that, a tray of tiles that differ only in
    the colours round them is a search, not a puzzle — so only
    Ammann–Beenker's and Klaassen's (`?level=klaassen.3apart`, its
    heptagon's marks no longer symmetric, so it brings a flip control) are
    listed, and one that a window colours with fewer will be by itself.
    The rep-tiles are coloured the same way, off their own board: an edge
    of the rim has nothing across it, so it faces a neighbour of its own
    past the board (`patchWindow`), which touches only that tile, and the
    search picks its colour as freely as it picks the tiles round an
    aperiodic window. Six come in at four tray tiles and are listed
    (`?level=trapezoid.3apart`, the right isosceles triangle, the drafter,
    the right-angled fish, the kissing squares and triangles); the rest take
    6 to 13.
  - *The other eight uniform tilings* (`?level=trihex.lines`,
    `?level=trihex.3byshape`, `?level=trunctrihex.lines`) are lined and
    coloured the same way, one tray tile per colour *and shape*: a colouring
    may give every shape every colour, or give a shape colours of its own
    ("by shape": 3.6.3.6's hexagons one colour, its up and down triangles
    the two others). Each keeps at most two lined boards and three coloured
    ones — fewest tray tiles first, then the hardest as measured (a lined
    board with a line left before one cut back to half discs only), one
    balanced and one by shape among the coloured where it has both. A lined
    board cut back to half discs only is named dots
    (`?level=rhombitrihex.dots`, "3.4.6.4 · dots"). On an
    octagon or a dodecagon a line between two edges further apart than
    neighbours runs round the point past the tile where their lines meet,
    square on to both.
  - *The twenty 2-uniform tilings* (`?level=elongated2.lines`,
    `?level=hexrows.2oneinthree`, `?level=dodecasquare.2byshape`) are lined
    and coloured just as the uniform ones are, one tray tile per colour and
    shape, at most two lined boards and three coloured each, named as the
    uniform ones are: "[3⁶; 3³.4²]₁ · lines". [3⁶; 3⁴.6]₂ has lined boards
    only, and [3⁶; 3².4.3.4] none: it has no balanced painting at all. Most have a dozen or more translation classes, too many to
    try every colouring (k to the power of the classes, past ten billion on
    [3⁶; 3².4.12]), so `paintings` sets the colouring a class at a time and
    drops a branch the moment it can keep nothing (`offsetsFor`, below).
  - *The eight Laves tilings* (`?level=cairo.lines`,
    `?level=deltoidal.2oneinthree`, `?level=kisrhombille.3mixed`) are lined
    and coloured just as the uniform ones are, and named as the regular
    boards are, one tile each: "V3.12² · linked pairs". On their kites,
    rhombi, pentagons and triangles a line between two edges is a curve
    leaving each edge's middle square on. The Cairo has lined boards only:
    `paintedCandidates` keeps none of its colourings.
  - *The twenty 2-isohedral tilings* (`?level=elongated2dual.lines`,
    `?level=hexringsdual.3byshape`, `?level=studdedtridual.dots`) are lined
    and coloured just as the 2-uniform ones are, one tray tile per colour and
    shape, at most two lined boards and three coloured each, named as the
    uniform ones are: "V[3⁶; 3³.4²]₁ · lines". Every one has lined boards
    ([3⁶; 3⁴.6]₁'s dual dots only); V[3⁶; 3².4.12], V[3⁶; 3².6²],
    V[3³.4²; 3².4.3.4]₂ and V[3.4.3.12; 3.12²] have no colouring that
    `paintedCandidates` keeps. Their lines between two edges are curves, as on the
    Laves tiles.
  - *The five congruent-rectangle bonds* (`?level=runningbond.lines`,
    `?level=herringbone.branchinglines`, `?level=basketweave3.3mixed`) are
    lined and coloured just as the Laves tilings are, one brick each, named
    as the plain bonds are: "Running bond · lines". A bond is not edge to
    edge — a brick's corner lands part-way along its neighbour's long side —
    so its painted board's bricks are cut there: every side of every brick
    into steps of a half brick (a third in the 3×3 basket weave; `paintBase`,
    `Window.steps`), so each piece of a side meets one piece across and
    carries a mark of its own. Every brick is cut alike, even where nothing
    lands (the 3×3 basket weave's middle brick, the sides a basket weave's
    brick shares with its block's other), so the cut asks nothing of where a
    brick goes — only the marks do. The stacked bond, edge to edge, is not
    cut. Each has lined and coloured boards but the basket weave (lined
    only) and the 3×3 basket weave (coloured only).
  - *The three pentagonal tilings* (`?level=pentagon13.lines`,
    `?level=pentagon10.3mixed`, `?level=pentagon15.linkedpairs`) are lined
    and coloured just as the bonds are, one pentagon each, named as the
    plain tilings are: "Type 13 (Rice, 1977) · lines". None is edge to edge
    — a pentagon's corner lands part-way along its neighbour's side — and
    their sides are no whole number of any step, so a pentagon is cut where
    that happens instead (`cutAlike`, `src/geometry/cutAlike.ts`): every
    point where some copy's side is met part-way is carried back onto one
    copy and every copy cut there, round until no corner lies part-way along
    any piece — twice on type 10's pentagon, once on types 13 and 15. Each
    has a lined board and a coloured one (type 13 two lined), from 0.5 to
    1.9 measured; the lines between a side's two pieces close into a loop
    with the tile across.
  - *The six isogonal tilings* (`?level=offsetsquare.lines`,
    `?level=pythagorean.2oneinthree`, `?level=rotatedtri.3byshape`) are
    lined and coloured just as the 2-uniform ones are, one tray tile per
    colour and shape, named as the plain tilings are: "Pythagorean · lines".
    None is edge to edge — at every vertex one tile's side runs straight
    through — so each kind is cut where that happens, as the pentagons are
    (`cutAlike`, which cuts every copy of a kind alike, each kind on its own
    prototile): every side of the offset square's square and the
    staggered triangular's triangle once, the Pythagorean's big square but
    not its small one, the rotated hexagonal's hexagon but not its
    triangle, the rotated triangular's triangle but not its hexagon, and the
    three-scale triangular's middle triangle once a side and its large one
    twice. Each has two lined
    boards and two or three coloured, 29 in all, from 0.16 (the offset
    square's lines) to 1.55 (the three-scale triangular in three colours)
    measured.
  A marked level is measured as any other (Difficulty, below), with no
  floor at its plain board's score: marks can make a board easier as well as
  harder.
  A marked tile is held, where it can be, so that it fits none of the board's
  cells as the tray has it — the tray does not hand over the turn — so the
  marks ask for turning a plain board never needs. But tray
  tiles of one outline, marked differently, all rest the same way round —
  the one that leaves fewest of them fitting as held — so a tray of one
  shape never shows it at two angles (Klaassen's heptagons, the rhombille's
  rhombi); a test holds that too.
- **Piles and stars.** Each pile shows how many of that tile the board was cut
  from still to go (past zero, how many extra). Finishing at all is one star;
  with no more tiles than that, two; and within the level's time limit
  (`seconds`, five a tile), three. The clock starts with the first tile down.
  The best per level is kept in `localStorage` and shown in Tilings and
  Figures — on a tiling's card and a figure set's, as stars earned of stars
  to earn over all its levels; on a tiling's page, per board and marking.
- **Zoom.** Two fingers pinch the board in, up to four times fitted, about
  their midpoint (a second finger landing mid-drag puts that tile back first;
  one on a control still turns or flips it); one finger on bare board pans it
  once zoomed; a wheel or a trackpad pinch zooms about the pointer. Safari's
  own page pinch is cancelled.
- **The tray** is a strip along the bottom (portrait) or the right
  (landscape), in two rows — columns in landscape: a shelf of tiles at the
  board's own scale (a tray tile is the size it lands at, zoomed in or not, up
  to the strip taking 45% of the screen), then the controls in a row of their
  own at a fixed size. A shelf longer than the strip scrolls, with a scroll bar
  between the two rows: drag its thumb or press its track, drag the strip's
  bare background, or wheel over it. The two four-kind levels,
  [3.4.6.4; 4.6.12] and the hat's metatiles, are the ones to check a tray
  change on.

**Screens**, in Hypersweeper's Sand look (its `sand`/`sandDark` palettes,
grain, Space Grotesk, and Caprasimo for the title — the two fonts bundled in
`public/fonts`). Home (no query): Easy, Medium and Hard each deal a random
level of that difficulty; Tilings opens the catalog (`?tilings`; old
`?catalog` links still work): each family a row of tiling cards scrolling
sideways — first board's outline, tiles, name, difficulty as Hypersweeper's
three bars, how many levels it is (every board by every marking) and the
stars earned of them; a tiling of one level (the P-pentomino) opens it, any
other its **page** (`?tiling=<key>`, `src/view/picker.ts`): its boards on
top, as their outlines in a grid, one dealt at random; under them its
markings in one row scrolling sideways — Plain first and picked, then its
matching rules, then its colourings — each card the tray's tiles drawn big
in a grid that fits them all (`trayIcon`), never the board's outline, which
is up top, with the level's difficulty and stars on the picked board; then
Play, pinned to the foot of the screen, naming the level. A board the picked
marking is not laid on is dimmed, as is a marking not laid on the picked
board; picking one picks what goes with it (a board it is laid on, or the
plain tiles). The page keeps its pick in its URL (`&pick=<level>`), so Back
from a level comes back to it. Figures (`?figures`) lists the levels by the tiles in their tray, a
row each: one figure by its sides — triangles, quadrilaterals, pentagons,
hexagons, 7+-gons — then one figure of several pieces, regular pairs, irregular pairs (at least one figure
irregular), and packs of three or more. A row puts the regular figure first,
then the rest closest to regular first; one lone figure at two sizes is one
figure, named for its shape (V4.8² and the isosceles right rep-tile are the
isosceles right triangle). Each card shows the set's tiles side by side at
their true sizes — and a set's page (`?figure=<key>`, keyed by its first
level) is a tiling's page for every tiling whose tray is exactly that set:
their boards side by side, each tiling's name and difficulty over its own,
easiest first, one dealt at random, then the picked tiling's markings and
Play. The gear in home's top-left
corner (Hypersweeper's icon) opens Settings (`?settings`), which shows the
version and checks for updates (the shared check in `@tiling/platform`; left
out of a packaged build). Levels are picked in
Tilings or Figures. A level is `?level=<key>`: one header row, Hypersweeper's —
home, on a tiling with more than one board the next board (two squares, the
window moved along; or B), the clock against the three-star limit, restart,
and a die that deals another board of the same difficulty as this one — then
the level's name, which board it is (`board 2/6`) and the coverage as a faint
label on the page behind the board, which fills the rest
of the screen, the tray on a strip along the bottom (portrait) or the right
(landscape). The win card has Play again and Next level (another level of
the same difficulty, dealt at random as the die deals), and an ✕ in its
corner that closes it to look at the finished board (as do Escape and a tap
outside it). Each move
is a history entry, so the browser's Back works.

**Boards.** A tiling cut in more than one place has more than one board, each
a level of its own (`?level=<key>-<n>`, its own stars and difficulty band;
the first is `<key>`, the board it shipped with) — and each of its markings
on each board too (`?level=<marking>-<n>`: `trihex.lines-2` is `trihex-2`
lined; the next-board control steps through the boards a marking is laid
on). Tilings and Figures list a tiling once — its first board's outline, how
many levels it is, the stars earned of them — and Easy/Medium/Hard and the
die deal from every board, plain and marked.
`npm run boards` (`scripts/find-boards.mts`) finds them and writes where each
is cut to `src/boards.json`: a periodic tiling's square moved across one
domain of it on a 32 × 32 grid of steps, its edge shrunk by up to half a
tile edge or grown by up to one and a half, in quarters (moved, the first
board's square, the tightest that holds its tiles, loses some); an
aperiodic builder's other `variant`s; a hat window centred on another tile
near the patch's middle. A cut is a board when it has within 10% of the
first board's tiles, is as square (what the tests hold every board to), is
one outline with no pinch, not bitten into (`solidity`, its area over its
convex hull's: no more than 0.05 below the first board's, or above 0.75 —
which a patch ending inside the square falls well under, and a spiky tile's
ragged rim does not), and takes the very same tray — and, uniform or
2-uniform, has every vertex configuration inside; a periodic cut is taken only
at a step whose eight neighbours keep the same tiles, so no float on a box
edge decides it. It is a new board only when it is congruent to none before
(`congruenceKey`, exact: centred as N·p − Σ, tried at every ζᵏ, mirrored or
not). Of those, the most unlike each other — tiles of each kind, length of
rim — are kept: up to six boards a periodic tiling, eight an aperiodic one.
The regular tilings, squares, triangles and hexagons, are one board each, the
same wherever they are cut; so are the rep-tiles (a big copy of the tile, not
a window), the spirals (one true centre) and the Socolar–Taylor tile (its
patch holds one two-ring window). Boards past the first are built when first
opened (`levelByKey`), so the page loads no slower; `BOARDS` lists them all,
`LEVELS` the first boards — and no level at all is built as the page loads
(building them all takes seconds, a quarter of a minute on a phone, which
showed a blank page): `src/levelIndex.json` (`npm run levels`,
`scripts/index-levels.mts`) lists every first board's key, label, name,
section and marks in catalog order, and `LEVELS` is a stub of each
(`lazyLevel`) that builds the level the first time anything else of it is
read — its tiles, cells or region, when its card or board is drawn.
`tests/unit/levelIndex.test.ts` builds them all (`buildFirstBoards`) and
fails while the file is out of step. `tests/unit/boards.test.ts` holds every listed
board to the search's promises, so a changed window that leaves
`boards.json` behind fails there; re-run `npm run boards`, then
`npm run difficulty`. After changing a level's window, name or tiles, or
`npm run colourings`, re-run `npm run levels` too.

**A marking on every board.** A marked level is listed (and searched for:
`npm run colourings`) on its tiling's first board, and laid on the rest by
`markedOn` in `levels.ts`. A painting of a periodic tiling is written down as
numbers on the first board's own translation classes and lattice origin, so
it is not laid on another board by those numbers alone: the board is carried
onto the first's coordinates — the translation that lays it tile for tile on
a patch three times the first board's size (`shiftInto`, `widePatch`), exact
— and painted with the first board's cells placed first (`paintingOf`'s
`bases`), so its classes are the first board's and it is the same colouring
of the tiling (`paintedBoard`; a bond's, pentagonal or isogonal board's tiles
cut first as the first board's are, `paintBase`). A rule read off an
aperiodic patch reads another board off the same patch (`patchWindow`, keyed
by the board), and Penrose's arrows come from his builder's legs for that
board's `variant`. A colouring of an aperiodic window is chosen with the
cells round that window, so it is not carried across; Ammann–Beenker's other
windows colour with six to nine tray tiles at best, past `MAX_COLOURED_TRAY`,
so its colouring stays on its first board. `npm run marked-boards`
(`scripts/find-marked-boards.mts`, half a minute) lays every marking on
every board and writes to `src/markedBoards.json` those where it makes the
very same tray as on its first board (`sameTray`: each tile the other's
turned, marks and all, on whichever side it rests — a window can show a
colouring's tiles in more ways or fewer: 94 of a thousand do): 913 boards
past the first, 1654 levels in all. Run it after `npm run boards`,
`colourings` or `levels`, then `npm run difficulty`;
`tests/unit/difficulty.test.ts` builds every listed one and holds it to that,
and `tests/unit/boards.test.ts` to its numbering.

**Difficulty** is measured, not assigned (`src/difficulty.ts`), by a
simulated player laying the board the level was cut from, and it counts two
things. **Turning:** the player always takes a tile it can snap down now that
needs the fewest rotate/flip presses from how the tray is held (turning
whichever way round is shorter), so it groups tiles by orientation as a person
would; its presses per tile, each weighted √(90°/step) — a 15° press counts
2.4, a 90° one 1 — plus flips. **Traps:** a person lays tiles where they fit
the edge, and on a square board every tile that fits is right; on the
Spectre's nearly two in three are not. So as the player lays the board, every
open corner is looked at once, as it first opens, with every tile, every way,
that fits there (`Puzzle.fitsAt`), and each fit not the board's own is *seen*
(a corner it opens takes nothing at all), *fine* (the board's own tiles laid
round it leave a hole that fills, within 40 tiles: six triangles where a
hexagon was) or *hidden* — wrong, and looking as right as any
(`measureTraps`). The score is the turning, plus 1.25 (`TRAPS`) times the
share of fits that are wrong (seen or hidden), plus 0.15 per extra tile kind
and tiles/200. Bands split at 0.85 and 1.45 (`MEDIUM`, `HARD`), set so that
every flag-transitive level, 4.8² and 3³.4² are easy and the Cairo pentagonal,
V4.6.12, the Spectre and the hat hard, and so that by their medians the
periodic tilings measure easier than the spirals and the spirals than the
aperiodic ones; the tests pin all of that. A marked level is measured the
same way, its marks narrowing what fits; `chooseColourings` ranks
candidates by the turning alone (`turningScore`), the traps too slow for
thousands. Measuring a board's traps takes up to seconds (the hat's; the
Socolar–Taylor tile's two and a half minutes), so `npm run difficulty`
measures every board, one process per core — half an hour on four — and writes
`src/difficulty.json`, which the game reads. `tests/unit/difficulty.test.ts`
measures every board's turning again and checks its stored score against it,
and the traps of a sample (`TRAPS_CHECKED`); it fails while the file is out
of step.

The ladder it is built for is every flat board Hypersweeper has: squares,
triangles, hexagons, the uniform and 2-uniform tilings, then spirals and
aperiodic ones. A level can also hold every vertex to a configuration
(`Level.rule`, "every point is 3.3.4.3.4") — built and tested, unused so far.

**Status: 104 tilings in eleven sections, then 165 matching rules (lines on the eleven uniform tilings, nineteen of the twenty 2-uniform ones, the eight Laves tilings, the twenty 2-isohedral ones, four of the five bonds, the three pentagonal tilings and the six isogonal ones, Penrose's arrows on his rhombi and his kites and darts, and a rule read off its patch on each of the seven other aperiodic levels, four of the five spirals and sixteen of the seventeen rep-tiles) and 188 colourings of the uniform, 2-uniform, Laves and 2-isohedral tilings, four of the bonds, the three pentagonal tilings and the six isogonal ones, Ammann–Beenker, Klaassen's spiral and six rep-tiles in three more, every marking on every board of its tiling that it makes the same tray on, 1654 levels in all (see Boards above), deployed at <https://rep-tiles.pages.dev/>** — named as
Hypersweeper names its families (`menu.familyLabels` in `data/catalog.json`):
*Regular* (4⁴, 3⁶, 6³), *Uniform* (the other eight uniform tilings, 3.6.3.6 to
4.6.12), *2-uniform* (all twenty, named as Hypersweeper's catalog writes them,
[3⁶; 3⁴.6]₁), *Laves* (the eight Laves tilings, V4.8² to V4.6.12),
*2-isohedral* (the twenty 2-uniform tilings' duals, two kinds of tile each,
named V and the primal's pair, V[3⁶; 3⁴.6]₁), *Pentagonal* (types 10, 13 and
15 — James, Rice, and Mann et al. — one convex pentagon each, named as
Hypersweeper labels them: none is vertex-transitive, so there is no one
configuration to name it by), *Isogonal* (all six of Hypersweeper's — offset
square, staggered triangular, Pythagorean, rotated hexagonal, rotated
triangular, three-scale triangular — regular polygons, every vertex alike but
not edge to edge, one tile's side running through each; named as Hypersweeper
labels them, since two pairs of them share their count of tiles round a
vertex (4.4.4, 3⁴); the rotated hexagonal's windows each leave a lone tile at a
corner, dropped), *Congruent rectangles* (the five
brick bonds — stacked, running, basket weave, 3×3 basket weave, herringbone —
one brick each, named as Hypersweeper labels them: a bond has no vertex
configuration, and but for the stacked bond is not edge to edge),
*Rep-tiles* (twelve of Hypersweeper's thirteen — the sphinx to the
T-tetromino — each a big copy of its one tile to fill with small ones, 16 to
32 of them; the five-triangle is left out, being the pinwheel, whose tiles
turn by no power of ζ — then five whose tile is **several pieces** moved as
one, which Hypersweeper has no board for: the right-angled fish and the 60°
fish, a tail meeting a body at one point, 8 and 9 tiles; the kissing squares
and kissing triangles, two corner to corner, 16; and the kissing square chain,
four in a zigzag, 16), *Spirals* (five of Hypersweeper's six — the
phyllotactic hexagons, Klaassen's heptagon, Klaassen's pentagons at five-,
six- and seven-fold — one tile each, wound round a centre, 24 to 30 of them
kept as Hypersweeper trims its board, a whole number of arms where that is
squarest; the brick rings are left out, a square of bricks laid as easily in
stacked rows) and *Aperiodic* (all four of Hypersweeper's — Penrose's rhombi,
his kites and darts, Ammann–Beenker's squares and rhombi, the Spectre — each
the centred window of its builder's patch, 24 to 33 tiles, the sun or star in
the middle; any cover wins, so the matching rules that keep the other three
aperiodic are not enforced — the Spectre, never flipped, needs none — then
**the hat's family**, cut from the patch Hypersweeper's three boards of it are
(`hatMetatiles` in `@tiling/geometry`) but windowed Rep-tiles' own way (`?level=hat`,
`?level=turtle`, `?level=hatmetatiles`): *the hat*, Tile(1,√3), the first
aperiodic monotile, 36 of them, used both ways up — about one in seven
mirrored and no two of those sharing a side, so the flip control is the
puzzle; *the turtle*, Tile(√3,1), the same outline with its two edge lengths
swapped, 34, laid as the hats are; and *the hat's metatiles* — H, T, P and F:
a hexagon, a triangle, a parallelogram and a pentagon, 26, never flipped —
that every hat tiling is built from; all three turn by 60°; then
the **Socolar–Taylor tile** (`?level=socolartaylor`), which Hypersweeper has no
board for: a hexagon whose matching rules are forced by its shape alone, at
the price of nineteen pieces — a notched hexagon, six small rectangles across
its sides and six pairs of larger ones past its corners — moved as one, used
both ways up; 19 tiles, two rings round a middle one, the outer ring's far
pieces lying off the hexagon and gaps opening in it where missing neighbours'
pieces would go). The
Spectre's board is two levels: *Tile(1,1)* (`?level=tile11`), the tile with
straight edges, and *the Spectre* (`?level=spectre`), the same tile with its
fourteen unit edges bulging out and in by turns — **round edges**: a tile lies
along a round edge only where its own edge there is the same curve, whole
(`Shape.curve`, below). Each
window board is as near square as its tiling allows at two or three
dozen tiles — but V[3.4.3.12; 3.12²], whose dodecagon centres make it coarse:
20 tiles, its next square window 60; and the 3×3 basket weave, 48, a whole
square of blocks (its smaller windows are a lopsided pinwheel). CI's `game-checks (reptiles)` job typechecks, formats, tests and
builds it on every change, and `game-e2e (reptiles)` runs the Playwright smoke
test against the production bundle (`tests/e2e/smoke.spec.ts`: the screens,
a tiling's page — a board, its tiles, Play — Figures and a figure set's page, settings, the header, rotating both ways, wheel and pinch zoom, the tray at
board scale, its two rows and scroll bar, the family names, the Spectre's round
edges, the hat's family's flip and 60° turn, a tile of several pieces moving as one, a coloured board's bands and lines, Ammann–Beenker's rule read off its patch and its colouring, a won board and
its ✕) and every level — every marking on every board — and tiling page opening with no error
(`tests/e2e/every-level.spec.ts`, in Chromium and in WebKit as an iPhone). It packages as an offline desktop app through the
shared shell — `make desktop-run GAME=reptiles`, `make mac-app GAME=reptiles`
— from `packaging.json` (see `shells/desktop/README.md`); its data lives in
its own `Rep-tiles` folder there. No iPhone app yet (a recipe is in
`apps/hypersweeper/ios/README.md`, "A second game's iPhone app").

## Deploy

Like Hypersweeper, and by the same workflows, one matrix entry each:

- **Production:** `deploy-cloudflare.yml` builds this folder on every push to
  `master` and publishes it to the `rep-tiles` Cloudflare Pages project
  (`wrangler.toml` names it) at <https://rep-tiles.pages.dev/>.
- **Previews:** `pr-preview.yml` publishes each pull request to
  `https://pr-<number>.rep-tiles.pages.dev`, with its own sticky comment, and
  deletes it when the PR closes.
- **What the build adds** — all from the shared preset (`vite.config.ts`, see
  `packages/vite-preset`):
  - the link-preview tags (a text card: there is no `public/og.png`);
  - the PWA: service worker, `manifest.webmanifest`, the icons in `public/`;
  - the version stamp;
  - `public/_headers` — Hypersweeper's security policy, applied at the edge
    and, through the preset, by `vite dev` / `vite preview`.
- **Versions:** `bump-version.yml` bumps this game's patch version (in
  `package.json`) on every push to `master` that changes this folder,
  `packages/` or `data/` (`scripts/bump_version.py`). A version set by hand
  lands as written.
- **Icons:** `npm run icons` redraws them (`scripts/make-icons.mts`): a
  triangle as four half-size copies of itself, in the tile colours — the web
  icons in `public/` and the desktop app's `packaging/icon.png`. Commit what
  it writes.

## Build and run

```sh
npm install          # at the repo root, first time and after a dependency change
cd apps/reptiles
npm run dev          # http://localhost:5174 (Hypersweeper's dev server is 5173)
npm run typecheck    # tsc --noEmit, strict — also checks the packages/geometry files it imports
npm run test         # vitest unit tests (a few seconds)
npm run format       # Prettier (the root .prettierrc.json), in place; CI runs format:check
npm run build        # typecheck + the production bundle (PWA included) into dist/
npm run e2e          # Playwright smoke test: builds, serves with `vite preview`, plays a move
npm run boards       # find every tiling's boards past its first into src/boards.json (minutes)
npm run marked-boards # lay every matching rule and colouring on every board into src/markedBoards.json (half a minute)
npm run colourings   # list each painted tiling's lined and coloured levels into src/colourings.json (twenty minutes, nearly all the 2-uniform and 2-isohedral tilings of many classes; `-- <key>…` for only those), and each aperiodic level's, spiral's and rep-tile's colouring into src/aperiodicColourings.json (a minute)
npm run levels       # build every first board and list them into src/levelIndex.json (seconds)
npm run difficulty   # re-measure every board into src/difficulty.json (half an hour on four cores, a process per core)
npm run icons        # redraw public/favicon.svg, the PNG icons and packaging/icon.png
```

or from the root: `make reptiles-install`, `make reptiles-run`, `make reptiles-test`,
`make reptiles-e2e`.
`?level=<key>` opens a level directly. In dev builds `window.__reptiles.fill()`
finishes the board (the board's own tiles that still fit, then a search) — the
quick way to see the win state.

## Layout

- `src/geometry/cyclotomic.ts` — **exact coordinates.** A point is an element
  of ℤ[ζn] (any n; Φn computed at runtime), stored as φ(n) integers. That
  covers every edge-to-edge board Hypersweeper builds — ℤ[ζ4] squares, ℤ[ζ12]
  triangles/hexagons/most uniform tilings/spectre, ℤ[ζ8] 4.8.8 and
  Ammann–Beenker, ℤ[ζ5]/ℤ[ζ10] Penrose, ℤ[ζ7] Klaassen, ℤ[ζ24] mixes — and
  the exact predicates (`orient`, `sameDirection`, `strictlyBetween`,
  `properlyCross`) decide zero exactly and only read a float's sign.
- `src/geometry/shape.ts` — `Shape`: a tile, its `pieces` — one `Piece`,
  any simple polygon (CCW, y up, concave allowed), or several moved as one
  (the fish, the kissing squares: `polygon` makes the one-piece kind; nothing
  asks the pieces to touch, so a tile whose pieces lie apart, the
  Socolar–Taylor tile, fits too) — `Pose` (rotate by ζᵏ, optional mirror, translate), `regular`,
  `walk` (a region outline as unit steps), and the float measures used for
  drawing and nearest-snap. `posed`, `turnsOnto`, `selfTurns` and `restFlat`
  take every piece together: a tile rests on a side with all its pieces above
  it (or, having none, as it is); `spotKey` names a placement by all its
  vertices. A round piece's `curve` is a `Bulge` per edge —
  `IN` (to the edge's left, into the tile), `OUT`, or 0 — every bulge the same
  symmetric arc, so an edge in from one side is the line of one out from the
  other. It lists every point a curve ends at, a flat corner too (the
  Spectre's 14 points); `sideCount` counts only the real corners (13), and
  `restFlat` rests a tile on a whole side. `posedCurve` carries a curve
  through a mirror, `curveOnto` onto a placed copy, its pieces and vertices
  listed in any order.
- `src/geometry/frontier.ts` — **the frontier**: the uncovered area's boundary
  as directed edges, uncovered side on the left. Covering a tile adds its
  edges reversed and cancels a→b against b→a, after splitting both at each
  other's vertices (so T-junctions work). `fits` is the overlap test,
  `corners` the frontier vertices where it turns, `placements` the snap
  candidates (a tile vertex on a corner, an edge laid along a frontier edge),
  `nearest` the one the drag shows. Won ⇔ empty. Each edge carries its
  `bulge` (a round tile's or the rim's, `Level.regionCurves`), and `fits`
  lays an edge along a round one only with the same bulge, end to end — a
  round edge is never cut part-way. A tile of several pieces fits where every
  piece does, covers them in turn, and snaps by any corner of any of them.
  Fast enough for the Socolar–Taylor tile (114 corners, against a board of
  650 edges in 88 loops) in a few milliseconds a snap: the edges are indexed
  by height (`edgesNear`, `windingAt`), a shape's corners and sides are worked
  out once per shape object (`Puzzle.shapeAt` keeps one per way it is held),
  and before a placement is built `placements` drops it in floats — its
  centroid out of the drag's reach (`aim`), or a point well inside one of its
  pieces on covered ground, which no placement that fits has — and builds a
  placement reached from several of its corners once.
- `src/geometry/outline.ts` — a patch of cells' boundary loops (shared edges
  cancel exactly, after each side is cut at every corner lying inside it, for
  the bonds' T-junctions): how a level's region is made from its cells; and
  `solidity`, a region's area over its convex hull's, the float measure the
  board search refuses a bitten-into board by.
- `src/geometry/fromTemplate.ts` — a `box`-edge square window of one of
  Hypersweeper's periodic tilings in exact coordinates: the tiles
  `archimedeanBoard` keeps, with vertex identity taken from the template's own
  references and each unit edge's direction read off its float vector (to
  1e-4: templates round positions to six decimals). The ring is the first of
  ℤ[ζ4], ζ6, ζ8, ζ12, ζ24 that holds every edge. A tiling with no edge along an
  axis (the snub hexagonal, drawn 19° off) is turned until one is, and its
  square cut in the turned frame — the tray's tiles rest flat, so the board's
  must too; `turned` records it (the rotated triangular and the three-scale
  triangular are turned too). `offset` moves the square off its centre (a
  board past the first, `boards.json`), and `centre` says where it ended up in
  the template's coordinates, for the tests to cut Hypersweeper's board there. The congruent-rectangle bonds' edges are a
  half or a third of a brick, split at T-vertices — and the isogonal tilings'
  a half of the unit, read the same way: each edge is read as a
  whole number of the smallest fraction of the unit that makes them all whole,
  the board built at that scale in a ring whose `unit` draws it at true size,
  and each cell keeps only its real corners (the template's `real` flags), so
  a brick is a plain rectangle — and `steps` the same cells with every side
  cut into steps of that fraction (only asked for a bond's painted board:
  `paintBase` in `levels.ts`). The pentagonal tilings' edges are no whole
  fraction of the unit (√2/2, (3√3 − 1)/2, 2cos 15°): every edge length is
  read as a short real of the ring — a whole number plus a multiple of one
  ζʲ + ζ⁻ʲ, whole numbers first — times its direction; the walk's closure check
  holds every reading.
- `src/geometry/laves.ts` — a Laves tiling as the exact dual of a uniform
  patch, or a 2-isohedral one of a 2-uniform patch: a tile on every whole
  vertex, its corners the face centres round it. Centres are exact once
  scaled by the face sizes' lcm, so the board is built at that scale in a ring
  whose `unit` draws it back at true size. Tiles the square cuts off from the
  rest are dropped: the board is the largest piece joined edge to edge. The
  dual patch is built once per tiling and size, and cut wherever the square is
  moved to (`offset`), so the board search can try a thousand places.
- `src/geometry/repTile.ts` — a rep-tile patch: Hypersweeper's substitution
  tile (`SUBSTITUTIONS`, `substitutionPlacements`) inflated `levels` times,
  its lattice points read exactly into ℤ[ζ4] or ℤ[ζ12] and turned by the
  same upright turn Hypersweeper draws the right triangles at, each cell cut
  to its real corners (the tiles meet at T-junctions, as the bonds do).
- `src/geometry/pieces.ts` — the rep-tiles of several pieces
  (`PIECE_TILES`): each tile, the ring element its big copy is grown by (2,
  3, 4, or 2 + 2i — the right-angled fish grows by 2√2 and turns 45°), and
  that copy cut into copies of the tile, as a gallery picture of rep-tiles
  draws it. `piecePatch` grows it: once is the children; again cuts
  each child the same way, which needs a real factor (a mirror does not
  commute with a turning growth). The tests (`tests/unit/pieces.test.ts`)
  check each child is the tile and that they cover the grown tile exactly —
  the oracle these levels have instead of a Hypersweeper builder.
- `src/geometry/exact.ts` — tiles a Hypersweeper builder publishes exactly
  (`ExactTiles`: the coefficient vectors its vertex ids are) read into a
  ring: ℤ[ζ(order)], or ℤ[ζ(2·order)] for an odd order, whose tiles sit at
  every (2·order)th of a turn; mirrored in the x axis, the way round
  Hypersweeper shows a chiral board; each tile cut to its real corners.
- `src/geometry/spiral.ts` — a spiral patch: the tiles Hypersweeper's
  spiral builder keeps (`phyllotaxisExact`, `klaassenExact`,
  `pentaSpiralExact`), read by `exactPatch` into ℤ[ζ10], ℤ[ζ12], or ℤ[ζ14]
  for the ζ7 spirals — or, `keep` null, the whole patch the builder grew,
  which its marks are read off.
- `src/geometry/aperiodic.ts` — an aperiodic patch: the centred window
  Hypersweeper's builder keeps (`penroseExact`, `kiteDartExact`,
  `ammannBeenkerExact`, `spectreExact`), read by `exactPatch` into ℤ[ζ10],
  ℤ[ζ8] or ℤ[ζ12]. The Penrose patches deflate a unit wheel, so their edges
  are 1/φ^depth; they are grown back by φ^depth (exactly: φ = ζ + ζ⁻¹) to
  unit edges, and the tests draw the builder at that scale
  (`aperiodicShrink`). The Spectre's flat corner is dropped — a 13-gon,
  Tile(1,1) — but for the round Spectre (`keepFlat`), whose two curves meet
  there. `APERIODIC` in `levels.ts` keys each level and names the board it is
  cut from (`aperiodic.mode`: both Spectre levels are `spectre`'s).
- `src/geometry/hat.ts` — the hat's family, cut from `hatMetatiles` in
  `@tiling/geometry` (`packages/geometry/src/hat.ts`, shared with
  Hypersweeper's hat, turtle and metatile boards): Craig Kaplan's hatviz
  substitution (BSD 3-Clause; the four metatiles H, T, P and F, glued into a
  patch and cut into bigger ones, `depth` times from the H) ported as it is,
  floats and all, then every corner of every hat and metatile read back onto
  the Eisenstein lattice ℤ[ω] ⊂ ℤ[ζ12] at twice hatviz's size (`snap`: it
  throws unless the corner is within 1e-6 of a lattice point, whole units
  apart — discrete identity, not rounding). The hat's short edges point at
  multiples of 60°, its long ones 30° past, and every hat is turned by sixths,
  so a hat tiling is any Tile(a,b) tiling with each edge's length changed:
  `deform` walks the hats' edges from one corner and lays every corner again
  with short edges a and long ones b, exactly, checking each tile closes and
  each shared corner lands once — the turtle is (√3, 1), and (1, 1) gives
  Tile(1,1), which the tests check is the Spectre's level's tile.
  `hatPatch` keeps the `keep` tiles nearest the middle by Chebyshev distance,
  as Hypersweeper trims its aperiodic boards (`centredWindow`) — or nearest
  another tile's centroid (`centre`, a board past the first). The tests
  (`tests/unit/hat.test.ts`) are its oracle: no overlap and no gap as hats and
  as metatiles, every hat the hat turned by sixths, the mirrored ones one in
  seven or so and apart, every turtle the turtle.
- `src/geometry/socolarTaylor.ts` — the Socolar–Taylor tile
  (`SOCOLAR_TAYLOR`, its nineteen pieces read off the shape-enforced drawing,
  in ℤ[ζ12] via the lattice points (a, b) — x = a·cos 30°, y = b/2 — that
  `stPoint` maps), and its tiling: each tile on a hexagon of a hexagonal
  lattice, in one of twelve ways. No formula gives the ways, but the shape
  forces them: `socolarTaylorSearch` lays hexagons ring by ring, keeping a way
  that overlaps nothing and leaves no gap no later tile can reach. That is
  exact — every edge of the tile lies on a line of the kisrhombille, so a tile
  is a set of its small triangles (3600 of them, the hexagon's area) and the
  search compares sets. Four rings take a quarter of a minute, so their patch
  is written out (`SOCOLAR_TAYLOR_PATCH`, 61 tiles) and the tests check it has
  no overlap and no gap (`stFaults`); the level keeps its middle two rings,
  19 tiles, so the board carries on at least two rings further. The tests
  (`tests/unit/socolarTaylor.test.ts`) are its oracle instead of a
  Hypersweeper builder.
- `src/geometry/marks.ts` — **edge marks**: a coloured or lined tile's label
  per edge — `NONE` (a plain tile's, and the rim's, which takes any), `LINE`,
  `END` (a line cut back to a half disc) and `BLANK` (each its own partner,
  so a half disc never meets a line); a coloured board's colour pair
  `colourMark(own, other)`, whose partner is the pair the other way round;
  and Penrose's arrows, `arrowMark(kind, forward)` — kinds 1 and
  2 the rhombi's single and double, 3 and 4 the kites' and darts' long and
  short edges' — pointing along the tile's outline or against it: its
  partner points the other way, and a mirror (`mirrored`) turns it round;
  and a rule read off an aperiodic patch, `labelMark(cls, forward)`, an
  arrow of any class, or with no way (`null`, its own partner). A
  `Piece` carries
  them as `marks`, edge for edge as it carries `curve`; `posed`, `moved`,
  `curveOnto` and `restFlat` keep them, `turnsOnto` (given the cell's marks)
  and `selfTurns` count them — a square striped across is the same only after
  a half turn — and `spotKey` names them, so one spot turned two ways is two
  placements. The frontier treats a marked edge as a round one: each open edge
  holds the mark the tile across must bring (`partner`), a tile lies along it
  only with that mark, whole, and covering a tile leaves its marks' partners.
- `src/colourings.ts` — **the colourings**: `paintings` tries every linear
  colouring of a periodic board in 2 or 3 colours — a tile of translation
  class t at lattice point (i, j) is colour (a·i + b·j + c[t]) mod k — with
  each colour equally common, and each 3-colouring with two of its colours
  made one (a third of the tiles one colour: the hexagons' only way in two),
  as edge marks (colour pairs; and, where tiles of one colour touch, the
  same edges unordered, `alike`, to find a colouring that plays as its lined
  board does) and each cell's colour, and for each
  balanced one the lined board in
  one colour, where it has lines — each line that would end in a tile cut
  back to a pair of half discs (`cutEnds`: leaf-pruning the same-colour
  graph on the tiling's period, the colouring's k steps each way, so a rim
  tile is cut as it is in the tiling). Each cell's class and lattice point are
  solved for in floats and checked exactly; which class lies across each edge
  of each class is read off the window's inner edges (`atlasOf`), so a rim
  tile's marks are its marks in the tiling (it needs every edge to meet one
  edge across: a bond's bricks and a pentagonal or isogonal tiling's tiles
  are cut first, `paintBase`). `paintedCandidates` in `levels.ts`
  builds each with `makeLevel` (its `marks` and `paints`: a kind takes the
  first colour among its cells), keeps those that mark all of a colour's
  tiles alike — the colourings that look alike everywhere; one tile per
  colour, or fewer where colours read alike — and ask something (not one mark
  all round) and need more than one tile per shape (one reads as a lined
  board), and drops any whose tray another already had (`traySignature`: the same up to
  turning a tile, a mirror and renaming the colours — rows and columns are
  one). `COLOURED` lists the regular boards painted and each one's lattice
  (their paintings listed in `src/colourings.json` too, all that are kept,
  so nothing is searched as the page loads); the
  level is `<plain>.<label>`, `Level.decor` saying what it marks — lined
  ones in the Matching rules section (`decor.rules`), the rest in
  Colourings. The other eight uniform tilings (`UNIFORM`) are painted the
  same way, with three differences. `paintedCandidates` asks for one tray
  tile per colour *and plain kind*, and drops a tray of one tile per shape
  each one mark all round (the shapes decide it). Their lattice is found
  from the cells (`latticeOf`: the shortest translation that carries the
  patch onto itself, and the shortest not along it), and what lies past the
  rim is read off a patch twice the window's size (`periodicContext`, moved
  onto the window exactly) — the snub hexagonal's window holds one hexagon,
  too few to see its period. A step is kept only if it carries every cell
  well inside the patch (two cells' widths in from its bounding box) onto a
  cell, not only every cell it moves onto the patch's vertices: one along
  2-uniform rows of squares and triangles carries the squares onto squares
  and a triangle to where no vertex is. The twenty 2-uniform tilings
  (`TWO_UNIFORM`) are painted just as the uniform ones are. The eight Laves tilings (`LAVES`) are painted
  just as these are, their wider patch a wider dual window (`lavesWindow`,
  in the same ring); one tile each, they are labelled as the regular boards
  are. The twenty 2-isohedral tilings (`TWO_ISOHEDRAL`, listed by their own
  keys in `TWO_ISOHEDRAL_KEYED`) are painted as the Laves ones are, their
  wider patch a wider dual window of the 2-uniform primal (`Level.dualOf`),
  and labelled as the 2-uniform ones are. The five congruent-rectangle bonds
  (`RECTANGLES`) are painted as the uniform ones are, on their bricks cut
  into steps (`paintBase`; its wider patch, `periodicContext`, cut alike),
  and labelled as the Laves ones are; the three pentagonal tilings
  (`PENTAGONAL`) the same way, on their pentagons cut alike (`cutAlike`,
  read off the wider patch, which is cut the same way), and the six
  isogonal tilings (`ISOGONAL`) on their polygons cut alike kind by kind,
  labelled as the 2-uniform ones are. Trying every colouring is k to the power of the translation classes
  (a million and a half on the kisrhombille's twelve, ten billion on
  [3⁶; 3².4.12]'s twenty), so given each cell's plain kind `paintings` tries
  only the offsets `offsetsFor` cannot rule out: it sets them a class at a
  time, outwards from class 0, reads each window cell once its class and
  every class across its edges is set, and drops the branch once the
  colouring, each third of a 3-colouring and the lined board would each have
  two cells of one kind (and colour) that read differently — for the lined
  board, which edges have a tile of its colour across, which no cut changes.
  It yields what trying every one would, in the same order. Even so the
  search takes twenty minutes (six of them [3.4².6; 3.4.6.4]'s nineteen
  classes, four its dual's), so `npm run colourings`
  (`scripts/find-colourings.mts`, choosing in `src/colouringChoice.ts`)
  writes each one's chosen `PaintingParams` to `src/colourings.json`, and
  the game builds only those (`paintingOf`); the tests choose again for all
  but the slowest (`SLOW_CHOICE`: the eight 2-uniform tilings that take half
  a minute or more, and the eight 2-isohedral ones that take ten seconds or
  more — four minutes on V[3.4².6; 3.4.6.4]) and fail while the file is out of step. Labels on a
  board of several shapes say lines, how many colours, "one in three" and
  "by shape" (`trihex.2oneinthreebyshape`), not how many edges match. `arrowLevel` gives an aperiodic board arrows from its builder's Robinson
  triangles, which name their corners alike at every step: which leg each
  edge was (`penroseLegs`, `kiteDartLegs` in @tiling/geometry), and a rule
  stated on the legs. The rhombi's (`penroseRulesLevel`): every a–b leg a
  double arrow, pointing in to the apex on a thin half and out on a thick
  one, every a–c leg a single arrow pointing out — up to renaming and
  reversing, the only rule of that shape every shared edge of the builder's
  430-rhombus patch keeps. The kites' and darts' (`kiteDartRulesLevel`):
  every edge pointing to a kite's side corners and from a dart's — of the
  rules every shared edge of the 705-tile patch keeps, the one that forbids a
  kite in a dart's notch.
- `src/patchMarks.ts` — **marks read off an aperiodic patch**, for every
  aperiodic level, every spiral and every rep-tile (`PATCH_MARKED` in
  `levels.ts`; a rep-tile's patch is its own board).
  `patchFrames` lists the level's whole patch with each tile in its
  prototile's own order (Ammann–Beenker's from each tile's own first corner,
  `ammannBeenkerFrames` in @tiling/geometry; the Spectre's fourteen corners;
  `hatFrames`; the Socolar–Taylor tile's pieces as `SOCOLAR_TAYLOR` lists
  them; a spiral's from the corner that turns it onto the patch's first
  tile, `spiralFrames`, its builder's own first corner where that serves;
  a rep-tile's as its substitution lays it, `repTilePatch` and
  `piecePatchFrames`),
  so edge j of every copy is one slot. `refine` cuts every edge where
  a corner of the tile across lands on it, every copy of a slot alike,
  round and round until nothing more is cut; `deriveRules` is a union–find
  with parity over the slots that meet (`meetings`), a class with an odd
  cycle wayless; `locate` finds the level's cells in the patch and
  `windowCells` reads them off it, counter-clockwise, with each edge's slot
  and the cell across (`patchWindow` gives an edge with nothing across —
  a rep-tile's rim — a cell of its own past the patch); `chooseColouring` (the script's) is a seeded search,
  DSATUR then Kempe-chain swaps from many starts, for the proper colouring
  of the window and the cells round it with the fewest tray tiles, every
  colour used inside the window.
  `patchRulesLevel` and `patchColouredLevel` in `levels.ts` build the levels
  (`<plain>.rules`, and `<plain>.<k>apart` where its colouring is few
  enough tray tiles, `MAX_COLOURED_TRAY`); a round Spectre's marked cells take
  its plain board's curves edge for edge (`makeLevel`'s `round`, given per
  cell). The tests (`tests/unit/patchMarks.test.ts`) check no patch edge is
  met part-way, every meeting keeps its rule, and each colouring is proper
  and needs its colours.
- `src/geometry/cutAlike.ts` — `cutAlike`: a tiling that is not edge to
  edge, cut so its sides meet piece for piece, every copy of a kind cut
  alike (the cuts gathered on one prototile a kind through each copy's
  exact pose and the kind's own symmetries, round until they settle; it
  throws if they do not). How a pentagonal or isogonal tiling's painted
  board is cut (`paintBase`).
- `src/geometry/congruent.ts` — `congruenceKey`: one key for exactly the
  boards congruent to a given one (turned, mirrored or moved, tile for tile),
  how the board search tells a new board from one it has.
- `src/geometry/vertexRule.ts` — the vertex rule: whether the corners round a
  point can still be completed to a vertex configuration. Applied only where a
  level sets `rule`.
- `src/levels.ts` — the levels, and `GROUPS`, the sections they are listed
  in. `windowLevel` makes a level from a tiling key and a box size (uniform,
  2-uniform, pentagonal, isogonal or a congruent-rectangle bond, by the
  tiling's family); the 2-uniform boxes are in `TWO_UNIFORM`, the windows that
  also have both kinds of vertex inside, the pentagonal ones' in `PENTAGONAL`,
  the isogonal ones' in `ISOGONAL`, the bonds' in `RECTANGLES`. `makeLevel`'s
  `round` gives a level round edges: each kind's tray tile's first edge bulges
  that way and the rest alternate; every cell takes its kind's curve, and the
  rim (`regionCurves`) the curve of the cell along it.
  `lavesLevel` and `twoIsohedralLevel` make the duals, from `LAVES` and
  `TWO_ISOHEDRAL` (the latter keyed by the 2-uniform primal; the level is
  `<primal>dual`, Hypersweeper's key). `repTileLevel` makes a rep-tile from
  `REPTILES` (Hypersweeper's mode key and how many inflations); the tests check
  it tile for tile against Hypersweeper's builder at that many `levels`.
  `spiralLevel` makes a spiral from `SPIRALS` (the mode key, how far the
  builder grows it, how many tiles it keeps), checked the same way, and
  `aperiodicLevel` an aperiodic window from `APERIODIC` (the mode key, how
  many substitutions, how many tiles the centred window keeps).
  `hatLevel` makes the hat's family's from `HAT_FAMILY` (the key, the tile,
  how many substitutions, how many tiles the window keeps), after the
  Spectre, marked `hat`.
  `pieceTileLevel` makes a rep-tile of several pieces from `PIECE_REPTILES`
  (its key in `PIECE_TILES`, its name, how many times it is grown), in the
  Rep-tiles section, marked `pieceTile`; `socolarTaylorLevel` the
  Socolar–Taylor tile's, last in the Aperiodic section, marked
  `socolarTaylor` (how many rings it keeps).
  `makeLevel` reads everything off a level's
  cells (each its pieces; `whole` wraps a builder's one-polygon cells): the tray (one tile per kind — cells alike up to a turn, or a turn and
  a mirror — resting flat on its longest side the whole tile lies above and
  that runs along a ring direction, `restFlat`: not the pentagonal spirals'
  cut, nor across the Klaassen heptagon's dent), whether a kind is
  used both ways round (`mirror`, which brings a flip control), each
  kind's rotate step from flat (`turns`) and pile (`need`), the time limit
  (`seconds`), each kind's colour classes (`colours`: by side count, plus
  `twin` on a second kind with as many sides as another — the two
  quadrilaterals of V[3².6²; 3.6.3.6]), the region, and keeps the cells
  themselves as one known solution; `turn` is the one rotate step for them all
  (the gcd of the kinds' steps). Every level carries its vertex
  configurations (`configs`, one or two — not enforced) and its `name`: the
  `notation` of the one, or the catalog's `[A; B]ᵢ` for two, read back by
  `parseNotation`. Each
  level's cells are built on the same lattice as the Hypersweeper builder it
  mirrors (`squareBoard`, `triangleGridBoard`, `hexBoard` — Hypersweeper's
  default flat board for each tiling), and its region is their outline.
- `src/progress.ts` — the best stars per level, in `localStorage` (guarded;
  the game works without it; the old finished-levels list reads as one star
  each).
- `src/puzzle.ts` — pure game state: `place`, `lift`, `snap` (in the held
  orientation only — `selfTurns` in `shape.ts` says which turns leave a tile
  unchanged — and, on a level with a rule, only edge to edge and where every
  vertex touched can still become the configuration: `allows`), `canTurn`,
  `won`, `coverage` (a share of the area, not a tile count — the count
  depends on how the board is finished), `used`, `stars`, and `solve`, a
  budgeted backtracking fill for the tests and the dev seam that always works
  the open corner with the fewest placements, trying the board's own tile
  there first (blind, it gets lost on V[3.4².6; 3.6.3.6]; on the
  Socolar–Taylor board it takes a quarter of a minute, so its test is left
  out), and `layOwn`, which lays every one of the board's own tiles that
  still fits — what the dev seam's `fill()` does first.
- `src/view/curve.ts` — drawing a tile: a `Loop` per piece (`loopsOf`),
  drawn as one path with a sub-path each (`loopsPath`), bounded by
  `loopsReach`; and round edges: `outlinePath` (a polygon as an
  SVG path, each round edge a cubic arc, laid out in board space before any
  y flip), `edgePath` for an open edge, and `reachPoints` (corners and points
  along the arcs: what a round tile's bounds and tray circle are taken from).
  Every tile, the region, the open edges and the icons are paths drawn
  through it.
- `src/view/decor.ts` — drawing a tile's marks over it, so that tiles that
  meet as they should make one shape across their edge: a colour as a half
  disc on the edge's middle; a lined board's lines from edge to edge, square
  on and ending on each (straight across, or a Truchet arc about the corner
  two lined edges share — or, two edges further apart on an octagon or a
  dodecagon, about the point their lines meet, `meet`; on an irregular tile,
  a Laves tile's kite, rhombus or pentagon, a cubic leaving each edge's
  middle along its inward normal, and spokes to the middle the same way;
  butt-capped, so never past the edge), and a line cut back (`END`) as a half disc;
  Penrose's arrows as arcs about the tile's corners (`arcsOf` finds the corners whose two edges' crossings are one kind
  and one distance off; `ARC_AT`, by kind, where an arc crosses its edge —
  chosen so every arc stays inside its tile, a thin rhombus's round its wide
  corners small, a dart's round its notch the long way); a label as a point
  (`LABEL_AT`: a third of the way back from its head, a second six classes a
  fifth), a tile's points of one class joined by a cubic leaving each along
  its inward normal (`LABEL_COLOURS`; a lone one a half disc), as wide as
  `markUnit`'s `line`, the level's middle side length, so every line of a
  level is one width. Every tile, tray
  tile, dragged tile and icon is decorated through it; its parts are
  `pointer-events: none`.
- `src/view/svgBoard.ts` — the SVG drawing. The SVG is in screen pixels:
  the world (region, tiles, the tile in hand; board units, y up) under one
  camera transform — fitted at zoom 1, `zoomAt`/`panBy` — and on the tray's
  pinned strip the shelf (at the world's scale, clipped to its room,
  `scrollTray`), its scroll bar (`scrollBarBy`, `scrollBarTo`) and the
  controls' row (a fixed size).
- `src/figures.ts` — **the figures**: every level's tray tiles matched across
  levels — the same figure when one is a turned, moved or mirrored copy of the
  other at its true size (`sameFigure`, exact: both lifted into ℤ[ζ lcm], each
  scaled by the other's drawing `unit`, compared by products of edge vectors;
  a float area check only ever rejects; a round tile matches only a round one
  whose curves land on its own, so Tile(1,1) and the Spectre are two figures)
  — and the levels grouped by the set of
  figures their tray is (`figureSets`). A lone figure also joins the first
  lone figure of its shape at any size (`sameFigure(…, false)`): V4.8² with
  the isosceles right rep-tile, V4.6.12 with the 30-60-90 one; pairs and
  packs keep true sizes (Pythagorean's two squares). Each set is in a row
  (`bucket`, the order of `BUCKETS`: one figure by its sides — triangles,
  quadrilaterals, pentagons, hexagons, 7+-gons — then one figure of several
  pieces, regular pairs, irregular pairs, packs), and in a row by fewer figures, regular first, then
  `distortion` ascending (1 − the isoperimetric quotient over the regular
  n-gon's; a float, for ordering only; a set's is its figures' mean), then
  side counts compared term by term, then first use in `LEVELS`. A figure is
  named as a regular polygon or a rectangle by its shape, else for the
  rep-tile of its shape (rep-tiles are named for their shape), else by the
  level it alone tiles (V3.6.3.6), else as a rhombus, kite or dart, else by
  its sides.
- `src/view/home.ts`, `src/view/catalog.ts`, `src/view/figures.ts`,
  `src/view/picker.ts`, `src/view/settings.ts` — the first screen, Tilings
  (the catalog), Figures, a tiling's or figure set's page (a board, then its
  tiles, then Play: its pictures drawn one a frame after the page is up, each
  building its level), and the settings; `src/view/icons.ts` the pictures
  they share (board outline, tray tile, a tray's tiles in a grid, the three
  bars, a star row) and the header's glyphs. The catalog shows only what a player starts with: the
  board's outline, the tray's tiles, the vertex configuration as the name
  (`notation`: 4⁴, 3.4.6.4), and the best stars — never a picture of the
  tiling, which would give the puzzle away. The descriptive label is only a
  tooltip.
- `src/input/drag.ts` — pointer drag and drop, rotate and flip, the ✕
  remove mode, and pinch, pan and wheel zoom.

The geometry is the `@tiling/geometry` workspace package (`packages/geometry`)
and the shared data the `@tiling/data` one (`data/`) — both listed in
`package.json`, so no alias sets them up.

## Rules

- **Identity is exact.** Never key, compare or merge points by rounded floats
  (the repo rule in the root `AGENTS.md`). Floats are for drawing, for bounding
  boxes, for ordering points already known to be on one segment, and for the
  sign of a value already known to be non-zero.
- **No float breaks a tie.** Safari's `Math.sin` and `Math.cos` (the system
  libm) and Chrome's (V8's own) can differ in the last bit, so wherever a
  float picks one of several — the shortest of six equally long translations
  (`latticeOf`), the nearest of two equally near centres (`lavesWindow`) —
  "as short" or "as near" is within a float's error, and a tie goes to the
  least exact key (`ring.key`), the same in every browser. A float tie broke
  this before: a painting written down in one lattice basis was another
  colouring in Safari's, so the level threw and V4.6.12's page never opened
  on an iPhone. `tests/unit/engines.test.ts` builds every level with sin and
  cos one ulp off, up, down and by turns, and fails on any level that comes
  out differently; `tests/e2e/every-level.spec.ts` opens every level and
  every tiling's page, in Chromium and, in CI, in WebKit as an iPhone
  (`PW_WEBKIT=1` locally, after `npx playwright install webkit`).
- **A level follows a Hypersweeper board** — but for the tiles of several
  pieces, which Hypersweeper cannot have (a minesweeper cell is one polygon):
  the rep-tiles of several pieces are defined in `src/geometry/pieces.ts` and
  checked by covering their grown tile exactly, and the Socolar–Taylor tile in
  `src/geometry/socolarTaylor.ts`, checked by its patch having no overlap and
  no gap — and for the hat's family, cut in `src/geometry/hat.ts` from
  the shared patch (`hatMetatiles`) with windows of its own, and checked the
  same way. Build its cells exactly — for a
  periodic tiling, `uniformLevel` with the template key and a box size found by
  scanning (square, one outline, a couple of dozen tiles) — and the tests check
  it tile for tile against the Hypersweeper board (`archimedeanBoard` for a
  window, else the builder in `BUILDERS` in `tests/unit/puzzle.test.ts`), and
  check every inner point carries the level's vertex configuration. The
  spiral and aperiodic builders publish their exact coordinates
  (`ExactTiles`); planned: the rest do too, so any level can be read off its
  builder.
- **Colours come from `var(--…)`** in `src/styles.css`, with the
  `prefers-color-scheme: dark` block kept in step. A tile is coloured by its
  side count (`.sides-3`, `.sides-4`, …), on Hypersweeper's shape hues (7,
  Klaassen's heptagon, between 6 and 8 as its hue ramp puts it; 13, Tile(1,1),
  the Spectre, the hat and the turtle, violet at its end — real corners, `sideCount`), a tile
  of several pieces in slate, off the ramp (`.pieces`), and a second kind
  coloured as another in rose (`.twin`), and a coloured board's tile in its
  colour's paint (`.paint-<c>`, `--paint-<c>`: terracotta, blue, gold, green)
  — read a kind's classes from `level.colours`, never from its side count.
- Import the geometry as `@tiling/geometry` (its index) and nothing from
  `apps/hypersweeper/` (renderer, UI, game rules) — that is Hypersweeper's own.
  A name the geometry has but does not export gets a line in
  `packages/geometry/src/index.ts`. `packages/geometry/tests/boundaries.test.ts`
  fails on a deep import or one game importing another.
- Verify visual changes with a real screenshot (the `reptiles` entry in
  `.claude/launch.json` starts the dev server).
