# Boards in the app: symmetries and the web menu

The board geometry itself — tilings, surfaces, solids, adjacency — is shared
with the Python reference implementation and documented in
[`../../docs/agents/geometry.md`](../../docs/agents/geometry.md). This file
covers what the TypeScript app adds on top.

## Board symmetries (`src/boards/symmetry.ts`, `src/boards/surfaces.ts`)

A board's **symmetries** are the permutations of its cells that preserve
adjacency. Each one the UI offers is a button on the caption row: the contents
slide along it while the geometry stays exactly where it is drawn, and the game
never notices, because every number still counts the mines beside it.

This began as the Klein bottle's scroll: the bottle's neck passes through its
own belly, so a few cells are hidden behind it and no amount of turning the
board brings them out. It generalises because the same is true elsewhere. **A
donut's inner wall** is only ever glimpsed through the hole; a cylinder's inside
only at a shallow angle through its ends. Rolling the contents round the tube
brings them round the outside instead. On a **flat** board or a **solid**
nothing is hidden that the view cannot reach, and the controls are a way of
looking at the same puzzle from another angle rather than a way of reaching part
of it — the classic 9×9 grid turns a quarter and mirrors both ways, and a cube
quarters about three axes.

### Five ids, and three ways of finding them

`SYMMETRY_IDS` in `boards/symmetry.ts`: a step round the **ring** (the loop
through the hole), a step round the **tube** (the cross-section), a **turn**,
and a reflection in each of the two directions. The names are the wrapped
surface's and carry over to the other two kinds: a flat board is the window such
a surface is cut from, so its x is the ring and its y the tube, and on a solid
`ring` and `tube` are rotations about the board's principal axis and one across
it. The labels the player sees say what the control does to the board rather
than naming a seam, because one label has to serve all three.

Where the symmetries are hidden differs by kind, so there are three ways in:

- A **wrapped** board's drawn cells are not congruent — a donut's inner tiles
  are smaller than its outer ones — so nothing can be found by looking at the
  geometry. `surfaces.ts` offers candidate motions of the board's own lattice.
- A **flat** board is a finite patch with no translations at all, but its
  symmetries *are* congruences of the drawing. `planeSymmetries` measures them,
  which needs nothing from the builder and works the same on a square grid, a
  Penrose window and a Gosper island. Every symmetry fixes the centroid of the
  cell centres, so each is pinned by where it sends *one* cell — and the
  outermost cell is the one to ask, since only a cell the same distance from the
  centre can be its image. A candidate is not believed on centres alone: the
  whole polygon has to land on the target's (the sphinx patch is one tile in
  four orientations, so centres coinciding proves nothing) and the permutation
  still has to be an automorphism.
- A **solid** is measured the same way, in three dimensions. See below — what
  changes is that one cell no longer pins a motion, because a rotation has an
  axis to find first.

### What survives the gluing is not what you would guess

Which of the five a wrapped surface keeps is a question about the seam, not
about the tiling:

- A **donut** keeps all four (where the tiling is not chiral): both translations
  commute with both gluings, and both mirrors do.
- A **Klein bottle** keeps the ring step and both mirrors, but **not** the tube
  step. Crossing the ring seam reverses the tube, so conjugating a tube
  translation by it gives that translation back *inverted* — it does not
  descend. The **half**-tube step does, because it is its own inverse; that is
  the one on the board, and it is exactly the move that swaps the sheet inside
  the neck for the one outside it. Where half the tube is an odd number of rows
  and the plain step would land the tiling off its own lattice, the half step
  carries a glide along the ring with it.
- A **double torus** keeps *no* translation. It is not glued from a rectangle:
  it is two donuts merged at their outer rims, and the cell each gives up at
  the join pins the lattice both ways, so there is nothing to scroll. What is
  left is the figure of eight's own point group — the half turn about z that
  swaps the two donuts (`turn`), and the two mirrors that fix each of them, one
  across the tubes and one across the rings. The plain donut-swap mirror is the
  product of the first two, so it is not offered.
