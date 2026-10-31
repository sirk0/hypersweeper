"""Bump the games' patch versions, for .github/workflows/bump-version.yml.

Each TypeScript game has its own version, in its package.json and mirrored in
the root package-lock.json's entry for its workspace:

- **Hypersweeper** shares its version with the pygame build: ``pyproject.toml``
  is the source of truth, and ``apps/hypersweeper/package.json`` follows it.
- **Rep-tiles** has its own (``apps/reptiles/package.json``).

    python scripts/bump_version.py [--hypersweeper] [--reptiles]

bumps the patch level of each game named, rewrites the files in place, and
prints the commit subject. It always starts "Bump version to", which is what
the bump and deploy workflows skip on. Which games to bump — every push for
Hypersweeper, a push that changed what ships in Rep-tiles for Rep-tiles, and
neither when the push set that version by hand — is the workflow's decision.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Workspace folder -> package name, as the lockfile records them.
GAMES = {
    "hypersweeper": ("apps/hypersweeper", "hypersweeper-web"),
    "reptiles": ("apps/reptiles", "rep-tiles"),
}
SEMVER = r"(\d+)\.(\d+)\.(\d+)"


def next_patch(version: str) -> str:
    major, minor, patch = map(int, re.fullmatch(SEMVER, version).groups())
    return f"{major}.{minor}.{patch + 1}"


def _set_package(root: Path, game: str, new: str) -> None:
    folder, name = GAMES[game]
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
    text = (root / GAMES[game][0] / "package.json").read_text()
    return re.search(r'"version":\s*"(' + SEMVER + ')"', text).group(1)


def bump_hypersweeper(root: Path) -> str:
    py = root / "pyproject.toml"
    text = py.read_text()
    m = re.search(r'^version = "' + SEMVER + '"$', text, re.M)
    new = next_patch(".".join(m.groups()))
    py.write_text(text[: m.start()] + f'version = "{new}"' + text[m.end() :])
    _set_package(root, "hypersweeper", new)
    return new


def bump_reptiles(root: Path) -> str:
    new = next_patch(package_version(root, "reptiles"))
    _set_package(root, "reptiles", new)
    return new


def bump(root: Path, hypersweeper: bool, reptiles: bool) -> str | None:
    """Bump the games asked for; the commit subject, or None for neither."""
    hs = bump_hypersweeper(root) if hypersweeper else None
    rt = bump_reptiles(root) if reptiles else None
    if hs and rt:
        return f"Bump version to {hs} (Rep-tiles {rt})"
    if hs:
        return f"Bump version to {hs}"
    if rt:
        return f"Bump version to Rep-tiles {rt}"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hypersweeper", action="store_true")
    parser.add_argument("--reptiles", action="store_true")
    args = parser.parse_args()
    subject = bump(ROOT, args.hypersweeper, args.reptiles)
    if subject:
        print(subject)


if __name__ == "__main__":
    main()
