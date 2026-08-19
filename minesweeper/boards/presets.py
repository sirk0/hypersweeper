"""Difficulty presets and the build_board entry point.

The regular tilings, one-off solids and Archimedean/Laves tilings all
build from data/presets.json (the shared source both front-ends read).
The Archimedean presets are authored in the compact ARCH_PRESETS table
below (tiling -> surface -> difficulty -> builder args); adding an
Archimedean tiling is one ARCH_PRESETS row, expanded into presets.json
by scripts/export_data.py. See AGENTS.md.
"""

from __future__ import annotations

from minesweeper.boards._data import load
from minesweeper.boards.aperiodic import penrose_board, phyllotaxis_board, spectre_board
from minesweeper.boards.catalan import (
    deltoidal_hexecontahedron_board,
    deltoidal_icositetrahedron_board,
    disdyakis_dodecahedron_board,
    disdyakis_triacontahedron_board,
    pentagonal_icositetrahedron_board,
    pentakis_dodecahedron_board,
    rhombic_dodecahedron_board,
    rhombic_triacontahedron_board,
    sphere_board,
    tetrakis_hexahedron_board,
    triakis_icosahedron_board,
    triakis_octahedron_board,
    triakis_tetrahedron_board,
)
from minesweeper.boards.core import DIFFICULTIES, ROOT3, Board, Board3D
from minesweeper.boards.fractal import (
    carpet_board,
    chair_board,
    gosper_board,
    pentaflake_board,
    sphinx_board,
)
from minesweeper.boards.solids import (
    brick_cube_board,
    c80_board,
    c180_board,
    cube_board,
    cube_frame_board,
    dodecahedron_board,
    icosahedron_board,
    octahedron_board,
    rhombicosidodecahedron_board,
    snub_dodecahedron_board,
    sphere_triangle_board,
    stepped_bipyramid_board,
    stepped_pyramid_board,
    tetrahedron_board,
    tetrahedron_frame_board,
    truncated_icosidodecahedron_board,
)
from minesweeper.boards.surfaces import (
    arch_cylinder_board,
    arch_klein_board,
    arch_mobius_board,
    arch_torus_board,
    cylinder_board,
    cylinder_hex_board,
    cylinder_triangle_board,
    klein_board,
    klein_hex_board,
    klein_triangle_board,
    mobius_board,
    mobius_hex_board,
    mobius_triangle_board,
    torus_board,
    torus_hex_board,
    torus_triangle_board,
)
from minesweeper.boards.tilings import (
    archimedean_board,
    hex_board,
    hexhex_board,
    hextri_board,
    hextriangle_board,
    square_board,
    triangle_board,
    triangle_grid_board,
)

