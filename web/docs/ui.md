# The UI: menu, settings, dialogs and the player's record

The app's pages, windows and stored state. For how cells are *drawn* see
[`render.md`](render.md); for what a board is made of see
[`boards.md`](boards.md).

## The menu

The menu is play-first, and deliberately **not** the pygame one: the home page
is Classic, Flat, 3D, Hyperbolic and Custom (`src/ui/menu.ts`). Classic opens
one particular board straight away — the original square grid — and sits above
the three that deal a *random* one: the flat picker's pool, every flat manifold
plus the spheres and polyhedra, and the Hyperbolic page's boards. So no picker
carries a Random row; Custom holds the old root (Flat, Flat manifolds,
Hyperbolic, Sphere, Solids, Volumes). **Solids** gathers four of the shared
solid groups — Platonic, Archimedean and Catalan solids, and Polyhedra — as
submenus of one page (`SOLIDS_PAGE` in `src/ui/boardTree.ts`); they stay
groups of their own everywhere else (achievements, a board's family in its
info window, the pygame menu), so only this menu nests them. Hyperbolic is the one geometry group the pygame menu does
not have: there it is a family on the flat picker, and the web menu lifts it
out into a group of its own (`MENU_GROUP_FAMILIES` in `src/modes/catalog.ts`)
— a curved space rather than a kind of flat tiling — after Flat manifolds and
before the solids. Its page is three submenus, **Regular** (the {p,q} tilings),
**Uniform** (Wythoff's tilings of them) and **Closed surfaces** (the plane glued
up with no rim: the Bolza surface, Klein's quartic, Dyck's and Bring's
surfaces, Macbeath's surface and a genus-14 Hurwitz surface, one surface a
board), filed by each board's builder in
`data/presets.json` (`menuSubfamilies`), so a new hyperbolic board lands in the
right one without a list to edit. The binary tiling is hyperbolic too, but it
is drawn in a rectangle of the upper half-plane rather than in the disc, and
reads as a self-similar board — every row the one above it halved — so the
menu files it under **Flat › Fractals** instead (`MENU_REFILED`) and the Flat
pool deals it. The Regular page is sorted by p, then q — triangles first, as
the flat picker lists Triangles, Squares, Hexagons — rather than in the shared
catalog's order, which the pygame menu keeps. Everywhere but the menu the hyperbolic boards still count as the
plane's: the info window says Hyperbolic, and the achievements file them there.
A board reachable from the home page is still reachable through Custom — the
home row is a shortcut, not a move, which is how `square` has always worked.
The reverse is **`CUSTOM_ONLY`** (`src/modes/randomBoard.ts`): boards kept off
the home page *and* out of every random pool until their UX is ready to be
promoted. Both pools also drop, per difficulty, the boards
`data/distortion.json` marks as distorted at the difficulty being dealt, and at
every difficulty the boards whose surface carries a **caution** (Boy's surface).
The cube of cubes (`cube3d`, Volumetric) is there today — it used to
be a second launch row beside Classic, and is now Custom › Volumes only.
In every tiling picker the three regular tilings are promoted to rows of their
own, leaving the Regular family holding the shaped boards alone under the label
**Shaped boards** (plane only). That shape is *derived* from
the shared port in the "web menu" section of `src/modes/catalog.ts`, so
`data/catalog.json` and the pygame menu are untouched;
`tests/unit/menu.test.ts` pins it.

The header's two buttons — the **?** at the left edge, the gear at the right —
open the how-to-play page and the settings page; see "Settings and themes"
below.

### Two layouts, one DOM

From **900px** wide and 501px tall (`Menu.wideQuery`, the matching `@media`
block in `styles.css`) the same menu lays out as two panes: a sidebar holding the whole
top level of the tree, and a content pane showing the current page as a grid of
board cards under a **pane header** — the page's title, its breadcrumb hint and
the difficulty pills. Below that width it is the phone column, with the back
stack in place of the sidebar.

A board's card shows **the level it opens**: the preset board at the selected
difficulty, every cell, drawn whole — a flat board as its outline, a solid or
a wrapped surface as the real thing lit (`levelPreview` in `ui/icons.ts`). So
Squares is a 9×9 grid on Easy and 16×30 on Hard, and the card is redrawn when
the pills move. Building a board takes up to a second and a half (a closed
surface at Hard), so `Menu.paintLevel` draws a page's cards in the
background, one board per task, with the card's `previewIcon` (or the level
at the old difficulty) standing in meanwhile; the drawings are cached per
mode and difficulty, and nothing is built while a game is on screen.

A **group's** card — a family, a surface, a Solids submenu, a random pool —
shows a level too: the board its icon is drawn from (`iconBoard`: Uniform's
rhombitrihexagonal, the Flat manifolds' squares on each surface), taken from
the group's own members where it has them (`Menu.cardBoard`), so the Uniform
card on the Torus page is the torus's rhombitrihexagonal. On a solid or a
surface every cell is laid over a solid grout in its own shade, as the board
lays its grout under the tiles, so a seam is a line and never a hole onto the
far side; and a surface's cells are painted back to front rather than culled,
since a big cell (an easy board's) can face the viewer in part while its one
normal points away.

A board row (a card on the desktop) can carry a second, smaller line under its
label. A graded board's fairness hint takes it; otherwise a 2-uniform tiling
puts its vertex-type symbol there (`[3⁶; 3⁴.6]₁` under *Studded triangular*),
read from `tilingNotations` in `data/catalog.json` through `TilingSpec.notation`
— the label says how the tiling is made, in words, and the symbol is what the
literature calls it.

A wrapped board its surface draws **too far out of shape** carries a second
mark, per difficulty (`src/modes/distortion.ts`, reading the measured
`data/distortion.json`): a *Distorted* pill on the desktop card, and on the
phone a hint line — "Distorted on Easy — Medium and Hard draw the tiles truer"
— with a ⚠ in the corner unless the fairness mark already holds it. Most of
these boards are distorted on easy alone, where a few big cells span the whole
curve, so unlike the fairness mark this one follows the selected difficulty:
it is built once per row and `paintDistortion` shows or hides it whenever the
pills change, without re-rendering the page. The board stays playable; the
in-game caption takes the same ⚠ (its tooltip says why) and the info window a
line, and the random launchers never deal it at that difficulty.

A third mark is **declared** rather than measured: a surface may carry a
`caution` in `data/catalog.json` (`surfaceCaution` in `src/modes/catalog.ts`),
and every board on it is marked the distortion mark's way — an *Intersects*
pill on the desktop card, the caution as the hint line and a ⚠ on the phone
row, the ⚠ on the caption and the line in the info window — at every
difficulty, since it is the surface's and not the size's, and is left out of
every random pool. Boy's surface is the one: it passes through itself, so some
of its cells hide behind others however it is turned. (The Klein bottle passes
through itself too, but its scroll brings every cell round, and it carries
none.)

**A tablet held upright gets the two panes too**: the query's second clause,
`(min-width: 720px) and (min-height: 800px)`, takes in an iPad in portrait
(744–834 wide), which on the width rule alone was handed the 520px phone column
with a third of the screen empty either side of it — while the same iPad turned
on its side got the desktop. The height floor is what keeps a phone on *its*
side (844×390 and the like) on the phone column. Between 720 and 899px a second
block in `styles.css` fits the panes to the narrower screen: a 236px sidebar,
a 200px card floor so the pane holds two columns, both titles at 25px (at 28px
"Hypersweeper" breaks mid-word in that sidebar), and the difficulty pills on
their own row under the page title rather than beside it. From 900px nothing
of that applies, so the desktop and its gallery baselines are untouched. The
query lives in two places — `Menu.wideQuery` and the `@media` rule — and they
must match; `tests/e2e/layout.spec.ts` pins both sides of the height floor.

**A phone on its side gets a rail** (the `orientation: landscape` and
`max-height: 500px` block in `styles.css`). In the phone column the title took
the top of a 390px-tall screen and the difficulty row its bottom, and the list
between them showed three and a half rows. Landscape has width to spare, so the
chrome moves to a 248px rail at the left — the title row on top, the
difficulty pills stacked at its foot — and the page takes the whole height to
its right, its board lists two-up where they fit (not the settings-style pages,
whose rows carry switches). It is still the phone's navigation, back stack and
rows, placed by grid alone, so no page has a third layout to render. The widest
phones are in it too: the first clause's `min-height: 501px` turns a 932×430
Pro Max away from the desktop panes, whose cards are taller than half that
screen. The menu body is shared by every page, so `go` puts its scroll back to
the top on navigation — on a screen this short a row tapped low on one page
otherwise opened the next one past its back row.

Nothing is duplicated: the how-to-play/gear
buttons and the difficulty block are the *same* elements, moved between the two
homes (`placeHeaderButtons`, `paneHeader`), so every `data-action` and
`.difficulty-btn` selector still resolves to one element at any width.

Three rules keep the two layouts honest, and all three were learned the hard
way:

- **Every page must render at either width.** `this.view` is a closure that
  outlives a resize — a rotate on a big phone crosses the breakpoint on its
  own — so a page that only one layout can draw needs a guard that re-routes when the
  breakpoint moves under it. `renderRoot` and `renderCustom` bounce to the
  sidebar's Quick start when they go wide; `renderQuickStart` bounces to the
  phone's home page when it goes narrow. Without that last one the phone was
  left on the desktop's Quick start page — no Custom row, no back row and the
  sidebar `display: none`, so the whole geometry tree was unreachable until a
  reload. `tests/e2e/layout.spec.ts` pins the crossing.
- **The sidebar is built once, so it is the one thing a render does not
  repaint.** Only the pane content and the active row change between pages —
  but its rows carry menu glyphs, and a glyph is a *string of SVG* with its
  colours already baked in (`ui/icons.ts`), so a theme switch left the whole
  geometry list in the old theme's ink: Classic's grey tiles still grey under
  Sand's cards. `Menu.refresh` therefore rebuilds it (`rebuildSidebar`), and
  puts back the two things that live in it rather than being rebuilt with it —
  the How to play / Settings buttons, which are *moved* into its footer rather
  than cloned, and which row is active. Anything else cached across a render
  has to answer the same question. `tests/e2e/settings.spec.ts` pins it against
  what a fresh load of the same theme draws.
- **The pane header does not scroll.** It carries the only difficulty control
  on screen and, on a family page, the only way back up, so a page marked
  `paned` (set by `paneHeader`, cleared by `render` the way `settings-open` is)
  hands its scrolling to the card grid and keeps `.menu-body` itself still.
  Sticky would want a fill of its own over the page's textured gradient, and a
  flat one seams against it. The settings/help pages are not `paned` — they are
  a stack of sections with no single list to scroll — so they still scroll
  whole.

### Favourites and completion marks

Every playable board row carries a **star** at its right edge, centred on the
row's height (`Menu.favButton`; on a desktop card, in the preview's top-right
corner), and the starred boards are listed in a **Favourites**
section on the main screen: under Classic / Flat / 3D / Hyperbolic / Custom on the phone
home page, and under the quick-play cards on the desktop's Quick start —
the desktop's landing page, whose sidebar row was already a star. The section is
not there at all until something is starred; the stars on the rows are how a
player finds it.

- **The star is a button of its own**, a sibling of the row's button inside the
  same `<li>` and laid over its corner, because a button cannot hold a button.
  So the row still launches the board, the star only stars it, and every
  `.menu-entry[data-mode]` selector still finds one element. `data-fav` is its
  handle. On a desktop card it sits on a panel-coloured disc over the preview,
  which a busy tiling would otherwise swallow.
- **Per board, not per board and difficulty.** The star says "I like this
  board"; the pills say how to play it.
- **Blocked boards get no star**, and a stored one is left out of the section:
  they cannot be played.
- **Rows outside their page are named in full** — the row's own label plus its
  surface ("Squares · Torus"), since the page that said "torus" is gone. The row
  label, not `fullModeLabel`'s catalogue name: the plane's triangles are
  "Triangles" on their page and would be "Triangle grid" there.
  `menuEntryFor` (`src/ui/boardTree.ts`) finds a board's row — label, icon,
  notation — by walking the tree once.
- **Unstarring in the section takes the row away at once** (the page re-renders);
  anywhere else the row stays and just repaints its star.

`src/favourites.ts` keeps them under its own key, `ms:favourites`, shaped like
best times (a version inside the record, total reads, a re-read before each
write, unknown boards carried through). **A favourite is a dated switch, not a
list entry**: each board stores `{on, at}`, and an unstar keeps its entry with
`on: false`. The section lists the `on` ones by `at`, which is the order they
were starred. The date is what lets two devices merge — see "The record in
iCloud". Another tab's change, or one merged in from iCloud, reaches the menu
through `subscribeFavourites`, which `main.ts` points at `Menu.refresh`.

The **completion mark** (`Menu.addDoneMark`) is three bars rising Easy, Medium,
Hard after a board's name (on a card, at the caption's right), each filled in
`--accent` once the board has been won at that difficulty. Deliberately not
stars, so it cannot be read as the favourite, and shown only on a board won at
least once, so the catalogue's untouched rows are as they were. It reads the
achievement record's win counts (`Progress.wins`, `src/achievements.ts`) — the
one record of every win, seeded from the best times — once per menu render;
clearing achievements clears the marks with it. Classic carries one too, being
the plane's squares. `data-won` ("easy hard") is the e2e handle, and the
`aria-label` says it in words. `tests/e2e/favourites.spec.ts` pins both
features.

