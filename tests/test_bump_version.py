"""scripts/bump_version.py: the per-game patch bumps bump-version.yml runs."""

import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import bump_version  # noqa: E402


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A copy of the files the bump touches."""
    for rel in [
        "pyproject.toml",
        "package-lock.json",
        "apps/hypersweeper/package.json",
        "apps/reptiles/package.json",
    ]:
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, tmp_path / rel)
    return tmp_path


def versions(root: Path) -> dict[str, str]:
    lock = json.loads((root / "package-lock.json").read_text())["packages"]
    py = next(
        line.split('"')[1]
        for line in (root / "pyproject.toml").read_text().splitlines()
        if line.startswith("version = ")
    )
    return {
        "pyproject": py,
        "hypersweeper": bump_version.package_version(root, "hypersweeper"),
        "hypersweeper-lock": lock["apps/hypersweeper"]["version"],
        "reptiles": bump_version.package_version(root, "reptiles"),
        "reptiles-lock": lock["apps/reptiles"]["version"],
    }


def test_next_patch():
    assert bump_version.next_patch("0.4.9") == "0.4.10"


def test_the_repo_starts_consistent(repo: Path):
    v = versions(repo)
    assert v["pyproject"] == v["hypersweeper"] == v["hypersweeper-lock"]
    assert v["reptiles"] == v["reptiles-lock"]


def test_hypersweeper_only(repo: Path):
    before = versions(repo)
    subject = bump_version.bump(repo, hypersweeper=True, reptiles=False)
    after = versions(repo)
    new = bump_version.next_patch(before["pyproject"])
    assert subject == f"Bump version to {new}"
    assert after["pyproject"] == after["hypersweeper"] == after["hypersweeper-lock"] == new
    assert after["reptiles"] == after["reptiles-lock"] == before["reptiles"]


def test_reptiles_only(repo: Path):
    before = versions(repo)
    subject = bump_version.bump(repo, hypersweeper=False, reptiles=True)
    after = versions(repo)
    new = bump_version.next_patch(before["reptiles"])
    assert subject == f"Bump version to Rep-tiles {new}"
    assert after["reptiles"] == after["reptiles-lock"] == new
    assert after["pyproject"] == before["pyproject"]
    assert after["hypersweeper-lock"] == before["hypersweeper-lock"]


def test_both_and_neither(repo: Path):
    before = versions(repo)
    subject = bump_version.bump(repo, hypersweeper=True, reptiles=True)
    hs = bump_version.next_patch(before["pyproject"])
    rt = bump_version.next_patch(before["reptiles"])
    assert subject == f"Bump version to {hs} (Rep-tiles {rt})"
    assert bump_version.bump(repo, hypersweeper=False, reptiles=False) is None


def test_the_lockfile_is_still_json(repo: Path):
    bump_version.bump(repo, hypersweeper=True, reptiles=True)
    json.loads((repo / "package-lock.json").read_text())
