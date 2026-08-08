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
from minesweeper.boards.core import DIFFICULTIES, ROOT3, Board, Board3D
from minesweeper.boards.fractal import (
    carpet_board,
    chair_board,
    gosper_board,
    pentaflake_board,
    sphinx_board,
)
from minesweeper.boards.solids import (
    c80_board,
    c180_board,
    cube_board,
    cube_frame_board,
    rhombicosidodecahedron_board,
    snub_dodecahedron_board,
    sphere_board,
    sphere_triangle_board,
    stepped_bipyramid_board,
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
    "sphere_board": sphere_board,
    "c80_board": c80_board,
    "c180_board": c180_board,
    "sphere_triangle_board": sphere_triangle_board,
    "snub_dodecahedron_board": snub_dodecahedron_board,
    "rhombicosidodecahedron_board": rhombicosidodecahedron_board,
    "truncated_icosidodecahedron_board": truncated_icosidodecahedron_board,
    "cube_board": cube_board,
    "cube_frame_board": cube_frame_board,
    "tetrahedron_board": tetrahedron_board,
    "tetrahedron_frame_board": tetrahedron_frame_board,
    "stepped_bipyramid_board": stepped_bipyramid_board,
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
        "flat": {"easy": (6, 2, 4, 65.143), "medium": (13, 3, 30, 33.786), "hard": (16, 5, 93, 26.471)},
        "torus": {"easy": (14, 1, 16, 0.28), "medium": (15, 3, 61, 0.52), "hard": (27, 3, 119, 0.38)},
        "cylinder": {"easy": (12, 1 + 1 / (2 + ROOT3), 3, -0.5), "medium": (37, 1 + 1 / (2 + ROOT3), 15, -0.5), "hard": (37, 2 + 1 / (2 + ROOT3), 89, -0.5)},
        "mobius": {"easy": (14, 1, 12), "medium": (40, 1, 30), "hard": (40, 2, 93)},
        "klein": {"easy": (13, 1, 17, 0.85), "medium": (22, 2, 59, 0.85), "hard": (27, 3, 122, 1.15)},
    },
    "snubsquare": {
        "flat": {"easy": (4, 3, 9, 54), "medium": (6, 6, 35, 38.217), "hard": (9, 9, 109, 26.149)},
        "torus": {"easy": (7, 2, 9, 0.28), "medium": (11, 4, 61, 0.33), "hard": (16, 5, 132, 0.28)},
        "cylinder": {"easy": (14, 1, 4), "medium": (21, 2, 32), "hard": (20, 4, 100)},
        "mobius": {"easy": (13, 2, 12), "medium": (29, 3, 39), "hard": (39, 4, 97)},
        "klein": {"easy": (9, 3, 18, 1.3), "medium": (21, 4, 62, 1.3), "hard": (27, 6, 132, 1.3)},
    },
    "trihex": {
        "flat": {"easy": (4, 3, 12, 48), "medium": (8, 5, 43, 26.667), "hard": (11, 7, 102, 18.333)},
        "torus": {"easy": (7, 2, 18, 0.45), "medium": (15, 3, 59, 0.33), "hard": (20, 4, 116, 0.33)},
        "cylinder": {"easy": (14, 1, 4, ROOT3 / 2), "medium": (21, 2, 37, ROOT3 / 2), "hard": (40, 2, 75, ROOT3 / 2)},
        "mobius": {"easy": (14, 1, 10), "medium": (21, 2, 43), "hard": (40, 2, 89)},
        "klein": {"easy": (7, 2, 18, 1.15), "medium": (14, 3, 56, 1.15), "hard": (16, 5, 122, 1.3)},
    },
    "snubhex": {
        "flat": {"easy": (2, 2, 8, 56.737), "medium": (5, 3, 34, 33), "hard": (7, 4, 97, 23.771)},
        "torus": {"easy": (5, 1, 18, 0.38), "medium": (7, 2, 51, 0.45), "hard": (8, 3, 110, 0.49)},
        "cylinder": {"easy": (5, 1, 6, 21**0.5 / 4), "medium": (14, 1, 22, 21**0.5 / 4), "hard": (9, 3, 90, 21**0.5 / 4)},
    },
    "truncsquare": {
        "flat": {"easy": (6, 6, 7, 29), "medium": (11, 11, 24, 17.375), "hard": (15, 15, 64, 13.075)},
        "torus": {"easy": (10, 4, 3, 0.33), "medium": (21, 6, 39, 0.28), "hard": (24, 10, 98, 0.38)},
        "cylinder": {"easy": (20, 2, 5), "medium": (32, 4, 27), "hard": (40, 6, 71)},
        "mobius": {"easy": (10, 4, 8), "medium": (21, 6, 29), "hard": (34, 7, 74)},
        "klein": {"easy": (10, 4, 5, 1.15), "medium": (16, 8, 48, 1.3), "hard": (24, 10, 98, 1.3)},
    },
    "trunchex": {
        "flat": {"easy": (4, 3, 3, 26.6), "medium": (8, 5, 13, 14), "hard": (12, 7, 40, 9.308)},
        "torus": {"easy": (7, 2, 3, 0.45), "medium": (14, 3, 16, 0.35), "hard": (20, 4, 39, 0.33)},
        "cylinder": {"easy": (14, 1, 3, 0.5 + ROOT3 / 2), "medium": (21, 2, 10, 0.5 + ROOT3 / 2), "hard": (40, 2, 31, 0.5 + ROOT3 / 2)},
        "mobius": {"easy": (14, 1, 3), "medium": (21, 2, 10), "hard": (40, 2, 24)},
        "klein": {"easy": (7, 2, 3, 1.0), "medium": (14, 3, 17, 1.15), "hard": (16, 5, 42, 1.3)},
    },
    "rhombitrihex": {
        "flat": {"easy": (4, 2, 4, 38.0), "medium": (6, 3, 16, 26.53), "hard": (8, 5, 58, 19.979)},
        "torus": {"easy": (7, 1, 9, 0.28), "medium": (11, 2, 37, 0.28), "hard": (13, 3, 81, 0.38)},
        "cylinder": {"easy": (7, 1, 4), "medium": (21, 1, 15), "hard": (20, 2, 53)},
        "mobius": {"easy": (7, 1, 6), "medium": (21, 1, 12), "hard": (20, 2, 50)},
        "klein": {"easy": (7, 1, 10, 0.7), "medium": (11, 2, 37, 0.85), "hard": (13, 3, 83, 1.15)},
    },
    "trunctrihex": {
        "flat": {"easy": (3, 2, 6, 27.89), "medium": (7, 3, 29, 13.267), "hard": (8, 5, 76, 11.25)},
        "torus": {"easy": (6, 1, 12, 0.33), "medium": (11, 2, 41, 0.28), "hard": (13, 3, 87, 0.38)},
        "cylinder": {"easy": (7, 1, 7), "medium": (21, 1, 24), "hard": (20, 2, 70)},
        "mobius": {"easy": (7, 1, 9), "medium": (21, 1, 24), "hard": (20, 2, 72)},
        "klein": {"easy": (7, 1, 12, 0.7), "medium": (11, 2, 42, 0.85), "hard": (13, 3, 86, 1.3)},
    },
    # Laves (dual) tilings: same fundamental domain as the Archimedean tiling
    # they dualise, so the windows/seams carry over; only the mine counts are
    # retuned to the dual's (different) tile counts.
    "prismaticpent": {
        "flat": {"easy": (9, 2, 10, 45.6), "medium": (15, 4, 40, 29.562), "hard": (20, 6, 98, 21.429)},
        "torus": {"easy": (20, 1, 11, 0.28), "medium": (21, 3, 58, 0.45), "hard": (40, 3, 118, 0.28)},
        "cylinder": {"easy": (20, 1 + 1 / (2 + ROOT3), 9, -0.5), "medium": (32, 2 + 1 / (2 + ROOT3), 46, -0.5), "hard": (40, 3 + 1 / (2 + ROOT3), 107, -0.5)},
        "mobius": {"easy": (20, 1, 9), "medium": (32, 2, 44), "hard": (40, 3, 105)},
        "klein": {"easy": (19, 1, 10, 0.7), "medium": (21, 3, 56, 1.3), "hard": (40, 3, 116, 0.85)},
    },
    "cairo": {
        "flat": {"easy": (4, 5, 8, 54), "medium": (8, 8, 24, 28.559), "hard": (11, 11, 83, 21.226)},
        "torus": {"easy": (7, 3, 12, 0.38), "medium": (16, 4, 45, 0.28), "hard": (20, 6, 105, 0.28)},
        "cylinder": {"easy": (10, 2, 11), "medium": (16, 4, 41), "hard": (40, 3, 79)},
        "mobius": {"easy": (21, 2, 10), "medium": (33, 4, 46), "hard": (39, 6, 92)},
        "klein": {"easy": (13, 3, 14, 1.3), "medium": (25, 5, 50, 1.15), "hard": (35, 7, 107, 1.15)},
    },
    "rhombille": {
        "flat": {"easy": (4, 3, 3, 48), "medium": (8, 5, 6, 26.667), "hard": (12, 7, 20, 16.923)},
        "torus": {"easy": (7, 2, 2, 0.45), "medium": (14, 3, 7, 0.33), "hard": (20, 4, 19, 0.33)},
        "cylinder": {"easy": (14, 1, 3, ROOT3 / 2), "medium": (21, 2, 7, ROOT3 / 2), "hard": (40, 2, 21, ROOT3 / 2)},
        "mobius": {"easy": (14, 1, 3), "medium": (21, 2, 7), "hard": (40, 2, 20)},
        "klein": {"easy": (7, 2, 2, 1.3), "medium": (11, 4, 7, 1.3), "hard": (16, 5, 19, 1.3)},
    },
    "floret": {
        "flat": {"easy": (3, 2, 8, 44), "medium": (6, 4, 37, 26.591), "hard": (8, 5, 79, 20.414)},
        "torus": {"easy": (7, 1, 12, 0.28), "medium": (11, 2, 47, 0.28), "hard": (13, 3, 97, 0.38)},
        "cylinder": {"easy": (7, 1, 9, 21**0.5 / 4), "medium": (21, 1, 22, 21**0.5 / 4), "hard": (20, 2, 77, 21**0.5 / 4)},
    },
    "tetrakis": {
        "flat": {"easy": (4, 5, 6, 43.5), "medium": (8, 8, 27, 24.938), "hard": (11, 12, 62, 17.609)},
        "torus": {"easy": (7, 3, 7, 0.52), "medium": (16, 4, 29, 0.28), "hard": (16, 7, 68, 0.45)},
        "cylinder": {"easy": (4, 5, 7), "medium": (4, 16, 29), "hard": (3, 40, 58)},
        "mobius": {"easy": (10, 2, 8), "medium": (16, 4, 27), "hard": (24, 5, 71)},
        "klein": {"easy": (7, 3, 9, 1.3), "medium": (21, 3, 24, 0.7), "hard": (24, 5, 65, 0.85)},
    },
    "triakis": {
        "flat": {"easy": (3, 2, 9, 35.286), "medium": (6, 4, 46, 18.308), "hard": (8, 5, 96, 13.588)},
        "torus": {"easy": (3, 2, 9, 0.52), "medium": (11, 2, 42, 0.38), "hard": (14, 3, 101, 0.38)},
        "cylinder": {"easy": (7, 1, 11, 0.5 + ROOT3 / 2), "medium": (3, 7, 40, 0.5 + ROOT3 / 2), "hard": (4, 10, 96, 0.5 + ROOT3 / 2)},
        "mobius": {"easy": (3, 2, 9), "medium": (21, 1, 40), "hard": (20, 2, 96)},
        "klein": {"easy": (3, 2, 9, 1.3), "medium": (11, 2, 42, 1.3), "hard": (20, 2, 96, 0.7)},
    },
    "deltoidal": {
        "flat": {"easy": (3, 2, 8, 49.692), "medium": (6, 4, 36, 26.88), "hard": (8, 5, 86, 20.212)},
        "torus": {"easy": (7, 1, 12, 0.28), "medium": (11, 2, 42, 0.28), "hard": (13, 3, 97, 0.38)},
        "cylinder": {"easy": (7, 1, 12), "medium": (21, 1, 34), "hard": (20, 2, 94)},
        "mobius": {"easy": (7, 1, 12), "medium": (21, 1, 35), "hard": (20, 2, 92)},
        "klein": {"easy": (6, 1, 12, 0.85), "medium": (10, 2, 41, 1.0), "hard": (13, 3, 102, 1.15)},
    },
    "kisrhombille": {
        "flat": {"easy": (3, 1, 3, 28), "medium": (4, 3, 21, 22.5), "hard": (6, 3, 50, 15.167)},
        "torus": {"easy": (3, 1, 5, 0.52), "medium": (6, 2, 26, 0.52), "hard": (10, 2, 68, 0.33)},
        "cylinder": {"easy": (3, 1, 5), "medium": (11, 1, 15), "hard": (2, 10, 62)},
        "mobius": {"easy": (3, 1, 3), "medium": (11, 1, 12), "hard": (20, 1, 40)},
        "klein": {"easy": (3, 1, 7, 1.3), "medium": (6, 2, 29, 1.3), "hard": (10, 2, 68, 1.0)},
    },
    # The isogonal (non-edge-to-edge) tilings. Flat windows chosen for a
    # square board of about 490px at 100 / 190 / 350 cells, mined at the
    # usual 14 / 16 / 19 per cent; the manifold windows (nx/ny domain counts
    # or ring/rows) are tuned to the same cell-count targets and mine
    # density, each verified to give the surface's correct topology (Euler
    # characteristic 0 for torus/Klein, boundary components 2/1 for
    # cylinder/Mobius). Only offset square and staggered triangular have a
    # template mirror, so only they wrap the Mobius strip / Klein bottle.
    "offsetsquare": {
        "flat": {"easy": (8, 4, 12, 55), "medium": (15, 8, 44, 30.875), "hard": (21, 11, 102, 22.455)},
        "torus": {"easy": (10, 4, 15, 0.45), "medium": (21, 6, 56, 0.52), "hard": (34, 7, 120, 0.38)},
        "cylinder": {"easy": (27, 1.5, 9), "medium": (32, 4, 48), "hard": (40, 6, 105)},
        "mobius": {"easy": (20, 2, 11), "medium": (32, 4, 48), "hard": (40, 6, 106)},
        "klein": {"easy": (13, 3, 15, 1.0), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 121, 1.3)},
    },
    "staggeredtri": {
        "flat": {"easy": (6, 3, 12, 69.714), "medium": (10, 6, 50, 41.727), "hard": (14, 8, 110, 32.933)},
        "torus": {"easy": (7, 3, 18, 0.45), "medium": (10, 6, 59, 0.45), "hard": (10, 12, 128, 0.52)},
        "cylinder": {"easy": (8, 2.5, 14), "medium": (32, 2, 44), "hard": (16, 7.5, 122)},
        "mobius": {"easy": (21, 2, 16), "medium": (27, 5, 59), "hard": (31, 8, 129)},
        "klein": {"easy": (21, 2, 18, 1.0), "medium": (27, 5, 66, 1.15), "hard": (31, 8, 134, 1.0)},
    },
    "pythagorean": {
        "flat": {"easy": (2, 4, 6, 81.333), "medium": (5, 5, 30, 38.077), "hard": (7, 7, 77, 27.556)},
        "torus": {"easy": (4, 2, 12, 0.38), "medium": (9, 3, 47, 0.33), "hard": (12, 4, 96, 0.33)},
        "cylinder": {"easy": (5, 1.5, 10), "medium": (17, 1.5, 26), "hard": (24, 2, 63)},
    },
    "rotatedhex": {
        "flat": {"easy": (4, 3, 3, 48.212), "medium": (8, 5, 13, 28.814), "hard": (12, 7, 40, 20.329)},
        "torus": {"easy": (7, 2, 3, 0.45), "medium": (14, 3, 16, 0.33), "hard": (20, 4, 42, 0.33)},
        "cylinder": {"easy": (9, 1.5, 3), "medium": (21, 2, 9), "hard": (32, 2.5, 26)},
    },
    "rotatedtri": {
        "flat": {"easy": (5, 3, 11, 64), "medium": (8, 5, 37, 42.537), "hard": (12, 7, 98, 28.682)},
        "torus": {"easy": (7, 2, 12, 0.45), "medium": (14, 3, 56, 0.33), "hard": (16, 5, 124, 0.45)},
        "cylinder": {"easy": (10, 1.5, 11), "medium": (8, 5.5, 50), "hard": (15, 5.5, 106)},
    },
    "threescaletri": {
        "flat": {"easy": (5, 3, 7, 65), "medium": (8, 5, 36, 40.929), "hard": (11, 7, 92, 30.244)},
        "torus": {"easy": (7, 2, 18, 0.45), "medium": (14, 3, 56, 0.33), "hard": (20, 4, 120, 0.33)},
        "cylinder": {"easy": (9, 1.5, 12), "medium": (21, 2, 44), "hard": (32, 2.5, 95)},
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
        "flat": {"easy": (6, 12, 11, 70), "medium": (10, 22, 36, 45), "hard": (15, 31, 99, 32.933)},
        "torus": {"easy": (14, 6, 3, 0.38), "medium": (23, 11, 58, 0.45), "hard": (32, 15, 129, 0.45)},
        "cylinder": {"easy": (4, 20.5, 11), "medium": (16, 16.5, 49), "hard": (12, 40, 111)},
        "mobius": {"easy": (20, 4, 11), "medium": (32, 8, 35), "hard": (40, 12, 105)},
        "klein": {"easy": (16, 5, 15, 0.85), "medium": (23, 11, 62, 1.3), "hard": (32, 15, 127, 1.3)},
    },
    "runningbond": {
        "flat": {"easy": (6, 6, 12, 69.714), "medium": (11, 11, 42, 41.25), "hard": (15, 15, 100, 30.625)},
        "torus": {"easy": (10, 4, 14, 0.45), "medium": (21, 6, 59, 0.52), "hard": (34, 7, 120, 0.38)},
        "cylinder": {"easy": (20, 2, 14), "medium": (17, 7.5, 53), "hard": (40, 6, 107)},
        "mobius": {"easy": (20, 2, 9), "medium": (32, 4, 47), "hard": (40, 6, 105)},
        "klein": {"easy": (13, 3, 15, 1.0), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 119, 1.3)},
    },
    "basketweave": {
        "flat": {"easy": (3, 3, 10, 72), "medium": (6, 6, 44, 37.5), "hard": (8, 8, 97, 28.5)},
        "torus": {"easy": (5, 2, 12, 0.45), "medium": (8, 4, 46, 0.45), "hard": (12, 5, 109, 0.38)},
        "cylinder": {"easy": (4, 2.5, 14), "medium": (13, 2.5, 40), "hard": (24, 2.5, 84)},
        "mobius": {"easy": (11, 2, 15), "medium": (21, 3, 43), "hard": (39, 3, 89)},
        "klein": {"easy": (11, 2, 12, 1.3), "medium": (17, 4, 50, 1.15), "hard": (23, 5, 104, 1.3)},
    },
    "basketweave3": {
        "flat": {"easy": (2, 3, 5, 105), "medium": (4, 5, 21, 54), "hard": (6, 6, 64, 37.5)},
        "torus": {"easy": (3, 2, 15, 0.45), "medium": (7, 3, 53, 0.38), "hard": (10, 4, 115, 0.38)},
        "cylinder": {"easy": (7, 1, 4), "medium": (2, 10.5, 34), "hard": (2, 20, 85)},
        "mobius": {"easy": (13, 1, 5), "medium": (15, 3, 31), "hard": (21, 4, 86)},
        "klein": {"easy": (13, 1, 12, 0.85), "medium": (15, 3, 56, 1.15), "hard": (19, 4, 111, 1.3)},
    },
    "herringbone": {
        "flat": {"easy": (3, 3, 11, 75.846), "medium": (5, 6, 40, 44.864), "hard": (8, 8, 106, 29.545)},
        "torus": {"easy": (5, 2, 17, 0.38), "medium": (8, 4, 60, 0.45), "hard": (12, 5, 122, 0.38)},
        "cylinder": {"easy": (4, 2.5, 12), "medium": (21, 1.5, 30), "hard": (24, 2.5, 86)},
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