## Telling the player where they are

`src/ui/boardInfo.ts` owns the board's name and the row of controls under the
header.

The **name** (`fullModeLabel`) says which board it is. Nothing on the game
screen did before, and the menu's Flat, 3D and Hyperbolic rows each open a
*random* board —
so a player could be dropped on a truncated icosahedron with no way to find out
what it was. It is also what makes a screenshot of the game say what it is.

It is drawn **behind the board**, not above it: its own fixed layer, inserted
before `<canvas id="board">` (the `App` constructor), so tree order paints the
transparent canvas over it — no z-index anywhere, and none would work from
inside `#ui`, which is itself a fixed element and therefore its own stacking
context. Two things follow, and both are the point: the name costs the board no
height (`App.onResize` frames the board below the header and the control row
alone, and puts the name on that same line through `--board-name-top`), and a
board zoomed up over it simply covers it. `pointer-events: none`, so a tap on
the name is a tap on the cell drawn over it.

The row under the header is where the **board-symmetry controls** live, rather
than in the header, and they are all that is on it: a board with none has no row
at all, since the name is no longer in it to hold it open. The header holds two
slots a side — back and flag-mode, a random board and about-this-board — around
the centred counter/smiley/counter block, and seven controls is
what one row holds at 320px. These belong to the *board* rather than to the
game, a board can carry six or seven of them at once, and putting them in the
header would wrap that row on exactly the boards with the most to fit. They are
declared in `data/ui/screens.json` under `hud.boardBar`, beside the header's own
clusters, and the caption row wraps rather than shrinking them below a touch
size. `tests/e2e/hud.spec.ts` pins all of this.

### The header's size

The header's buttons are **Apple's standard 44pt touch target or bigger**, and
go smaller only where the row would not fit. They used to be a fixed fraction
of the viewport width (`9.6vw`, between 31 and 46px), tuned so the worst case
fitted at 320px. That left every other phone short of 44pt (38px on a 16 Pro)
with the unused width standing as gaps between the side clusters and the
centre block, and stopped at 46px on the Duo and iPad.

