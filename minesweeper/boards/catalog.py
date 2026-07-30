"""The menu catalog, derived from two small registries.

Everything the menu and CLI need -- MODE_LABELS, TILINGS, SURFACE_LABELS,
the geometry-first menu tables, MODES_3D -- is *derived* here from
SURFACE_SPECS and TILING_SPECS rather than hand-listed. Adding a periodic
tiling means adding one
ArchTiling row (in tilings.py) and one ARCH_PRESETS row (in presets.py);
adding a surface means adding one SurfaceSpec here plus a builder. See
AGENTS.md. A mode string is always ``surface.prefix + tiling.key`` unless
the tiling overrides it (a few legacy names do).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from minesweeper.boards._data import load
from minesweeper.boards.tilings import ARCH_TILINGS

# The pure-data leaves of this module (surface specs, the regular tiling specs,
# the menu taxonomy and its labels) live in data/catalog.json, the single
# source both the pygame and TypeScript front-ends read. The derivations
# (MODE_LABELS, TILINGS, MODES_3D, allows(), mode_for(), ...) stay in code here
# and mirror the TypeScript. See scripts/export_data.py.
_CATALOG = load("catalog")


@dataclass(frozen=True)
class SurfaceSpec:
    key: str                          # "flat" | "torus" | "cylinder" | "mobius"
    label: str                        # menu label, "Torus"
    prefix: str                       # mode = prefix + tiling.key by default
    is_3d: bool                       # rendered by GameScreen3D
    needs_mirror: bool                # seam reverses orientation: excludes
    #                                   chiral tilings (snub hexagonal)
    boundary_components: int | None   # topological invariant; None for flat
    tilt: float | None = None         # GameScreen3D initial x-rotation
    tilings: frozenset[str] | None = None  # restrict to these tiling keys;
    #                                        None means every tiling (default)


# The menu picks a group, then a tiling, then -- for the uniform and
# dual-uniform tilings -- a surface. Every such tiling wraps every
# surface, with one exception per handedness: 3.3.3.3.6 (snub hexagonal)
# and its dual (the floret pentagonal) are chiral (p6, no mirror or
# glide), so the orientation-reversing Mobius seam cannot glue them to
# themselves (needs_mirror gates them out). The sphere is its own group:
# none of these planar patterns can tile it (Euler's formula forces
# curvature in), so it offers spherical tilings instead. To add a surface
# (e.g. the Klein bottle) add a SurfaceSpec here and wire its builders.
def _surface_from_json(row: dict) -> SurfaceSpec:
    tilings = row["tilings"]
    return SurfaceSpec(
        key=row["key"],
        label=row["label"],
        prefix=row["prefix"],
        is_3d=row["is3d"],
        needs_mirror=row["needsMirror"],
        boundary_components=row["boundaryComponents"],
        tilt=row["tilt"],
        tilings=frozenset(tilings) if tilings is not None else None,
    )


SURFACE_SPECS = tuple(_surface_from_json(r) for r in _CATALOG["surfaces"])
SURFACES = {s.key: s for s in SURFACE_SPECS}
SURFACE_LABELS = {s.key: s.label for s in SURFACE_SPECS}


@dataclass(frozen=True)
class TilingSpec:
    """A periodic tiling as the menu sees it. Regular tilings (square,
    triangle, hexagon) are declared explicitly below; Archimedean ones
    are lifted from tilings.ARCH_TILINGS."""
    key: str
    label: str
    chiral: bool = False                 # no mirror/glide -> no Mobius seam
    mode_overrides: dict = field(default_factory=dict)  # surface -> mode string
    flat_only: bool = False              # the plane only: no wrap builders or
    #   preset windows for this tiling (currently no ARCH_TILINGS family --
    #   see _FLAT_ONLY_FAMILIES -- but a future one-off tiling could set it)

    def mode(self, surface: SurfaceSpec) -> str:
        return self.mode_overrides.get(surface.key, surface.prefix + self.key)

    def allows(self, surface: SurfaceSpec) -> bool:
        if self.flat_only and surface.key != "flat":
            return False
        if surface.needs_mirror and self.chiral:
            return False
        if surface.tilings is not None and self.key not in surface.tilings:
            return False
        return True


# The three regular tilings keep their legacy mode names: the square
# tiling's wrapped boards are just the bare surface names, and the flat
# triangle grid is "trigrid". (Declared in data/catalog.json.)
REGULAR_TILINGS = tuple(
    TilingSpec(
        key=r["key"],
        label=r["label"],
        chiral=r["chiral"],
        mode_overrides=dict(r["modeOverrides"]),
    )
    for r in _CATALOG["regularTilings"]
)

# the ARCH_TILINGS families that live on the plane only: no wrap builders and
# no per-surface preset windows for them yet.
_FLAT_ONLY_FAMILIES: frozenset[str] = frozenset()

TILING_SPECS = REGULAR_TILINGS + tuple(
    TilingSpec(t.key, t.label, chiral=t.template().mirror is None,
               flat_only=t.family in _FLAT_ONLY_FAMILIES)
    for t in ARCH_TILINGS
)
TILINGS_BY_KEY = {t.key: t for t in TILING_SPECS}


def mode_for(tiling: str, surface: str) -> str:
    """The mode string for a (tiling, surface) pair, e.g.
    ('trihex', 'torus') -> 'torustrihex'. The one place the naming
    convention lives; the wrap builders and presets go through it."""
    return TILINGS_BY_KEY[tiling].mode(SURFACES[surface])


_MODE_SURFACE = {
    tiling.mode(surface): surface
    for tiling in TILING_SPECS
    for surface in SURFACE_SPECS
    if tiling.allows(surface)
}


def surface_of(mode: str) -> SurfaceSpec | None:
    """The SurfaceSpec a periodic (tiling x surface) mode lives on, or
    None for the one-off solids/aperiodic/shaped modes."""
    return _MODE_SURFACE.get(mode)


def view_hint(mode: str) -> float | None:
    """GameScreen3D initial x-rotation for a wrapped mode, or None if the
    mode is flat or a one-off solid (which set their own view)."""
    surface = surface_of(mode)
    return surface.tilt if surface else None


# tiling -> (label, {surface: mode}); the menu surface page reads this.
TILINGS = {
    t.key: (t.label, {s.key: t.mode(s) for s in SURFACE_SPECS if t.allows(s)})
    for t in TILING_SPECS
}

# ---------------------------------------------------------------------------
# Menu navigation taxonomy
#
# The menu is geometry-first: a five-item home page, each leading straight to a
# geometry (or a group of them) and then, where it applies, to a shared tiling
# picker.
#
#   Classic         -> flat squares, at once
#   Flat            -> tiling picker on the plane
#   Flat manifolds  -> cylinder / Mobius / Klein / torus -> tiling picker
#   Sphere          -> the spherical tilings
#   Polyhedra       -> the solids
#
# The picker is a list of family submenus -- Regular, Uniform, Laves,
# Isogonal and Congruent rectangles, plus (flat only) Aperiodic and a random
# option. It is parameterised by the
# surface it was reached through, so the same picker serves the plane and every
# flat manifold; the plane is reached through the home page's Flat entry rather
# than repeated in the manifolds list. Chiral tilings are gated out of the
# Mobius strip / Klein bottle per surface by TilingSpec.allows.
# ---------------------------------------------------------------------------

# The menu taxonomy and labels live in data/catalog.json (shared with the TS
# menu); the derivations below stay in code.
_MENU = _CATALOG["menu"]

# Home page: the five top-level entries, in order.
MENU_ROOT = tuple(_MENU["root"])
MENU_ROOT_LABELS = dict(_MENU["rootLabels"])

# Flat manifolds page: the surfaces the plane wraps onto. The plane itself is
# not repeated here -- the home page's Flat entry opens its picker.
MANIFOLD_ORDER = tuple(_MENU["manifoldOrder"])
MANIFOLD_LABELS = dict(_MENU["manifoldLabels"])

# The tiling picker's families. The uniform, dual, isogonal and rectangle
# family members are exactly the ARCH_TILINGS rows of each family, so they
# derive from that registry -- adding a tiling stays a one-row change.
# Aperiodic tilings only exist on the plane (there is no periodic domain to
# wrap), so that family alone is offered only when the surface is flat; the
# isogonal and rectangle families wrap every surface their member tilings'
# chirality allows, exactly like the uniform and dual families.
PICKER_REGULAR = tuple(_MENU["pickerRegular"])
UNIFORM_ARCH = tuple(t.key for t in ARCH_TILINGS if t.family == "uniform")
DUAL_ARCH = tuple(t.key for t in ARCH_TILINGS if t.family == "dual")
ISOGONAL_ARCH = tuple(t.key for t in ARCH_TILINGS if t.family == "isogonal")
RECTANGLE_ARCH = tuple(t.key for t in ARCH_TILINGS if t.family == "rectangle")
APERIODIC_MODES = tuple(_MENU["aperiodic"])
FAMILY_LABELS = dict(_MENU["familyLabels"])
FAMILY_MEMBERS = {
    "regular": PICKER_REGULAR,
    "uniform": UNIFORM_ARCH,
    "dual": DUAL_ARCH,
    "isogonal": ISOGONAL_ARCH,
    "rectangle": RECTANGLE_ARCH,
    "aperiodic": APERIODIC_MODES,
}
# the picker's family rows, in order; "aperiodic" is added on the plane only
PICKER_FAMILIES = ("regular", "uniform", "dual", "isogonal", "rectangle")
FLAT_ONLY_FAMILIES = ("aperiodic",)

# Sphere page: the spherical tilings, none of which wraps a flat surface.
SPHERE_MODES = tuple(_MENU["sphereModes"])

# Polyhedra page: the solids, each launching at once.
POLYHEDRA_MODES = tuple(_MENU["polyhedraModes"])

# The shaped flat boards, by the regular tiling they are made of: the same
# tiling as the plain rectangular board, cut to a triangular or hexagonal
# outline instead. They live on the plane only, so the Regular page carries
# them under their tiling on the flat picker and nowhere else.
SHAPED_MODES = {k: tuple(v) for k, v in _MENU["shapedModes"].items()}

# Labels for the non-periodic (one-off) modes (aperiodic, sphere, solids,
# shaped) listed in the menu tuples above.
SOLO_LABELS = dict(_CATALOG["soloLabels"])

# mode -> label. Periodic modes take the tiling's label; the flat triangle
# grid keeps its own historical CLI label.
MODE_LABELS = {
    **{t.mode(s): t.label
       for t in TILING_SPECS for s in SURFACE_SPECS if t.allows(s)},
    "trigrid": "Triangle grid",
    **SOLO_LABELS,
}


def family_rows(family: str,
                surface_key: str) -> tuple[tuple[str, str, str, bool], ...]:
    """The (key, label, mode, enabled) rows of one picker family on a surface.

    ``key`` is what the menu reports as clicked: a tiling key for a tiling row,
    the mode itself for a one-off board. A row a surface cannot carry (a chiral
    tiling on a mirror seam) comes back with ``enabled`` False, and its mode
    does not exist -- the pygame menu greys those out, the TypeScript one drops
    them.
    """
    surface = SURFACES[surface_key]
    if family == "aperiodic":
        return tuple((m, MODE_LABELS[m], m, True) for m in APERIODIC_MODES)
    rows: list[tuple[str, str, str, bool]] = []
    for key in FAMILY_MEMBERS[family]:
        spec = TILINGS_BY_KEY[key]
        allowed = spec.allows(surface)
        rows.append((key, spec.label, spec.mode(surface) if allowed else "",
                     allowed))
        if family == "regular" and surface_key == "flat":
            # the same tiling on a triangular / hexagonal outline
            rows += [(m, MODE_LABELS[m], m, True)
                     for m in SHAPED_MODES.get(key, ())]
    return tuple(rows)


def picker_families(surface_key: str) -> tuple[str, ...]:
    """The family rows a surface's picker offers, in order."""
    if surface_key == "flat":
        return PICKER_FAMILIES + FLAT_ONLY_FAMILIES
    return PICKER_FAMILIES


def picker_modes(surface_key: str) -> tuple[str, ...]:
    """Every mode reachable on a surface through the tiling picker -- the pool
    the random button draws from (and the reachability guarantee in the tests).
    The flat picker also carries the shaped boards and the aperiodic modes."""
    modes = [mode for family in picker_families(surface_key)
             for _, _, mode, enabled in family_rows(family, surface_key)
             if enabled]
    return tuple(dict.fromkeys(modes))


# The pool the random button draws from on the plane: every flat tiling board
# (regular, shaped, uniform, dual and the aperiodic ones) -- no wrapped
# surfaces or solids.
FLAT_MODES = picker_modes("flat")

_SOLID_MODES = frozenset(SPHERE_MODES) | frozenset(POLYHEDRA_MODES)
MODES_3D = frozenset(
    _SOLID_MODES
    | {t.mode(s) for t in TILING_SPECS for s in SURFACE_SPECS
       if s.is_3d and t.allows(s)}
)