- A **cylinder** and a **Möbius strip** are open across, so nothing translates
  that way at all — but an open band can still be turned **end over end**, a
  half turn about a horizontal axis through its middle, and that is the `turn`
  they carry. They also turn about their own axis (the Möbius seam flips the
  band, so a cell returns only after *two* loops), and reflect in their own
  centre line — the only horizontal axis that maps an open band onto itself.
  Which of the mirror and the half turn actually survives is the same question
  `flips` answers for the rims (see THE CUT in `tilings.ts`), and a chiral tiling
  has only the half turn: it is why the snubs wrap a cylinder at all.
- A **chiral** tiling has no mirror to offer, on any surface — but it does have
  half turns, so `turn` reaches almost everywhere the mirrors do not. Three-scale
  triangular (p3) is the one tiling with neither: its rotations are all
  three-fold, so its torus is the only wrapped board in the catalogue with no
  flip of any kind.

### Candidates in, measured symmetries out

None of the above is asserted from the algebra. A builder *offers* candidates —
`latticeCandidates` / `domainCandidates` in `surfaces.ts`, each a motion of the
board's own lattice composed with its own seam canonicalization — and
`keepSymmetries` throws out everything that is not an automorphism of the
adjacency it has just built (`isAutomorphism`). So the algebra only decides
which candidates are worth *trying*; the board decides what it has. Several
candidates may share an id and the first that survives wins, which is how a
mirror whose axis has to be searched for, or a translation that needs a glide
on some sizes and not others, is expressed without a special case per board.
`involution` is measured the same way, and is what draws a reflection one button
rather than a back/forward pair.

Two consequences worth knowing:

- The **Archimedean wraps** find every motion the same way, off the template's
  own vertex set rather than out of `template.mirror` (which records only the
  reflection the Möbius and Klein seams are glued through). A reflection or a
  half turn can only map the vertex set onto itself if it sends the first vertex
  to *some* vertex, which fixes it — so there is one candidate per vertex, a
  short list (`templateHalfTurns`, `templateXMirrors`), and every one is offered
  for `keepSymmetries` to rule on. A half
  turn's centre gets both coordinates from that one pairing; `levels` then says
  which horizontal line it may sit on (an open band's own centre, the two a
  Klein seam leaves standing, or anywhere on a donut).
- A **glide** template (p4g — the snub square tiling and its Cairo dual) has no
  plain horizontal mirror, only a glide reflection, so what it offers under
  `mirror-tube` is not an involution: reflect, and the board comes back half a
  domain further round the ring. That is a different motion with a different
  undo, and one button cannot honestly be both it and a mirror, so
  `keepSymmetries` drops it — those boards keep their two translations and show
  no mirror across the tube. A *vertical* mirror is never affected: `x -> axis
  - x` squares to the identity in the plane, so it is an involution wherever it
  survives at all.

### One button per motion nothing else can make

Five controls offered blind are not five *different* things to do. A donut's
mirror across the tube is its half turn after the mirror along the ring; a
cube's third quarter turn is the other two combined, and once one of its nine
mirrors is there the rest are a rotation away; the classic 9×9 grid's horizontal
mirror is its quarter turn twice and then the vertical one. Each of those is a
button a player has to *learn* is redundant.

So `irredundant` (in `keepSymmetries`, so all three derivations get it) tests
each control against the group the **others** generate and drops it when it
turns up there. Dropping never costs the board a motion — a control only goes
when the rest still reach it — so the buttons always generate the same group
they did before, which `tests/unit/symmetries.test.ts` pins by measuring its
order: 48 for a cube from three controls, 120 for an icosahedron from *two*, 8
for the classic 9×9 grid, 6 for the chiral Gosper island.

Two details:

