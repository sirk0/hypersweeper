# Rep-tiles (`apps/reptiles/`)

The second game in this repo. The player gets a bounded flat region and a tray
of tiles and must cover the region exactly, dragging tiles in. **Any exact
cover wins** — the board a level was cut from is one way to finish it, not the
only one (six triangles where a hexagon was are fine) — so a player can also
lay tiles into a corner the board cannot be finished from, and has to take
some back off.

- A dropped tile sticks to a corner of what is still uncovered — never
  part-way along a straight edge. On a jigsaw (below) an open edge cut as a
  knob, a socket or an S seam holds a tile too, wherever along the edge it
  is: a tile laid along it whole, its own edge there the same mark (`sawOn`
  in `frontier.ts`; a straight seam holds nothing, looking as any straight
  edge does). The hint, the solver and the difficulty measure still work
  corner by corner. While it would stick, a ✓ shows where it
  will land and a dot marks each of its corners that meets the edge (the rim
  or a placed tile), wherever along it. Only a tile's real corners stick or
  get a dot — never a point part-way along one of its sides, where a marked
  tile's edge is cut (`sidesOf` in `frontier.ts`).
- Every tray tile starts resting on a flat side — but a star, which has no
  side the rest of it lies above, rests on its points (`restOnPoints` in
  `shape.ts`): on two of them level where a turn of the ring lays them so,
  else straight down on one, mirrored about the upright through it, else on
  two as nearly level as the ring's turns allow. A tile lands only as it is
  held, and there is **one** rotate step, with a control for each direction at
  the end of the tray (R clockwise; Shift+R or E anticlockwise): it turns
  *every* tray tile, and the one in hand, by the level's step — the largest
  that reaches, from flat, every way any kind sits: 60° for triangles, 30° for
  the pointy-top hexagons, 30° on 3.4.6.4, where the squares need it too, so
  its triangles and hexagons pass through turns they fit nowhere at. Turning
  one kind into place can turn another out of it. Each control is a round
  arrow, open at the top, turning its way, with the step in its middle — the
  number centred, its ° to the right (`turnGlyph`) — clockwise first (on top
  in landscape, on the left in portrait), and both are left out where nothing
  ever needs turning. No control has a label under it: the step is inside
  the arrows, and a tooltip names each one and its key.
