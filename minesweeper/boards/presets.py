"""Difficulty presets and the build_board entry point.

The regular tilings, one-off solids and Archimedean/Laves tilings all
build from data/presets.json (the shared source both front-ends read).
The Archimedean presets are authored in the compact ARCH_PRESETS table
below (tiling -> surface -> difficulty -> builder args); adding an
Archimedean tiling is one ARCH_PRESETS row, expanded into presets.json
by scripts/export_data.py. See docs/agents/board-recipes.md.
"""

from __future__ import annotations

from minesweeper.boards._data import load
from minesweeper.boards.aperiodic import (
    ammann_beenker_board,
    brick_rings_board,
    kitedart_board,
    klaassen_board,
    penrose_board,
    pentaspiral5_board,
    pentaspiral6_board,
    pentaspiral7_board,
    phyllotaxis_board,
    spectre_board,
)
from minesweeper.boards.archimedean import (
    cuboctahedron_board,
    rhombicosidodecahedron_split_board,
    snub_cube_board,
    snub_dodecahedron_split_board,
    truncated_icosidodecahedron_split_board,
    truncated_octahedron_board,
)
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
from minesweeper.boards.hurwitz import hurwitz_board
from minesweeper.boards.hyperbolic import (
    binary_board,
    hyperbolic_board,
    hyperbolic_uniform_board,
)
from minesweeper.boards.solids import (
    brick_cube_board,
    c180_board,
    cube_board,
    cube_frame_board,
    dodecahedron_board,
    gp21_board,
    icosahedron_board,
    octahedron_board,
    sphere_square_board,
    sphere_triangle_board,
    stepped_bipyramid_board,
    stepped_pyramid_board,
    tetrahedron_board,
    tetrahedron_frame_board,
)
from minesweeper.boards.surfaces import (
    arch_cylinder_board,
    arch_klein_board,
    arch_mobius_board,
    arch_torus_board,
    boy_board,
    cylinder_board,
    cylinder_hex_board,
    cylinder_triangle_board,
    double_torus_board,
    double_torus_hex_board,
    double_torus_triangle_board,
    klein_board,
    klein_hex_board,
    klein_triangle_board,
    mobius_board,
    mobius_hex_board,
    mobius_triangle_board,
    projective_board,
    projective_hex_board,
    projective_triangle_board,
    torus_board,
    torus_hex_board,
    torus_triangle_board,
    trefoil_board,
    trefoil_hex_board,
    trefoil_triangle_board,
)
from minesweeper.boards.tilings import (
    archimedean_board,
    hex_board,
    hexhex_board,
    hextri_board,
    hextriangle_board,
    square_board,
    square_diamond_board,
    triangle_board,
    triangle_grid_board,
)
from minesweeper.boards.volume import solid_cube_board

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
    "square_diamond_board": square_diamond_board,
    "c180_board": c180_board,
    "gp21_board": gp21_board,
    "sphere_square_board": sphere_square_board,
    "sphere_triangle_board": sphere_triangle_board,
    # the Archimedean solids cut into boards (boards/archimedean.py), duals of
    # their Catalan solids; (mine_count, frequency) like those. The three
    # icosahedral ones take frequency 0 as well, the solid uncut.
    "cuboctahedron_board": cuboctahedron_board,
    "truncated_octahedron_board": truncated_octahedron_board,
    "snub_cube_board": snub_cube_board,
    "rhombicosidodecahedron_split_board": rhombicosidodecahedron_split_board,
    "truncated_icosidodecahedron_split_board": truncated_icosidodecahedron_split_board,
    "snub_dodecahedron_split_board": snub_dodecahedron_split_board,
    "cube_board": cube_board,
    "cube_frame_board": cube_frame_board,
    # the one volume board: a solid cube of cells, 26 neighbours
    "solid_cube_board": solid_cube_board,
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
    # the donut's three lattices on a tube round a trefoil knot
    "trefoil_board": trefoil_board,
    "trefoil_triangle_board": trefoil_triangle_board,
    "trefoil_hex_board": trefoil_hex_board,
    # the real projective plane: a cubed sphere, a geodesic sphere and its
    # Goldberg dual with antipodes identified, drawn as the whole sphere
    "projective_board": projective_board,
    "projective_triangle_board": projective_triangle_board,
    "projective_hex_board": projective_hex_board,
    # the same cubed-sphere board drawn once, on Boy's surface
    "boy_board": boy_board,
    # the genus-2 board: two square-tiled donuts merged at their outer rims
    "double_torus_board": double_torus_board,
    "double_torus_triangle_board": double_torus_triangle_board,
    "double_torus_hex_board": double_torus_hex_board,
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
    # kitedart_board(subdivisions, mine_count, scale, keep): penrose's
    # arguments, for the same reason -- it is the same substitution machinery.
    "kitedart_board": kitedart_board,
    # ammann_beenker_board(levels, mine_count, scale, keep), Penrose's order.
    "ammann_beenker_board": ammann_beenker_board,
    "spectre_board": spectre_board,
    "phyllotaxis_board": phyllotaxis_board,
    # klaassen_board(turns, mine_count, keep, scale): ``turns`` only has to
    # grow the spiral well past ``keep``, as ``rings`` does for phyllotaxis.
    "klaassen_board": klaassen_board,
    # The pentagonal spirals, one builder per fold, each
    # pentaspiralN_board(rings, mine_count, keep, scale) as phyllotaxis.
    "pentaspiral5_board": pentaspiral5_board,
    "pentaspiral6_board": pentaspiral6_board,
    "pentaspiral7_board": pentaspiral7_board,
    # The brick rings fill their square exactly, so the only size knob is
    # the ring count: brick_rings_board(rings, mine_count, scale).
    "brick_rings_board": brick_rings_board,
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
    # The hyperbolic boards: hyperbolic_board(p, q, shells, mine_count, scale),
    # the {p,q} tiling in the Poincare disc trimmed to the faces at its
    # ``shells`` smallest distances from the centre (boards/hyperbolic.py).
    "hyperbolic_board": hyperbolic_board,
    # ...and the uniform tilings Wythoff's construction makes of one,
    # hyperbolic_uniform_board(p, q, op, shells, mine_count, scale): 6.6.7,
    # 3.7.3.7, 3.4.7.4 and 4.6.14 from {7,3}, trimmed the same way.
    "hyperbolic_uniform_board": hyperbolic_uniform_board,
    # Böröczky's binary tiling in the upper half-plane: binary_board(top,
    # levels, mine_count, scale), top * (2**levels - 1) cells.
    "binary_board": binary_board,
    # The closed hyperbolic surfaces: hurwitz_board(surface, op, margin,
    # mine_count, scale), a Hurwitz surface tiled in ``op`` and drawn as a
    # patch of the disc that covers it (boards/hurwitz.py). The surface is the
    # size: 80, 240 and 520 cells of 6.6.7.
    "hurwitz_board": hurwitz_board,
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
        "flat": {"easy": (6.5, 2.211, 9, 65.143, (0.0, 0.0)), "medium": (13.5, 3.5, 41, 33.786, (0.0, 0.0)), "hard": (17.5, 4.5, 98, 25.0, (0.0, 0.0))},
        "torus": {"easy": (7, 2, 18, 0.52), "medium": (15, 3, 61, 0.52), "hard": (27, 3, 123, 0.38)},
        "cylinder": {"easy": (13, 1 + 1 / (2 + ROOT3), 6), "medium": (23, 1.5 + 1 / (2 + ROOT3), 33), "hard": (32, 2.5 + 1 / (2 + ROOT3), 99)},
        "mobius": {"easy": (13, 1 + 1 / (2 + ROOT3), 6), "medium": (22, 2 + 1 / (2 + ROOT3), 44), "hard": (32, 2 + 1 / (2 + ROOT3), 83)},
        "klein": {"easy": (7, 2, 16, 1.3), "medium": (22, 2, 59, 0.85), "hard": (27, 3, 127, 1.15)},
    },
    "snubsquare": {
        "flat": {"easy": (3.5, 3.5, 8, 68.86), "medium": (6.5, 6.5, 39, 38.217, (0.965925, 1.448889)), "hard": (9.5, 9.5, 112, 26.149, (1.931851, 0.482963))},
        "torus": {"easy": (5, 3, 20, 0.52), "medium": (11, 4, 63, 0.33), "hard": (16, 5, 129, 0.28)},
        "cylinder": {"easy": (7, 2, 12), "medium": (11, 3.5, 38), "hard": (16, 5, 108)},
        "mobius": {"easy": (13, 2, 12), "medium": (23, 4, 43), "hard": (31, 5, 102)},
        "klein": {"easy": (9, 3, 18, 1.3), "medium": (21, 4, 62, 1.3), "hard": (27, 6, 132, 1.3)},
    },
    "trihex": {
        "flat": {"easy": (4.5, 2.833, 9, 48), "medium": (8.5, 5.167, 44, 26.667, (0.0, 1.732051)), "hard": (12.5, 7.167, 111, 16.923)},
        "torus": {"easy": (5, 3, 18, 0.52), "medium": (15, 3, 60, 0.33), "hard": (20, 4, 116, 0.33)},
        "cylinder": {"easy": (9, 1.5, 9), "medium": (15, 3, 47), "hard": (21, 4, 102)},
        "mobius": {"easy": (9, 1.5, 11), "medium": (15, 2.5, 37), "hard": (20, 3.5, 86)},
        "klein": {"easy": (5, 3, 16, 1.3), "medium": (14, 3, 54, 1.15), "hard": (16, 5, 121, 1.3)},
    },
    "snubhex": {
        "flat": {"easy": (3.143, 1.548, 13, 45.872, (1.133893, 3.600595)), "medium": (5.143, 2.857, 34, 35.2, (1.133893, 1.309308)), "hard": (6.857, 4.071, 95, 25.418, (1.133893, 3.600595))},
        "torus": {"easy": (4, 2, 26, 0.52), "medium": (7, 2, 51, 0.45), "hard": (8, 3, 107, 0.49)},
        "cylinder": {"easy": (5, 11 / 14, 7), "medium": (8, 1 + 11 / 14, 36), "hard": (12, 2 + 2 / 7, 98)},
    },
    "truncsquare": {
        "flat": {"easy": (6.5, 6.5, 8, 29), "medium": (11.5, 11.5, 38, 16.775, (1.207107, 1.207107)), "hard": (15.5, 15.5, 82, 12.737, (1.207107, 1.207107))},
        "torus": {"easy": (10, 4, 7, 0.33), "medium": (21, 6, 39, 0.28), "hard": (24, 10, 98, 0.38)},
        "cylinder": {"easy": (11, 3.5, 5), "medium": (20, 6.5, 30), "hard": (27, 8.5, 70)},
        "mobius": {"easy": (11, 3.5, 4), "medium": (20, 6.5, 29), "hard": (27, 8.5, 68)},
        "klein": {"easy": (10, 4, 7, 1.15), "medium": (16, 8, 48, 1.3), "hard": (24, 10, 98, 1.3)},
    },
    "trunchex": {
        "flat": {"easy": (4.5, 3.167, 4, 26.6), "medium": (9.5, 5.167, 15, 12.6, (0.0, 3.232051)), "hard": (12.5, 7.167, 39, 9.308)},
        "torus": {"easy": (5, 3, 6, 0.52), "medium": (14, 3, 16, 0.35), "hard": (20, 4, 40, 0.33)},
        "cylinder": {"easy": (9, 1.5, 4), "medium": (15, 3, 13), "hard": (21, 4, 37)},
        "mobius": {"easy": (9, 1.5, 4), "medium": (15, 2.5, 11), "hard": (20, 3.5, 30)},
        "klein": {"easy": (5, 3, 6, 1.3), "medium": (14, 3, 17, 1.15), "hard": (16, 5, 45, 1.3)},
    },
    "rhombitrihex": {
        "flat": {"easy": (3.75, 2.167, 8, 48.457, (0.0, 2.366025)), "medium": (6.25, 3.583, 28, 26.53), "hard": (8.25, 4.583, 68, 19.979, (0.0, 2.366025))},
        "torus": {"easy": (4, 2, 14, 0.52), "medium": (11, 2, 37, 0.28), "hard": (13, 3, 81, 0.38)},
        "cylinder": {"easy": (7, 1 + 1 / 6, 12), "medium": (11, 2 + 1 / 6, 36), "hard": (15, 2 + 2 / 3, 77)},
        "mobius": {"easy": (7, 1 + 1 / 6, 12), "medium": (11, 2 + 1 / 6, 40), "hard": (15, 3 + 1 / 6, 88)},
        "klein": {"easy": (4, 2, 11, 1.3), "medium": (11, 2, 37, 0.85), "hard": (13, 3, 83, 1.15)},
    },
    "trunctrihex": {
        "flat": {"easy": (3.25, 2.167, 9, 27.89), "medium": (6.25, 3.833, 30, 14.864), "hard": (8.25, 4.833, 73, 11.25)},
        "torus": {"easy": (4, 2, 13, 0.52), "medium": (8, 3, 47, 0.52), "hard": (13, 3, 87, 0.38)},
        "cylinder": {"easy": (6, 1 + 5 / 12, 12), "medium": (12, 1 + 11 / 12, 32), "hard": (15, 2 + 11 / 12, 80)},
        "mobius": {"easy": (6, 1 + 5 / 12, 10), "medium": (11, 2 + 5 / 12, 39), "hard": (16, 2 + 5 / 12, 69)},
        "klein": {"easy": (4, 2, 14, 1.3), "medium": (7, 3, 41, 1.3), "hard": (13, 3, 89, 1.3)},
    },
    # Laves (dual) tilings: same fundamental domain as the Archimedean tiling
    # they dualise, so the windows/seams carry over; only the mine counts are
    # retuned to the dual's (different) tile counts.
    "prismaticpent": {
        "flat": {"easy": (8.5, 2.5, 11, 50.667, (0.0, 0.0)), "medium": (14.5, 4, 40, 31.533), "hard": (21.5, 6, 105, 20.455)},
        "torus": {"easy": (11, 2, 19, 0.52), "medium": (21, 3, 58, 0.45), "hard": (40, 3, 118, 0.28)},
        "cylinder": {"easy": (15, 1.5, 14), "medium": (27, 2.5, 51), "hard": (38, 3, 101)},
        "mobius": {"easy": (18, 1, 8), "medium": (28, 2, 43), "hard": (37, 3, 98)},
        "klein": {"easy": (10, 2, 17, 1.3), "medium": (21, 3, 56, 1.3), "hard": (40, 3, 116, 0.85)},
    },
    "cairo": {
        "flat": {"easy": (4.5, 4.5, 11, 45.482), "medium": (8, 8, 34, 28.559), "hard": (11, 11, 86, 21.226, (0.965925, 0.482963))},
        "torus": {"easy": (7, 3, 12, 0.38), "medium": (16, 4, 47, 0.28), "hard": (20, 6, 105, 0.28)},
        "cylinder": {"easy": (8, 2.5, 9), "medium": (14, 4.5, 32), "hard": (19, 6, 84)},
        "mobius": {"easy": (17, 2.5, 9), "medium": (29, 4.5, 38), "hard": (39, 6.5, 94)},
        "klein": {"easy": (13, 3, 14, 1.3), "medium": (25, 5, 47, 1.15), "hard": (35, 7, 113, 1.15)},
    },
    "rhombille": {
        "flat": {"easy": (4.75, 2.75, 6, 48, (0.0, 1.732051)), "medium": (8.25, 4.75, 7, 26.667, (0.0, 0.0)), "hard": (11.75, 6.75, 18, 18.333, (0.0, 1.732051))},
        "torus": {"easy": (7, 2, 5, 0.45), "medium": (14, 3, 9, 0.33), "hard": (20, 4, 17, 0.33)},
        "cylinder": {"easy": (9, 1.75, 7), "medium": (15, 2.75, 9), "hard": (21, 3.75, 19)},
        "mobius": {"easy": (11, 1.25, 6), "medium": (15, 3.25, 10), "hard": (22, 4.25, 20)},
        "klein": {"easy": (7, 2, 6, 1.3), "medium": (11, 4, 9, 1.3), "hard": (16, 5, 18, 1.3)},
    },
    "floret": {
        "flat": {"easy": (3.214, 2, 8, 40.48, (0.472456, 2.454951)), "medium": (6.143, 3.5, 33, 25.714, (1.133894, 1.309308)), "hard": (8.214, 4.786, 80, 19.734)},
        "torus": {"easy": (4, 2, 16, 0.52), "medium": (11, 2, 47, 0.28), "hard": (13, 3, 97, 0.38)},
        "cylinder": {"easy": (7, 1, 9), "medium": (11, 2, 41), "hard": (15, 2.5, 81)},
    },
    "tetrakis": {
        "flat": {"easy": (5.0, 4.667, 8, 34.8, (1.207107, 0.0)), "medium": (8, 8, 27, 24.938), "hard": (11, 11, 69, 19.21, (1.207107, 1.207107))},
        "torus": {"easy": (5, 4, 9, 0.52), "medium": (13, 5, 26, 0.38), "hard": (17, 7, 68, 0.45)},
        "cylinder": {"easy": (9, 2, 8), "medium": (14, 5, 26), "hard": (19, 6, 69)},
        "mobius": {"easy": (10, 2, 8), "medium": (14, 5, 28), "hard": (19, 6, 69)},
        "klein": {"easy": (5, 4, 9, 1.3), "medium": (13, 5, 27, 1.3), "hard": (24, 5, 67, 0.85)},
    },
    "triakis": {
        "flat": {"easy": (3.5, 2.278, 12, 35.286, (1.866025, 0.0)), "medium": (5.833, 3.278, 36, 21.359, (1.866025, 0.0)), "hard": (8.833, 5, 106, 13.588)},
        "torus": {"easy": (4, 2, 12, 0.45), "medium": (11, 2, 42, 0.38), "hard": (14, 3, 101, 0.38)},
        "cylinder": {"easy": (7, 1, 11), "medium": (11, 2, 42), "hard": (15, 2.5, 90)},
        "mobius": {"easy": (7, 1, 11), "medium": (11, 2, 42), "hard": (15, 3, 108)},
        "klein": {"easy": (4, 2, 12, 1.15), "medium": (11, 2, 42, 1.3), "hard": (20, 2, 96, 0.7)},
    },
    "deltoidal": {
        "flat": {"easy": (3.188, 2, 6, 49.692), "medium": (5.812, 3.313, 31, 29.12, (0.0, 2.366025)), "hard": (8.812, 5, 91, 19.089)},
        "torus": {"easy": (4, 2, 13, 0.52), "medium": (11, 2, 44, 0.28), "hard": (13, 3, 102, 0.38)},
        "cylinder": {"easy": (6, 1, 10), "medium": (11, 2, 42), "hard": (15, 2.5, 91)},
        "mobius": {"easy": (6, 1, 10), "medium": (11, 2, 39), "hard": (13, 3, 95)},
        "klein": {"easy": (4, 2, 13, 1.3), "medium": (10, 2, 41, 1.0), "hard": (13, 3, 102, 1.15)},
    },
    "kisrhombille": {
        "flat": {"easy": (3, 1.333, 6, 28), "medium": (4.417, 2.806, 30, 18.0), "hard": (6, 3.333, 63, 15.167, (0.0, 4.098076))},
        "torus": {"easy": (4, 2, 12, 0.52), "medium": (6, 2, 26, 0.52), "hard": (10, 2, 68, 0.33)},
        "cylinder": {"easy": (9, 0.5, 7), "medium": (8, 1.5, 29), "hard": (11, 2, 68)},
        "mobius": {"easy": (6, 1, 10), "medium": (11, 1, 27), "hard": (11, 2, 73)},
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
        "flat": {"easy": (8.5, 4.5, 12, 55, (0.0, 0.0)), "medium": (16.5, 8.5, 46, 29.059, (0.0, 0.0)), "hard": (22.5, 11.5, 108, 21.479, (0.0, 0.0))},
        "torus": {"easy": (14, 3, 16, 0.38), "medium": (21, 6, 59, 0.52), "hard": (34, 7, 120, 0.38)},
        "cylinder": {"easy": (16, 2.5, 14), "medium": (28, 4.5, 47), "hard": (39, 6, 102)},
        "mobius": {"easy": (16, 2.5, 15), "medium": (28, 4.5, 48), "hard": (39, 6.5, 113)},
        "klein": {"easy": (13, 3, 15, 1.0), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 120, 1.3)},
    },
    "staggeredtri": {
        "flat": {"easy": (6, 3.5, 12, 75.077, (0.25, 0.433013)), "medium": (10, 6, 46, 43.714, (0.75, 0.0)), "hard": (14, 8.5, 112, 34.069, (0.25, 0.433013))},
        "torus": {"easy": (7, 3, 18, 0.52), "medium": (16, 4, 58, 0.38), "hard": (20, 6, 131, 0.45)},
        "cylinder": {"easy": (12, 1.5, 14), "medium": (19, 3.5, 56), "hard": (26, 4.5, 115)},
        "mobius": {"easy": (35, 1, 9), "medium": (41, 3, 49), "hard": (49, 5, 118)},
        "klein": {"easy": (21, 2, 18, 1.0), "medium": (33, 4, 62, 1.15), "hard": (41, 6, 131, 1.3)},
    },
    "pythagorean": {
        "flat": {"easy": (2.9, 2.9, 9, 65.066, (0.25, 2.25)), "medium": (4.9, 5.1, 33, 38.077), "hard": (6.9, 6.9, 73, 28.343, (0.25, 2.25))},
        "torus": {"easy": (4, 2, 12, 0.38), "medium": (9, 3, 47, 0.33), "hard": (12, 4, 96, 0.33)},
        "cylinder": {"easy": (5, 1 + 7 / 10, 10), "medium": (9, 2 + 9 / 10, 33), "hard": (12, 3 + 9 / 10, 77)},
    },
    "rotatedhex": {
        "flat": {"easy": (5, 2.667, 4, 43.89, (0.450694, 2.341874)), "medium": (9.5, 5.167, 17, 25.955, (0.0, 1.561249)), "hard": (12, 7, 33, 21.137, (0.450694, 2.341874))},
        "torus": {"easy": (5, 3, 6, 0.52), "medium": (14, 3, 16, 0.33), "hard": (20, 4, 41, 0.33)},
        "cylinder": {"easy": (9, 1.5, 4), "medium": (15, 3, 13), "hard": (21, 4, 36)},
    },
    "rotatedtri": {
        "flat": {"easy": (5, 2.667, 11, 69.973, (0.330718, 0.572822)), "medium": (8.5, 4.833, 43, 42.537, (0.661438, 2.291287)), "hard": (12.5, 7.167, 112, 28.682)},
        "torus": {"easy": (7, 2, 12, 0.45), "medium": (14, 3, 56, 0.33), "hard": (16, 5, 123, 0.45)},
        "cylinder": {"easy": (9, 1.5, 14), "medium": (15, 3, 49), "hard": (21, 4, 111)},
    },
    "threescaletri": {
        "flat": {"easy": (4, 3, 12, 77.817), "medium": (9, 5, 48, 36.865), "hard": (12, 7, 115, 27.104)},
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
        "flat": {"easy": (6, 12, 6, 81.667, (0.0, 0.0)), "medium": (11, 22, 40, 45, (0.5, 0.0)), "hard": (15, 30, 93, 32.933, (0.5, 0.0))},
        "torus": {"easy": (20, 4, 15, 0.38), "medium": (21, 12, 58, 0.33), "hard": (24, 20, 131, 0.45)},
        "cylinder": {"easy": (12, 7, 13), "medium": (20, 13, 52), "hard": (27, 17, 107)},
        "mobius": {"easy": (12, 7, 15), "medium": (20, 13, 47), "hard": (28, 17, 113)},
        "klein": {"easy": (16, 5, 15, 0.85), "medium": (23, 11, 62, 1.3), "hard": (32, 15, 127, 1.3)},
    },
    "runningbond": {
        "flat": {"easy": (6.5, 6.5, 12, 69.714, (0.0, 0.0)), "medium": (11.5, 11.5, 44, 41.25, (0.0, 0.0)), "hard": (15.5, 15.5, 99, 30.625, (0.0, 0.0))},
        "torus": {"easy": (10, 4, 14, 0.45), "medium": (18, 7, 58, 0.45), "hard": (30, 8, 122, 0.28)},
        "cylinder": {"easy": (12, 3.5, 16), "medium": (20, 6.5, 52), "hard": (28, 8.5, 112)},
        "mobius": {"easy": (12, 3.5, 16), "medium": (20, 6.5, 52), "hard": (27, 8.5, 110)},
        "klein": {"easy": (14, 3, 15, 1.3), "medium": (26, 5, 57, 1.15), "hard": (34, 7, 119, 1.3)},
    },
    "basketweave": {
        "flat": {"easy": (3, 3, 10, 72, (0.0, 1.0)), "medium": (5.5, 5.5, 39, 40.909, (0.5, 0.5)), "hard": (7.5, 7.5, 88, 30.4, (0.5, 1.5))},
        "torus": {"easy": (5, 2, 12, 0.45), "medium": (8, 4, 46, 0.45), "hard": (15, 4, 105, 0.28)},
        "cylinder": {"easy": (5, 2, 12), "medium": (10, 3, 41), "hard": (14, 4.5, 101)},
        "mobius": {"easy": (11, 2, 15), "medium": (19, 3, 39), "hard": (29, 4, 93)},
        "klein": {"easy": (9, 2, 13, 1.3), "medium": (17, 4, 50, 1.3), "hard": (23, 5, 107, 1.3)},
    },
    "basketweave3": {
        "flat": {"easy": (2.806, 2.806, 12, 74.118, (0.5, 1.5)), "medium": (4.806, 4.806, 42, 44.69, (0.5, 0.5)), "hard": (6.194, 6.194, 97, 34.615, (0.5, 1.5))},
        "torus": {"easy": (4, 2, 20, 0.52), "medium": (7, 3, 53, 0.38), "hard": (10, 4, 115, 0.38)},
        "cylinder": {"easy": (5, 1.5, 12), "medium": (8, 2.5, 41), "hard": (11, 3.5, 94)},
        "mobius": {"easy": (15, 1, 10), "medium": (17, 3, 54), "hard": (23, 4, 112)},
        "klein": {"easy": (9, 2, 21, 1.3), "medium": (15, 3, 56, 1.15), "hard": (21, 4, 119, 1.15)},
    },
    "herringbone": {
        "flat": {"easy": (3.125, 3.375, 11, 75.846, (0.25, 1.5)), "medium": (5.625, 5.875, 45, 42.913), "hard": (7.625, 7.875, 99, 31.451, (0.25, 0.5))},
        "torus": {"easy": (5, 2, 17, 0.38), "medium": (8, 4, 60, 0.45), "hard": (12, 5, 122, 0.38)},
        "cylinder": {"easy": (6, 1 + 7 / 8, 14), "medium": (10, 3 + 1 / 8, 42), "hard": (14, 4 + 3 / 8, 105)},
    },
    # The 2-uniform family reaches the plane, the torus, the cylinder and the
    # Mobius strip (_FAMILY_SURFACES in catalog.py), so its twenty carry the
    # first three rows and all but one the fourth -- studdedtri2 (p6) has no
    # mirror or glide to glue the seam through, while snubelongated (pgg)
    # glues through its glide, and elongated3 wraps turned a quarter turn
    # (both in the layout _wrap_template returns, which is what their strip
    # rows count; the donut reads its own torus layout where one is declared --
    # elongated3 flat, elongated2 and trirhombitrihex turned, see _with_torus).
    # Ten easy donuts are 4x2 domains (hexrings 4x1), the smallest that close,
    # and well over the easy size -- see EXEMPT_ROWS in tests/test_presets.py.
    # Each cylinder row count ends in the fraction that centres the
    # strip on one of the tiling's flip levels (see arch_cylinder_board), and
    # each Mobius one in the fraction that makes rows + 2*cut/height whole
    # (see arch_mobius_board), given its cut.
    "studdedtri": {
        "flat": {"easy": (2.5, 1.333, 9, 80.0, (0.0, 2.598076)), "medium": (3.833, 2.333, 34, 46.667, (0.0, 2.598076)), "hard": (5.5, 3.333, 86, 31.373, (0.0, 2.598076))},
        "torus": {"easy": (4, 2, 35, 0.52), "medium": (5, 2, 54, 0.52), "hard": (9, 2, 116, 0.45)},
        "cylinder": {"easy": (4, 2 / 3, 10), "medium": (7, 1 + 1 / 6, 35), "hard": (10, 1 + 2 / 3, 90)},
        "mobius": {"easy": (4, 2 / 3, 10), "medium": (12, 2 / 3, 28), "hard": (10, 1 + 2 / 3, 92)},
    },
    "studdedtri2": {
        "flat": {"easy": (1.923, 1.038, 8, 79.877, (0.901388, 4.683749)), "medium": (3.154, 1.846, 39, 45.872, (0.901388, 1.56125)), "hard": (4.423, 2.538, 93, 32.191, (1.802776, 0.0))},
        "torus": {"easy": (4, 2, 68, 0.52), "medium": (4, 2, 80, 0.52), "hard": (6, 2, 129, 0.45)},
        "cylinder": {"easy": (4, 1 / 2, 11), "medium": (6, 1, 39), "hard": (8, 1 + 1 / 2, 105)},
    },
    "elongated2": {
        "flat": {"easy": (6.5, 2.711, 12, 78.367), "medium": (11.5, 4.289, 42, 43.333, (0.5, 1.366025)), "hard": (16.5, 6, 105, 30.0)},
        "torus": {"easy": (4, 4, 11, 0.38), "medium": (7, 7, 49, 0.33), "hard": (8, 12, 123, 0.45)},
        "cylinder": {"easy": (12, 1 + 1 / 3, 12), "medium": (20, 2 + 1 / 3, 44), "hard": (29, 3 + 1 / 3, 110)},
        "mobius": {"easy": (12, 1 + 1 / 3, 12), "medium": (21, 2 + 1 / 3, 46), "hard": (29, 3 + 1 / 3, 108)},
    },
    "elongated3": {
        "flat": {"easy": (6.5, 0.89, 14, 80.0), "medium": (11.5, 1.62, 41, 43.636), "hard": (16.5, 2.38, 117, 30.0)},
        "torus": {"easy": (6, 1, 15, 0.52), "medium": (18, 1, 60, 0.38), "hard": (34, 1, 127, 0.28)},
        "cylinder": {"easy": (2, 2 + 5 / 6, 11), "medium": (3, 6 + 1 / 3, 45), "hard": (4, 8 + 1 / 3, 103)},
        "mobius": {"easy": (2, 2 + 1 / 3, 9), "medium": (3, 5 + 1 / 3, 36), "hard": (7, 4 + 1 / 3, 69)},
    },
    "trirhombitrihex": {
        "flat": {"easy": (2.539, 1.583, 14, 58.564), "medium": (4.461, 2.728, 40, 37.914, (0.0, 2.366025)), "hard": (6.317, 3.728, 113, 26.483, (0.0, 2.366025))},
        "torus": {"easy": (4, 2, 12, 0.28), "medium": (4, 3, 56, 0.38), "hard": (7, 3, 113, 0.28)},
        "cylinder": {"easy": (5, 5 / 7, 13), "medium": (7, 1 + 5 / 7, 54), "hard": (11, 2 + 3 / 14, 123)},
        "mobius": {"easy": (5, 5 / 7, 12), "medium": (7, 1 + 5 / 7, 54), "hard": (12, 1 + 5 / 7, 103)},
    },
    "tritrunctrihex": {
        "flat": {"easy": (2.106, 1.228, 5, 50.718), "medium": (4.106, 2.096, 11, 25.359), "hard": (5.356, 3.096, 33, 20.287)},
        "torus": {"easy": (4, 2, 9, 0.52), "medium": (4, 2, 10, 0.52), "hard": (5, 3, 36, 0.52)},
        "cylinder": {"easy": (4, 0.5 + ROOT3 / 18, 5), "medium": (7, 1 + ROOT3 / 18, 12), "hard": (9, 1.5 + ROOT3 / 18, 32)},
        "mobius": {"easy": (5, 1 + ROOT3 / 18, 7), "medium": (7, 1 + ROOT3 / 18, 12), "hard": (12, 1 + ROOT3 / 18, 27)},
    },
    "fannedhex": {
        "flat": {"easy": (3.167, 1.833, 6, 53.333, (0.0, 2.598076)), "medium": (5.167, 3, 12, 32.0), "hard": (7.167, 4.167, 33, 22.857, (0.0, 2.598076))},
        "torus": {"easy": (4, 2, 7, 0.52), "medium": (8, 2, 11, 0.33), "hard": (10, 3, 32, 0.45)},
        "cylinder": {"easy": (6, 4 / 5, 5), "medium": (10, 1 + 4 / 5, 12), "hard": (13, 2 + 3 / 10, 32)},
        "mobius": {"easy": (6, 4 / 5, 6), "medium": (10, 1 + 4 / 5, 11), "hard": (12, 2 + 4 / 5, 36)},
    },
    "hexbands": {
        "flat": {"easy": (5.167, 1.8, 6, 55.426), "medium": (9.167, 3.2, 27, 30.792), "hard": (12.167, 4.2, 66, 23.094, (0.0, 2.5))},
        "torus": {"easy": (4, 2, 6, 0.52), "medium": (13, 2, 27, 0.45), "hard": (16, 3, 67, 0.45)},
        "cylinder": {"easy": (8, 1 + 1 / 3, 11), "medium": (16, 1 + 5 / 6, 27), "hard": (22, 2 + 1 / 3, 66)},
        "mobius": {"easy": (9, 1 + 1 / 3, 10), "medium": (20, 1 + 1 / 3, 25), "hard": (22, 2 + 1 / 3, 63)},
    },
    "snubelongated": {
        "flat": {"easy": (3.76, 2, 13, 66.05, (0.965926, 0.0)), "medium": (6.76, 3.5, 42, 36.81, (0.965926, 1.931852)), "hard": (8.76, 4.5, 97, 28.408)},
        "torus": {"easy": (4, 2, 20, 0.52), "medium": (11, 2, 61, 0.33), "hard": (13, 3, 127, 0.38)},
        "cylinder": {"easy": (7, 1, 5), "medium": (12, 2, 40), "hard": (16, 2 + 1 / 2, 95)},
        "mobius": {"easy": (13, 1, 5), "medium": (23, 2, 42), "hard": (29, 3, 109)},
    },
    "snubelongated2": {
        "flat": {"easy": (1.606, 1.522, 11, 62.702, (0.0, 2.366025)), "medium": (2.728, 2.728, 39, 38.936, (0.0, 2.366025)), "hard": (3.606, 3.728, 105, 28.188)},
        "torus": {"easy": (4, 2, 52, 0.45), "medium": (4, 2, 64, 0.45), "hard": (7, 2, 135, 0.28)},
        "cylinder": {"easy": (3, 5 / 7, 9), "medium": (4, 1 + 5 / 7, 45), "hard": (6, 2 + 3 / 14, 107)},
        "mobius": {"easy": (3, 5 / 7, 11), "medium": (4, 1 + 5 / 7, 45), "hard": (7, 1 + 5 / 7, 92)},
    },
    "dissectedtrunchex2": {
        "flat": {"easy": (1.289, 2.134, 7, 68.345, (0.0, 1.866025)), "medium": (2.122, 3.866, 30, 37.128), "hard": (3.122, 5.5, 81, 24.752)},
        "torus": {"easy": (4, 2, 28, 0.28), "medium": (4, 2, 39, 0.28), "hard": (5, 3, 92, 0.33)},
        "cylinder": {"easy": (2, 1 + 1 / 2, 11), "medium": (4, 2, 30), "hard": (5, 3, 72)},
        "mobius": {"easy": (2, 1 + 1 / 2, 9), "medium": (5, 1 + 1 / 2, 24), "hard": (6, 2 + 1 / 2, 72)},
    },
    "squarerows2": {
        "flat": {"easy": (7.5, 1.312, 8, 67.5), "medium": (13.5, 2.312, 36, 36.735), "hard": (18.5, 3.312, 99, 26.593)},
        "torus": {"easy": (10, 1, 14, 0.45), "medium": (16, 2, 58, 0.52), "hard": (30, 2, 120, 0.38)},
        "cylinder": {"easy": (12, 3 / 5, 10), "medium": (24, 1 + 1 / 10, 37), "hard": (33, 1 + 3 / 5, 95)},
        "mobius": {"easy": (12, 3 / 5, 12), "medium": (21, 1 + 3 / 5, 46), "hard": (30, 1 + 3 / 5, 88)},
    },
    "squarerows3": {
        "flat": {"easy": (8.5, 1.129, 11, 60.0), "medium": (14.5, 1.871, 38, 34.286), "hard": (19.5, 2.5, 96, 25.263)},
        "torus": {"easy": (9, 1, 19, 0.52), "medium": (25, 1, 49, 0.28), "hard": (25, 2, 129, 0.52)},
        "cylinder": {"easy": (13, 2 / 3, 7), "medium": (24, 1 + 1 / 6, 44), "hard": (37, 1 + 1 / 6, 87)},
        "mobius": {"easy": (13, 2 / 3, 7), "medium": (32, 2 / 3, 13), "hard": (32, 1 + 2 / 3, 109)},
    },
    "dissectedtrunchex": {
        "flat": {"easy": (2.26, 1.272, 8, 50.718, (0.0, 3.232051)), "medium": (4.077, 2.272, 30, 28.355), "hard": (5.26, 3.106, 76, 23.233, (0.0, 3.232051))},
        "torus": {"easy": (4, 2, 19, 0.52), "medium": (4, 2, 26, 0.52), "hard": (8, 2, 73, 0.38)},
        "cylinder": {"easy": (5, 1 / 2, 7), "medium": (6, 1 + 1 / 2, 34), "hard": (10, 1 + 1 / 2, 76)},
        "mobius": {"easy": (5, 1 / 2, 6), "medium": (6, 1 + 1 / 2, 34), "hard": (10, 1 + 1 / 2, 74)},
    },
    "hexrows": {
        "flat": {"easy": (6, 4.5, 8, 46.188, (0.0, 1.0)), "medium": (10, 8.5, 29, 27.713, (0.0, 1.0)), "hard": (14, 11.5, 74, 19.795)},
        "torus": {"easy": (6, 5, 11, 0.52), "medium": (17, 5, 29, 0.33), "hard": (23, 7, 72, 0.33)},
        "cylinder": {"easy": (10, 2 + 1 / 3, 9), "medium": (18, 5 + 1 / 3, 37), "hard": (24, 6 + 1 / 3, 71)},
        "mobius": {"easy": (10, 2 + 1 / 3, 9), "medium": (18, 5 + 1 / 3, 28), "hard": (24, 6 + 1 / 3, 71)},
    },
    "dodecasquare": {
        "flat": {"easy": (3.789, 3.789, 4, 34.308, (0.0, 1.866025)), "medium": (6.789, 6.789, 15, 20.999, (1.866025, 0.0)), "hard": (9.289, 9.289, 42, 14.291, (0.0, 1.866025))},
        "torus": {"easy": (4, 4, 7, 0.52), "medium": (9, 5, 16, 0.45), "hard": (13, 6, 35, 0.45)},
        "cylinder": {"easy": (6, 2 + 2 / 3, 5), "medium": (12, 3 + 2 / 3, 13), "hard": (16, 4 + 2 / 3, 37)},
        "mobius": {"easy": (6, 2 + 2 / 3, 6), "medium": (12, 3 + 2 / 3, 15), "hard": (16, 4 + 2 / 3, 36)},
    },
    "hexrings": {
        "flat": {"easy": (2.144, 1.096, 11, 50.718, (0.0, 4.098076)), "medium": (3.644, 2.096, 41, 29.602), "hard": (4.856, 2.759, 83, 22.002)},
        "torus": {"easy": (4, 1, 23, 0.38), "medium": (4, 2, 47, 0.52), "hard": (7, 2, 111, 0.45)},
        "cylinder": {"easy": (4, 3 / 5, 9), "medium": (6, 1 + 1 / 10, 37), "hard": (9, 1 + 3 / 5, 91)},
        "mobius": {"easy": (4, 3 / 5, 8), "medium": (11, 3 / 5, 22), "hard": (9, 1 + 3 / 5, 92)},
    },
    "squaretrihex": {
        "flat": {"easy": (5.5, 3.211, 10, 52.364, (1.0, 1.366025)), "medium": (8.5, 6.211, 44, 28.333, (1.0, 0.0)), "hard": (11.5, 8.211, 92, 22.767, (1.0, 0.0))},
        "torus": {"easy": (6, 3, 10, 0.52), "medium": (13, 4, 53, 0.38), "hard": (19, 5, 108, 0.33)},
        "cylinder": {"easy": (9, 1 + 2 / 3, 6), "medium": (15, 3 + 2 / 3, 40), "hard": (20, 4 + 2 / 3, 87)},
        "mobius": {"easy": (9, 1 + 2 / 3, 5), "medium": (15, 3 + 2 / 3, 39), "hard": (20, 4 + 2 / 3, 87)},
    },
    "squaretrihex2": {
        "flat": {"easy": (4.5, 1.894, 12, 57.6), "medium": (8.5, 3.106, 44, 30.0, (0.0, 2.732051)), "hard": (11.5, 4.356, 98, 21.818, (0.0, 2.732051))},
        "torus": {"easy": (4, 2, 15, 0.52), "medium": (13, 2, 54, 0.38), "hard": (16, 3, 120, 0.45)},
        "cylinder": {"easy": (8, 1 + 1 / 5, 15), "medium": (15, 1 + 7 / 10, 44), "hard": (21, 2 + 1 / 5, 98)},
        "mobius": {"easy": (8, 1 + 1 / 5, 15), "medium": (14, 2 + 1 / 5, 54), "hard": (20, 2 + 1 / 5, 92)},
    },
    "dodecarhombitrihex": {
        "flat": {"easy": (2.375, 1.583, 8, 32.742, (2.732051, 0.0)), "medium": (4.375, 2.583, 24, 18.759), "hard": (5.625, 3.292, 52, 15.102)},
        "torus": {"easy": (4, 2, 14, 0.52), "medium": (6, 2, 28, 0.45), "hard": (10, 2, 60, 0.33)},
        "cylinder": {"easy": (5, 3 / 5, 7), "medium": (7, 1 + 3 / 5, 27), "hard": (11, 2 + 1 / 10, 69)},
        "mobius": {"easy": (5, 3 / 5, 7), "medium": (7, 1 + 3 / 5, 27), "hard": (11, 1 + 3 / 5, 57)},
    },
    # The "Other" family is flat-only for now (_FAMILY_SURFACES in
    # catalog.py), so its three carry a "flat" row alone.
    "sphinxpairs": {
        "flat": {"easy": (4.667, 3, 13, 28.236, (0.5, 3.464102)), "medium": (8.333, 5.333, 52, 17.143), "hard": (12, 7.333, 124, 12.632)},
    },
    "tromino": {
        "flat": {"easy": (5, 6, 10, 30.0), "medium": (9, 14, 47, 17.143), "hard": (12, 18, 92, 14.0)},
    },
    "durer": {
        "flat": {"easy": (6.5, 2.138, 9, 50.0), "medium": (10.5, 3.5, 36, 29.455, (0.5, 0.0)), "hard": (15.5, 4.862, 93, 19.688, (0.5, 0.0))},
    },
}