- **A translation is never dropped**, and that exception is the one place the
  rule is not followed. On a triangular cylinder with an odd row count the ring
  step is the *square* of a half turn and a mirror, so minimality would take the
  spin arrows away and leave the player pressing four buttons to move the board
  one column; nine donuts and thirty-odd cylinders would be left with
  reflections and nothing else. A step is the motion the whole feature exists
  for — the only one that moves the board a little rather than turning it inside
  out — so `assemble` passes `ring` and `tube` as essential.
- **The order controls are given up in** decides which of a mutually redundant
  pair survives: mirror across the tube first, then the mirror along the ring,
  then the turn, then the two steps. One pass suffices, because the set of
  others only ever shrinks as the pass goes on, so a control kept against a
  larger group stays out of every smaller one.

### A solid's point group (`solidSymmetries`)

Thirteen Catalan solids, five Platonic ones, the frames, the pyramids and the
brick cubes would be twenty tables of axes to keep in step with twenty builders,
so none of it is declared: a solid is drawn as the thing it is, every symmetry
of the polyhedron is a symmetry of the picture, and the group is measured off
the drawing. Each board gets its own — a cube quarters about three axes, a
tetrahedron thirds and never quarters, an icosahedron fifths, a square pyramid
has one axis and no second kind of mirror at all, and a **chiral** solid (the
pentagonal hexecontahedron, which is the snub operation's dual) has no mirror
anywhere. `tests/unit/symmetries.test.ts` pins those.

**The one solid that is not measured off the drawing is `cube3d`**, and it is
the exception that states the rule: "a solid is drawn as the thing it is" is
what makes the measurement work, and the volume board is *not* — a solid cube
would show only its shell, so it is drawn as its slices pulled apart. None of
the cube's forty-eight motions survives in that layout. They all survive in the
**cells**, though, since any signed permutation of `(i, j, k)` carries
Chebyshev-distance-1 pairs to Chebyshev-distance-1 pairs, so `boards/volume.ts`
offers them as candidates and `keepSymmetries` checks them against the adjacency
— the same route `surfaces.ts` takes for the same reason, and with the same
guarantee that nothing is asserted from the algebra. `ring`, `tube` and
`mirror-ring` are what stand after the redundancy pass. They are also the only
way to move that board's contents at all: dragging turns the drawing, and the
drawing is the cube taken apart rather than the cube.

Three things make it work:

- **Where to look for an axis.** A symmetry axis of a polyhedron passes through
  a face centre, a vertex or an edge midpoint, and subdividing the faces leaves
  all three among the board's own cell centres, cell corners and cell-edge
  midpoints. A **mirror normal** need be none of those — a plane running between
  two cells is normal to the line joining their centres, and a tetrahedron's six
  mirrors are each normal to the edge opposite the one they contain, a direction
  no point of the solid lies on — so edge vectors and centre differences are
  offered too.
- **Where that is not enough.** A cube *frame*'s four-fold axes go through the
  hole in the middle of each face, where there is no cell, no corner and no edge
  pointing at them. They are found as the line two of its mirror planes meet in,
  which is why the mirrors are searched for first.
- **Not walking the board for each.** A disdyakis triacontahedron has a hundred
  and twenty symmetries, and testing each against every cell cost most of a
  second on a board the player is waiting for. The search runs on a **sample** —
  two cells chosen to reject nearly everything on two lookups, plus a spread of
  sixteen more — and only the five motions actually offered as controls are ever
  built in full, which `keepSymmetries` then measures against the whole
  adjacency.
- **Choosing a generating chain, not five nice axes.** Each control is picked
  against the group its predecessors already reach — cheaply, over 3×3 matrices
  rather than cell permutations, since a point group has at most a hundred and
  twenty elements and the two groups are the same one. Chosen on geometry alone
  an icosahedron gets two half turns about axes perpendicular to its five-fold
  one, and the second is just the first after a spin; chosen this way it gets a
  second fifth-turn. `compactRotations` then closes the survivors up onto
  `ring`, `tube`, `turn` in order, because on a solid those ids are only axis
  one, two and three and a board left holding the second and third would draw
  its second and third icons and no first.

### What the icons say (`src/ui/symmetryIcon.ts`)

A chevron pair and a circular arrow say "this moves the board" and nothing else.
A cube's quarter turn drew the same arrow as an icosahedron's fifth-turn, and a
mirror in a vertical plane the same glyph as one in a horizontal plane. So the
icons are not a table of drawings picked by slot: each is **generated from the
motion the button makes**, measured off the board's own geometry at the view it
opens in. Three pictures:

- A **step** along a seam — a wrapped board's ring and tube translations — keeps
  the double chevrons. It has no angle: it slides the board one column along.
- A **turn** draws the fraction of a circle it really is, on the faint whole, so
  a quarter reads as a quarter and a sixth as a sixth. Its **axis** is drawn
  beside it: a line across the icon at the angle the axis makes on screen, or a
  dot in the middle where it points at the viewer — the old convention for a
  line coming out of the page, and what tells a cube's two quarter turns apart.
- A **reflection** draws its plane as a dashed disc at the attitude it really
  has, with a two-headed arrow through it. A vertical plane comes out as a
  vertical dashed line with the arrow across it, a horizontal one as a
  horizontal line with the arrow up and down, and a plane square-on to the
  viewer as a dashed *circle* with the arrow leaning out of the page — a
  cylinder's mirror swaps its near wall for its far one, which no line could
  ever have said.

The measurement needs nothing from the builders. A reflection moves every point
straight across its plane, so the displacements are the plane's own normal, up
to the sign they are flipped to agree on; a rotation moves every point at right
angles to its axis, so the axis is the cross product of two displacements that
are not parallel, and the sign that says which way it winds comes from summing
`from × to`. The order is the whole permutation's, not one cell's — a cell *on
the axis* comes home after a single press, which would call the Gosper island's
sixth-turn a step.

One thing was tried and dropped: drawing the turn's own circle **projected**, so
the ellipse opens and closes with the axis and puts it in the picture for free.
It is the truer drawing, and it is how the reflection's disc is still drawn —
but a cube's axes lie almost across the screen at its opening view, and a
quarter of an ellipse that thin is a scribble. The angle stopped being legible
on exactly the boards with the most of them, so the arc is drawn square-on and
the axis beside it.

Two details worth knowing. The icons are re-drawn on every re-frame, because the
renderer turns a landscape flat board a quarter round on a portrait viewport and
the mirror line turns with it. And the buttons carry `data-motion`,
`data-turns` and `data-mirror`, which is what the tests assert against: 26
pixels of glyph are no evidence.

The controls are declared in `data/ui/screens.json` under `hud.boardBar` and
drawn by `ui/boardInfo.ts`: `symmetry:<id>` shows a control on a board with that
symmetry, `symmetry-pair:<id>` shows the second of a pair only where the
symmetry is not its own inverse — which means the two mirrors, every wrapped
surface's half turn and a Klein bottle's half-tube step get one button, while a
translation and a cube's or a flat board's quarter turn get two. A board with
everything shows eight; the caption row wraps rather than shrinking them. The mouse wheel
walks the ring and shift+wheel the tube (ctrl+wheel still zooms, as it already
did on the Klein bottle, which is the board this behaviour is inherited from);
`[` / `]`, `,` / `.` and `;` / `'` do the ring, the tube and the turn from the
keyboard, on flat boards as well as wrapped ones. Each button's tooltip is
generated with its icon and says the same thing in words — "Turn 90°", "Mirror
in a vertical plane (left to right)". The **pygame build has none of
this** — it keeps the single Klein `cell_cycle` it always had, which is why the
conformance oracle's `hasCellCycle` is checked one way only (see
`tests/unit/conformance.test.ts`); the symmetry sets themselves are pinned in
`tests/unit/symmetries.test.ts` and `tests/unit/surfaces.test.ts`, and the
controls themselves in `tests/e2e/surfaces.spec.ts`.