- Where a board uses a tile both ways round (the kisrhombille's triangles,
  five of the 2-isohedral levels' tiles, the hat and the turtle),
  a flip control (or F) mirrors every tray tile and the one in hand across
  the upright line through its middle, as its icon draws it, however the
  tiles are turned — so a flip changes the turn too (`Puzzle.flipTurn`: held
  at ζ^rot, the other side is at ζ^(n/2 − rot); the hint and the
  difficulty measure count from there, and so the colouring choice ranked by
  it). Where the tray never holds a half turn (a 120°
  step) the line is the one nearest upright it can, 30° off; with no rotate
  step at all, the turn stays. A tile lands only on its own side.
- Taking tiles off: drag a placed tile back over the tray (it turns red on
  the way), or turn on ✕ remove, the control after rotate (or X), and tap
  tiles — Escape, the control again, or picking up a tray tile ends that mode.
  A lifted tile dropped anywhere else it cannot land goes back where it was.
- **Matching rules, colourings and jigsaws** — listed with the tiling they
  mark, not as families of their own (`markedOf` in `levels.ts`; their
  `group` is `rules`, `colourings` or `jigsaw`, not one of `GROUPS`), and laid
  on **every board** of it that they make the same tray on (Boards, below): a
  level is a board by a marking — plain, a matching rule, a colouring or a
  jigsaw — so a tiling's page
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
    round the corner two lined edges share; where a tile has three or more
    lined edges, one line runs between two of them and each other one
    branches off it, ending inside that line's stroke, so lines meeting in a
    tile leave no gap. A line never ends in a tile:
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
    three as one line and a branch off it, as a lined tile's — so two tiles meeting as they should run one line on
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
    has a lined board and a coloured one (type 13 two lined), from 1.4 to
    2.7 measured; the lines between a side's two pieces close into a loop
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
    boards and two or three coloured, 29 in all, from 0.51 (the offset
    square's lines) to 2.72 (the three-scale triangular in three colours)
    measured.
  - *Jigsaws* (`?level=squares.2apart.jigsaw`, `?level=hexagons.3apart.jigsaw`,
    `?level=ammannbeenker.3apart.jigsaw`): a colouring again, in one colour
    — each tile coloured by its shape, as on the plain board — with every
    colour mark drawn as the edge's own outline instead (`jigsawOf` in
    `levels.ts`, `knobMark`/`seamMark` in `marks.ts`). Each pair of colours
    that meet is a knob shape of its own (a round head, a square one, an
    arrowhead, two small heads, a dovetail, a wide flat head: six, for four
    colours), standing out of the lower colour's tile and a socket in the
    other's; an edge between two tiles of one colour is a seam — straight for
    the first such colour, an S and a Z for the next two. Every knob is
    symmetric about its edge's middle, so a mirror keeps it, and one tile's
    knob is the very line of its neighbour's socket (`src/view/curve.ts`).
    So it is the same rule, mark for mark, as the colouring — the same tray,
    piles and turns — but for the **rim**, which is cut as the tiles along it
    are (`Level.regionMarks`) where a coloured board's takes any: the rim
    shows where the tiles along it go, and every jigsaw measures easier than
    its colouring (406 of 406 boards; medians 2.05 and 1.62). A colouring
    has no jigsaw where it cannot be drawn so: two colours that meet their
    own on a level that flips (a mirror turns an S into a Z, but leaves a
    colour as it is; 46 of them), or knobs that crowd an edge's at every
    size (one, Klaassen's). A level's knobs are drawn at the largest of four
    sizes (`KNOB_SIZES`) that keeps every tray tile's outline clear of
    itself (`knobsClear`: no two edges' strokes within a fiftieth of an
    edge), chosen as `npm run levels` writes the index and kept there
    (`decor.size`), so no float decides it as the game builds a level; 130
    of the 138 are full size, the kisrhombille's at 0.64. Each is on every
    board its colouring is (`boardNumbers`), keyed `<colouring>.jigsaw` and
    listed after the colourings on a tiling's page. A tile sticks to a knob
    or a socket part-way along the frontier, not only in a corner (above).
  - *Vertex rules* (`?level=rhombitrihex.vertex`, "3.4.6.4 · every point"):
    the plain tiles, but every point must keep the tiling's own vertex
    configuration (`Level.rule`, `vertexRuleLevel` in `levels.ts`): a tile
    lands only where every point it touches, its corner added, can still
    become 3.4.6.4 read either way round, and only edge to edge
    (`RuleState` in `src/geometry/vertexRule.ts`). So six triangles never
    stand where a hexagon was, nor squares and triangles of 3³.4² meet as
    3².4.3.4. One on each uniform tiling where the rule changes what fits as
    the board is laid (`VERTEX_RULED`, held to that by a test): seven — not
    4.8², whose squares and octagons make nothing else. It is easier than its
    plain board on 3³.4², 3.4.6.4, 4.6.12, 3.12² and 3².4.3.4 (wrong fits
    turned away) and harder on 3.6.3.6 and 3⁴.6, where a fine fit becomes
    a dead end. Its tray is the plain one, so it is on every board of its
    tiling, `markedBoards.json` not asked (`boardNumbers`); listed last on
    a tiling's page, its card the configuration drawn round one point
    (`vertexFigure` in `src/view/icons.ts`), which stands beside the level's
    name in play too. While a held tile would fit but for the rule, a red
    ring marks the point it would break it at instead of the ✓, and flashes
    there if it is let go (`Puzzle.ruleBreak`). The hint and the difficulty
    measure ask the rule as play does: each frontier their searches try
    carries its `RuleState`, and the hint remembers a dead frontier with
    the corners round its points.
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
  with no more tiles than that, two; and that with no hint shown, three. No
  clock shows while playing: the time from the first tile down to the last
  is told only on the win card, with how many hints were shown (a press
  again while a hint is on show is not another) — there is no time limit.
  The fastest finish of each level, any number of stars, is kept
  (`recordTime`, `rep-tiles.times`): the win card says "— a new best!" when
  one beats it, else "· best m:ss" (a first finish is only its time), and a
  tiling's page shows it on Play ("best 0:42").
- **Undo and redo** (the hooked arrows at the head of the header's right
  cluster; Z, and Shift+Z or Y, with or without Ctrl/⌘) step back and forth
  through moves: a tile laid, moved or taken off. The drag control marks the
  end of each (`Puzzle.commit`, called by `done` in `drag.ts`); a tile lifted
  and put back where it was is no move, and a new move clears what was
  undone. An undo cancels a tile in hand first (`DragControl.cancel`). A
  hint shown stays shown — undo is not a way back to the third star — and a
  finished board undone and redone keeps its first finish's time.
- **A board left half-covered is kept** (`src/saved.ts`, `rep-tiles.boards`):
  its tiles, the time spent on it so far and the hints shown, saved at every
  move, as a hint is shown, and as the level is left — for another screen,
  another level, or the page hidden (`pagehide`, `visibilitychange`: an
  iPhone may close the app in the background). Opening the level again lays
  it back (`Puzzle.resume`, nothing to undo), the time running on from where
  it was left; on its tiling's page Play reads **Resume**. Each tile is kept
  exactly — its kind, turn, side and its pieces' vertices, integers — and
  checked as it is laid back (a translate of its kind held that way
  (`curveOnto`), allowed and fitting), with a fingerprint of the level's own
  cells, so a board kept for a level since changed, or unreadable, opens
  empty. Restart and Play again forget it, as does finishing; at most 30 are
  kept (`MAX_SAVED`), the one left longest ago dropped first.
- **The hint** (the bulb in the header, or H) looks at the board as it
  stands and says what to do next, worked out exactly (`src/hint.ts`). First
  it checks the tiles down: can the board still be finished round them — any
  exact cover, not only the board's own? If so, a tile to lay: drawn dashed
  where it lands, its tray tile ringed, and the control it needs first (flip,
  or a turn the shorter way) ringed too. If not, a tile to take off, ringed in
  the remove colour: one whose going alone lets the board be finished, where
  there is one, else a tile the board was not cut with (taking all of those
  off always leaves a board that finishes). A hint shown costs the third
  star. It is worked out in a worker (`src/hint.worker.ts`, driven by
  `src/hintClient.ts`) after every move, so a press often finds it ready;
  else the bulb glows and "thinking…" shows until it is — exact however long
  that takes (most boards in milliseconds; a stray tile on the hardest
  2-isohedral and coloured boards, tens of seconds).
  The best per level is kept in `localStorage` and shown in Tilings — on a
  tiling's card, as stars earned of stars to earn over all its levels; on a
  tiling's page, per board and marking.
- **Zoom.** Two fingers pinch the board in, up to four times fitted, about
  their midpoint (a second finger landing mid-drag puts that tile back first;
  one on a control still turns or flips it); one finger on bare board pans it
  once zoomed; a wheel or a trackpad pinch zooms about the pointer. Safari's
  own page pinch is cancelled.
- **The tray** is a card along the bottom (portrait) or the right
  (landscape), inset from the screen's edges (`--tray-card-gap`: 10px on a
  phone, 14px on a desktop), shadowed, and only as long as its tiles and
  controls need (the whole strip while the shelf scrolls): a shelf of tiles at the board's own scale (a tray tile is the
  size it lands at, zoomed in or not, up to the strip taking 45% of the
  screen), then the controls in a row of their own at a fixed size — columns
  in landscape. Every slot is one size — as wide and as tall as the biggest
  tile any way the level holds it (every rotate step, either side where it
  flips) — so turning never moves a tile and the plates line up, drawn a
  shade darker than the card (`--tray-plate`): what a press picks it up by,
  filled when the hint names it. Each pile's count sits in its slot's lower
  right corner, the same place on every slot. The padding round a tile, the gap between plates
  and the card's padding are each a share of a tile edge or of the tiles'
  size, whichever is more (`spacingOf`), so tiles of many short edges (the
  hat's metatiles) are not crammed together. **Every tile is on screen
  at first**: the fit shrinks the board, and its tiles with it, until the
  shelf fits along the strip, and lays the shelf in one, two or three rows
  (columns in landscape) — whichever lets the board be biggest, fewer rows
  unless more are 2% better (`shelfIn`, `fit` in `svgBoard.ts`). Zoomed in,
  a shelf longer than the strip scrolls, with a scroll bar between the
  shelf and the controls: drag its thumb or press its track, drag the
  strip's bare background, or wheel over it. In landscape the level's name
  is centred over the board's room, clear of the strip (`--tray-side`). The
  four-kind levels, [3.4.6.4; 4.6.12] and the hat's metatiles, and
  Ammann–Beenker's five coloured tiles, are the ones to check a tray change
  on — on a small phone (375 × 667), a large one, and in landscape.

**Screens**, in Hypersweeper's Sand look (its `sand`/`sandDark` palettes,
grain, Space Grotesk, and Caprasimo for the title — the two fonts bundled in
`public/fonts`). Home (no query): the title on top; Easy, Medium and Hard,
the main buttons, in the middle, each dealing a random level of that
difficulty; Tilings at the foot — all four full-width rows, one under
another; the difficulties in the accent fill, Tilings in the light one.
Tilings opens the catalog (`?tilings`; old
`?catalog` links still work, and so do the old Figures screen's `?figures`
and `?figure=<key>`): each family a row of tiling cards scrolling
sideways — one picture of the first board's outline with the tray's tiles
inside it, never crossing it (`src/view/cardArt.ts`, held to it by
`tests/unit/cardArt.test.ts`). A rep-tile's tile is the outline made small
(turned at any angle — the right isosceles triangle and the right-angled
fish 45° off any turn of their ring — or mirrored where it flips:
`boardFit` in `src/view/icons.ts`, held to it by
`tests/unit/cardPose.test.ts`), shrunk by half toward the point its two
parts touch at on a kissing one (the fish, the kissing squares and
triangles: the tile's touching point is the outline's), else toward the
middle of the outline's kernel, clear of it all round. Any other tiling's
tiles sit side by side at their true sizes, three to a row (four as two and
two), each row on one bottom line, as big as 55% of the outline and near
its middle as fits clear of the rim — smaller, or off the middle, where it
must (the kissing square chain, whose three touching points no one
shrink keeps, too). Then the name, difficulty as Hypersweeper's
three bars, how many boards and tile sets it has (a tile set is a card of its
page's Tiles row: plain, a matching rule, a colouring or a jigsaw), and the
stars earned of its levels; a tiling of one level (the P-pentomino) opens it, any
other its **page** (`?tiling=<key>`, `src/view/picker.ts`): its boards on
top, as their outlines in a grid, one dealt at random; under them its
markings in one row scrolling sideways — Plain first and picked, then its
matching rules, then its colourings, then its jigsaws — each card the tray's tiles drawn big
in a grid that fits them all (`trayIcon`), three cards to a row, no wider
than leaves a row of them on screen under the boards on a short desktop
window, never the board's outline, which is up top, with the level's difficulty and stars on the picked board; then
Play, pinned to the foot of the screen, naming the level. A board the picked
marking is not laid on is dimmed, as is a marking not laid on the picked
board; picking one picks what goes with it (a board it is laid on, or the
plain tiles). The page keeps its pick in its URL (`&pick=<level>`), so Back
from a level comes back to it. The gear in home's top-left
corner (Hypersweeper's icon) opens Settings (`?settings`), which has the
player's choices — the **colour scheme**, Auto (the device's
`prefers-color-scheme`, the default), Light or Dark, as a three-way pill
(`src/scheme.ts`, below), the **sound** theme — Chime, Arcade, Blocks (the
default) or Off — and its volume (below), **Haptics** where the device can buzz (an
iPhone in the app, an Android browser; on by default), and the tiling past a finished board, a switch, off by
default (below) — then shows the version, checks for updates (the shared check in `@tiling/platform`) and
links the **privacy policy** (`public/privacy.html`, served as `/privacy`, in
a new tab); the update row and the policy link are left out of a packaged
build. Under Tilings on home, a quiet **More games ↗** links to the shared
site, <https://tiling-games.pages.dev/> (on a desktop, a row at the head of
the sidebar's foot, above How to play); it opens in a new tab, and like the
update row it is left out of a packaged build — its address is the shared Vite
preset's `__GAMES_SITE_URL__`, read from `site/site.json` and null there. The **?** in home's top-right corner (Hypersweeper's, too) opens **How
to play** (`?help`, `src/view/help.ts`): the puzzle, laying, turning,
flipping and taking off tiles with their keys, marks, the stars and the hint,
zoom — drawn as the settings are; every line of it is a statement about the
code, so it changes with the behaviour it describes. On a desktop both are in
the sidebar's foot. `smoke.spec.ts` pins all three, and More games. Levels are picked in
Tilings. A level is `?level=<key>`: one header row, Hypersweeper's —
home and back, then (no clock: the time taken is on the win card) undo, redo, the hint, restart,
and a die that deals another board of the same difficulty as this one — then
the level's name, which board it is (`board 2/6`) and the coverage as a faint
label on the page behind the board, which fills the rest
of the screen, the tray on a strip along the bottom (portrait) or the right
(landscape). The win card has Play again and Next level (another level of
the same difficulty, dealt at random as the die deals), and an ✕ in its
corner that closes it to look at the finished board (as do Escape and a tap
outside it). Each move between screens
is a history entry, so the browser's Back works (a tile's move is not: undo
is the header's).

**The first-run tutorial** (`?tutorial`, `src/tutorial.ts`) — four tiny
boards, one lesson each: *Drag* (a 2×2 of squares, nothing to turn), *Turn*
(five triangles in a row, three up as held and two down, a 60° turn), *Flip*
(an S and a Z tetromino making an arch: the mirror image, no turn) and *Take
off* (dominoes on an L, opened with one laid across its corner, leaving two
squares no domino fits). Each is a level made from its exact cells as any
other is (`tutorialLevel` in `levels.ts`), but never listed, dealt, measured,
starred, timed, kept or hinted: a coach card between the header and the board
(`#coach`, which takes its room from the board) says what to do, with Skip
tutorial, and once the board is covered says so with Next — after the last,
Play a level (an easy one, dealt as Easy deals) and Home. The hint and the die
are hidden there; Restart puts a step back as it opened; the steps follow one
another in place (`?tutorial=<step>`). It opens by itself in place of home for
a newcomer — never opened before, no stars, no board kept (`firstRun`) — and is
marked seen the moment it opens (`rep-tiles.tutorial`), so leaving it
part-way is leaving it for good; How to play's **Play the tutorial** opens it
again. `tests/unit/tutorial.test.ts` holds each board to its lesson (Drag fits
every square as held; Turn three of five; Flip one of two, the other only
flipped; Take off cannot be finished until its domino is off), and
`smoke.spec.ts` plays it through. Every other e2e test starts with it seen
(`storageState` in `playwright.config.ts`), so `/` is home; the store
screenshots set it seen too.

**Sound** — Hypersweeper's synthesiser, shared as `@tiling/sound`
(`packages/sound`), in its three themes — Chime, Arcade and **Blocks**, the
default here (`DEFAULT_THEME` in `src/sound.ts`) — or Off, picked in
Settings › Sound (`src/preferences.ts`): a row each with Hypersweeper's
swatch (`swatchLevels`) and a line of Rep-tiles' own (`THEME_HINTS`: the
presets' own hints name Hypersweeper's mine blast), the one in force ticked,
and picking one plays a sample; under them, but for Off, a volume slider,
heard while dragged and kept when let go. A click as a tile lands, pitched by
its shape (Hypersweeper's cell-opening click, `strikeVoice`); a short centred
beep as the tray turns, gliding up one way round and down the other
(`glideVoice`; flip is silent); and the win flourish as the board is
finished (`flourishVoices`) — again only after a tile is taken off and it is
finished anew. Putting a lifted tile back is silent. **Stereo:** a click is
panned to where the tile's middle landed across the screen
(`SvgBoard.panAt`, -1 at the left edge to +1 at the right — the whole
screen, as the speakers are, so on a desktop, the tray on the right, the
board leans left), and the flourish leans toward the last tile laid
(`DragControl.lastPan`). Nothing sounds before the player's first touch
(`unlockAudio`). `src/sound.ts` is the seam (`voicesFor`, pure, pinned by
`tests/unit/sound.test.ts`), called from `src/input/drag.ts`, `changed` in
`src/main.ts` and the settings; `smoke.spec.ts` counts the oscillators the
page builds (sound on, a theme picked, Off) and reads each panner's position
(a tile in the board's left corner heard left, its right corner right, at a
phone's size).

**The tiling past a finished board** — a setting, off by default (Settings ›
Board, `src/preferences.ts`). With it on, once the region is covered, the
tiling the level was cut from is carried on round it as faint outlines (`path.beyond`,
`--muted`, a 1px non-scaling hairline under the region — nothing filled,
nothing to tap) out to the edges of the screen, fading in, and the board may
then be zoomed out past the fit to see more of it: to `WON_MIN_ZOOM` (a
third), held up where its tiles would be under `MIN_TILE_PX` across or the view
would outrun how far the tiling is known; the tray keeps its fitted size.
Taking a tile off takes them away and fits the board again. Where the tiling
comes from is `src/extension.ts`, below. Three levels' boards have none
(pentagon13 and pentagon15, whose windows sit in no wider window, and the
right-angled fish, which grows once only and shows no period), and the round
Spectre's outlines are its corners joined straight. `smoke.spec.ts` ("the win
card's Exit…" with it off, "with its setting on…") pins it.

**The desktop** — from 900px wide and 501px tall, or a tablet held upright
(720 × 800): Hypersweeper's own query (`WIDE_QUERY` in
`src/view/groups.ts`, the matching `@media` block at the foot of
`styles.css`; the two must match) — lays the same screens out as
Hypersweeper's two-pane menu does: a **sidebar** (the title, Quick start,
the tilings in five groups with how many each, Settings at its foot) beside
every screen but a level's, and the page in the pane under a Caprasimo
title. Home is **Quick start**: Easy, Medium and Hard as three cards side by
side, each the picture of a tiling of that difficulty (`SHOWCASE` in
`home.ts`: its outline and tiles, as its Tilings card draws it — never the
board tiled), its counts and its hint; below 1100px, one under another. The
catalog's twelve families are put together in **five groups**
(`MENU_GROUPS`): Regular polygons (regular, uniform, 2-uniform, star polygons), Irregular
tiles (Laves, 2-isohedral, pentagonal), Offset corners (isogonal, bonds),
Self-similar (rep-tiles, spirals) and Aperiodic — each family in exactly one
(`tests/unit/groups.test.ts`). A group's page (`?group=<key>`; `?tilings`
opens the first) is its families' sections, their cards in grids that wrap,
with a jump to each under the title (none for a group of one family, nor its
heading). A tiling's page is two columns from 1100px (`TWO_COLUMNS`): the
level the pick makes on the left, held in view — its outline with its tiles
inside it, its name, difficulty and stars, then Play — and the boards and
tiles to pick from on the right; narrower, it is the phone's column inside
the pane. A level has its name in the header, between the two clusters of
buttons, and its tray card is inset a little further — `svgBoard.ts` reads
both from the stylesheet (`--label-room`, `--tray-card-gap`). Every screen
renders at either width, and crossing it re-renders the one on show; a
level in play only moves its name and refits, keeping its tiles. A phone
never sees any of it. `tests/e2e/desktop.spec.ts` pins it, and
`smoke.spec.ts` holds the phone's screens at a phone's size.

