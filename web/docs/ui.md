# The UI: menu, settings, dialogs and the player's record

The app's pages, windows and stored state. For how cells are *drawn* see
[`render.md`](render.md); for what a board is made of see
[`boards.md`](boards.md).

## The menu

The menu is play-first, and deliberately **not** the pygame one: the home page
is Classic, Volumetric, Flat, 3D and Custom (`src/ui/menu.ts`). The first two
open one particular board straight away — the original square grid, and the
cube of cubes — and sit together above the two that deal a *random* one: the
flat picker's pool, and every flat manifold plus the spheres, polyhedra and
volumes. So no picker carries a Random row; Custom holds the old root (Flat,
Flat manifolds, Sphere, Platonic solids, Catalan solids, Polyhedra, Volumes).
A board reachable from the home page is still reachable through Custom — the
home row is a shortcut, not a move, which is how `square` has always worked.
In every tiling picker the three regular tilings are promoted to rows of their
own, leaving the Regular family holding the shaped boards alone under the label
**Shaped boards** (plane only). That shape is *derived* from
the shared port in the "web menu" section of `src/boards/catalog.ts`, so
`data/catalog.json` and the pygame menu are untouched;
`tests/unit/menu.test.ts` pins it.

The header's two buttons — the **?** at the left edge, the gear at the right —
open the how-to-play page and the settings page; see "Settings and themes"
below.

## Telling the player where they are

`src/ui/boardInfo.ts` owns the board's name and the row of controls under the
header.

The **name** (`fullModeLabel`) says which board it is. Nothing on the game
screen did before, and the menu's Flat and 3D rows each open a *random* board —
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
the tiling comes from (Uniform, Laves, Isogonal, Congruent rectangles, Aperiodic,
Fractals, or the solid group), the surface it is wrapped on, how many cells there
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
- **A wrapped board is named off the flat tiling, not off its drawn cells.** The
  immersion bends every tile — a hexagonal torus measures 0.80 regular — so
  naming from the geometry would call the hexagonal tiling irregular. The tiles
  come from the tiling's own periodic domain instead
  (`templateCells(archTemplate(key), 0, 0)`, no board built), matched by side
  count, which is exactly what `classifyShapes` gives a curved board one class
  of. The three regular tilings need no template.
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
(`Menu.showThemePicker`, `Menu.showSchemePicker`): settings shows a Theme row and
a Colour scheme row naming the current values, and the pickers live one level
down, which keeps the settings page short enough to read at a glance. Two pages
rather than one list of every combination — the axes are independent, so a single
picker would be nine rows that all have to be read to find the two facts they
encode.

**Themes and the colour scheme.** The look is **two** settings, on two axes that
have nothing to say to each other:

- a **theme** — how the board's cells are cut, what the page behind them is made
  of, and (on Realistic) whether a flag and a mine are billboards or real models
  (see "3D markers" in [`render.md`](render.md)). Three of them: **Realistic** (the default), **Flat**,
  **Classic**, one per entry in `render/cellStyle.ts`.