Now every part of the row is a fraction of `--hud-btn` (the glyph, the gaps,
the counters' width and digits), so the row is a known number of buttons wide,
8.52 of them. `--hud-fit` solves for the button that fills the line between
the two side paddings (dividing by 8.6 for slack), and `--hud-btn` clamps that
between 28px and `--hud-btn-max` (52px). That gives 36px at 320, about 43.5 at
390, 45 at a 16 Pro's 402, 49 at the Pro Max, and 52 on the Duo, an iPad and a
desktop. The App Clip's header is the same header with two slots held
empty, so it sizes the same way, and `tests/e2e/appClip.spec.ts` checks it.

**The ends of the row keep clear of the display's rounded corners.** A Face ID
iPhone's portrait inset (59–62pt) already puts the header below the curve of
the corner. A Touch ID screen has only a status bar up there, about 24pt (the
iPhone Duo, an iPad), and the back and ⓘ buttons sat inside the curve. The
header's side padding is therefore at least `--corner-clear`: `--corner-reach`
(48px) less the top inset, and nothing at all when the top inset is 0, since
then the page does not reach the top of the screen (Safari with its address bar
above it, a desktop) or the phone is in landscape, where the side insets clear
the corners. No web API reports a display's corner radius, so the reach is an
estimate: one constant in `styles.css`.

The insets reach that arithmetic through `--safe-top`, `--safe-left` and
`--safe-right` rather than `env()` directly, because a desktop browser reports
none. That is how the e2e suite and `scripts/make-store-screenshots.mts` stand
a device's insets in. The store screenshots give each device its real top
inset (62pt for the Dynamic Island iPhones, 24 for an iPad and, as an estimate,
for the Duo), so the header sits where it does on the device instead of in the
corners App Store Connect rounds every screenshot off at.

See **Board symmetries** in [`boards.md`](boards.md) for what they do and which boards have which.

The **first-run hint** is the app's only onboarding: one dismissible line over
the first board this browser ever opens, saying how to open a cell and how to
flag one. Long-press-to-flag and right-click-to-flag were documented on the
how-to-play page and nowhere a new player would look. It is spent via
`settings.seenHint` (purely additive, so no `SCHEMA_VERSION` bump) and goes on
the first move. **Any test that screenshots a board must seed `seenHint: true`**
— every Playwright test gets a fresh context, so without it every board is a
first board, and the hint carries a seven-second timer a slow shot would race.

The how-to-play page is **not reachable from inside a game**, and that is a
decision rather than an omission. It had a header slot, and briefly the right
end of the control row; a game screen already carries a header, a row of board
controls and the board itself, and a link to a page of prose on top of that is
clutter. The rules live behind the menu's ?, which is where a player who wants
them is looking, and the first-run hint teaches the one gesture a new player
cannot guess. `Menu.showHelpOverGame` and `App.showHelp` went with the button —
the canvas-hiding, `view`-preserving machinery they needed has no caller now.

### The info window (`src/ui/boardFacts.ts`, `src/ui/infoDialog.ts`)

The header's ⓘ answers the question the name raises: *what is this?* The family
the tiling comes from (Uniform, Laves, 2-uniform, 2-isohedral, Pentagonal, Isogonal, Congruent rectangles, Other,
Aperiodic, Spirals, Rep-tiles, Fractals, Hyperbolic, or the solid group), the surface it is wrapped on, how many cells there
are and how many mines, and then one row per kind of tile — its name, its count
and the colour the board paints it in (`iconHex`, the menu icons' saturation;
the board's own tint is faint by design and reads as off-white at 14px). A board
graded ⚠ says why, here, because the mark on the name is a tooltip on a desktop
and nothing at all on a phone.

Everything in it is **derived**, never tabulated — a new tiling describes itself
with no edit to `boardFacts.ts`:

- **Counts** come from `classifyShapes` over the live board's polygons, grouped
  by the same `(sides, variant, size)` classing that colours the board. So the
  window is a key for the board behind it: what it lists is what is on screen.
- **Names** come from measuring a tile — equal sides and equal angles, measured
  separately, because they are what tell a rectangle from a rhombus and a
  brick bond from "quadrilaterals". Two further shapes English has a word for
  are picked out: the isosceles triangle (half the Laves duals) and the kite
  (the deltoidal ones).
- **A tile has two shapes: its ideal one and its drawn one.** On a flat board
  or a solid they are the same, and the tile is named as measured. On a curved
  board they cannot be — three regular hexagons meet only on a plane, so no
  sphere, torus or Klein bottle keeps a hexagonal tiling's hexagons regular —
  and a tile whose drawing does not keep its ideal shape is named
  **projected**: a Goldberg sphere is "Regular pentagons" (its symmetry keeps
  those exact) and "Projected regular hexagons". The ideal shape comes from:
  - for a wrapped board, the flat tiling it is cut from — the tiling's own
    periodic domain (`templateCells(archTemplate(key), 0, 0)`, no board built),
    matched by side count, which is exactly what `classifyShapes` gives a curved
    board one class of. The three regular tilings need no template. A hexagonal
    torus measures 0.80 regular, and is the regular hexagonal tiling of the flat
    torus it is a quotient of; the Klein bottle is flat in the same way, so its
    tiles are regular too, however far the immersion bends them.
  - for a board that bends a regular tiling, the builder: `regularTiles` on the
    Goldberg polyhedra, the geodesic sphere, the spherical snub dodecahedron and
    the hyperbolic boards, {p,q} and uniform alike (whose surface row reads
    "Hyperbolic plane").

  A class is projected unless *every* cell in it keeps the ideal shape (the
  geodesic sphere's twenty exact triangles do not make its eighty
  equilateral). An irregular tile — a Laves pentagon — is irregular on any
  surface and never projected. Where a row is projected the window explains the
  word under the tile list (`BoardFacts.note`).
- **A solid's colour class is split into the shapes it holds.** A solid is
  coloured by side count, and one count can be two shapes — the truncated
  octahedron's board is rhombi and squares, a fanned Archimedean solid's
  triangles are equilateral and isosceles — so exact boards get one row per
  measured shape, sharing the class's swatch.
- **Nothing is called equiangular past a quadrilateral.** Corner angles are
  measured unsigned (as `shapeMetrics` measures them), so a reflex corner reads
  as its complement — the chair's L-tromino would otherwise qualify. Side
  lengths carry no such ambiguity, hence "Equilateral hexagons" for the
  phyllotactic tile.
- **Two classes with the same name are told apart** by size where they are two
  sizes of one tile ("Squares · large", the Pythagorean tiling) and by their
  sharpest corner otherwise ("Rhombi · 36°", Penrose).

`tests/unit/boardFacts.test.ts` pins the naming and sweeps every mode this build
ships (every cell counted exactly once, every board with a family and a shape
list); `tests/e2e/hud.spec.ts` pins the window itself.

The window and the record window share one shell, `src/ui/modal.ts`: those two
are the app's only modals — everything else that looks like a page *is* a page —
and Escape, the backdrop click, the focus ring and the open transition belong to
neither of them individually.

## Shareable board links

A board's address *is* its share link: `?mode=<mode>&difficulty=<key>`, which
`App.syncLocation` writes with `history.replaceState` whenever a board opens and
clears on the way back to the menu (so reloading from the menu shows the menu).
`replaceState`, not `pushState` — this mirrors the current view rather than
building history the back button would have to unwind.

**Every ordinary game carries a `seed`**, generated in `App.startGame` when the
caller has none, so the link names *this* mine layout rather than "another board
of this kind" — which is what makes the share button (`src/share.ts`) worth
having, and what lets a player hand a board to someone else. The consequence to
know: a reload replays the board you were on instead of dealing a fresh one.
Re-rolling is the smiley (or the record window's **Play again**), both of which
come back through `startGame` with no seed. Only a board built from an explicit
mine layout — the `window.__ms` test seam — has no seed to carry, and it claims
no link at all.

Parsing lives in `src/link.ts`, apart from `main.ts` so it is unit-testable, and
treats the query string as **untrusted**: links get typed, truncated by chat
clients and forwarded between builds that do not offer the same boards. Every
parameter is read on its own and only if this build knows its value — an
unrecognised value is dropped rather than repaired, and dropping one never costs
the others:

- an unknown `mode` opens the menu, but a valid `difficulty` alongside it is
  still applied (for the session only — someone else's link never rewrites your
  stored preference);
- an unknown `difficulty` still launches the board, at the stored one;
- a `seed` is used only when it is a safe integer, since `mulberry32` does
  `seed >>> 0` and a fraction or infinity would not reproduce the sharer's board;
- unknown parameters are ignored, so tracking/campaign query strings are
  harmless.

`hasMode` uses `Object.hasOwn`, not `in`. With `in`, `?mode=toString` (or
`constructor`, `valueOf`, …) resolves up the prototype chain and hands the board
builder a function — the reason a link-facing lookup must never use `in`.

`tests/unit/link.test.ts` round-trips **every** mode in the catalog at every
difficulty, so every board the menu can launch is shareable.

## Settings and themes

The gear on the menu title row opens a settings page — not a modal: it is one
more `Menu` page (`Menu.showSettings`, rendered by `src/ui/settings.ts`), so it
reuses the back row, the `.menu-entry` cards and the scrolling body. The **?**
beside it is the same pattern with no state at all (`Menu.showHelp`, rendered by
`src/ui/help.ts`): its text lives in TS rather than in `data/ui/screens.json`,
which is the config the pygame build shares and which has no help page. Both
buttons are `.menu-header-btn[data-action=…]` inside `.menu-header-actions`, one
per side — the **?** at the left edge, the gear at the right — so the two balance
each other and the title keeps the whole middle. Both on the right cost the title
twice that width, and "Hypersweeper" is a single unbreakable word that then does
not fit on one line on a narrow phone. A third button means picking a side and
adjusting the shared `--menu-header-actions` width, which is what the empty side
is sized from. Both look settings are pages below settings in the same way
(`Menu.showThemePicker`, `Menu.showShapePicker`, `Menu.showSchemePicker`):
settings shows a Theme row, a Board shape row and a Colour scheme row naming the
current values, and the pickers live one level down, which keeps the settings
page short enough to read at a glance. Three pages rather than one list of every
combination — the axes are independent, so a single picker would be twenty-seven
rows that all have to be read to find the three facts they encode.

**Themes, shapes and the colour scheme.** The look is **three** settings, on
three axes that have nothing to say to each other:

- a **board shape** — how a cell is cut, and what it is made of. Three of them,
  one per entry in `BOARD_SHAPES` (`render/cellStyle.ts`): **Classic** (the
  1990s beveled button, the one cut that is *lit* on a flat board, so its
  highlight and shadow invert when a cell opens), **Realistic** (a five-loop
  glass dome, a centre-lit gradient, translucent opened cells, and real models
  rather than billboards for a flag and a mine — see "3D markers" in
  [`render.md`](render.md)) and **Flat** (unlit plates with a wide gap and no
  relief). The shipped default is Classic.
- a **theme** — what the page behind the board is made of, which palette the
  chrome paints with, and what the board itself is coloured in (`BOARD_LOOKS`,
  keyed by the theme key). Three of them: **Bright** (the shape colours at full
  strength, on the woven, vignetted page — the only theme with a tiling pattern
  to draw), **Classic** (grey at every cut, opaque, on a cool grey page) and
  **Sand** (the shape colours at about a quarter chroma, Space Grotesk digits,
  on a warm page). The shipped default is Sand.
- a **colour scheme** — which half of the theme's palette pair the chrome paints
  with. **Auto** (the default — the device's own `prefers-color-scheme`),
  **Light**, **Dark**.

The first two were one setting of five entries until v5, and that list was the
two axes tangled: Realistic and Flat were one palette at two cuts, Sand and Flat
Sand another palette at the same two cuts, and Classic a third palette welded to
a third cut. So six of the nine looks were unreachable — a grey board could only
be a beveled one, and a beveled board could only be grey. The colour scheme came
out of the same tangle at v4, when Light and Dark turned out to be one look on
two palettes. Split three ways, every combination exists, and
`render/cellStyle.ts` composes the pair into the one `CellStyle` a mesh is built
from (keyed `"<shape>/<theme>"`).

The theme and scheme lists are declared in `src/ui/theme.ts` and the shape list
in `src/render/cellStyle.ts`, not in `data/ui/screens.json`. The distinction
matters:

- The eight **palettes** are still shared config (`data/ui/screens.json` under
  `themes`; six ported from the pygame `THEMES` registry in `minesweeper/gui.py`,
  `dark` and `classicDark` web-only), and `tests/test_theme_sync.py` still fails
  if one is retuned without the JSON following. A theme *composes* palettes, two
  at a time — `Theme.palette` is a `{light, dark}` pair — and never adds a colour
  to one. The two web-only entries are exactly the dark halves the pygame presets
  could never supply: `ios`/`dark` and `classic`/`classicDark`.
- The **lists** are web-only because pygame has neither cell shapes, page
  textures nor a dark mode, so its six presets could never be these axes. That is
  the same split the menu already has (`catalog.ts`'s web-menu section).

`applyTheme(theme, schemePref, mode?)` writes the whole set of CSS custom
properties onto `document.documentElement` — the `:root` block in `styles.css` is
only the *boot* default (Sand on light — including its `--ui-font`, since that
theme names a face of its own) and must stay in step with it, as must the
`prefers-color-scheme: dark` block beside it, which covers every player on a
dark device who has not chosen light. Things worth knowing:

- **`auto` is resolved at paint time, and it is live.** `activeScheme` reads
  `matchMedia("(prefers-color-scheme: dark)")` exactly as `animationsEnabled`
  reads reduced motion, and guards `window` the same way for the node unit
  environment. `onSchemeChange` is the other half: `App` subscribes to the media
  query and repaints when the device switches, because nothing else would notice
  and the page would sit on the wrong palette until the next reload.
- **A scheme is chrome and page only.** The board's tiles are lit head-on by a
  fixed rig and read the same either way — which is what the old Dark theme
  already shipped, a light-toned board on a dark page — so `shapePalette.ts`,
  `glyphAtlas.ts` and the renderer's lighting take no scheme argument at all.
  Classic dark is a black page with the same gray beveled board on it.
- **The board is themed only as far as a `BoardLook` says.** The shape colour
  code (`shapePalette.ts`) still owns the hues, and exactly one theme switches it
  off: Classic, whose `monochrome` flag draws the board in its plain grays at
  every cut. No theme reaches into `shapePalette.ts` or `glyphAtlas.ts` for a
  colour of its own.
- **A look's `albedo` travels with the *colours*, not the cut.** The classic
  bevel is the one cut that is lit on a flat board, so it pays back what the
  shading takes (`1 / 0.3246 ≈ 3.08`, measured); and the Classic theme's mono
  tones are a third darker than the colour ones and were chosen against the same
  payback, so that theme overrides the albedo at *every* cut. Between them, the
  five looks this replaces land exactly where they did.
- **The gallery flattens the page, on every shot.** Every theme carries a grain
  now — the axis split left no untextured palette, since the one theme that had
  a plain field was folded into Bright — and full-frame turbulence is the one
  thing a PNG cannot compress: measured, it takes a board baseline from 30 KB to
  650 KB, which is 21 MB over the gallery in a repo whose whole history is
  17 MB. So `gallery.spec.ts` injects `--bg-texture: none !important` (an author
  `!important` is the only thing that beats the property `applyTheme` writes
  inline) and the page's own layers are asserted where they cost nothing:
  `settings.spec.ts` reads `--bg-texture` per theme, and
  `tests/unit/backgroundPattern.test.ts` pins the tiling drawn over it.
  `BASE_LOOK` is then the quietest *board* — Bright's full-strength shape
  colours cut flat, which is what a geometry regression shows up against most
  clearly — and `LOOKS` / `SOLID_LOOKS` cover the rest of the product.
- **The theme's board half and the shape both land on the next board; a scheme
  lands whole.** A cut fixes the mesh's vertex layout and a board's colours are
  written into its buffers, so nothing is re-cut or repainted in flight and both
  pickers' footers say so. A scheme needs no new mesh, so it applies to the board
  already in play — which is why the scheme page carries no footer.
- **An unknown theme key falls back to Sand** through `resolveTheme`, which uses
  `Object.hasOwn` for the same reason `link.ts` does. The folded-away keys are
  *aliases* onto the palette they wore rather than strangers: `realistic`,
  `flat`, `light` and `dark` onto Bright, `flatSand` onto Sand. `resolveShape`
  and `resolveScheme` are the same shape. Those are also the safety net under the
  migrations below.
- **The WebGL canvas is transparent** (`alpha: true`, clear alpha 0), so the
  field around the board is the *page* background. That is what makes the glass
  theme's gradient show and means a theme needs no renderer call at all. Do not
  reintroduce an opaque clear colour — it would cover the CSS background.
- Any new chrome colour must be a `var(--…)` from `themeVars`. A hard-coded dark
  stroke is the classic dark-theme bug (the header icons in `hud.ts` stroke in
  `currentColor` for this reason; the flag keeps its own colours because it is
  the game's own glyph, not a control — all but the mast, `--flag-mast`, whose
  near-black vanished on the dark scheme's buttons and which turns to the
  palette's `--text` there. It is not written by `themeVars`, so the dark rules
  in `styles.css` decide it: `[data-scheme="dark"]`, and the boot media query
  guarded by `:not([data-scheme="light"])`).
- **The reset button's face is the other glyph, and it is yellow.** Same
  argument as the flag's: a minesweeper's face is yellow the way its flag is
  red, so it does not follow the chrome. It is still a `var(--…)` —
  `--smiley` / `--smiley-rim` / `--smiley-ink`, written by `themeVars` from
  `smileyHex` in `render/shapePalette.ts` — so the colour is the palette's own
  yellow anchor (a pentagon's hue) rather than one invented for this control,
  and `:root` in `styles.css` carries the boot values as it does for the rest.
  What it does *not* take is the menu icons' register, which pulls every hue
  part-way back toward the old indigo's lightness and has no yellow down there
  at all — 105° comes out olive. The head is drawn at the lightness that hue is
  most colourful at and comes out the same under every theme and both schemes;
  the features are a fixed dark ink, because `currentColor` on a yellow disc is
  near-white on the dark scheme.

`tests/test_theme_sync.py` (Python) fails if a pygame palette is retuned without
the JSON following.

### Visual effects, and motion in the chrome

Settings › Appearance › **Visual effects** steps Auto → High → Low
(`settings.quality`, render/quality.ts): the particles, the shadow a solid
stands on, reflections and the rim light. Auto is off on a software renderer
and a two-core device, and the row says which way Auto came out. Nothing in it
is cut into the mesh, so it lands on the board already on screen.

The chrome moves too, all of it under the player's *motion* setting, which
`App.syncMotion` mirrors onto `<html data-motion="on|off">` so the stylesheet
can obey the Animations override as well as the OS preference: buttons give
under the finger, a menu page rises in row by row when it is **navigated to**
(`Menu.go` → `riseIn`; a page repainted for a toggle on it stays put), the mine
counter ticks when it changes, and the smiley bounces on a win (both counters
glow once in the accent) or shakes its head on a loss. The e2e suite runs with
reduced motion, so none of it reaches a baseline.

### The page follows the board's tiling

Behind the grain, a theme's page carries **the board's own tiling**, drawn very
small and very faint (`src/ui/backgroundPattern.ts`). Open `torustrihex` and the
paper behind it is trihexagonal; open `kleincairo` and it is Cairo pentagons.
Cut with the domed shape the opened cells are translucent, so that page is what
shows *through* the board as well as around it; cut opaque, it is the field
around it, which is a page either way.

It is **opt-in**: Settings › Appearance › **Custom backgrounds**, off by
default. The row sits beside Theme rather than under Behaviour (this is what the
page is made of, not what the game does). It draws under **all three** themes:
it is the player's setting rather than one theme's flourish, and a switch that
silently did nothing on two of them read as a broken switch rather than as a
design. What decides whether a pattern is on the page is the switch and whether
a board is open — nothing about the theme.

`patternLayer(mode)` returns one CSS `background-image` layer — an inline SVG
data URI, because the packaged builds assert the bundle fetches nothing. It goes
into its own `--bg-pattern` property, above `--bg-texture` in the `html, body`
list. Wiring: `applyTheme(key, mode)` takes the mode; every caller goes through
`App.paintTheme` (`main.ts`), which reads it off the session, so a theme switch
or a change synced from another tab keeps the board's pattern and the menu goes
back to the plain field. The setting is applied there too, by withholding the
*mode*: with no board named there is nothing to follow, which is the state the
menu is in anyway.

- **It follows the tiling, not the surface.** All five surfaces of a tiling
  share one tile, so the cache holds 38 entries for 159 modes. `tilingOf(mode)`
  in `modes/catalog.ts` is the inverse of `modeFor` — not a prefix strip, since
  `torustri`, `torustriakis` and `torustrihex` are three tilings on one surface.
- **The pattern is the board's tile, laid down periodically.** A board's own
  patch may be aperiodic, fractal or wrapped round a solid, but what the page
  wants is the *tile* — and nearly every tile in the catalogue tiles the plane
  periodically by itself. The 30 `ARCH_TILINGS` come from `archTemplate`, whose
  fundamental domain *is* a seamless repeat tile; the three regular tilings have
  no template, so their domains are written out in this module. The
  **rep-tile** and **fractal** boards do not repeat, but their tiles do — the
  Gosper island is plain hexagons, every rep-tile and its half turn fill a
  parallelogram (two trapezoids a regular hexagon), and the Sierpinski carpet
  is unit squares. The pentaflake takes two tiles rather than
  one: regular pentagons famously do not tile the plane (which is why that board
  has gnomon-shaped holes), but pentagons *and* 36° rhombs do. Three pentagons
  round a point leave 36°, the rhomb's sharp corner, and two leave 144°, its
  blunt one; counting corners over those two vertex figures fixes the ratio at
  two pentagons to one rhomb, and a torus exact-cover search finds that cell.

  Three of the **aperiodic** and **spiral** boards are the same story: the phyllotactic
  hexagon is a *parallelohexagon*, so it tiles
  by translation alone (the spiral is in how the board's wedges are offset, not
  in the tile), and Penrose's two rhombs make a plain periodic tiling as
  alternating courses of fat and thin diamonds — the interfaces line up because
  a fat course shifts by cos 72° and a mirrored thin one by −cos 36°, which sum
  to exactly −½, so four courses come back a whole edge. Ammann–Beenker's
  square and 45° rhomb are laid the same way, a course of squares between a
  rhomb course and its mirror, whose shifts of ±cos 45° cancel outright. The brick rings are
  the easiest of the lot: their tile is a plain 2:1 brick, which tiles the plane
  as any wall does, so they take the **running bond** (`BRICK_PATTERN`) — a
  tiling this module already draws from `archTemplate`. What has no period on
  that board is the nesting, and no page that repeats can draw a centre.

  The **Spectre** is the one board whose page is a relative rather than its own
  tile. Tile(1,1) has no periodic cell of its own small enough to use — an
  exhaustive torus exact-cover search over the lattices in ℤ[ζ12] that could
  carry a two-tile cell finds none — and letting other figures in, as the
  pentaflake does, is not enough either. One Spectre with a square, a 30° rhomb
  and a 60° rhomb *does* tile the plane, and the search finds that cell; but its
  lattice contains **no orthogonal pair at all**, so there is no rectangle
  anywhere in it, and a CSS background tiles a rectangle. Nor does any other: no
  cell of one or two Spectres with up to four triangles, squares or 30°/60°
  rhombs has a rectangular sublattice. So it takes the **deltoidal
  trihexagonal** tiling instead — the hat continuum, of which Tile(1,1) is the
  equilateral member, is drawn as polykites on exactly that, eight kites to a
  hat.

  A tiling whose lattice is not rectangular — the phyllotactic
  one is a rhombus at 36° — goes through `latticeDomain`, which finds the
  smallest rectangle *inside* the lattice and fills it with the cosets between.
- **A solid takes the flat tiling its faces come from.** The Platonic solids
  and the frames take the flat grid they are folded out of (a cube and the
  stepped bipyramid are squares, a tetrahedron triangles); each **Catalan**
  solid takes the Laves tiling of the same Conway operation — the plane's own
  face-transitive duals, so a rhombic solid really does sit on a tiling of
  rhombi and a disdyakis one on a barycentric subdivision (`join` → rhombille,
  `ortho` → deltoidal trihexagonal, `meta` → kisrhombille, `gyro` → the
  pentagonal Laves dual of the matching snub, `kis` → whichever of the plane's
  two kis tilings raises its pyramids on the same kind of face), and each
  **Archimedean** solid the uniform tiling dual to its Catalan partner's (the
  cuboctahedron trihexagonal, the snub cube the snub square). That leaves
  circles for the sphere family alone, whose faces close up only because the
  surface curves.
- **Traps.** Every placed point is snapped to a tenth of a pixel *before*
  de-duplication and with a tie-break epsilon: a shared edge is computed twice
  by two routes through the lattice, and without that the two copies disagree in
  the last bits, both survive, and the line is stroked twice — plainly darker at
  7% alpha. The same snapping is what makes a tile seam-free, since a whole-tile
  shift is a whole number of grid steps. Hand-written tiles keep a vertex at
  every lattice step (the chair's two collinear ones are load-bearing) or
  neighbours disagree about where an edge ends. And a hole cannot be drawn with
  outlines — the cells around it draw its boundary either way — so the carpet
  washes its holes in faintly, which is the only thing that stops its page being
  a plain square grid.
- **Screenshots cannot see it.** A 7%-alpha hairline moves a pixel by about
  0.05, under Playwright's default per-pixel `threshold` of 0.2, so every
  gallery baseline keeps passing whether the pattern renders or not — and
  `--update-snapshots` will not rewrite a baseline that passes. The e2e
  assertions read `--bg-pattern` instead; `tests/unit/backgroundPattern.test.ts`
  pins the geometry (every mode classified, tiles seamless under a one-tile
  shift, no line drawn twice). To *look* at one, raise the alpha — replace
  `stroke-opacity` in the layer — or it will not survive review at all.
- **The ink follows the colour scheme, and the memo key has to follow it too.**
  `INKS` in `backgroundPattern.ts` holds one colour and alpha per scheme, baked
  into the data URI — a `background-image` is its own document, so `currentColor`
  means nothing inside it. The dark entry is not the light one turned up: a
  hairline works by moving the page toward its opposite, so `#4a5568` at 7% over
  `#101014` shifts a pixel by about four values in 255 — it renders, it costs the
  same, and it is invisible. Hence a *lighter* ink than the page, at its own
  alpha, and hence the scheme in the `CACHE` key: keyed on geometry alone, the
  first scheme to open a tiling hands its tile to the second and one of the two
  gets a hairline the colour of its own page.
- **The pentaflake is a compromise.** Regular pentagons do not tile the plane —
  that is exactly why that board is a fractal with gnomon-shaped holes — so its
  page is the Cairo pentagonal tiling, the pentagon tiling that does.
- **A theme may repaint the menu icons, and two do.** `Theme.icons` carries an
  `IconTint` (how vivid the shape-derived colours are drawn, and at what
  lightness) and a `plain` ramp for the non-tile art. Sand takes
  `QUIET_ICON_TINT` — one lightness for every hue so a red row and a green row
  weigh the same in a list, at about 60% of the chroma to hand. Classic takes
  `GREY_ICON_TINT`, which is the same lightness at **no chroma at all**: its
  board is grey at every cut, so a row of coloured glyphs above it announces that
  the chrome and the board were designed separately, and a row is read by its
  drawing (a patch of the real tiling) rather than by its hue. The two also
  differ in `plain`: Sand's sage against Classic's ink, since that ramp is
  hairlines and frames rather than anything a board is picked by. The *hue* is
  never overridden by either — Sand's rows keep the thread tying them to the
  board they open, and Classic's have no hue left to keep.
- **Every theme is patterned**, so a theme has nothing to say about it — see
  "The page follows the board's tiling" above. The settings swatches call
  `themeVars` with the texture and no pattern, so they show the theme rather
  than whatever board was last open; keep it that way. Their *tiles* are the
  other half: the `--tile-*` custom properties a theme's `[data-theme]` block in
  `styles.css` declares, worn by whichever `[data-shape]` rule the swatch
  carries — the same two-halves composition the real board gets, done in CSS.
  On the settings page itself the three appearance rows each wear a different
  cut of it, so they say which axis they open: Theme the whole miniature,
  Board shape a close-up of two by two tiles (`themeSwatch`'s `closeUp`), and
  Colour scheme the look under both schemes split on the diagonal
  (`schemeSwatch`). The picker pages keep the whole miniature on every row.

**The v2 → v3 → v4 → v5 migrations.** Until v3, `theme` named a chrome palette and
`cellStyle` sat beside it as a second setting. `migrate` in `settings.ts` reads
the **pair** — not each field on its own — because only the pair says what look a
player had chosen: a palette a v3 theme is named after (`classic`, `dark`) wins
outright, and otherwise the old cell style is the better evidence, so someone on
`ios` + `gloss` lands on Realistic rather than being flattened to Light with
everyone else. The stale `cellStyle` key is deliberately left in the record —
`saveSettings` carries unknown keys over anyway, and a downgrade to a v2 build
should find its setting intact.

v4 splits that theme in two: `theme` keeps the look and the new `scheme` takes
the colour. Light and Dark were one look on two palettes, so both become Flat.
The scheme is deliberately **not** carried over — the key is simply absent, so a
v3 record takes whatever the current default is.

v5 splits it again along the other seam: `theme` keeps the palette and the board's
colours, and the new `shape` takes the cut (`V4_THEMES`, one `[theme, shape]`
pair per v4 key). Here the pair **is** carried over, because every v4 look is
still reachable and nobody's board should change under them. What v5 does *not*
touch is a stored `scheme`, though the default had moved to `light`: every v4
record carries one, so there is no telling "chose auto" from "never chose", and
switching a player on a dark device to a light page is the worse mistake. The new
default reached new records only, and the same goes for its move back to `auto`:
a stored `light` may have been chosen, so it stays.

Two things about the run of branches. They run in **series**, not as
alternatives: a v1 record passes through all of them, so each may only speak the
vocabulary of the version it upgrades *to*. And that is why v2 falls back to a
written-out `V3_DEFAULT = "light"` and v3 to `V4_DEFAULT = "realistic"` rather
than to `DEFAULT_THEME` — letting either drift with the current default would
silently re-aim every record that passes through it.

**The board's finish: glossy tiles and 3D pins.** Two switches under Appearance,
beside Custom backgrounds, and the same kind of thing — what the board is made
of rather than what the game does.

Both were the **Realistic theme's alone** and welded to its cell style, back
when a theme was a cut as well as a palette: the glass finish could not be had
without that theme's page, and its pins could not be had on any other theme at
all. They are one number and one flag deep in `render/cellStyle.ts`, neither
changes a cell's vertex layout, and the argument for each is independent of the
argument for a textured page — so each is a setting that overrides whatever the
composed style says, either way.

- **Glossy tiles** is on by default, so the board ships polished. What it covers
  is the polished *reading*, both halves of it: the specular finish a solid
  catches a sweeping highlight with, and the bright-centre-to-dark-rim gradient
  that is the only thing saying "polished" on a flat board lit head-on. Turning
  it off mattes the material and falls the closed cells back to the style's own
  `openShade` — which is not an invented number but the matte reading that cut
  already declares ("glass beads closed, matte pans opened"), so the tile keeps
  its relief and its edges and loses only the hotspot. Turning it *on* lends the
  dome's finish to a cut that declares no gradient (Classic, Flat) and leaves
  alone one that does: Sand's is tuned a hair off Bright's on purpose, and
  answering a switch is not an excuse to retune a theme.
- **3D flag pins** is on by default, and applies to every look rather than to the
  domed cut alone — a board you can turn is exactly the case a billboard fails at
  (see "3D markers" in [`render.md`](render.md)), and that argument never had
  anything to do with which page the board sits on. A flat board still never
  takes them, whatever the switch says.

`finishStyle(style, finish)` in `cellStyle.ts` is the whole of it, and what it
deliberately does **not** touch is the style's colour — `openAlpha`, `unlit`,
`albedo`, `boardTint`, `monochrome` — because that half is the theme's. Turning
the gloss off is not meant to make a glass board opaque or the Classic theme's
coloured. Like a cell style and unlike the sound preset, both are cut into the mesh
(`GameSession` takes a `finish` beside the style), so both land on the next
board and the rows say so.

**Extra board controls.** Whether the row under the header carries every
symmetry a board has, or only the two the Klein bottle cannot be played without.
Under Behaviour, and **off** by default.

A board with everything shows eight buttons, and for most players that is a row
of chrome on every screen for a feature they never reach for. What makes the
setting safe is that the controls are the only way to reach a hidden cell on
exactly two surfaces: the Klein bottle's neck passes through its own belly, and
Boy's surface folds its three lobes over its own funnel, and no amount of
turning either board brings those cells out. Everywhere else a control is
a second look at a puzzle already fully on screen — a donut's inner wall is
glimpsed through the hole, a flat board's quarter turn shows the same patch
sideways.

So the exception is declared rather than coded: a slot in
`data/ui/screens.json` lists the conditions that keep it — the two ring slots
**`keepWhen: ["surface:klein", "surface:boy"]`**, the two tube slots
**`["surface:boy"]`** (the Klein bottle's tube step is not kept; its ring roll is
what reaches the neck, while on Boy's surface no single motion of the
projective plane reaches every lobe, so it keeps both of its quarter turns).
`boardConditions` adds a `surface:<key>` condition beside the symmetry ones, and
`slotKept` (the mirror of `slotVisible`, with the opposite default — no
condition means *not* kept, and any one listed is enough) is what
`BoardInfo.setBoard` ands in when the setting is off. A whitelist,
so a control added later is quiet until someone says otherwise.

The second exception is not a symmetry at all: a hyperbolic board's **pan
arrows** (`pan-left` / `pan-right` / `pan-up` / `pan-down`, both
`visibleWhen` `"disc"` and `keepWhen` `["disc"]`, a condition `boardConditions` adds for a
board drawn in the Poincaré disc). A drag is how a hyperbolic board's rim cells
are reached at all, and nothing else on screen says that a flat board can be
dragged, so they show whatever the setting — first in the row, before the turn
and mirror controls when those are on. Each press is one step of the same pan a
drag makes (`pan:<dx>:<dy>` → `App.nudge`, `KEY_PAN_STEP` through the centre),
glided over `NUDGE_MS` so it reads as the board being dragged, and landing at
once with motion off.

Two things it is **not**. It never adds a control — a board still has to have
the symmetry — and it takes no motion away: the wheel, `[` / `]`, `,` / `.` and
`;` / `'` drive the same permutations either way. It is chrome.

**Sound.** What the game sounds like — a preset key or `"off"` — under the
Behaviour heading, with its own picker page (see [`audio.md`](audio.md)). Unlike a theme's
cells it needs no new board: every event reads the preset when it plays, so a
change is audible on the very next click. The picker page also carries
**Volume**, a 0..1 level stored beside the preset and starting at half: it is a
level rather than a character, so turning it down keeps the preset, and it is
left off the page entirely under `off`, where there is nothing to set. It sits
in the *same* list as the presets — `.menu-body` is a gapless flex column, so a
second `<ul>` would butt straight against the first. The settings row above
reports both ("Chime · 60%").

**Hold to flag.** How long a press has to be held on a touch screen before it
plants a flag — a slider under Behaviour, `src/input/hold.ts` for the range
(100–500 ms, step 50) and the default. It **is** a setting because the right
number is a fact about the hand rather than about the game: a player who flags a
lot wants the flag the moment they commit, and one who drags and rotates a lot
wants room to start a gesture before the press turns into something else. The
shipped default is 300 ms, down from the 450 ms it was fixed at — the time is
*held*, so it is dead time, and it is spent on every flag of every board. The
bottom of the range is a hair-trigger on purpose: a deliberate tap on a phone
runs to about that long, so at 100 ms the two gestures very nearly meet and an
unhurried tap flags rather than opens — a real way to play a board you are
mostly flagging.

Four things about it:

- **It is read at every press**, not captured when the controls are attached
  (which happens once, for the life of the app): `ControlHandlers.holdMs()` is a
  live query like `rotates()` and `pans()`, so a change on the settings page
  reaches the board already in play, exactly as the sound preset does.
- **It is the second `.settings-volume` row**, and for the same reason the first
  one is a slider: it is a level rather than a choice, so a list of named speeds
  would be a list of guesses about the player's hand. Like the volume it does
  **not** re-render its page — the value is being dragged — so the label updated
  in place is the whole feedback, and `Menu.settingsPageHost` leaves `page()` off
  both setters.
- **The row is conditional**, on the same principle as Haptics: `controls.ts`
  arms the hold for a touch or a pen and never for a mouse, which flags by
  right-click, so `longPressSupported()` (a touch point, or a coarse pointer)
  hides the slider on a machine that could never use it.
- **It is also how long the flag takes to land.** A held flag is the one the
  player cannot see (their finger is over the cell), so it drops in from outside
  the fingertip — and a drop that outlasts the press it answers reads as lag, so
  `GameSession.flag` passes the hold straight through to `dropFlag`, and
  `CellAnimations.startDrop` takes the length as an argument rather than owning a
  constant. `DROP_HOLD` stays a *share* of it, so every point on the slider gets
  the same shape of landing; the whole gesture is over in twice the setting.

**The header's flag blinks red when a flag is planted.** The gesture has a blind
spot by construction — the finger doing the holding is on top of the very cell
the flag will land on — so the confirmation has to be somewhere else on screen,
and the header's own flag is where the player is already looking for flag state.

- **It marks the landing, not the countdown.** `GameSession.flag` returns whether
  a flag was *planted* (the toggle's other half clears one), and `App` blinks on
  that — so every way of planting one blinks, clearing one never does, and the
  win's own auto-flagging does not either, since it does not go through a player
  move.
- **`Hud.flashFlag()` is a one-shot, not a `HudState` field.** It marks a moment
  rather than a condition, and `setState` re-renders on every clock tick, so a
  moment kept in that record would be re-fired by a tick or need clearing by one.
  The class is removed on `animationend`, and taken off and put back with a
  reflow between, so two flags in quick succession blink twice.
- **The red is a layer, not an animated `background`.** The button's resting
  background is one of two things (`--panel`, or `--selected` in flag mode) and a
  keyframe can only name one, so ending on the wrong one snaps at the last frame.
  `.hud-btn.flag-flash::after` fades a `--danger` overlay out instead, which
  composes with either — and with `:active`. The icon carries a `z-index` so it
  stays on top of it: a pseudo-element paints after its siblings.

`tests/e2e/holdToFlag.spec.ts` pins all of it. Note the pattern for catching the
class: it comes off again after ~420 ms, so the spec arms a `MutationObserver`
before the move rather than polling for it.

**Haptics.** A plain boolean, and the one row that is **conditional**:
`hapticsSupported()` (`src/haptics.ts`) offers it only where something can
actually buzz — the native iOS shell, or a *mobile* browser with
`navigator.vibrate`, which in practice means Android. A desktop browser defines
`navigator.vibrate` with no hardware behind it, and iOS Safari implements no web
haptic at all, so neither gets a switch; `haptic()` is gated on the same check,
so a `haptics: true` carried in from a phone is inert rather than driving a
mechanism that does nothing.

**No outward links.** The About block reports what the build *is* (its version,
and whether a newer one is waiting) and nothing more — a settings page that
sends the player to another site is not part of playing the game. The page's
one anchor is the same-origin **Privacy policy** link at the end of the Privacy
note, which opens `/privacy` (`public/privacy.html`) in a new tab. It exists
only in builds with the Privacy section, so packaged apps never hand a URL to
the system browser. `tests/e2e/settings.spec.ts` asserts that this link is the
only anchor on the page.

**Analytics.** Whether anonymous play counts are reported — see "Analytics"
above. Its own **Privacy** heading rather than a fourth Behaviour row: sound,
haptics and animations are what the game *does*, and this is what leaves the
machine, which someone who came looking for it should be able to find by
heading. Present only in a build that carries the counter at all — the same
principle as the Haptics row needing a device that can buzz, and the "Check for
updates" row needing a deployed build to check against.

**Persistence.** `src/settings.ts` is the app's only stored state: theme, board
shape, colour scheme, difficulty, the animations override, haptics, the hold-to-flag duration,
the page pattern, the board's two finish switches, the extra-controls switch,
the analytics flag, and the sound preset with its volume. Flag mode, zoom, the
menu page you are on and the board in progress stay in memory as before.

The layout is **one stable `localStorage` key holding a record that carries its
own `version`** — deliberately not a versioned key name (`…:v1`, `…:v2`), which
silently resets every user on a schema change because the new build reads a key
nobody has written. `migrate()` upgrades an old record; `LEGACY_KEYS` still picks
up records written under the old key-per-version scheme, and the old key is
removed only *after* the new one is written, so an interrupted migration cannot
lose it. Four rules the tests pin:

- Reading is **total and field-by-field** — one bad field costs the user that
  field, not the record. Corrupt JSON, an array, a removed theme, a removed
  difficulty and a storage that throws all degrade to defaults.
- A record from a **newer** build is read for what it understands, and writing
  **preserves the keys it does not recognise**, so an older tab or a rolled-back
  deploy does not throw away newer preferences.
- Storage may be absent entirely (node under vitest) or throw on write (Safari
  private mode, quota); a refused write is dropped and the choice still applies
  for the session.
- `subscribeSettings` mirrors changes made in another tab (a `storage` event,
  including `localStorage.clear()`), which `App.adoptSettings` applies.

Bump `SCHEMA_VERSION` only when a field changes *meaning*; purely additive
fields need no bump, since an old record simply lacks them.

**Version.** `__APP_VERSION__` / `__APP_COMMIT__` are Vite `define` constants
(see `vite.config.ts`, declared in `src/vite-env.d.ts`). The version tracks
`package.json`, which `bump-version.yml` keeps in lockstep with
`pyproject.toml` on every push to master.

### The app icon (`src/appIcon.ts`)

Settings › Appearance › **App icon** picks which icon this copy of the game
wears — a pentagon (the default), a hexagon or an octagon cell, each in the
colour Sand paints that shape — so the App Store app and the web app on one
Home Screen can be told apart. `APP_ICONS` is the one list: the picker page
(`renderAppIconPicker`), the icon generator (`scripts/make-icons.mts`) and the
iOS project's alternate icons all follow it, and `tests/unit/appIcon.test.ts`
checks the last two against it.

The row is conditional, like Haptics: it is offered only where a pick changes
something (`appIconSupported`).

- **The iOS app** switches the Home Screen icon with `setAlternateIconName`,
  through `ios/App/App/AppIconPlugin.swift`, and iOS confirms the change with
  its own alert. The OS, not the stored setting, is the record of which icon is
  on: the shell reports it before the page runs (`window.hypersweeperAppIcon`),
  and `App` takes that over the stored value. A switch the OS refuses leaves
  the setting where it was. The Mac app has no row, since Catalyst cannot
  switch icons.
- **A browser tab** points `<link rel="icon">` and `<link
  rel="apple-touch-icon">` at the chosen icon, at startup and on every change.
  Safari's Add to Home Screen copies the touch icon when the icon is added, so
  the choice is made *before* adding, and the page's footer says so. An
  installed (standalone) web app has no row, because the icon it was added with
  never changes.
- **The Electron app** has no row: the dock icon could be swapped at runtime,
  but Finder would go on showing the pentagon.

### Check for updates (`src/update.ts`)

The About block's update row, and the one part of the settings page that is a
question about the *world* rather than about a stored preference.

It used to ask the service worker: `registration.update()`, then
`registration.installing ?? registration.waiting` — anything there means a new
build is on its way, nothing there means you are on the latest. Both halves of
that are wrong, because `registerType: "autoUpdate"` gives the generated worker
`skipWaiting()` and `clientsClaim()`, so a new build passes through installing
and waiting on its own and never pauses in either. Worse, the worker checks for
itself on **every launch** (`registerSW.js` registers, and registering updates),
so the ordinary sequence is: a build is deployed, the player opens the app, the
worker quietly fetches and activates the new build while the page that just
loaded is still the old one — and a check made now finds nothing installing and
says **"You are on the latest build"** to a player looking at the previous
version. Close the app, reopen it, and there is the new version. That was the
bug, and it reproduces in desktop Chromium in about forty seconds: install a
build, deploy another, reload, check.

So the check does not ask the worker. Every non-packaged build emits a
`version.json` naming itself — version *and* short commit, since a PR preview
publishes many builds under one version number — and `checkForUpdate` fetches it
and compares it with the constants compiled into the running bundle. That is a
fact about the server rather than the state of a cache's state machine, and it
is true whatever the worker is doing. Three points of care:

- **The stamp must come from the network.** The fetch carries `cache:
  "no-store"` and a `?t=` cache-buster; the query is what keeps it off the
  precache, since Workbox matches a precached URL exactly (bar the `utm_` /
  `fbclid` parameters it is told to ignore), so an unrecognised parameter misses
  every route and falls through. Belt and braces, `globIgnores` keeps
  `version.json` out of the precache manifest altogether: a stamp served from
  the worker's own cache could only ever name the build that installed the
  worker, and the check would confirm this build to itself for ever.
- **A failed fetch is not "up to date".** Offline — which is every check an
  installed app makes with no signal — and a host with no stamp both come back
  "Could not check for updates.". A body that is not the shape we asked for is
  the same answer: `parseStamp` treats it as untrusted input, the way `link.ts`
  treats a share link.
- **Only then is the worker involved**, and only as machinery for *getting* the
  new build: `loadDeployedBuild` calls `update()` and waits for the incoming
  worker to reach `activated`, because only then has its precache replaced the
  old one and only then does a reload serve something new. It subscribes to
  `updatefound` *before* that call and keeps listening for `ARRIVAL_GRACE_MS`
  after it, rather than reading `installing`/`waiting` at the instant the
  promise resolves — the spec resolves it as the install *begins*, so an engine
  that sets the property a tick later would look exactly like the next case, and
  reloading there is the old mistake in the other direction. If there is no
  incoming worker the active one is already the newest this device has (the
  quiet-update case above) and the reload is enough on its own. If the install
  does not finish inside `SETTLE_TIMEOUT_MS`, or goes `redundant`, the row says
  the download is still running and the next launch will finish it — reloading
  into the same old build would teach the player nothing, which is where the
  old code's fixed 800 ms `setTimeout` also landed.

With no worker registered at all — a dev server, a PR preview, `VITE_NO_SW=1` —
there is no cache between the page and the server, so the reload *is* the
update. (That row therefore no longer reports "running from source": a preview
build can now genuinely tell you whether the push you are looking at is the
latest one, which on the URL a PR reuses across pushes is worth more.)

`tests/unit/update.test.ts` pins the comparison, the stamp parsing and every
branch of the settle-then-reload path against a hand-driven fake worker;
`tests/e2e/settings.spec.ts` pins the three outcomes the row can show, driving a
"deploy" by fulfilling the `version.json` request once with a newer stamp.

## Best times

Winning a board files the time with `src/leaderboard.ts`, which keeps the
**fastest three per board per difficulty** on the device; when the time places,
a window says so. The App Store app also keeps them in iCloud ("The record in
iCloud" below).

- **Its own key.** `ms:scores`, not the settings record. Best times are game
  history rather than a preference: they grow with every board played, while
  `ms:settings` is small on purpose so it can be rewritten on every change and
  mirrored across tabs on a `storage` event. Both records follow the same rules
  (one stable key holding a versioned record, total field-by-field reads,
  guarded writes) and share `src/storage.ts`.
- **Milliseconds rank, seconds show.** The HUD counter shows whole seconds, and
  so does every list — but entries store `ms`, so two wins the counter both read
  as `41` still order by which was actually faster. A time *equal* to a stored
  one ranks below it: you have to beat a record to take its place. That case is
  not exotic — on a small board a first click that floods the field wins in ~0 ms.
- **Nothing readable is ever deleted.** A board key this build does not know (a
  renamed mode, a board dropped from this deploy) is carried through every
  write, and a board whose entry list is corrupt costs that board's records
  rather than the whole leaderboard. Times are sorted on read, so a hand-edited
  file still lists sensibly.
- **A refused write still reports the rank.** Private mode and a full quota both
  throw on `setItem`; the player did just set that time, so the window says so
  and the record simply is not there next launch — the bargain `saveSettings`
  makes.
- **One win is one record.** `App.checkRecord` runs from `afterMove`, the funnel
  every move goes through, and `App.scored` gates it, so further clicks on a
  finished board (or the timer tick) cannot file it twice. A loss records
  nothing.

The window (`src/ui/scoreDialog.ts`) is one of the app's **two modals** — the
info window is the other, and everything else that looks like a page is a page,
the settings screen included. A record is a moment, it belongs over the board
just cleared, and it has to be dismissible back to it, so it is a real overlay
and carries the obligations — Escape, the backdrop click, the trapped Tab ring,
focus restored on close — which live in `src/ui/modal.ts` for both windows;
its colours are all theme custom properties. It waits
`RECORD_DIALOG_DELAY_MS` for the win wave to play, and opens straight away when
animations are off — which is also why e2e (run under emulated reduced motion)
sees it immediately. Leaving or restarting inside that gap cancels it.

It asks **one question** — this board again, or another — and its foot is that
question and nothing else. **Play again** re-deals the same board. **New board**
deals a random one from the pool this board came from — flat if it was flat,
hyperbolic if it was on the Hyperbolic page, otherwise a manifold, sphere or
polyhedron (`randomKindOf`) — through `src/modes/randomBoard.ts`, which is the
home page's Flat, 3D and Hyperbolic pools and
their fairness weighting, shared rather than re-derived. It is the same call as
the header's die (`App.startRandomBoard`), which is that move without having to
win first; both abandon the board in progress the way the smiley does, without
asking.

It offered four things, and two of them were not answers to that question.
**Menu** left outright: the × and Escape already go back to the cleared board,
and the header's back button goes home. **Share** became an icon in the card's
top-*left* corner, the mirror of the ×, which is what it is — chrome over the
card rather than a third choice in the row (`shareButton` in
`src/ui/scoreDialog.ts`). It is still the only place the app offers a board's
link, it still does not dismiss the card (the player is looking at the time they
just set), and a board built from an explicit mine layout (the test seam) has no
seed, so it gets no icon. What it lost by shedding its label is the one thing a
clipboard write cannot say for itself, so the glyph swaps for a tick or a cross
and `.dialog-share-note` — hung under the icon, out of the card's flow so
nothing shifts — spells it out for `SHARE_LABEL_MS`. A share *sheet* is its own
feedback and gets neither.

**Which button is highlighted is a fact about the board**, not a preference:
`App.dealtAtRandom`, set by `startGame` and passed to the card as `primary`. A
board the player picked out of the catalogue is one they came for, so playing it
again is the obvious next move; a board the game *dealt* them — the home page's
Flat, 3D and Hyperbolic rows, the header's die, this window's own New board — is
a step in a
wander, and the next step is another board. Focus lands on whichever it is, so
Enter takes the card's own answer. The flag **sticks to the board**: Play again
and the smiley pass it through, so replaying a dealt board does not turn it into
a chosen one — the highlight would otherwise move between two wins on the same
board. It reaches e2e through `MsState.dealtAtRandom`, since a dealt board is an
ordinary board once it is up and leaves no other trace; `startBoard` takes it
too, because the paths that really deal one pick the mode themselves and a test
that has to *win* a board needs to know what is under it.

The stylesheet still lays the row out by how many buttons there are
(`data-buttons`), but the count is now at most two: two side by side, and one
(the info window's Done, or a card with no New board to offer) full width.

The list lives under **Settings › Best times** (`src/ui/bestTimes.ts`), one more
`Menu` page like the theme picker, ordered by the catalog rather than by the
storage record. Boards are named with `fullModeLabel` — the menu can call a
wrapped tiling by its tiling alone because the surface is the page it was
reached through, but in one flat list "Triakis triangular" names two boards.
Clearing arms on the first tap and fires on the second, rather than calling
`window.confirm`, which an installed iOS web app renders as a URL-badged alert
that reads like a browser warning.

## Achievements

A win used to leave no trace unless the clock beat a record. The catalogue is
200+ boards across eleven tiling families, eight surfaces and six solid groups,
and nothing in the game said so. `src/achievements.ts` is the record of where a
player has been, and the list of where they have not.

- **The list is derived.** 42 achievements, and none of them typed out: the
  families come from `familyRows` over every surface, the surfaces from
  `SURFACE_SPECS`, the solid groups from `SOLID_GROUPS`, the difficulties from
  `data/ui/screens.json`. A tiling added tomorrow joins its family's
  achievement the way it joins the menu, the info window and the background
  pattern — with no edit here at all. Group membership is computed once at
  module load, from strings; **nothing in this feature builds a board**, which
  is what keeps the page instant.
- **One achievement per group, for winning all of it.** Each tiling family,
  surface and solid group used to earn a pair — win any one board, win them
  all — and a first win handed out its family, its surface and its first
  difficulty along with everything else. Those halves said nothing a player had
  not just done, and they doubled the list Game Center has to be told about,
  so they went: a group's one achievement is its completion, named plainly
  ("Cylinder", not "Cylinder complete"), and its id keeps the `-all:` form
  (`surface-all:cylinder`) so no stamp an older record holds can be mistaken
  for it. **Easy has no rung** for the same reason: a win on easy is the first
  win almost every player makes, and "First clear" already says so.
- **"Other" earns nothing.** It is the catch-all family for tilings that fit
  no named one, and not a name to award (`UNAWARDED_FAMILIES`). Its boards still
  count towards their surface and the whole catalogue.
- **One declared table, pinned by measurement.** `SHAPE_SIDES` — the side counts
  a board's tiles can have, `[3, 4, 5, 6, 7, 8, 10, 12, 13]` — is the exception,
  because deriving it means building all 200+ boards and running
  `classifyShapes`, about a second. `tests/unit/achievements.test.ts` does
  exactly that and fails if the list drifts, so a tiling with eleven-sided tiles
  cannot ship without a badge (the `soundHarmony.test.ts` pattern).
- **Blocked boards are left out of every completion target.** The five triakis
  boards cannot be played at all — their menu row opens `blockedExplanation`
  instead of a game (see "fairness" in `src/modes/fairness.ts`) — so a set
  containing one could never be finished. `blockedModes()` is the filter, the
  totals leave those five out, and the page says so in a line rather than
  leaving a silent gap.
- **The stored record is history; unlocking is a pure function of it.** Its own
  key `ms:achievements`, shaped like `leaderboard.ts` (version inside the
  record, total reads, a re-read before the write, unknown fields carried
  through). What is stored is what was won, plus the three facts about a win a
  mode string cannot carry: whether a flag was ever planted, the fastest time at
  each difficulty, and the side counts seen. Which achievements that earns is
  recomputed by `earned()` every time, so **an achievement added by a later
  build unlocks retroactively** from history already on the device. The stored
  `unlocked` map only remembers *when* — and `loadStored` stamps anything the
  record already earns on read, so the page can never show something as unlocked
  that a card is still going to announce.
- **It seeds itself from the best times.** `allBestTimes()` is already a
  complete list of every board and difficulty this device has won, so a player
  who has cleared eighty boards does not meet this feature at 0 / 200-odd. Run once,
  at record creation. It cannot recover flags or shapes and claims neither.
- **A win counts a board at any one difficulty.** The completion sets run to
  200+ boards; asking for all three each would triple that.
- **No speed milestone.** There was one — a hard board inside two minutes — and
  it was the only number in the feature somebody picked rather than derived.
  Best times already record speed properly, per board and per difficulty, so it
  was dropped rather than rationalised, and `Progress.fastest` went with it.
- **One trap in the win payload.** `Game.reveal` auto-flags every remaining mine
  on a win, so the flags on the board at the moment the achievements are counted
  say nothing about how the game was played. `GameSession.flagless` counts the
  player's own placements instead.

### What Game Center is told

The App Store builds will report these achievements to Game Center, which keeps
its own list, registered once in App Store Connect. Once an achievement is live
there its id and points are permanent and it cannot be deleted, and the game is
capped at 100 achievements and 1000 points (100 each). So each achievement
carries three more fields, all fixed functions of its stable id and its kind,
never of how many boards a group has today:

- **`gameCenterId(id)`** rewrites the app id: `hs.` in front, `:` to `.`, `-`
  to `_` (`tiling-all:2-uniform` is `hs.tiling_all.2_uniform`). The app id is
  already stable, so this is too.
- **`points`** come from `POINTS`, a table over kinds: first clear 5,
  difficulty rungs 10 / 15 (medium, hard), win tiers 10 / 20 / 40, no flags and
  against the odds 10 each, a shape 5, every board of a group 15, the whole
  catalogue 100. That is 625 today. A rule over group *size* would have been
  fairer to "Laves" and wrong the day a tiling joined it.
- **`brief` and `done`** are the pre-earned and earned descriptions. The page's
  hints quote group sizes ("Win all 33 of its boards"); these cannot, so a group's
  text names what its boards share ("Win every board tiled this way").

`GAME_CENTER_ACHIEVEMENTS` is the list in that shape. The unit tests check the
id characters, that the rewrite never merges two ids, both caps, that a group's
points do not depend on its size, and that no group text has a number in it.

`ios/GameCenter/achievements.json` is that list as App Store Connect is told
it, with a badge image per achievement beside it, regenerated by
`npm run gamecenter`. A unit test fails when the committed file falls behind
the code. See "Game Center" in [`../../ios/README.md`](../../ios/README.md).

### Where an unlock is said

**In the App Store app, Game Center says it.** There the shell registers a
native `GameCenter` plugin, and `gameCenterSupported()` (`src/gameCenter.ts`)
is true. `App.checkRecord` then passes the card no unlocks and opens it only
for a time that placed; at the beat the card would have opened, the unlocks
go to Game Center, which shows a banner for each, with the unlock sound and
buzz (`App.announceUnlocks`). Settings' Achievements row becomes a **Game
Center** row that opens Game Center's achievements page, so the game's own
page has no way in. How the record reaches Game Center is in "Game Center" in
[`../../ios/README.md`](../../ios/README.md); everything below is every other
build.

In the **record window**, which is why that window is no longer only about
records. The app has exactly two modals on purpose (`src/ui/modal.ts`), and an
unlock wants saying at the same instant a record does — a third overlay would
either stack on this one or queue behind it, and both read as the app talking
over itself. So `App.checkRecord` opens the card when the time placed **or**
something was unlocked, and `rank` is `number | null`: with no rank the title
becomes "Achievement unlocked" and the list of times is left out. The
`data-buttons` layout contract is untouched — no button was added (and the row
is down to two since, so there is less of it to break).

At most `MAX_UNLOCKS_SHOWN` (4) are listed. A first win usually earns three —
first board, its shape, and the flagless one, because a first click that floods
the field plants no flag — but a first win on medium or hard, on a board graded
harder than that, with two kinds of tile, earns six, and six rows push the
buttons off a phone's screen. The card scrolls, but a primary
action that has scrolled away is not an answer.

The list's **last row is always a link to the whole page**, saying "and N more"
when it truncated and "All achievements" when it did not. Always, because most
wins unlock one or two things and a link that only appeared past four would
almost never be there — and the card is where a player is thinking about
achievements, where Settings is somewhere they have to decide to go. It is a row
of the list rather than a button of its own: the row at the foot of the card is
two real choices about what to play next, and a way into a settings page is not
a third answer to that. It goes through
`Menu.openAchievements` (public for exactly this) and `App.showAchievements`,
and it is in the modal's `focusRing` so Tab reaches it.

### An unlock buzzes and speaks

Both channels, because the card alone is the easiest thing in the app to miss on
a phone.

The **haptic** is a new `HapticKind`: a *medium impact* natively — one firmer
tap, where a flag is a light one — and a short rising triple on the web. Not a
second `Success` notification, because it lands beside the win's own and the two
have to be distinguishable through a fingertip. `nativeHaptic`'s ternary chain
became a small table when the fourth kind arrived.

The **sound** is a new `SoundEvent`, and a preset block of exactly the same
shape as `win`, so `voicesFor`'s new case is the win flourish's code path with
different knobs rather than a second engine. Two things about it:

- **It is derived from the move, like everything else here.** The figure is one
  note per achievement unlocked, `clamp(count + 1, 2, preset.unlock.notes)`, so
  a single unlock is a two-note lift and a first win's three runs to the ceiling.
- **What separates it from the win flourish is the gesture, not the register.**
  The win is long and sweeps the whole stereo field, climbing from an octave
  below the root to a third above it; this is a short lift from the root,
  centred, with no sweep. (An earlier draft claimed the two sat in different
  registers. They do not — the win's range is the wider of the two.) They can
  sound *together*: with animations on the win figure has finished by the time
  the card opens, but under reduced motion the card opens at once. What makes
  that safe is the one-collection rule — both are grid degrees, so they are
  consonant however they land.

It is played from `App.showScoreDialog`, when the card arrives, not from
`countWin`: at the moment of counting, the win's own sound and buzz are playing,
and this is the card's voice.

The list itself lives at **Settings › Achievements** (`src/ui/achievements.ts`),
one more `Menu` page built like the best-times one, ordered by `ACHIEVEMENTS`
rather than by the storage record. Unlocked rows carry their date, locked ones
carry `have / need` where there is something to count — "0 / 1" on a yes/no
would be noise dressed up as progress. There is no empty state: a locked list is
the point of the page.

### The badges

Generated, like every other icon here. A shape badge is the regular polygon it
is about, drawn by `shape(ngon(...))` and so painted by the board palette's own
rule for that side count — the hexagon badge is the green a hexagonal board is
drawn in, and the two match with no table between them. A family, surface or
solid-group badge reuses that group's own menu icon key, which already draws a
patch of the real tiling or a mesh of the real immersion. What is left is the
hand-drawn symbols on the icon set's plain disc (`badge()` in `src/ui/icons.ts`:
star, flag, warning, and a three-bar difficulty ladder that fills one bar per
rung, drawing all three so a lone bar is not left saying nothing; and the
trophy) — there is no geometry in "win ten boards". The `badge()` symbols are
drawn `fill-rule="evenodd"`, because they have holes in them. The trophy is
not: its pieces overlap (handles into the bowl, collar onto the stem), and
under even-odd an overlap is a hole, so it is one nonzero fill with its
handles stroked. The three wins milestones (10, 50, 250) draw it in bronze,
silver and gold (`trophy:1` to `trophy:3`) — the one badge that leaves the
theme's palette, since a metal's rank is what its colour says.

## The record in iCloud

In the App Store app (iPhone, iPad and Mac) the best times, the achievement
record and the favourites are kept in step through iCloud, so a second device, or the same one
after the app is deleted and installed again, starts with everything the player
has won. `src/cloudRecord.ts` does it over a native plugin, `CloudRecord`
(`ios/App/App/CloudRecordPlugin.swift`), which hands the page iCloud's
key-value store; the website, the PWA, Android, the Electron Mac app and the App
Clip have no plugin, and nothing runs.

- **The local record stays the game's.** `leaderboard.ts` and `achievements.ts`
  read and write `localStorage` as before. A sync merges iCloud into them and
  them into iCloud: at launch, after every win, and whenever iCloud delivers
  another device's write. A win offline, or signed out of iCloud, is merged the
  next time.
- **Best times are a union** (the `scores` key): the fastest three of every
  device's times. Merging the same time twice changes nothing, so each device
  writes the whole merged list, and when two writes cross the device whose
  time was lost hears of the change, merges and writes it back.
- **Win counts are a sum**, so each device has its own key (`wins.<device>`)
  holding only what *it* won, and the record is the sum of all of them. A device
  knows what it has won since the last sync as the local record minus `base`,
  the total it last wrote (`ms:cloud` holds both, and the device id). A
  reinstall is a new device; the old key stays and keeps counting. Unlock dates
  merge to the earliest.
- **A clear is a date** (the `reset` key). Every other device still holds what
  was cleared and would merge it straight back, so clearing best times or
  achievements on one device records when, and from then on every device leaves
  out times set before it and device keys counting from before it. Clearing
  therefore clears everywhere.
- **Offline is the normal case, not an error.** iCloud's store is a cache on
  the device: offline, a sync reads and writes that cache, and the writes go up
  when the network returns (then the latest write per key wins, and the other
  devices merge it). A fresh install's writes are dropped by iOS until its
  first download from iCloud arrives, so it cannot overwrite the record with an
  empty one. Neither loses anything, because **no write is remembered as done**:
  each sync works out what iCloud lacks by comparing with what it holds, so a
  dropped or failed write is simply made again. iCloud's change event is not
  certain to come (a download that changed nothing sends none), so the app also
  syncs whenever it comes back to the foreground. One thing an offline device
  cannot tell is which of its wins came before a clear made elsewhere, so on
  hearing of one it clears every win it counted; its times carry their own
  dates, and those set after the clear stay.
- **Favourites go the same way** (the `favourites` key): each board's star and
  when it last changed, the later change winning board by board
  (`mergeStars`). Like best times that is idempotent, so the merged map is
  written whole; unlike a plain set union, an unstar made after a star wins
  rather than being merged straight back. A star or an unstar syncs at once.
- **Game Center hears about merged wins.** When a sync changes the achievement
  record, the whole record is sent to Game Center again, quietly
  (`catchUpGameCenter`).
- The merge is pure (`mergeRecords`) and played out between simulated devices in
  `tests/unit/cloudRecord.test.ts`, which also models each device's own cached
  copy of iCloud to play out being offline (catching up, crossed writes, a
  fresh install's dropped writes, a clear heard of late);
  `tests/e2e/cloudRecord.spec.ts` checks the round trip over Capacitor's real
  bridge, and that the game plays on with iCloud failing every call. iCloud itself needs a device: two
  devices signed in to one Apple ID, or one app deleted and reinstalled.

## The App Clip

The iPhone app carries an App Clip (`ios/App/AppClip`, see
[`../../ios/README.md`](../../ios/README.md)): a second native target running
this same bundle, which plays one board — the Goldberg polyhedron GP(3,0)
(`c180`), at the default difficulty — so someone can try the game from the App Store without
installing it. The page learns it is a clip from its shell, never from the
build: `ClipBridgeViewController` sets `window.hypersweeperClip` to the board's
mode before any script runs, and `src/appClip.ts` reads it (`clipBoard`, which
treats a mode this build does not have as no clip at all). `App.clip` is that
mode, and everything a clip does differently hangs off it:

- **It opens the board at boot**, in place of the menu and the share-link
  parsing, and nothing leads away from it. The header's back and random slots
  are built **vacant** (`Hud`'s `vacant` set, `.hud-vacant`): invisible,
  disabled and out of the Tab order, but still taking their space, because the
  two side clusters have to stay the same width for the smiley to sit on the
  screen's centre. A vacant slot moves to its cluster's inner end, so the flag
  and the ⓘ that are left sit in the two corners, mirroring each other. `onAction` refuses `menu` and `random` anyway, and the
  native Settings and How to Play commands are ignored, as are the menu bar's
  board and difficulty items (the clip registers no `MenuBar` plugin, so it
  has none to send).
- **It earns nothing and records nothing.** `countWin` returns before
  `recordWin`, and `checkRecord` skips `recordTime`, so a clip writes neither
  `ms:achievements` nor `ms:scores`; a clip's storage is wiped with it and would
  never reach the app it is a taste of, so a "best time" it showed would be one
  it never kept.
- **A win puts no card up.** With nothing recorded there is nothing for the
  card to say, so `checkRecord` never opens it in a clip; the smiley is the way
  to go again.
- **The win is when the full game is offered.** At the beat the card would
  have opened on (`RECORD_DIALOG_DELAY_MS`, or at once with animations off),
  `tellClip("won")` posts to the `hypersweeperClip` message handler and the
  native side puts up Apple's App Clip `SKOverlay`; the next board
  (`tellClip("started")` from `startGame`) takes it down.

One fix it needed applies everywhere: a board opened at boot used to be framed
before WKWebView had applied the header's safe-area padding, which fires no
resize, so the board's name was drawn up in the header row. A `ResizeObserver`
on the header now re-frames whenever its size changes.

`tests/unit/appClip.test.ts` and `tests/e2e/appClip.spec.ts` pin the page's
half, faking the native flag and message handler as `haptics.spec.ts` fakes the
Capacitor bridge; the overlay itself is Apple's and needs the Simulator or a
device to see.