**Boards.** A tiling cut in more than one place has more than one board, each
a level of its own (`?level=<key>-<n>`, its own stars and difficulty band;
the first is `<key>`, the board it shipped with) — and each of its markings
on each board too (`?level=<marking>-<n>`: `trihex.lines-2` is `trihex-2`
lined; the next-board control steps through the boards a marking is laid
on). Tilings lists a tiling once — its first board's outline, how
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

**A marking on every board.** A vertex rule is on every board of its
tiling, as plain is. Any other marked level is listed (and searched for:
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
colouring's tiles in more ways or fewer: 107 of a thousand do): 888 boards
past the first, 1625 levels in all — and the jigsaws, on the boards their
colourings are, 406 more, and the vertex rules, on every board, 33 more:
2064. Run it after `npm run boards`,
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
(`measureTraps`). The score is the turning, plus 1.35 (`TRAPS`) times the
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
triangles, hexagons, the uniform and 2-uniform tilings (and the star
tilings beside them, which Hypersweeper has not), then spirals and
aperiodic ones, and the uniform tilings again with every point held to their
vertex configuration (`Level.rule`, the `.vertex` levels above).

**Status: 104 tilings in eleven sections, then 165 matching rules (lines on the eleven uniform tilings, nineteen of the twenty 2-uniform ones, the eight Laves tilings, the twenty 2-isohedral ones, four of the five bonds, the three pentagonal tilings and the six isogonal ones, Penrose's arrows on his rhombi and his kites and darts, and a rule read off its patch on each of the seven other aperiodic levels, four of the five spirals and sixteen of the seventeen rep-tiles) and 184 colourings of the uniform, 2-uniform, Laves and 2-isohedral tilings, four of the bonds, the three pentagonal tilings and the six isogonal ones, Ammann–Beenker, Klaassen's spiral and six rep-tiles in three more, then 138 of those colourings again as jigsaws, and a vertex rule on seven of the eight uniform tilings, every marking on every board of its tiling that it makes the same tray on, 2064 levels in all (see Boards above), deployed at <https://tiling-games.pages.dev/rep-tiles/>** — named as
Hypersweeper names its families (`menu.familyLabels` in `data/catalog.json`):
*Regular* (4⁴, 3⁶, 6³), *Uniform* (the other eight uniform tilings, 3.6.3.6 to
4.6.12), *2-uniform* (all twenty, named as Hypersweeper's catalog writes them,
[3⁶; 3⁴.6]₁), *Star polygons* (a family of its own: Hypersweeper has none —
Grünbaum and Shephard's twenty-two "uniform" tilings with star polygons,
regular polygons and isotoxal stars every vertex alike, named by their
configuration as Wikipedia writes it with the angles in degrees: 3.6*60°.6**60°
is a triangle, a six-pointed star's 60° point and another's dent round every
vertex; the four whose stars' angle may be anything in a range each at three
angles — 3.6*α.6**α at 30°, 60° and 90°, 4.4*α.4**α at 30°, 45° and 60°,
6.3*α.3**α at 20°, 30° and 45°, 3.3*α.3.3**α at 20°, 30° and 40° — then the
eighteen of one angle, 4.6.4*30°.6 to 9.3.9.3*20°, in Wikipedia's order; 21 to
37 tiles a window, plain tiles only for now), *Laves* (the eight Laves tilings, V4.8² to V4.6.12),
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
the desktop's in `tests/e2e/desktop.spec.ts`,
a tiling's page — a board, its tiles, Play — the card pictures, settings, the header, the hint (followed to a two-star finish), rotating both ways, wheel and pinch zoom, the tray at
board scale, every tile on screen at first, its rows and, zoomed in, its scroll bar, the family names, the Spectre's round
edges, the hat's family's flip and 60° turn, a tile of several pieces moving as one, a coloured board's bands and lines, Ammann–Beenker's rule read off its patch and its colouring, a won board and
its ✕) and every level — every marking on every board — and tiling page opening with no error
(`tests/e2e/every-level.spec.ts`, in Chromium and in WebKit as an iPhone). It packages as an offline desktop app through the
shared shell — `make desktop-run GAME=reptiles`, `make mac-app GAME=reptiles`
— from `packaging.json` (see `shells/desktop/README.md`); its data lives in
its own `Rep-tiles` folder there. It is an **iPhone and iPad app** too,
`apps/reptiles/ios/` — `make ios-app GAME=reptiles`, uploaded by
`app-store.yml` with `game: reptiles` — which buzzes as a tile lands and a
board is finished (Settings › **Haptics**, shown only where something can
buzz), keeps the stars and best times in iCloud and asks for a rating after the third finished
board: see [`ios/README.md`](ios/README.md), and `tests/e2e/native.spec.ts`,
which pins all three over Capacitor's real bridge.

## Deploy

On the shared site, <https://tiling-games.pages.dev/rep-tiles/> — a folder of
the one Cloudflare Pages project every game is moving to (`site/`, see "Deploy"
in `apps/hypersweeper/docs/deploy.md`):

- **Production:** `deploy-cloudflare.yml`'s `site` job runs
  `scripts/build-site.mjs`, which builds this folder with
  `VITE_BASE=/rep-tiles/` on every push to `master` and publishes it with the
  landing page. The privacy policy is
  <https://tiling-games.pages.dev/rep-tiles/privacy>.
- **The old address:** `rep-tiles.pages.dev` (packaging.json
  `web.movedFrom`) is republished by the `moved` job as 301s to the new one,
  `/privacy` included, plus a service worker that retires the old one, so an
  installed copy stops showing the old build.
- **Previews:** `pr-preview.yml` publishes each pull request to
  `https://pr-<number>.tiling-games.pages.dev/rep-tiles/`, beside the other
  games, with one sticky comment for all of them, and deletes it when the PR
  closes. `https://alpha.tiling-games.pages.dev/rep-tiles/` is the latest PR's.
- **What the build adds** — all from the shared preset (`vite.config.ts`, see
  `packages/vite-preset`):
  - the link-preview tags (a text card: there is no `public/og.png`);
  - the PWA: service worker, `manifest.webmanifest`, the icons in `public/`;
  - the version stamp;
  - `public/_headers` — Hypersweeper's security policy, applied at the edge
    and, through the preset, by `vite dev` / `vite preview`.
- **Versions:** Rep-tiles shares Hypersweeper's version
  (`"sharedVersion": true` in `packaging.json`): every push to `master`,
  `bump-version.yml` bumps Hypersweeper's patch version (`pyproject.toml`, the
  source of truth) and `scripts/bump_version.py` writes the same number into
  this `package.json` and its lockfile entry — never a patch of its own, so a
  hand-edited version comes back in step at the next bump.
  `tests/test_bump_version.py` fails if the two differ.
