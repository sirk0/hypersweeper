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
        "apps/hypersweeper/packaging.json",
        "apps/reptiles/package.json",
        "apps/reptiles/packaging.json",
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


def test_rep_tiles_shares_hypersweepers_version():
    # The guard that keeps them in step: Rep-tiles' packaging.json says
    # "sharedVersion", so its version is always pyproject.toml's.
    assert bump_version.sharing_games(ROOT) == ["reptiles"]
    v = versions(ROOT)
    assert v["reptiles"] == v["reptiles-lock"] == v["pyproject"]


def test_hypersweeper_bumps_the_games_that_share_its_version(repo: Path):
    before = versions(repo)
    subject = bump_version.bump(repo, hypersweeper=True, others=[])
    after = versions(repo)
    new = bump_version.next_patch(before["pyproject"])
    assert subject == f"Bump version to {new}"
    assert after["pyproject"] == after["hypersweeper"] == after["hypersweeper-lock"] == new
    assert after["reptiles"] == after["reptiles-lock"] == new


def test_a_sharing_game_that_drifted_comes_back_in_step(repo: Path):
    bump_version._set_package(repo, "reptiles", "0.0.7")
    bump_version.bump(repo, hypersweeper=True, others=[])
    after = versions(repo)
    assert after["reptiles"] == after["reptiles-lock"] == after["pyproject"]


def test_a_sharing_game_never_bumps_on_its_own(repo: Path):
    with pytest.raises(SystemExit):
        bump_version.bump_game(repo, "reptiles")


def test_a_game_with_its_own_version(repo: Path):
    # Rep-tiles with the flag taken off stands in for a game of its own.
    manifest = repo / "apps/reptiles/packaging.json"
    packaging = json.loads(manifest.read_text())
    del packaging["sharedVersion"]
    manifest.write_text(json.dumps(packaging))
    assert bump_version.sharing_games(repo) == []

    before = versions(repo)
    subject = bump_version.bump(repo, hypersweeper=False, others=["reptiles"])
    after = versions(repo)
    new = bump_version.next_patch(before["reptiles"])
    assert subject == f"Bump version to Rep-tiles {new}"
    assert after["reptiles"] == after["reptiles-lock"] == new
    assert after["pyproject"] == before["pyproject"]
    assert after["hypersweeper-lock"] == before["hypersweeper-lock"]

    bump_version._set_package(repo, "reptiles", before["reptiles"])
    subject = bump_version.bump(repo, hypersweeper=True, others=["reptiles"])
    hs = bump_version.next_patch(before["pyproject"])
    assert subject == f"Bump version to {hs} (Rep-tiles {new})"
    assert versions(repo)["reptiles"] == new
    assert bump_version.bump(repo, hypersweeper=False, others=[]) is None


def test_the_lockfile_is_still_json(repo: Path):
    bump_version.bump(repo, hypersweeper=True, others=[])
    json.loads((repo / "package-lock.json").read_text())


def test_games_are_read_from_their_manifests(repo: Path):
    assert sorted(bump_version.games(repo)) == ["hypersweeper", "reptiles"]
    assert bump_version.games(repo)["reptiles"] == ("apps/reptiles", "rep-tiles", "Rep-tiles")


def test_the_flagship_only_bumps_through_pyproject(repo: Path):
    with pytest.raises(SystemExit):
        bump_version.bump_game(repo, "hypersweeper")