# Presets for the ported modes (flat regular boards and the solids) live in
# data/presets.json, the single source both front-ends read; they are loaded
# below into _PRESETS via _JSON_BUILDERS. The remaining explicit presets stay
# here until their milestones port them to the TypeScript app.
_JSON_BUILDERS = {
    "square_board": square_board,
    "triangle_board": triangle_board,
    "triangle_grid_board": triangle_grid_board,
    "hex_board": hex_board,
    "hexhex_board": hexhex_board,
    "hextri_board": hextri_board,
    "hextriangle_board": hextriangle_board,
    "c80_board": c80_board,
    "c180_board": c180_board,
    "sphere_triangle_board": sphere_triangle_board,
    "snub_dodecahedron_board": snub_dodecahedron_board,
    "rhombicosidodecahedron_board": rhombicosidodecahedron_board,
    "truncated_icosidodecahedron_board": truncated_icosidodecahedron_board,
    "cube_board": cube_board,
    "cube_frame_board": cube_frame_board,
    # the three brick bonds that lay on a square face, one cube each
    "brick_cube_board": brick_cube_board,
    "tetrahedron_board": tetrahedron_board,
    "tetrahedron_frame_board": tetrahedron_frame_board,
    "octahedron_board": octahedron_board,
    "icosahedron_board": icosahedron_board,
    "dodecahedron_board": dodecahedron_board,
    "stepped_bipyramid_board": stepped_bipyramid_board,
    "stepped_pyramid_board": stepped_pyramid_board,
    # The thirteen Catalan solids (boards/catalan.py). Every one takes
    # (mine_count, frequency), the face subdivision being their only size knob.
    "triakis_tetrahedron_board": triakis_tetrahedron_board,
    "rhombic_dodecahedron_board": rhombic_dodecahedron_board,
    "triakis_octahedron_board": triakis_octahedron_board,
    "tetrakis_hexahedron_board": tetrakis_hexahedron_board,
    "deltoidal_icositetrahedron_board": deltoidal_icositetrahedron_board,
    "pentagonal_icositetrahedron_board": pentagonal_icositetrahedron_board,
    "disdyakis_dodecahedron_board": disdyakis_dodecahedron_board,
    "rhombic_triacontahedron_board": rhombic_triacontahedron_board,
    "triakis_icosahedron_board": triakis_icosahedron_board,
    "pentakis_dodecahedron_board": pentakis_dodecahedron_board,
    "deltoidal_hexecontahedron_board": deltoidal_hexecontahedron_board,
    "sphere_board": sphere_board,
    "disdyakis_triacontahedron_board": disdyakis_triacontahedron_board,
    "torus_board": torus_board,
    "torus_triangle_board": torus_triangle_board,
    "torus_hex_board": torus_hex_board,
    "mobius_board": mobius_board,
    "mobius_triangle_board": mobius_triangle_board,
    "mobius_hex_board": mobius_hex_board,
    "klein_board": klein_board,
    "klein_triangle_board": klein_triangle_board,
    "klein_hex_board": klein_hex_board,
    "cylinder_board": cylinder_board,
    "cylinder_triangle_board": cylinder_triangle_board,
    "cylinder_hex_board": cylinder_hex_board,
    # Archimedean/Laves modes take the tiling key as their first arg (the
    # tiling name), so their JSON preset args begin with a string.
    "archimedean_board": archimedean_board,
    "arch_torus_board": arch_torus_board,
    "arch_cylinder_board": arch_cylinder_board,
    "arch_mobius_board": arch_mobius_board,
    "arch_klein_board": arch_klein_board,
    # Aperiodic tilings take positional args: penrose_board(subdivisions,
    # mine_count, scale, keep); spectre_board(levels, mine_count, keep, scale);
    # phyllotaxis_board(rings, mine_count, keep, scale).
    "penrose_board": penrose_board,
    "spectre_board": spectre_board,
    "phyllotaxis_board": phyllotaxis_board,
    # Fractal boards take positional args: sphinx_board(levels, mine_count,
    # scale), and the other four the same -- a level is a whole substitution
    # step, so the cell count is 4**levels for the two rep-tiles, 8**levels for
    # the carpet, 6**levels for the pentaflake and 7**levels for the Gosper
    # island.
    "sphinx_board": sphinx_board,
    "chair_board": chair_board,
    "carpet_board": carpet_board,
    "pentaflake_board": pentaflake_board,
    "gosper_board": gosper_board,
}

# Explicit presets for the one-off boards not yet in the shared data/presets.json.
_PRESETS: dict = {}