- **The privacy policy:** `public/privacy.html`, a flat page served as
  `/privacy` (Cloudflare Pages and `vite preview` both resolve it; the service
  worker precaches it and `vite.config.ts` keeps it off the app shell's
  navigation fallback). No script, nothing remote. Its head comment lists the
  code each claim rests on — the page changes with any of it, and with
  turning on Cloudflare Web Analytics for the project, which it says is off.
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
npm run difficulty   # re-measure every board into src/difficulty.json (half an hour on four cores, a process per core; ONLY=missing measures only boards it does not list yet)
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
  `properlyCross`) decide zero exactly and only read a float's sign. A float
  filter goes first: a cross or dot product read in floats far from zero
  (past a million times its rounding, measured by its coefficients' sizes)
  is that sign, and one near zero is proved zero by its norm — a nonzero
  algebraic integer's images under the field's embeddings multiply to at
  least 1, so if even their bounded product is less it is zero — before the
  exact product in the ring is ever built (`provedZero`). Neither ever
  decides a case a tie is near, so every answer is the exact one.
- `src/geometry/shape.ts` — `Shape`: a tile, its `pieces` — one `Piece`,
  any simple polygon (CCW, y up, concave allowed), or several moved as one
  (the fish, the kissing squares: `polygon` makes the one-piece kind; nothing
  asks the pieces to touch, so a tile whose pieces lie apart, the
  Socolar–Taylor tile, fits too) — `Pose` (rotate by ζᵏ, optional mirror, translate), `regular`,
  `walk` (a region outline as unit steps), `starLike` (a star: one piece whose
  corners turn in and out by turns), and the float measures used for
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
  `parts` splits the open ground into its separate pieces (joined only
  through shared points), for the hint's search.
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
- `src/geometry/stars.ts` — **the star tilings**: Grünbaum and Shephard's
  twenty-two "uniform" tilings with star polygons (*Tilings and Patterns*
  §2.5, as Wikipedia's *Uniform tiling* lists them), which Hypersweeper has
  no board for. A star {n_α} is an isotoxal 2n-gon of unit sides, its n
  points of angle α and its n dents of 2π − 2π/n − α; a point where only two
  tiles meet (a dent against a corner) is no vertex. `STAR_TILINGS` writes
  each down as one period — two lattice steps and the tiles of one cell, each
  its kind, the corner it starts from, that corner and its first side's
  direction — in ℤ[ζ6], ζ8, ζ12, ζ18, ζ20 or ζ24, every side a unit ζᵏ, so
  `kindCell` walks the tiles out exactly. The data was found by growing each
  tiling from its configuration and reading its period off; the tests
  (`tests/unit/stars.test.ts`) are its oracle. The four of an adjustable
  angle are each three tilings, at three angles (a different star is a
  different tray). `starWindow` cuts a `box`-edge square round the period's
  tile of most corners, as `templateWindow` does — its tiles that fit whole,
  their largest piece joined edge to edge — moved off it for a board past
  the first (`starCut` in `levels.ts`, by 1/GRID steps of the lattice cell).
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
  arrow of any class, or with no way (`null`, its own partner); and a
  jigsaw's edges, `knobMark(shape, out, size)` — a knob or its socket, each
  the other's partner — and `seamMark(seam, size)`, flat, S or Z, each its
  own (a mirror turns an S into a Z). A jigsaw mark carries its level's knob
  size only so a tile is drawn from its marks alone: every mark of a level is
  one size. A
  `Piece` carries
  them as `marks`, edge for edge as it carries `curve`; `posed`, `moved`,
  `curveOnto` and `restFlat` keep them, `turnsOnto` (given the cell's marks)
  and `selfTurns` count them — a square striped across is the same only after
  a half turn — and `spotKey` names them, so one spot turned two ways is two
  placements. The frontier treats a marked edge as a round one: each open edge
  holds the mark the tile across must bring (`partner`), a tile lies along it
  only with that mark, whole, and covering a tile leaves its marks' partners.
  The rim takes any mark, but a jigsaw's (`Level.regionMarks`, passed to
  `Frontier.ofRegion`), which asks for the mark of the tile along it.
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
  one; a mirror is each tile reflected, marks and all, so a tile with no turn
  of its own, V[3⁶; 3³.4²]₁'s house pentagon, is not read as its mirror image
  — and, on a level that flips, each tile one with its mirror image, since a
  player can flip, lay it and flip back). A tiling's next candidate takes a
  dropped one's place, where it has one. `COLOURED` lists the regular boards painted and each one's lattice
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
  how the board search tells a new board from one it has; and `sameFigure`,
  whether two tiles are one shape (turned, moved or mirrored, at their true
  size or, `size` false, any), across rings — exact: both lifted into
  ℤ[ζ lcm], each scaled by the other's drawing `unit`, compared by products
  of edge vectors; a round tile matches only one whose curves land on its
  own, a tile of several pieces only piece for piece.
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
  `starLevel` makes a star tiling's from `STARS` (its key in `STAR_TILINGS`
  and its window's box), in the Star polygons section after the 2-uniform
  ones, marked `star`, named as Wikipedia writes its configuration — its
  `configs` none, a configuration here naming a star's points and dents
  apart.
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
  kind's rotate step from flat (`turns`) and pile (`need`), each kind's colour classes (`colours`: by side count, plus
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
- `src/hint.ts` — **the hint**, exact (`HintSolver`). The search works one
  *convex* corner of the open ground at a time — whatever covers the ground
  just inside one has a corner there and a side along its edge, so the
  frontier's `placements` there, every kind every way the tray can hold it
  (multiples of `turn`, flipped where the level flips), are every way to go
  on, and a convex corner nothing fits proves the board cannot be finished.
  It takes the corner with the fewest ways, the board's own tile first;
  finishes apart parts of the open ground apart (`Frontier.parts`); keeps
  each corner's ways from step to step while its two edges are unchanged
  (re-fitting only those near the tile just laid); and remembers frontiers
  found dead, by their edges with straight runs read whole, for as long as
  the level stays (up to 20M characters of names). A cover is looked for
  round the trouble first: the board's own cells laid wherever they fit, the
  hole they leave searched, then widened a tile's width at a time until it
  is the whole board. It is a generator, yielding between steps:
  `runSliced` runs it a slice at a time and drops it once the board has
  moved on; the tests run it through (`runToEnd`). A level with a vertex
  rule (`Level.rule`; none ships) is searched without it.
- `src/hint.worker.ts`, `src/hintClient.ts` — the hint's thread: the page
  posts the board after every move, the worker builds the level from its
  key and keeps its solver while the level stays; where a worker cannot
  start, the same search runs on the page in slices.
- `src/extension.ts`, `src/extension.worker.ts` — a finished level's tiling
  carried on past its edge, when the setting is on. A periodic level is
  carried on from its own tiles by their measured lattice, or, its window too
  small to hold a whole period, off a window three times as wide
  (`periodicContext`, found round the level by `placeIn` wherever its board
  was cut). The rest are found in bigger patches their own builders grow — the
  whole patch an aperiodic or hat window was cut from and deeper ones, more
  spiral rings, more inflations — by a similarity, the copy with the most
  patch round it kept. A rep-tile is tried as periodic first (most are cut
  from a lattice). A marked level is its plain level's board (`decor.of`). It
  runs in a worker (the deeper patches take a second or two to build exactly
  on a phone), which builds the level from its key and sends the tiles back;
  `tests/unit/extension.test.ts` holds each kind of level to it.
- `src/geometry/extension.ts` — the geometry under it, in floats (render-only:
  nothing is placed or keyed by it, so the exact-identity rule does not reach
  it): `latticeOf` measures a patch's periods (a translation is one when every
  tile lands on a tile of the same shape or off the patch, never on a
  different tile), `periodicExtension` lays one tile of each translation class
  out again (and refuses a patch whose classes do not add up to one period's
  area), `placeIn` finds a board in a bigger patch by a similarity, walking
  each candidate tile's corners both ways, mirrored or not, and
  `grownExtension` keeps the first patch that reaches far enough.
  `tests/unit/tilingExtension.test.ts` tests it on Hypersweeper's boards.
- `src/preferences.ts` — the player's choices from Settings (the colour
  scheme, sound, haptics, the tiling past a finished board), in
  `localStorage` through the shared guard, defaults where it is unreadable.