#: The builders that take a ``variant`` after their preset args: the
#: substitution tilings, which grow far more of a patch than a board keeps, so
#: one preset is a whole family of boards rather than a single one (see
#: ``aperiodic._window``). Every other builder ignores the variant, and the
#: nonperiodic-by-symmetry boards -- the spiral, the brick rings -- are left out
#: on purpose: each has one distinguished centre and no second window onto it.
_VARIANT_BUILDERS = frozenset({
    "penrose_board", "kitedart_board", "ammann_beenker_board", "spectre_board",
})

# Load the shared presets (data/presets.json) into _PRESETS. Each row is
# {builder, args: {difficulty: [positional args]}}. The Archimedean/Laves
# modes live here too now (their args begin with the tiling key); the
# ARCH_PRESETS table above is the compact authoring source that
# scripts/export_data.py expands into data/presets.json.
for _mode, _spec in load("presets")["presets"].items():
    _fn = _JSON_BUILDERS[_spec["builder"]]
    _varies = _spec["builder"] in _VARIANT_BUILDERS
    _PRESETS[_mode] = {
        _difficulty: (lambda variant=0, fn=_fn, a=_args, varies=_varies:
                      fn(*a, variant) if varies else fn(*a))
        for _difficulty, _args in _spec["args"].items()
    }


