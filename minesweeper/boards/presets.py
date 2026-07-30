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
from minesweeper.boards.aperiodic import penrose_board, spectre_board
from minesweeper.boards.core import DIFFICULTIES, ROOT3, Board, Board3D
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
    # mine_count, scale, keep); spectre_board(levels, mine_count, keep, scale).
    "penrose_board": penrose_board,
    "spectre_board": spectre_board,
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
        "flat": {"easy": (7, 2, 14, 57), "medium": (10, 3, 30, 43), "hard": (14, 4, 67, 30)},
        "torus": {"easy": (12, 1, 9, 0.31), "medium": (14, 2, 26, 0.53), "hard": (20, 2, 48, 0.37)},
        "cylinder": {"easy": (10, 1 + 1 / (2 + ROOT3), 8, -0.5), "medium": (12, 2 + 1 / (2 + ROOT3), 24, -0.5), "hard": (15, 3 + 1 / (2 + ROOT3), 60, -0.5)},
        "mobius": {"easy": (12, 1, 9), "medium": (12, 2, 22), "hard": (18, 2, 43)},
        "klein": {"easy": (12, 1, 9), "medium": (14, 2, 26), "hard": (20, 2, 48)},
    },
    "snubsquare": {
        "flat": {"easy": (4, 4, 15, 54), "medium": (5, 5, 26, 45), "hard": (7, 7, 57, 33)},
        "torus": {"easy": (5, 2, 8, 0.40), "medium": (7, 3, 19, 0.43), "hard": (10, 4, 48, 0.40)},
        "cylinder": {"easy": (5, 2, 8), "medium": (7, 3, 19), "hard": (9, 5, 57)},
        "mobius": {"easy": (13, 2, 10), "medium": (15, 3, 20), "hard": (17, 4, 41)},
        "klein": {"easy": (5, 2, 8), "medium": (7, 3, 19), "hard": (9, 4, 44)},
    },
    "trihex": {
        "flat": {"easy": (5, 3, 14, 40), "medium": (7, 4, 30, 30), "hard": (9, 6, 65, 22)},
        "torus": {"easy": (8, 2, 12, 0.43), "medium": (10, 2, 18, 0.35), "hard": (12, 3, 43, 0.43)},
        "cylinder": {"easy": (6, 2, 9, ROOT3 / 2), "medium": (9, 3, 24, ROOT3 / 2), "hard": (11, 4, 55, ROOT3 / 2)},
        "mobius": {"easy": (12, 1, 9), "medium": (12, 2, 22), "hard": (18, 2, 43)},
        "klein": {"easy": (8, 2, 12), "medium": (10, 2, 18), "hard": (12, 3, 43)},
    },
    "snubhex": {
        "flat": {"easy": (3, 2, 16, 44), "medium": (4, 2, 24, 39), "hard": (5, 3, 50, 32)},
        "torus": {"easy": (4, 1, 9, 0.43), "medium": (6, 1, 16, 0.29), "hard": (7, 2, 50, 0.49)},
        "cylinder": {"easy": (4, 1, 9, 21**0.5 / 4), "medium": (5, 2, 27, 21**0.5 / 4), "hard": (7, 2, 53, 21**0.5 / 4)},
    },
    "truncsquare": {
        "flat": {"easy": (6, 6, 12, 29), "medium": (9, 9, 29, 21), "hard": (13, 13, 68, 15)},
        "torus": {"easy": (9, 4, 9, 0.44), "medium": (12, 6, 22, 0.50), "hard": (16, 7, 45, 0.44)},
        "cylinder": {"easy": (9, 3, 7), "medium": (12, 5, 18), "hard": (16, 7, 45)},
        "mobius": {"easy": (12, 3, 9), "medium": (16, 4, 19), "hard": (22, 5, 44)},
        "klein": {"easy": (9, 4, 9), "medium": (12, 6, 22), "hard": (16, 7, 45)},
    },
    "trunchex": {
        "flat": {"easy": (6, 3, 16, 19), "medium": (8, 4, 33, 14), "hard": (10, 6, 70, 11)},
        "torus": {"easy": (7, 2, 10, 0.49), "medium": (10, 2, 18, 0.35), "hard": (12, 3, 43, 0.43)},
        "cylinder": {"easy": (6, 2, 9, 0.5 + ROOT3 / 2), "medium": (8, 3, 22, 0.5 + ROOT3 / 2), "hard": (10, 4, 48, 0.5 + ROOT3 / 2)},
        "mobius": {"easy": (9, 1, 7), "medium": (10, 2, 18), "hard": (12, 3, 43)},
        "klein": {"easy": (7, 2, 10), "medium": (10, 2, 18), "hard": (12, 3, 43)},
    },
    "rhombitrihex": {
        "flat": {"easy": (4, 2, 15, 38), "medium": (5, 3, 30, 32), "hard": (7, 4, 65, 23)},
        "torus": {"easy": (5, 2, 17, 0.40), "medium": (7, 2, 26, 0.40), "hard": (8, 3, 45, 0.43)},
        "cylinder": {"easy": (4, 2, 14), "medium": (5, 3, 28), "hard": (7, 3, 40)},
        "mobius": {"easy": (4, 2, 14), "medium": (6, 2, 22), "hard": (8, 3, 45)},
        "klein": {"easy": (5, 2, 17), "medium": (7, 2, 26), "hard": (8, 3, 45)},
    },
    "trunctrihex": {
        "flat": {"easy": (4, 2, 15, 21), "medium": (5, 3, 30, 18), "hard": (7, 4, 65, 13)},
        "torus": {"easy": (5, 2, 17, 0.40), "medium": (7, 2, 26, 0.40), "hard": (8, 3, 45, 0.43)},
        "cylinder": {"easy": (4, 2, 14), "medium": (5, 3, 28), "hard": (7, 3, 40)},
        "mobius": {"easy": (4, 2, 14), "medium": (6, 2, 22), "hard": (8, 3, 45)},
        "klein": {"easy": (5, 2, 17), "medium": (7, 2, 26), "hard": (8, 3, 45)},
    },
    # Laves (dual) tilings: same fundamental domain as the Archimedean tiling
    # they dualise, so the windows/seams carry over; only the mine counts are
    # retuned to the dual's (different) tile counts.
    "prismaticpent": {
        "flat": {"easy": (7, 2, 9, 57), "medium": (10, 3, 20, 43), "hard": (14, 4, 43, 30)},
        "torus": {"easy": (12, 1, 6, 0.31), "medium": (14, 2, 17, 0.53), "hard": (20, 2, 32, 0.37)},
        "cylinder": {"easy": (10, 1 + 1 / (2 + ROOT3), 5, -0.5), "medium": (12, 2 + 1 / (2 + ROOT3), 15, -0.5), "hard": (15, 3 + 1 / (2 + ROOT3), 38, -0.5)},
        "mobius": {"easy": (12, 1, 6), "medium": (12, 2, 15), "hard": (18, 2, 29)},
        "klein": {"easy": (12, 1, 6), "medium": (14, 2, 17), "hard": (20, 2, 32)},
    },
    "cairo": {
        "flat": {"easy": (4, 4, 9, 54), "medium": (5, 5, 16, 45), "hard": (7, 7, 36, 33)},
        "torus": {"easy": (5, 2, 5, 0.40), "medium": (7, 3, 13, 0.43), "hard": (10, 4, 32, 0.40)},
        "cylinder": {"easy": (5, 2, 5), "medium": (7, 3, 13), "hard": (9, 5, 38)},
        "mobius": {"easy": (13, 2, 7), "medium": (15, 3, 13), "hard": (17, 4, 27)},
        "klein": {"easy": (5, 2, 5), "medium": (7, 3, 13), "hard": (9, 4, 32)},
    },
    "rhombille": {
        "flat": {"easy": (5, 3, 13, 40), "medium": (7, 4, 28, 30), "hard": (9, 6, 61, 22)},
        "torus": {"easy": (8, 2, 12, 0.43), "medium": (10, 2, 18, 0.35), "hard": (12, 3, 43, 0.43)},
        "cylinder": {"easy": (6, 2, 9, ROOT3 / 2), "medium": (9, 3, 24, ROOT3 / 2), "hard": (11, 4, 55, ROOT3 / 2)},
        "mobius": {"easy": (12, 1, 9), "medium": (12, 2, 22), "hard": (18, 2, 43)},
        "klein": {"easy": (8, 2, 12), "medium": (10, 2, 18), "hard": (12, 3, 43)},
    },
    "floret": {
        "flat": {"easy": (3, 2, 10, 44), "medium": (4, 2, 15, 39), "hard": (5, 3, 33, 32)},
        "torus": {"easy": (4, 1, 6, 0.43), "medium": (6, 1, 11, 0.29), "hard": (7, 2, 33, 0.49)},
        "cylinder": {"easy": (4, 1, 6, 21**0.5 / 4), "medium": (5, 2, 18, 21**0.5 / 4), "hard": (7, 2, 35, 21**0.5 / 4)},
    },
    "tetrakis": {
        "flat": {"easy": (6, 6, 20, 29), "medium": (9, 9, 52, 21), "hard": (13, 13, 126, 15)},
        "torus": {"easy": (9, 4, 18, 0.44), "medium": (12, 6, 44, 0.50), "hard": (16, 7, 90, 0.44)},
        "cylinder": {"easy": (9, 3, 14), "medium": (12, 5, 36), "hard": (16, 7, 90)},
        "mobius": {"easy": (12, 3, 18), "medium": (16, 4, 38), "hard": (22, 5, 88)},
        "klein": {"easy": (9, 4, 18), "medium": (12, 6, 44), "hard": (16, 7, 90)},
    },
    "triakis": {
        "flat": {"easy": (6, 3, 30, 19), "medium": (8, 4, 62, 14), "hard": (10, 6, 134, 11)},
        "torus": {"easy": (7, 2, 20, 0.49), "medium": (10, 2, 36, 0.35), "hard": (12, 3, 86, 0.43)},
        "cylinder": {"easy": (6, 2, 18, 0.5 + ROOT3 / 2), "medium": (8, 3, 44, 0.5 + ROOT3 / 2), "hard": (10, 4, 96, 0.5 + ROOT3 / 2)},
        "mobius": {"easy": (9, 1, 14), "medium": (10, 2, 36), "hard": (12, 3, 86)},
        "klein": {"easy": (7, 2, 20), "medium": (10, 2, 36), "hard": (12, 3, 86)},
    },
    "deltoidal": {
        "flat": {"easy": (4, 2, 13, 38), "medium": (5, 3, 30, 32), "hard": (7, 4, 62, 23)},
        "torus": {"easy": (5, 2, 17, 0.40), "medium": (7, 2, 26, 0.40), "hard": (8, 3, 45, 0.43)},
        "cylinder": {"easy": (4, 2, 14), "medium": (5, 3, 28), "hard": (7, 3, 40)},
        "mobius": {"easy": (4, 2, 14), "medium": (6, 2, 22), "hard": (8, 3, 45)},
        "klein": {"easy": (5, 2, 17), "medium": (7, 2, 26), "hard": (8, 3, 45)},
    },
    "kisrhombille": {
        "flat": {"easy": (4, 2, 27, 21), "medium": (5, 3, 60, 18), "hard": (7, 4, 125, 13)},
        "torus": {"easy": (5, 2, 34, 0.40), "medium": (7, 2, 52, 0.40), "hard": (8, 3, 90, 0.43)},
        "cylinder": {"easy": (4, 2, 28), "medium": (5, 3, 56), "hard": (7, 3, 80)},
        "mobius": {"easy": (4, 2, 28), "medium": (6, 2, 44), "hard": (8, 3, 90)},
        "klein": {"easy": (5, 2, 34), "medium": (7, 2, 52), "hard": (8, 3, 90)},
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
        "flat": {"easy": (10, 5, 16, 45), "medium": (12, 6, 26, 38), "hard": (18, 9, 67, 26)},
        "torus": {"easy": (10, 5, 14, 0.45), "medium": (10, 10, 32, 0.45), "hard": (12, 15, 68, 0.45)},
        "cylinder": {"easy": (5, 10, 14), "medium": (10, 10, 32), "hard": (12, 15, 68)},
        "mobius": {"easy": (10, 5, 14), "medium": (10, 10, 32), "hard": (12, 15, 68)},
        "klein": {"easy": (5, 10, 14), "medium": (10, 10, 32), "hard": (15, 12, 68)},
    },
    "staggeredtri": {
        "flat": {"easy": (7, 4, 18, 61), "medium": (8, 5, 27, 51), "hard": (12, 7, 66, 38)},
        "torus": {"easy": (6, 4, 13, 0.45), "medium": (10, 5, 32, 0.45), "hard": (8, 11, 67, 0.45)},
        "cylinder": {"easy": (5, 5, 14), "medium": (5, 10, 32), "hard": (8, 11, 67)},
        "mobius": {"easy": (7, 7, 14), "medium": (11, 9, 32), "hard": (13, 13, 64)},
        "klein": {"easy": (5, 10, 14), "medium": (9, 11, 32), "hard": (15, 12, 68)},
    },
    "pythagorean": {
        "flat": {"easy": (3, 3, 14, 61), "medium": (4, 4, 27, 45), "hard": (6, 6, 71, 31)},
        "torus": {"easy": (1, 10, 14, 0.45), "medium": (2, 10, 32, 0.45), "hard": (5, 7, 66, 0.45)},
        "cylinder": {"easy": (1, 10, 14), "medium": (2, 10, 32), "hard": (5, 7, 66)},
    },
    "rotatedhex": {
        "flat": {"easy": (5, 3, 13, 43), "medium": (7, 4, 28, 34), "hard": (10, 6, 72, 24)},
        "torus": {"easy": (4, 4, 13, 0.45), "medium": (3, 11, 32, 0.45), "hard": (4, 15, 68, 0.45)},
        "cylinder": {"easy": (2, 8, 13), "medium": (3, 11, 32), "hard": (4, 15, 68)},
    },
    "rotatedtri": {
        "flat": {"easy": (5, 3, 13, 64), "medium": (7, 4, 27, 48), "hard": (10, 6, 68, 34)},
        "torus": {"easy": (4, 4, 13, 0.45), "medium": (5, 7, 34, 0.45), "hard": (7, 8, 64, 0.45)},
        "cylinder": {"easy": (2, 8, 13), "medium": (3, 11, 32), "hard": (4, 15, 68)},
    },
    "threescaletri": {
        "flat": {"easy": (5, 3, 13, 65), "medium": (7, 4, 28, 46), "hard": (10, 6, 72, 32)},
        "torus": {"easy": (2, 8, 13, 0.45), "medium": (3, 11, 32, 0.45), "hard": (4, 15, 68, 0.45)},
        "cylinder": {"easy": (2, 8, 13), "medium": (3, 11, 32), "hard": (4, 15, 68)},
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
        "flat": {"easy": (7, 14, 15, 70), "medium": (10, 20, 37, 45), "hard": (13, 26, 67, 38)},
        "torus": {"easy": (10, 10, 14, 0.45), "medium": (14, 14, 31, 0.45), "hard": (14, 25, 66, 0.45)},
        "cylinder": {"easy": (10, 10, 14), "medium": (14, 14, 31), "hard": (14, 25, 66)},
        "mobius": {"easy": (10, 10, 14), "medium": (14, 14, 31), "hard": (14, 25, 66)},
        "klein": {"easy": (10, 10, 14), "medium": (14, 14, 31), "hard": (14, 25, 66)},
    },
    "runningbond": {
        "flat": {"easy": (7, 7, 16, 61), "medium": (10, 10, 35, 45), "hard": (13, 13, 69, 35)},
        "torus": {"easy": (10, 5, 14, 0.45), "medium": (10, 10, 32, 0.45), "hard": (12, 15, 68, 0.45)},
        "cylinder": {"easy": (5, 10, 14), "medium": (10, 10, 32), "hard": (12, 15, 68)},
        "mobius": {"easy": (10, 5, 14), "medium": (10, 10, 32), "hard": (12, 15, 68)},
        "klein": {"easy": (5, 10, 14), "medium": (10, 10, 32), "hard": (15, 12, 68)},
    },
    "basketweave": {
        "flat": {"easy": (4, 4, 18, 54), "medium": (5, 5, 32, 45), "hard": (6, 6, 55, 38)},
        "torus": {"easy": (1, 12, 13, 0.45), "medium": (5, 5, 32, 0.45), "hard": (4, 11, 67, 0.45)},
        "cylinder": {"easy": (1, 12, 13), "medium": (5, 5, 32), "hard": (4, 11, 67)},
        "mobius": {"easy": (5, 5, 14), "medium": (5, 10, 32), "hard": (11, 8, 67)},
        "klein": {"easy": (5, 5, 14), "medium": (5, 10, 32), "hard": (11, 8, 67)},
    },
    "basketweave3": {
        "flat": {"easy": (3, 3, 15, 70), "medium": (4, 4, 31, 54), "hard": (5, 5, 57, 45)},
        "torus": {"easy": (1, 8, 13, 0.45), "medium": (2, 8, 31, 0.45), "hard": (2, 15, 68, 0.45)},
        "cylinder": {"easy": (1, 8, 13), "medium": (2, 8, 31), "hard": (2, 15, 68)},
        "mobius": {"easy": (3, 6, 15), "medium": (3, 11, 32), "hard": (5, 12, 68)},
        "klein": {"easy": (3, 6, 15), "medium": (3, 11, 32), "hard": (5, 12, 68)},
    },
    "herringbone": {
        "flat": {"easy": (4, 4, 19, 58), "medium": (5, 5, 34, 47), "hard": (6, 6, 57, 39)},
        "torus": {"easy": (1, 12, 13, 0.45), "medium": (5, 5, 32, 0.45), "hard": (4, 11, 67, 0.45)},
        "cylinder": {"easy": (1, 12, 13), "medium": (5, 5, 32), "hard": (4, 11, 67)},
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
