"""Bump the games' patch versions, for .github/workflows/bump-version.yml.

Each TypeScript game (every ``apps/<key>/`` with a ``packaging.json``) has its
own version, in its package.json and mirrored in the root package-lock.json's
entry for its workspace:

- **Hypersweeper** shares its version with the pygame build: ``pyproject.toml``
  is the source of truth, and ``apps/hypersweeper/package.json`` follows it.
- **Every other game** has its own (``apps/<key>/package.json``).

    python scripts/bump_version.py [--hypersweeper] [--game <key> ...]

bumps the patch level of each game named, rewrites the files in place, and
prints the commit subject. It always starts "Bump version to", which is what
the bump and deploy workflows skip on. Which games to bump — every push for
Hypersweeper, a push that changed what ships in a game for that game, and none
whose version the push set by hand — is the workflow's decision.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SEMVER = r"(\d+)\.(\d+)\.(\d+)"


def next_patch(version: str) -> str:
    major, minor, patch = map(int, re.fullmatch(SEMVER, version).groups())
    return f"{major}.{minor}.{patch + 1}"


def games(root: Path) -> dict[str, tuple[str, str, str]]:
    """Every game: key -> (folder, package name as the lockfile records it,
    product name for the commit subject)."""
    found = {}
    for manifest in sorted((root / "apps").glob("*/packaging.json")):
        folder = manifest.parent
        name = json.loads((folder / "package.json").read_text())["name"]
        product = json.loads(manifest.read_text())["productName"]
        found[folder.name] = (f"apps/{folder.name}", name, product)
    return found


def _set_package(root: Path, game: str, new: str) -> None:
    folder, name, _ = games(root)[game]
    pkg = root / folder / "package.json"
    pkg.write_text(
        re.sub(r'("version":\s*")' + SEMVER + '(")', rf"\g<1>{new}\g<5>", pkg.read_text(), count=1)
    )
    lock = root / "package-lock.json"
    text = lock.read_text()
    updated = re.sub(
        r'("name": "' + re.escape(name) + r'",\s*\n\s*"version": ")' + SEMVER + '(")',
        rf"\g<1>{new}\g<5>",
        text,
    )
    if updated == text:
        raise SystemExit(f"no {name} entry with a version in {lock}")
    lock.write_text(updated)


def package_version(root: Path, game: str) -> str:
    text = (root / games(root)[game][0] / "package.json").read_text()
    return re.search(r'"version":\s*"(' + SEMVER + ')"', text).group(1)


def bump_hypersweeper(root: Path) -> str:
    py = root / "pyproject.toml"
    text = py.read_text()
    m = re.search(r'^version = "' + SEMVER + '"$', text, re.M)
    new = next_patch(".".join(m.groups()))
    py.write_text(text[: m.start()] + f'version = "{new}"' + text[m.end() :])
    _set_package(root, "hypersweeper", new)
    return new


def bump_game(root: Path, game: str) -> str:
    if game == "hypersweeper":
        raise SystemExit("Hypersweeper's version follows pyproject.toml: use --hypersweeper")
    new = next_patch(package_version(root, game))
    _set_package(root, game, new)
    return new


def bump(root: Path, hypersweeper: bool, others: list[str]) -> str | None:
    """Bump the games asked for; the commit subject, or None for none."""
    hs = bump_hypersweeper(root) if hypersweeper else None
    known = games(root)
    rest = [f"{known[g][2]} {bump_game(root, g)}" for g in others]
    if hs and rest:
        return f"Bump version to {hs} ({', '.join(rest)})"
    if hs:
        return f"Bump version to {hs}"
    if rest:
        return f"Bump version to {', '.join(rest)}"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hypersweeper", action="store_true")
    parser.add_argument("--game", action="append", default=[], metavar="KEY")
    args = parser.parse_args()
    subject = bump(ROOT, args.hypersweeper, args.game)
    if subject:
        print(subject)


if __name__ == "__main__":
    main()
