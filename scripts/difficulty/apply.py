"""Write the measured geometry and mine counts back into the source tables.

Two authoring surfaces, as ``AGENTS.md`` describes: the 39 one-off modes live
directly in ``data/presets.json``, and the 121 Archimedean/Laves modes are
expanded by ``scripts/export_data.py`` out of the compact ``ARCH_PRESETS``
table in ``minesweeper/boards/presets.py``. Both are edited here.

``ARCH_PRESETS`` is edited *in place*, argument by argument, rather than
regenerated: the table carries a lot of hand-written prose about why each
family's windows and seams are what they are, and several rows hold exact
expressions -- ``2 + 1 / (2 + ROOT3)``, ``ROOT3 / 2``, ``21**0.5 / 4`` -- that
land a cylinder's rim flat. Re-emitting the table would flatten those to opaque
floats and drop the comments, so instead only the tokens that actually changed
are rewritten, and a fractional row count keeps its expression by having just
its integer part swapped.

Run after ``resize`` and ``calibrate``:
``PYTHONPATH=. python -m scripts.difficulty.apply``
"""

from __future__ import annotations

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PRESETS_PY = ROOT / "minesweeper" / "boards" / "presets.py"
PRESETS_JSON = ROOT / "data" / "presets.json"

# ARCH_PRESETS rows are (after the tiling key) flat: (nx, ny, mines, scale);
# torus: (nx, ny, mines, tube_radius); cylinder: (ring, rows, mines[, cut]);
# mobius/klein: (ring, rows, mines[, tube_scale]).
SURFACES = ("flat", "torus", "cylinder", "mobius", "klein")


def _split_args(text: str) -> list[str]:
    """Split a tuple body on its top-level commas, keeping the source text."""
    parts, depth, current = [], 0, ""
    for ch in text:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current)
    return parts


def _value_of(token: str):
    """Evaluate an argument's source text, or None if it is not a number."""
    try:
        return eval(token, {"ROOT3": 3 ** 0.5, "__builtins__": {}})  # noqa: S307
    except Exception:
        return None


def _format(value, original: str) -> str:
    """Render one argument, preserving the source text where we can.

    An argument the search did not move keeps its original token verbatim --
    that is what holds on to ``ROOT3 / 2`` and ``21**0.5 / 4``, the exact seam
    offsets that land a cylinder's rim flat, instead of flattening them to
    rounded decimals.

    "Did not move" is judged to 1e-6, not to the last bit, because that is the
    precision a value survives the round trip at: ``resize._cylinder_rows``
    rounds the row counts it enumerates to six decimals, so a cylinder row the
    search re-picked unchanged comes back 5e-8 away from the expression that
    wrote it. Compared exactly, every such row is rewritten as a decimal and
    the seam offset is lost. Nothing here moves by less than 0.05 when it moves
    at all -- a row count steps by a quarter domain, a tube radius by 0.05, a
    mine by one -- so the slack cannot hide a real change.
    """
    original = original.strip()
    if isinstance(value, bool) or value is None:
        return repr(value)
    was = _value_of(original)
    if was is not None and isinstance(value, (int, float)):
        if abs(float(was) - float(value)) < 1e-6:
            return original
    if isinstance(value, int):
        return str(value)
    # a fractional row count like "2 + 1 / (2 + ROOT3)" keeps its expression --
    # only the whole-number part moved, and the fraction is what lands the rim
    match = re.match(r"^(\d+)\s*\+\s*(.+)$", original)
    if match:
        tail = match.group(2)
        try:
            frac = float(value) - int(float(value))
            original_frac = float(eval(tail, {"ROOT3": 3 ** 0.5}))  # noqa: S307
            if abs(frac - original_frac) < 1e-9:
                return f"{int(float(value))} + {tail}"
        except Exception:
            pass
    if float(value).is_integer() and original.lstrip("-").isdigit():
        return str(int(value))
    return repr(round(float(value), 6))


