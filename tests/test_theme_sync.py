"""Guard the ported chrome palettes against drift.

The pygame ``THEMES`` registry (minesweeper/gui.py) is the origin of the six
UI themes; the TypeScript app offers the same six, ported into
``data/ui/screens.json`` so it can apply them as CSS custom properties. That is
the one place a colour is written twice, so it is the one place that needs a
test: retune a theme in gui.py and this fails until the JSON follows.

The two schemas are deliberately *not* identical. The web names its fields
after the CSS custom properties they drive, and only the subset CSS can express
crosses over — pygame's draw-style knobs (``style``, ``neu``, ``button_hover``,
``button_armed``) have no web counterpart, and the web may add themes of its own
(``dark``; all six pygame presets are light).
"""

import json
import re
from pathlib import Path

from minesweeper.gui import THEMES

SCREENS = Path(__file__).resolve().parent.parent / "data" / "ui" / "screens.json"

# web field -> pygame key. Note the two that do not read across literally:
# the web's `panel` is the card fill (pygame `button`), and its `counterBg` is
# the dark LED box (pygame `panel`).
COLOUR_FIELDS = {
    "background": "bg",
    "background2": "bg2",
    "panel": "button",
    "text": "text",
    "muted": "muted",
    "accent": "accent",
    "onAccent": "on_accent",
    "selected": "selected",
    "border": "border",
    "danger": "counter_fg",
    "counterBg": "panel",
}


def _themes() -> dict:
    return json.loads(SCREENS.read_text(encoding="utf-8"))["themes"]


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#%02x%02x%02x" % rgb


def test_every_pygame_theme_is_offered_on_the_web():
    assert set(THEMES) <= set(_themes())


def test_ported_palettes_match_pygame():
    web = _themes()
    for name, theme in THEMES.items():
        spec = web[name]
        assert spec["label"] == theme["label"], name
        assert spec["radius"] == theme.get("radius", 0), name
        for field, key in COLOUR_FIELDS.items():
            rgb = theme.get(key)
            if rgb is None:
                # pygame leaves accent/border unset on some themes (the CSS
                # cannot: it needs a concrete colour, chosen web-side).
                continue
            # An alpha suffix is allowed where the web look needs one (the
            # glass theme's translucent cards); the RGB must still match.
            assert spec[field][:7] == _hex(rgb), f"{name}.{field}"


def test_default_theme_is_the_pygame_default():
    # gui.py applies `ios` at import; the web must boot into the same look.
    screens = json.loads(SCREENS.read_text(encoding="utf-8"))
    assert screens["defaultTheme"] == "ios"


def test_web_only_themes_are_complete():
    # A theme with no pygame origin still has to declare the full palette, or
    # applying it would leave stale colours behind.
    required = set(COLOUR_FIELDS) - {"background2"} | {"label", "radius", "shadow"}
    for name, spec in _themes().items():
        assert required <= set(spec), name


# The classic board's grays are the other colour this repo writes twice: the
# TypeScript app's `classic` cell style switches the shape colours off and draws
# the board in a quotation of the pygame faces below, so that the two builds'
# classic boards are the same gray. Nothing else shares them — they are board
# colours, not chrome, so they are not in `data/ui/screens.json` — which is why
# this is a test rather than a shared config entry.
SHAPE_PALETTE = (
    Path(__file__).resolve().parent.parent / "web" / "src" / "render" / "shapePalette.ts"
)


def test_the_web_classic_board_quotes_the_pygame_grays():
    from minesweeper.gui import HIDDEN_FACE, REVEALED_FACE

    source = SHAPE_PALETTE.read_text(encoding="utf-8")
    match = re.search(
        r'mono:\s*\{\s*hidden:\s*"(#[0-9a-f]{6})",\s*revealed:\s*"(#[0-9a-f]{6})"',
        source,
    )
    assert match, "SHAPE_PALETTE.board.mono not found in shapePalette.ts"
    assert match.group(1) == _hex(HIDDEN_FACE)
    assert match.group(2) == _hex(REVEALED_FACE)
