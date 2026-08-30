# The pygame game and the board builders

This package is two things at once, documented separately:

| Working on | Read |
|---|---|
| `boards/` — the board model, what ships, why it is shaped that way | [`../docs/agents/geometry.md`](../docs/agents/geometry.md) |
| Adding a tiling, surface, solid or fractal board | [`../docs/agents/board-recipes.md`](../docs/agents/board-recipes.md) |
| A board's size and mine count (measured, never invented) | [`../docs/agents/difficulty.md`](../docs/agents/difficulty.md) |
| `gui.py` — the pygame UI, themes, headless screenshots, the pygbag build | [`../docs/agents/pygame.md`](../docs/agents/pygame.md) |
| `boards/catalog.py`, `boards/presets.py` and the `data/*.json` they load | [`../docs/agents/shared-data.md`](../docs/agents/shared-data.md) |

**This is the reference implementation, not the deployed game.** Change it only
when the request names it, or when a shared-`data/` edit necessarily carries
over — see "Which version to change" in the root
[`AGENTS.md`](../AGENTS.md).