def rewrite_arch_presets(rows: dict[tuple[str, str, str], list]) -> int:
    """Substitute new args into ARCH_PRESETS, leaving everything else alone.

    ``rows`` is keyed by ``(tiling, surface, difficulty)`` and holds the args
    *after* the tiling key, matching the table's own shape.
    """
    text = PRESETS_PY.read_text()
    lines = text.splitlines(keepends=True)
    tiling = None
    changed = 0
    in_table = False
    for i, line in enumerate(lines):
        if line.startswith("ARCH_PRESETS = {"):
            in_table = True
            continue
        if in_table and line.startswith("}"):
            break
        if not in_table:
            continue
        header = re.match(r'^    "(\w+)": \{$', line)
        if header:
            tiling = header.group(1)
            continue
        entry = re.match(r'^(\s*)"(\w+)": \{(.*)\},\s*$', line)
        if not entry or tiling is None or entry.group(2) not in SURFACES:
            continue
        indent, surface, body = entry.groups()
        pieces = []
        for chunk in _split_args(body):
            found = re.match(r'^\s*"(\w+)": \((.*)\)\s*$', chunk)
            if not found:
                pieces.append(chunk.strip())
                continue
            difficulty, argtext = found.groups()
            want = rows.get((tiling, surface, difficulty))
            if want is None:
                pieces.append(chunk.strip())
                continue
            originals = _split_args(argtext)
            rendered = [
                _format(value, originals[k] if k < len(originals) else "")
                for k, value in enumerate(want)
            ]
            pieces.append(f'"{difficulty}": ({", ".join(rendered)})')
            changed += 1
        lines[i] = f'{indent}"{surface}": {{{", ".join(pieces)}}},\n'
    PRESETS_PY.write_text("".join(lines))
    return changed


def rewrite_presets_json(rows: dict[tuple[str, str], list]) -> int:
    """Substitute new args for the modes authored directly in the JSON."""
    payload = json.loads(PRESETS_JSON.read_text())
    changed = 0
    for mode, spec in payload["presets"].items():
        for difficulty in ("easy", "medium", "hard"):
            want = rows.get((mode, difficulty))
            if want is None:
                continue
            spec["args"][difficulty] = want
            changed += 1
    PRESETS_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return changed


def main() -> int:
    geometry = json.loads((HERE / "geometry.json").read_text())
    # Geometry and mine counts are applied independently: the resize has to be
    # verified against the board tests *before* an hour is spent calibrating
    # mine counts on top of it, so a run with no calibration yet is normal and
    # simply leaves the existing counts alone.
    path = HERE / "calibration.jsonl"
    calibration = (
        [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if path.exists()
        else []
    )
    mines = {(row["mode"], row["difficulty"]): row["mines"] for row in calibration}
    if not calibration:
        print("no calibration.jsonl yet -- applying geometry only")

    arch_rows: dict[tuple[str, str, str], list] = {}
    json_rows: dict[tuple[str, str], list] = {}
    surface_of_builder = {
        "archimedean_board": "flat",
        "arch_torus_board": "torus",
        "arch_cylinder_board": "cylinder",
        "arch_mobius_board": "mobius",
        "arch_klein_board": "klein",
    }

    missing = []
    for mode, spec in geometry.items():
        builder = spec["builder"]
        for difficulty in ("easy", "medium", "hard"):
            args = list(spec["args"][difficulty]["args"])
            count = mines.get((mode, difficulty))
            if count is None:
                missing.append(f"{mode}/{difficulty}")
            if builder in surface_of_builder:
                tiling = args[0]
                rest = args[1:]
                if count is not None:
                    rest[2] = count  # (nx, ny, mines, ...)
                arch_rows[(tiling, surface_of_builder[builder], difficulty)] = rest
            else:
                if count is not None:
                    args[_mine_index(builder)] = count
                json_rows[(mode, difficulty)] = args
    if missing and calibration:
        print(f"!! {len(missing)} rows have no calibration yet: {missing[:6]} ...")

    n_arch = rewrite_arch_presets(arch_rows)
    n_json = rewrite_presets_json(json_rows)
    print(f"rewrote {n_arch} ARCH_PRESETS rows and {n_json} data/presets.json rows")
    print("now run: PYTHONPATH=. python scripts/export_data.py"
          " && PYTHONPATH=. python scripts/export_conformance.py")
    return 0


def _mine_index(builder: str) -> int:
    from scripts.difficulty.resize import SPEC

    return SPEC[builder]["mine"]


if __name__ == "__main__":
    raise SystemExit(main())