#: Which windows onto an aperiodic patch a board may be dealt from
#: (data/windows.json, measured by scripts/difficulty/windows.py). A window is
#: a board of its own -- a patch of an aperiodic tiling is not interchangeable
#: with another patch of it at 81 cells -- so the list is the ones whose
#: measured win rate lands within the calibration's tolerance of the centred
#: window's, the window the mine count was fitted on. Index 0 is that centred
#: window, so the patch this game shipped with stays in the deal.
_WINDOWS = load("windows")["modes"]


def window_for(mode: str, difficulty: str, seed: int) -> int:
    """Which window of a board's patch a game seed is played on.

    A mode with no measured list is one board however it is seeded, and the
    seed passes through to a builder that ignores it.
    """
    rows = _WINDOWS.get(mode)
    if rows is None:
        return seed
    windows = rows[difficulty]["windows"]
    return windows[seed % len(windows)]


def build_board(mode: str, difficulty: str, seed: int = 0) -> Board | Board3D:
    """The board a mode and difficulty name, as dealt for one game ``seed``.

    The seed only ever means more than one board for the aperiodic
    substitution tilings, where it picks which measured window onto the grown
    patch the game is played on (``window_for``, then ``aperiodic._window``);
    every other mode builds the same board whatever it is passed, so a caller
    can hand the seed along blindly.
    """
    if mode not in _PRESETS:
        raise ValueError(f"unknown mode {mode!r}")
    if difficulty not in DIFFICULTIES:
        raise ValueError(f"unknown difficulty {difficulty!r}")
    return _PRESETS[mode][difficulty](window_for(mode, difficulty, seed))