# Archimedean presets: tiling -> surface -> difficulty -> builder args
# (after the tiling name). flat: (nx, ny, mines, scale); torus:
# (nx, ny, mines, tube_radius); cylinder: (ring, rows, mines[, cut]);
# mobius: (ring, rows, mines). Hand-tuned so each board reads square
# and its rims/seam land cleanly.
ARCH_PRESETS = {
    "elongated": {
        "flat": {"easy": (6, 2, 5, 65.143), "medium": (11, 3, 26, 39.417), "hard": (17, 5, 92, 25.0)},
        "torus": {"easy": (7, 2, 18, 0.52), "medium": (15, 3, 61, 0.52), "hard": (27, 3, 123, 0.38)},
        "cylinder": {"easy": (13, 1 + 1 / (2 + ROOT3), 6), "medium": (23, 1.5 + 1 / (2 + ROOT3), 33), "hard": (32, 2.5 + 1 / (2 + ROOT3), 99)},
        "mobius": {"easy": (13, 1 + 1 / (2 + ROOT3), 6), "medium": (22, 2 + 1 / (2 + ROOT3), 44), "hard": (32, 2 + 1 / (2 + ROOT3), 83)},
        "klein": {"easy": (7, 2, 16, 1.3), "medium": (22, 2, 59, 0.85), "hard": (27, 3, 127, 1.15)},
    },
    "snubsquare": {
        "flat": {"easy": (4, 3, 9, 54), "medium": (6, 6, 35, 38.217), "hard": (9, 9, 107, 26.149)},
        "torus": {"easy": (5, 3, 20, 0.52), "medium": (11, 4, 63, 0.33), "hard": (16, 5, 129, 0.28)},
        "cylinder": {"easy": (7, 2, 12), "medium": (11, 3.5, 38), "hard": (16, 5, 108)},
        "mobius": {"easy": (13, 2, 12), "medium": (23, 4, 43), "hard": (31, 5, 102)},
        "klein": {"easy": (9, 3, 18, 1.3), "medium": (21, 4, 62, 1.3), "hard": (27, 6, 132, 1.3)},
    },
    "trihex": {
        "flat": {"easy": (4, 3, 9, 48), "medium": (8, 5, 44, 26.667), "hard": (12, 7, 111, 16.923)},
        "torus": {"easy": (5, 3, 18, 0.52), "medium": (15, 3, 60, 0.33), "hard": (20, 4, 116, 0.33)},
        "cylinder": {"easy": (9, 1.5, 9), "medium": (15, 3, 47), "hard": (21, 4, 102)},
        "mobius": {"easy": (9, 1.5, 11), "medium": (15, 2.5, 37), "hard": (20, 3.5, 86)},
        "klein": {"easy": (5, 3, 16, 1.3), "medium": (14, 3, 54, 1.15), "hard": (16, 5, 121, 1.3)},
    },
    "snubhex": {
        "flat": {"easy": (2, 2, 8, 56.737), "medium": (5, 3, 32, 33), "hard": (7, 4, 104, 23.771)},
        "torus": {"easy": (4, 2, 26, 0.52), "medium": (7, 2, 51, 0.45), "hard": (8, 3, 107, 0.49)},
        "cylinder": {"easy": (5, 11 / 14, 7), "medium": (8, 1 + 11 / 14, 36), "hard": (12, 2 + 2 / 7, 98)},
    },
    "truncsquare": {
        "flat": {"easy": (6, 6, 7, 29), "medium": (11, 11, 24, 17.375), "hard": (15, 15, 64, 13.075)},
        "torus": {"easy": (10, 4, 7, 0.33), "medium": (21, 6, 39, 0.28), "hard": (24, 10, 98, 0.38)},
        "cylinder": {"easy": (11, 3.5, 5), "medium": (20, 6.5, 30), "hard": (27, 8.5, 70)},
        "mobius": {"easy": (11, 3.5, 4), "medium": (20, 6.5, 29), "hard": (27, 8.5, 68)},
        "klein": {"easy": (10, 4, 7, 1.15), "medium": (16, 8, 48, 1.3), "hard": (24, 10, 98, 1.3)},
    },
    "trunchex": {
        "flat": {"easy": (4, 3, 4, 26.6), "medium": (8, 5, 13, 14), "hard": (12, 7, 38, 9.308)},
        "torus": {"easy": (5, 3, 6, 0.52), "medium": (14, 3, 16, 0.35), "hard": (20, 4, 40, 0.33)},
        "cylinder": {"easy": (9, 1.5, 4), "medium": (15, 3, 13), "hard": (21, 4, 37)},
        "mobius": {"easy": (9, 1.5, 4), "medium": (15, 2.5, 11), "hard": (20, 3.5, 30)},
        "klein": {"easy": (5, 3, 6, 1.3), "medium": (14, 3, 17, 1.15), "hard": (16, 5, 45, 1.3)},
    },
    "rhombitrihex": {
        "flat": {"easy": (3, 2, 6, 48.457), "medium": (6, 3, 24, 26.53), "hard": (8, 5, 69, 19.979)},
        "torus": {"easy": (4, 2, 14, 0.52), "medium": (11, 2, 37, 0.28), "hard": (13, 3, 81, 0.38)},
        "cylinder": {"easy": (6, 1 + 1 / 6, 6), "medium": (11, 2 + 1 / 6, 23), "hard": (15, 2 + 2 / 3, 60)},
        "mobius": {"easy": (6, 1 + 1 / 6, 6), "medium": (11, 2 + 1 / 6, 21), "hard": (14, 3 + 1 / 6, 68)},
        "klein": {"easy": (4, 2, 11, 1.3), "medium": (11, 2, 37, 0.85), "hard": (13, 3, 83, 1.15)},
    },
    "trunctrihex": {
        "flat": {"easy": (3, 2, 9, 27.89), "medium": (6, 3, 30, 14.864), "hard": (8, 5, 83, 11.25)},
        "torus": {"easy": (4, 2, 13, 0.52), "medium": (8, 3, 47, 0.52), "hard": (13, 3, 87, 0.38)},
        "cylinder": {"easy": (5, 1 + 5 / 12, 6), "medium": (11, 1 + 11 / 12, 21), "hard": (15, 2 + 11 / 12, 71)},
        "mobius": {"easy": (5, 1 + 5 / 12, 5), "medium": (10, 2 + 5 / 12, 27), "hard": (15, 2 + 5 / 12, 54)},
        "klein": {"easy": (4, 2, 14, 1.3), "medium": (7, 3, 41, 1.3), "hard": (13, 3, 89, 1.3)},
    },
    # Laves (dual) tilings: same fundamental domain as the Archimedean tiling
    # they dualise, so the windows/seams carry over; only the mine counts are
    # retuned to the dual's (different) tile counts.
    "prismaticpent": {
        "flat": {"easy": (9, 2, 10, 45.6), "medium": (14, 4, 40, 31.533), "hard": (21, 6, 105, 20.455)},
        "torus": {"easy": (11, 2, 19, 0.52), "medium": (21, 3, 58, 0.45), "hard": (40, 3, 118, 0.28)},
        "cylinder": {"easy": (15, 1.5, 14), "medium": (27, 2.5, 51), "hard": (38, 3, 101)},
        "mobius": {"easy": (18, 1, 8), "medium": (28, 2, 43), "hard": (37, 3, 98)},
        "klein": {"easy": (10, 2, 17, 1.3), "medium": (21, 3, 56, 1.3), "hard": (40, 3, 116, 0.85)},
    },
    "cairo": {
        "flat": {"easy": (4, 5, 8, 54), "medium": (8, 8, 24, 28.559), "hard": (11, 11, 81, 21.226)},
        "torus": {"easy": (7, 3, 12, 0.38), "medium": (16, 4, 47, 0.28), "hard": (20, 6, 105, 0.28)},
        "cylinder": {"easy": (8, 2.5, 9), "medium": (14, 4.5, 32), "hard": (19, 6, 84)},
        "mobius": {"easy": (17, 2.5, 9), "medium": (29, 4.5, 38), "hard": (39, 6.5, 94)},
        "klein": {"easy": (13, 3, 14, 1.3), "medium": (25, 5, 47, 1.15), "hard": (35, 7, 113, 1.15)},
    },
    "rhombille": {
        "flat": {"easy": (4, 3, 5, 48), "medium": (8, 5, 7, 26.667), "hard": (11, 7, 18, 18.333)},
        "torus": {"easy": (7, 2, 5, 0.45), "medium": (14, 3, 9, 0.33), "hard": (20, 4, 17, 0.33)},
        "cylinder": {"easy": (9, 1.75, 7), "medium": (15, 2.75, 9), "hard": (21, 3.75, 19)},
        "mobius": {"easy": (11, 1.25, 6), "medium": (15, 3.25, 10), "hard": (22, 4.25, 20)},
        "klein": {"easy": (7, 2, 6, 1.3), "medium": (11, 4, 9, 1.3), "hard": (16, 5, 18, 1.3)},
    },
    "floret": {
        "flat": {"easy": (3, 2, 7, 44), "medium": (6, 4, 37, 26.591), "hard": (8, 5, 81, 20.414)},
        "torus": {"easy": (4, 2, 16, 0.52), "medium": (11, 2, 47, 0.28), "hard": (13, 3, 97, 0.38)},
        "cylinder": {"easy": (7, 1, 9), "medium": (11, 2, 41), "hard": (15, 2.5, 81)},
    },
    "tetrakis": {
        "flat": {"easy": (3, 6, 5, 43.5), "medium": (8, 8, 27, 24.938), "hard": (11, 12, 59, 17.609)},
        "torus": {"easy": (5, 4, 9, 0.52), "medium": (13, 5, 26, 0.38), "hard": (17, 7, 68, 0.45)},
        "cylinder": {"easy": (9, 2, 8), "medium": (14, 5, 26), "hard": (19, 6, 69)},
        "mobius": {"easy": (10, 2, 8), "medium": (14, 5, 28), "hard": (19, 6, 69)},
        "klein": {"easy": (5, 4, 9, 1.3), "medium": (13, 5, 27, 1.3), "hard": (24, 5, 67, 0.85)},
    },
    "triakis": {
        "flat": {"easy": (3, 2, 10, 35.286), "medium": (5, 4, 40, 21.359), "hard": (8, 5, 98, 13.588)},
        "torus": {"easy": (4, 2, 12, 0.45), "medium": (11, 2, 42, 0.38), "hard": (14, 3, 101, 0.38)},
        "cylinder": {"easy": (7, 1, 11), "medium": (11, 2, 42), "hard": (15, 2.5, 90)},
        "mobius": {"easy": (7, 1, 11), "medium": (11, 2, 42), "hard": (15, 3, 108)},
        "klein": {"easy": (4, 2, 12, 1.15), "medium": (11, 2, 42, 1.3), "hard": (20, 2, 96, 0.7)},
    },
    "deltoidal": {
        "flat": {"easy": (3, 2, 6, 49.692), "medium": (5, 4, 28, 31.767), "hard": (8, 5, 84, 20.212)},
        "torus": {"easy": (4, 2, 13, 0.52), "medium": (11, 2, 44, 0.28), "hard": (13, 3, 102, 0.38)},
        "cylinder": {"easy": (6, 1, 10), "medium": (11, 2, 42), "hard": (15, 2.5, 91)},
        "mobius": {"easy": (6, 1, 10), "medium": (11, 2, 39), "hard": (13, 3, 95)},
        "klein": {"easy": (4, 2, 13, 1.3), "medium": (10, 2, 41, 1.0), "hard": (13, 3, 102, 1.15)},
    },
    "kisrhombille": {
        "flat": {"easy": (3, 1, 5, 28), "medium": (4, 3, 21, 22.5), "hard": (6, 3, 50, 15.167)},
        "torus": {"easy": (4, 2, 12, 0.52), "medium": (6, 2, 26, 0.52), "hard": (10, 2, 68, 0.33)},
        "cylinder": {"easy": (6, 0.5, 5), "medium": (8, 1.5, 17), "hard": (10, 2, 52)},
        "mobius": {"easy": (6, 1, 7), "medium": (10, 1, 15), "hard": (11, 2, 52)},
        "klein": {"easy": (4, 2, 12, 1.3), "medium": (6, 2, 29, 1.3), "hard": (10, 2, 68, 1.0)},
    },
    # The isogonal (non-edge-to-edge) tilings. Every window here is measured
    # -- `scripts/difficulty/resize.py` for the size and shape, `calibrate.py`
    # for the mine count -- and each verified to give the surface's correct
    # topology (Euler characteristic 0 for torus/Klein, boundary components
    # 2/1 for cylinder/Mobius). Only offset square and staggered triangular
    # have a template mirror, so only they wrap the Mobius strip / Klein
    # bottle.
    #
    # The manifold windows were re-measured once `resize` stopped counting a
    # T-vertex as a corner: a split edge read as two short sides, so the shape
    # bar scored a stretched window better than an undistorted one and then
    # defended it. Before that the staggered triangular donut was 11 domains
    # around and 11 across -- 3.3 times longer round the ring than across the
    # tube -- and the whole family was kept off the torus/Mobius/Klein menus
    # for the distortion it caused.
    "offsetsquare": {
        "flat": {"easy": (8, 4, 12, 55), "medium": (16, 8, 46, 29.059), "hard": (21, 11, 102, 22.455)},
        "torus": {"easy": (14, 3, 16, 0.38), "medium": (21, 6, 59, 0.52), "hard": (34, 7, 120, 0.38)},
        "cylinder": {"easy": (16, 2.5, 14), "medium": (28, 4.5, 47), "hard": (39, 6, 102)},
        "mobius": {"easy": (16, 2.5, 15), "medium": (28, 4.5, 48), "hard": (39, 6.5, 113)},
        "klein": {"easy": (13, 3, 15, 1.0), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 120, 1.3)},
    },
    "staggeredtri": {
        "flat": {"easy": (5, 3, 10, 81.333), "medium": (10, 6, 50, 41.727), "hard": (14, 8, 110, 32.933)},
        "torus": {"easy": (7, 3, 18, 0.52), "medium": (16, 4, 58, 0.38), "hard": (20, 6, 131, 0.45)},
        "cylinder": {"easy": (12, 1.5, 14), "medium": (19, 3.5, 56), "hard": (26, 4.5, 115)},
        "mobius": {"easy": (35, 1, 9), "medium": (41, 3, 49), "hard": (49, 5, 118)},
        "klein": {"easy": (21, 2, 18, 1.0), "medium": (33, 4, 62, 1.15), "hard": (41, 6, 131, 1.3)},
    },
    "pythagorean": {
        "flat": {"easy": (2, 4, 6, 81.333), "medium": (5, 5, 30, 38.077), "hard": (7, 7, 77, 27.556)},
        "torus": {"easy": (4, 2, 12, 0.38), "medium": (9, 3, 47, 0.33), "hard": (12, 4, 96, 0.33)},
        "cylinder": {"easy": (5, 1 + 7 / 10, 10), "medium": (9, 2 + 9 / 10, 33), "hard": (12, 3 + 9 / 10, 77)},
    },
    "rotatedhex": {
        "flat": {"easy": (4, 3, 4, 48.212), "medium": (8, 5, 14, 28.814), "hard": (12, 7, 40, 20.329)},
        "torus": {"easy": (5, 3, 6, 0.52), "medium": (14, 3, 16, 0.33), "hard": (20, 4, 41, 0.33)},
        "cylinder": {"easy": (9, 1.5, 4), "medium": (15, 3, 13), "hard": (21, 4, 36)},
    },
    "rotatedtri": {
        "flat": {"easy": (4, 3, 13, 77.176), "medium": (8, 5, 45, 42.537), "hard": (12, 7, 112, 28.682)},
        "torus": {"easy": (7, 2, 12, 0.45), "medium": (14, 3, 56, 0.33), "hard": (16, 5, 123, 0.45)},
        "cylinder": {"easy": (9, 1.5, 14), "medium": (15, 3, 49), "hard": (21, 4, 111)},
    },
    "threescaletri": {
        "flat": {"easy": (4, 3, 12, 77.817), "medium": (8, 5, 45, 40.929), "hard": (12, 7, 115, 27.104)},
        "torus": {"easy": (5, 3, 18, 0.52), "medium": (14, 3, 56, 0.33), "hard": (20, 4, 120, 0.33)},
    },
    # The congruent-rectangle bonds: same recipe as the isogonal family --
    # a square board of about 105 / 220 / 350 cells, mined at 14 / 16 / 19
    # per cent, flat and manifold windows both verified for the right
    # topology. The window counts *domains*, and a bond's domain is one
    # brick (stacked), two (running) or a 2 x 2 block of them (the weaves
    # and the herringbone), so the numbers differ per bond. Stacked bond,
    # running bond, basket weave and its three-brick version have a
    # template mirror and so wrap the Mobius strip / Klein bottle;
    # herringbone (pgg) is glide-only and stays off them.
    "stackedbond": {
        "flat": {"easy": (6, 12, 11, 70), "medium": (10, 22, 42, 45), "hard": (15, 31, 99, 32.933)},
        "torus": {"easy": (20, 4, 15, 0.38), "medium": (21, 12, 58, 0.33), "hard": (24, 20, 131, 0.45)},
        "cylinder": {"easy": (12, 7, 13), "medium": (20, 13, 52), "hard": (27, 17, 107)},
        "mobius": {"easy": (12, 7, 15), "medium": (20, 13, 47), "hard": (28, 17, 113)},
        "klein": {"easy": (16, 5, 15, 0.85), "medium": (23, 11, 62, 1.3), "hard": (32, 15, 127, 1.3)},
    },
    "runningbond": {
        "flat": {"easy": (6, 6, 12, 69.714), "medium": (11, 11, 45, 41.25), "hard": (15, 15, 100, 30.625)},
        "torus": {"easy": (10, 4, 14, 0.45), "medium": (18, 7, 58, 0.45), "hard": (30, 8, 122, 0.28)},
        "cylinder": {"easy": (12, 3.5, 16), "medium": (20, 6.5, 52), "hard": (28, 8.5, 112)},
        "mobius": {"easy": (12, 3.5, 16), "medium": (20, 6.5, 52), "hard": (27, 8.5, 110)},
        "klein": {"easy": (14, 3, 15, 1.3), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 119, 1.3)},
    },
    "basketweave": {
        "flat": {"easy": (3, 3, 10, 72), "medium": (6, 6, 44, 37.5), "hard": (8, 8, 99, 28.5)},
        "torus": {"easy": (5, 2, 12, 0.45), "medium": (8, 4, 46, 0.45), "hard": (15, 4, 105, 0.28)},
        "cylinder": {"easy": (5, 2, 12), "medium": (10, 3, 41), "hard": (14, 4.5, 101)},
        "mobius": {"easy": (11, 2, 15), "medium": (19, 3, 39), "hard": (29, 4, 93)},
        "klein": {"easy": (9, 2, 13, 1.3), "medium": (17, 4, 50, 1.3), "hard": (23, 5, 107, 1.3)},
    },
    "basketweave3": {
        "flat": {"easy": (2, 3, 6, 105), "medium": (4, 5, 21, 54), "hard": (6, 6, 64, 37.5)},
        "torus": {"easy": (4, 2, 20, 0.52), "medium": (7, 3, 53, 0.38), "hard": (10, 4, 115, 0.38)},
        "cylinder": {"easy": (5, 1.5, 7), "medium": (8, 2.5, 29), "hard": (11, 3.5, 73)},
        "mobius": {"easy": (13, 1, 6), "medium": (15, 3, 31), "hard": (21, 4, 86)},
        "klein": {"easy": (9, 2, 21, 1.3), "medium": (15, 3, 56, 1.15), "hard": (21, 4, 119, 1.15)},
    },
    "herringbone": {
        "flat": {"easy": (3, 3, 11, 75.846), "medium": (5, 6, 42, 44.864), "hard": (8, 8, 108, 29.545)},
        "torus": {"easy": (5, 2, 17, 0.38), "medium": (8, 4, 60, 0.45), "hard": (12, 5, 122, 0.38)},
        "cylinder": {"easy": (6, 1 + 7 / 8, 14), "medium": (10, 3 + 1 / 8, 42), "hard": (14, 4 + 3 / 8, 105)},
    },
}

# Load the shared presets (data/presets.json) into _PRESETS. Each row is
# {builder, args: {difficulty: [positional args]}}. The Archimedean/Laves
# modes live here too now (their args begin with the tiling key); the
# ARCH_PRESETS table above is the compact authoring source that
# scripts/export_data.py expands into data/presets.json.
for _mode, _spec in load("presets")["presets"].items():
    _fn = _JSON_BUILDERS[_spec["builder"]]
    _PRESETS[_mode] = {
        _difficulty: (lambda fn=_fn, a=_args: fn(*a))
        for _difficulty, _args in _spec["args"].items()
    }


def build_board(mode: str, difficulty: str) -> Board | Board3D:
    if mode not in _PRESETS:
        raise ValueError(f"unknown mode {mode!r}")
    if difficulty not in DIFFICULTIES:
        raise ValueError(f"unknown difficulty {difficulty!r}")
    return _PRESETS[mode][difficulty]()