- `src/sound.ts` — what each move sounds like (`RepSound`: a tile placed,
  a turn, a win, the settings' sample) as `@tiling/sound`'s figures,
  `playSound`, `applySound` (theme and volume), the default theme and each
  theme's line in Settings.
- `src/haptics.ts` — what a move feels like (`RepHaptic`: a tile placed, a
  win) as `@tiling/native`'s `HapticSpec`s, and the device flag the iOS shell
  sets (`window.reptilesDevice`); the mechanism, and whether anything can be
  felt, are the package's. Called beside the sounds, from `src/input/drag.ts`
  and `changed` in `src/main.ts`.
- `src/review.ts`, `src/cloudStars.ts` — the iPhone app's rating prompt, and
  the stars and best times kept in iCloud (each level's most stars and least
  time, merged both ways); both do nothing outside the app (`ios/README.md`).
- `src/scheme.ts` — the colour scheme: `applyScheme` sets `data-scheme` on
  `<html>` (none for Auto) and points the `theme-color` metas at the page
  colour. The dark colours are in `styles.css` twice, with the same
  declarations — under `prefers-color-scheme: dark` on
  `:root:not([data-scheme="light"])`, and on `:root[data-scheme="dark"]` — as
  plain CSS cannot join a media query and a selector; `tests/unit/scheme.test.ts`
  holds them equal, so a colour changes in both.
- `src/progress.ts` — the best stars per level, in `localStorage` (guarded;
  the game works without it; the old finished-levels list reads as one star
  each), and the fastest finish per level (`rep-tiles.times`, milliseconds).
- `src/saved.ts` — the boards in play, kept per level (`saveBoard`,
  `loadBoard`, `forgetBoard`, `hasBoard`, `keptCount`; `fingerprint`), held by
  `tests/unit/history.test.ts` with undo and redo.
- `src/tutorial.ts` — the first-run tutorial's four boards
  (`tutorialSteps`) and whether it has been seen (`tutorialSeen`,
  `markTutorialSeen`); the coach and the routing are `main.ts`'s
  (`openTutorial`, `drawCoach`, `firstRun`).
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
  still fits — what the dev seam's `fill()` does first. Undo and redo:
  `commit` marks the end of a move (the layout it leaves is `layout`),
  `undo`, `redo`, `canUndo`, `canRedo`; `resume` lays a kept board back.
- `src/view/curve.ts` — drawing a tile: a `Loop` per piece (`loopsOf`),
  drawn as one path with a sub-path each (`loopsPath`), bounded by
  `loopsReach`; and round edges: `outlinePath` (a polygon as an
  SVG path, each round edge a cubic arc, laid out in board space before any
  y flip), `edgePath` for an open edge, and `reachPoints` (corners and points
  along the arcs: what a round tile's bounds and tray circle are taken from).
  A jigsaw edge is drawn from its mark, the same way: its knob or socket
  (`KNOB_HALVES`, each knob's first half, the second its mirror image) or an
  S seam, laid along the edge and shrunk to the mark's size about its
  middle, its ends left on the corners; `jigsawPoints` samples it, for the
  bounds, the card pictures and `knobsClear`. Every tile, the region, the
  open edges (a frontier edge holds the mark the tile laid there must have,
  and runs the way that tile's edge does) and the icons are paths drawn
  through it.
- `src/view/decor.ts` — drawing a tile's marks over it, so that tiles that
  meet as they should make one shape across their edge: a colour as a half
  disc on the edge's middle; a lined board's lines from edge to edge, square
  on and ending on each (straight across, or a Truchet arc about the corner
  two lined edges share — or, two edges further apart on an octagon or a
  dodecagon, about the point their lines meet, `meet`; on an irregular tile,
  a Laves tile's kite, rhombus or pentagon, a cubic leaving each edge's
  middle along its inward normal; three or more lined edges as one line
  between two of them, drawn so, with a branch off it from each other one —
  straight on along its edge's normal where that meets the line at a fair
  angle, else curving round to meet it square on at a point clear of its
  ends — the pair whose line and branches are least ink, branches crossing
  counted against it (`branched`), so every branch ends inside a line's
  stroke and leaves no notch;
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
  tile, dragged tile and icon is decorated through it, and given its colour
  classes (`edge`) it draws the tile's border again last (`tile-edge`), so a
  line's end or a half disc never paints over a border — every border is
  whole, and two tiles' marks meet under it. Its parts are
  `pointer-events: none`.
- `src/view/svgBoard.ts` — the SVG drawing. The SVG is in screen pixels:
  the world (region, tiles, the tile in hand; board units, y up) under one
  camera transform — fitted at zoom 1, `zoomAt`/`panBy` — and on the tray's
  pinned strip the shelf (at the world's scale, its slots in one to three
  rows, `shelfIn`, all on screen at zoom 1, `fit`; clipped to its room and,
  zoomed in, scrolled, `scrollTray`), its scroll bar (`scrollBarBy`,
  `scrollBarTo`) and the controls' row (a fixed size).
- `src/view/home.ts`, `src/view/catalog.ts`, `src/view/cardArt.ts`,
  `src/view/picker.ts`, `src/view/settings.ts`, `src/view/help.ts` — the first screen, Tilings
  (the catalog) and its cards' pictures, a tiling's page (a board, then its
  tiles, then Play: its pictures drawn one a frame after the page is up, each
  building its level), the settings, and How to play; `src/view/groups.ts` the
  desktop's five groups of families and its two queries (the sidebar itself
  is built in `main.ts`); `src/view/icons.ts` the pictures
  they share (board outline, a tray's tiles in a grid, the three
  bars, a star row) and the header's glyphs. The catalog shows only what a player starts with: the
  board's outline, the tray's tiles, the vertex configuration as the name
  (`notation`: 4⁴, 3.4.6.4), and the best stars — never a picture of the
  tiling, which would give the puzzle away. The descriptive label is only a
  tooltip.
- `src/input/drag.ts` — pointer drag and drop, rotate and flip, the ✕
  remove mode, and pinch, pan and wheel zoom.

The geometry is the `@tiling/geometry` workspace package (`packages/geometry`),
the shared data the `@tiling/data` one (`data/`) and the sound `@tiling/sound`
(`packages/sound`) — all listed in `package.json`, so no alias sets them up.

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
- **A level follows a Hypersweeper board** — but for the star tilings, which
  Hypersweeper has no board for: defined in `src/geometry/stars.ts` and
  checked by `tests/unit/stars.test.ts` (a period's tiles a lattice cell's
  area, overlapping nothing over a block of periods, every vertex its
  configuration) — and for the tiles of several
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
  Klaassen's heptagon, between 6 and 8 as its hue ramp puts it; 9 cyan,
  between 8 and 12; 13, Tile(1,1),
  the Spectre, the hat and the turtle, violet at its end, and 18 lavender past
  it — real corners, `sideCount`), a tile
  of several pieces in slate, off the ramp (`.pieces`), a star in orchid
  whatever its corners, off the ramp too (`.star`, `starLike` in `shape.ts`;
  a second kind of star periwinkle, `.star-2`), and a second kind
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