- a **colour scheme** — which palette the chrome paints with. **Auto** (the
  default; the device's own `prefers-color-scheme`), **Light**, **Dark**.

They were one setting until v4, and the four themes it offered — Light, Dark,
Classic, Realistic — were the two axes tangled. Light and Dark were the *same*
look (both cut with the `flat` style, neither textured) on two palettes, while
Classic and Realistic were two looks with no dark form at all; so the glass tiles
on a dark page were unreachable, and nothing in the app knew what the device
preferred. Split, every combination exists.

Both lists are declared in `src/ui/theme.ts`, not in `data/ui/screens.json`. The
distinction matters:

- The eight **palettes** are still shared config (`data/ui/screens.json` under
  `themes`; six ported from the pygame `THEMES` registry in `minesweeper/gui.py`,
  `dark` and `classicDark` web-only), and `tests/test_theme_sync.py` still fails
  if one is retuned without the JSON following. A theme *composes* palettes, two
  at a time — `Theme.palette` is a `{light, dark}` pair — and never adds a colour
  to one. The two web-only entries are exactly the dark halves the pygame presets
  could never supply: `ios`/`dark` and `classic`/`classicDark`.
- The **lists** are web-only because pygame has neither cell styles, page
  textures nor a dark mode, so its six presets could never be these axes. That is
  the same split the menu already has (`catalog.ts`'s web-menu section).

`applyTheme(theme, schemePref, mode?)` writes the whole set of CSS custom
properties onto `document.documentElement` — the `:root` block in `styles.css` is
only the *boot* default (Realistic on light) and must stay in step with it, as
must the `prefers-color-scheme: dark` block beside it. Things worth knowing:

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
- **The board is themed only as far as a cell style says.** The shape colour code
  (`shapePalette.ts`) still owns the hues, and exactly one style switches it off:
  `classic`, whose `monochrome` flag draws the board in its plain grays. No theme
  reaches into `shapePalette.ts` or `glyphAtlas.ts` for a colour.
- **The gallery is shot in Flat on light, not in the default.** Realistic's page
  is full-frame turbulence, which no PNG compresses: pointing the `board-*.png`
  set at the default took the baselines from 30 KB each to 650 KB, 21 MB over the
  gallery, in a repo whose whole history is 17 MB. `BASE_LOOK` in
  `gallery.spec.ts` pins the quiet page instead — which is also the one a
  *geometry* regression, what those shots are for, shows up against most
  clearly — and the five `LOOKS` shots cover the rest of the product.
- **A theme's board half lands on the next board; a scheme lands whole.** A cell
  style fixes the mesh's vertex layout, so nothing is re-cut in flight and the
  theme picker's footer says so. A scheme needs no new mesh, so it applies to the
  board already in play — which is why the scheme page carries no footer.
- **An unknown theme key falls back to Realistic** through `resolveTheme`, which
  uses `Object.hasOwn` for the same reason `link.ts` does; `light` and `dark`
  are *aliases* onto Flat rather than strangers, since both cut their cells that
  way. `resolveScheme` is the same shape and falls back to `auto`. Those are also
  the safety net under the v3→v4 migration below.
- **The WebGL canvas is transparent** (`alpha: true`, clear alpha 0), so the
  field around the board is the *page* background. That is what makes the glass
  theme's gradient show and means a theme needs no renderer call at all. Do not
  reintroduce an opaque clear colour — it would cover the CSS background.
- Any new chrome colour must be a `var(--…)` from `themeVars`. A hard-coded dark
  stroke is the classic dark-theme bug (the header icons in `hud.ts` stroke in
  `currentColor` for this reason; the flag keeps fixed colours because it is the
  game's own glyph, not a control).

`tests/test_theme_sync.py` (Python) fails if a pygame palette is retuned without
the JSON following.

### The page follows the board's tiling

Realistic's page is not one texture: behind the grain it carries **the board's
own tiling**, drawn very small and very faint (`src/ui/backgroundPattern.ts`).
Open `torustrihex` and the paper behind it is trihexagonal; open `kleincairo`
and it is Cairo pentagons. On Realistic the opened cells are translucent, so
that page is what shows *through* the board as well as around it.

It is **opt-in**: Settings › Appearance › **Custom backgrounds**, off by
default. The row sits beside Theme rather than under Behaviour (this is what the
page is made of, not what the game does) and is shown whatever theme is active,
with the hint saying that only Realistic has a pattern to draw — better than a
row that appears and disappears with the theme.

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
  in `boards/catalog.ts` is the inverse of `modeFor` — not a prefix strip, since
  `torustri`, `torustriakis` and `torustrihex` are three tilings on one surface.
- **The pattern is the board's tile, laid down periodically.** A board's own
  patch may be aperiodic, fractal or wrapped round a solid, but what the page
  wants is the *tile* — and nearly every tile in the catalogue tiles the plane
  periodically by itself. The 27 `ARCH_TILINGS` come from `archTemplate`, whose
  fundamental domain *is* a seamless repeat tile; the three regular tilings have
  no template, so their domains are written out in this module. The five
  **fractal** boards do not repeat, but their tiles do — the Gosper island is
  plain hexagons, two sphinxes or two chairs fill a parallelogram, and the
  Sierpinski carpet is unit squares. The pentaflake takes two tiles rather than
  one: regular pentagons famously do not tile the plane (which is why that board
  has gnomon-shaped holes), but pentagons *and* 36° rhombs do. Three pentagons
  round a point leave 36°, the rhomb's sharp corner, and two leave 144°, its
  blunt one; counting corners over those two vertex figures fixes the ratio at
  two pentagons to one rhomb, and a torus exact-cover search finds that cell.

  Three of the four **aperiodic** boards are the same story: the phyllotactic
  hexagon is a *parallelohexagon*, so it tiles
  by translation alone (the spiral is in how the board's wedges are offset, not
  in the tile), and Penrose's two rhombs make a plain periodic tiling as
  alternating courses of fat and thin diamonds — the interfaces line up because
  a fat course shifts by cos 72° and a mirrored thin one by −cos 36°, which sum
  to exactly −½, so four courses come back a whole edge. The brick rings are
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
  two kis tilings raises its pyramids on the same kind of face). That leaves
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
  Realistic baseline keeps passing whether the pattern renders or not — and
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
- **Only Realistic is patterned** (`Theme.patterned`). The settings swatches
  call `themeVars` with the texture and no pattern, so they show the theme
  rather than whatever board was last open; keep it that way.

**The v2 → v3 → v4 migrations.** Until v3, `theme` named a chrome palette and
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
The scheme is deliberately **not** carried over — the key is simply absent, and an
absent key is `auto` — so everyone comes out following their device, which is the
new default and what most people would have chosen had it existed.

Two things about the pair of branches. They run in **series**, not as
alternatives: a v1 record passes through both, so each may only speak the
vocabulary of the version it upgrades *to*. And that is why the v2 branch falls
back to a written-out `V3_DEFAULT = "light"` rather than to `DEFAULT_THEME` —
letting it drift with the current default would silently re-aim every v2 record,
sending a `glass` player to Realistic instead of through Light to Flat.

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
sends the player to another site is not part of playing the game.
`tests/e2e/settings.spec.ts` asserts the page holds no anchors at all.

**Analytics.** Whether anonymous play counts are reported — see "Analytics"
above. Its own **Privacy** heading rather than a fourth Behaviour row: sound,
haptics and animations are what the game *does*, and this is what leaves the
machine, which someone who came looking for it should be able to find by
heading. Present only in a build that carries the counter at all — the same
principle as the Haptics row needing a device that can buzz, and the "Check for
updates" row needing a deployed build to check against.

**Persistence.** `src/settings.ts` is the app's only stored state: theme, colour
scheme, difficulty, the animations override, haptics, the hold-to-flag duration,
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
a window says so.

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
deals a random one from the half of the catalogue this board came from — flat if
it was flat, otherwise a manifold, sphere or polyhedron — through
`src/boards/randomBoard.ts`, which is the home page's Flat and 3D pools and
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
Flat and 3D rows, the header's die, this window's own New board — is a step in a
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
179 boards across seven tiling families, five surfaces and four solid groups,
and nothing in the game said so. `src/achievements.ts` is the record of where a
player has been, and the list of where they have not.

- **The list is derived.** 50 achievements, and none of them typed out: the
  families come from `familyRows` over every surface, the surfaces from
  `SURFACE_SPECS`, the solid groups from `SOLID_GROUPS`, the difficulties from
  `data/ui/screens.json`. A tiling added tomorrow joins its family's two
  achievements the way it joins the menu, the info window and the background
  pattern — with no edit here at all. Group membership is computed once at
  module load, from strings; **nothing in this feature builds a board**, which
  is what keeps the page instant.
- **One declared table, pinned by measurement.** `SHAPE_SIDES` — the side counts
  a board's tiles can have, `[3, 4, 5, 6, 8, 10, 12, 13]` — is the exception,
  because deriving it means building all 179 boards and running
  `classifyShapes`, about a second. `tests/unit/achievements.test.ts` does
  exactly that and fails if the list drifts, so a tiling with heptagonal tiles
  cannot ship without a badge (the `soundHarmony.test.ts` pattern).
- **Blocked boards are left out of every completion target.** The five triakis
  boards cannot be played at all — their menu row opens `blockedExplanation`
  instead of a game (see "fairness" in `src/boards/fairness.ts`) — so a set
  containing one could never be finished. `blockedModes()` is the filter, the
  totals run to 174 rather than 179, and the page says so in a line rather than
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
  who has cleared eighty boards does not meet this feature at 0 / 174. Run once,
  at record creation. It cannot recover flags or shapes and claims neither.
- **A win counts a board at any one difficulty.** The completion sets are 174
  boards; asking for all three each would make that 522.
- **No speed milestone.** There was one — a hard board inside two minutes — and
  it was the only number in the feature somebody picked rather than derived.
  Best times already record speed properly, per board and per difficulty, so it
  was dropped rather than rationalised, and `Progress.fastest` went with it.
- **One trap in the win payload.** `Game.reveal` auto-flags every remaining mine
  on a win, so the flags on the board at the moment the achievements are counted
  say nothing about how the game was played. `GameSession.flagless` counts the
  player's own placements instead.

### Where an unlock is said

In the **record window**, which is why that window is no longer only about
records. The app has exactly two modals on purpose (`src/ui/modal.ts`), and an
unlock wants saying at the same instant a record does — a third overlay would
either stack on this one or queue behind it, and both read as the app talking
over itself. So `App.checkRecord` opens the card when the time placed **or**
something was unlocked, and `rank` is `number | null`: with no rank the title
becomes "Achievement unlocked" and the list of times is left out. The
`data-buttons` layout contract is untouched — no button was added (and the row
is down to two since, so there is less of it to break).

At most `MAX_UNLOCKS_SHOWN` (4) are listed. A first win earns six at once —
first board, first difficulty, its shape, its family, its surface, and the
flagless one, because a first click that floods the field plants no flag — and
six rows push the buttons off a phone's screen. The card scrolls, but a primary
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
  a single unlock is a two-note lift and a first win's six runs to the ceiling.
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
star, trophy, flag, warning, and a three-bar difficulty ladder that fills one
bar per rung, drawing all three so a lone bar is not left saying nothing) —
there is no geometry in "win ten boards". They are drawn `fill-rule="evenodd"`,
because they have holes in them.
