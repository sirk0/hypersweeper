"""Guard the Homebrew formula against the repo moving out from under it.

`Formula/hypersweeper.rb` is the install path for the macOS app
(``brew install hypersweeper``), and unlike the rest of the project nothing
about it is exercised by any other check here: it is Ruby, it only runs inside
Homebrew, and it only runs on a Mac. So the things it hard-codes about *this*
repo — the script it shells out to, the bundle that script produces, the flag
its `brew test` block passes — can all be renamed away without a single test
going red, and the first sign of trouble would be a stranger's failed install.

These are the pins for that. They deliberately check the formula against the
files it names rather than against a copy of the expected text, so a rename
fails here and a reworded comment does not.

Regex rather than a Ruby parser for the obvious reason, and rather than a YAML
parser on the electron-builder side because PyYAML is not a test dependency of
this project.
"""

import re
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FORMULA = ROOT / "Formula" / "hypersweeper.rb"
BUILDER = ROOT / "desktop" / "electron-builder.yml"
LICENSE = ROOT / "LICENSE"
MAIN_MJS = ROOT / "desktop" / "main.mjs"


def _formula() -> str:
    return FORMULA.read_text(encoding="utf-8")


def _yaml_scalar(key: str) -> str:
    """The value of a unique `key: value` line in electron-builder.yml."""
    match = re.search(
        rf'^\s*{re.escape(key)}:\s*"?([^"\n]+?)"?\s*$',
        BUILDER.read_text(encoding="utf-8"),
        re.M,
    )
    assert match, f"no `{key}` in {BUILDER.name}"
    return match.group(1)


def test_source_url_is_this_repo_s_tag_archive():
    """The download is the tarball GitHub generates for a tag — nothing published.

    Losing this is how the formula would quietly grow a release artifact again.
    """
    url = re.search(r'^  url "([^"]+)"', _formula(), re.M)
    assert url, "the formula has no `url` stanza"
    assert re.fullmatch(
        r"https://github\.com/sirk0/hypersweeper/archive/refs/tags/v\d+\.\d+\.\d+\.tar\.gz",
        url.group(1),
    ), url.group(1)


def test_checksum_is_well_formed():
    """scripts/update-formula.py rewrites this line and the URL's version together."""
    assert re.search(r'^  sha256 "[0-9a-f]{64}"$', _formula(), re.M)


def test_build_script_it_calls_exists_and_is_executable():
    """`system "scripts/…"` is a path, and Homebrew resolves it at install time."""
    called = re.findall(r'system "(scripts/[^"]+)"', _formula())
    assert called, "the formula runs no build script"
    for path in called:
        script = ROOT / path
        assert script.is_file(), f"{path} does not exist"
        assert script.stat().st_mode & stat.S_IXUSR, f"{path} is not executable"


def test_installed_bundle_matches_the_packaged_product_name():
    """electron-builder names the .app; the formula installs and launches it by name."""
    app = f"{_yaml_scalar('productName')}.app"
    assert f'prefix/"{app}"' in _formula()
    assert f'Dir["build/desktop/mac*/{app}"]' in _formula()


def test_macos_only():
    """The build script refuses to run anywhere else, so the formula should too."""
    assert "depends_on :macos" in _formula()
    assert 'depends_on "node" => :build' in _formula()


def test_license_stanza_matches_the_license_file():
    assert 'license "MIT"' in _formula()
    assert "MIT License" in LICENSE.read_text(encoding="utf-8")


def test_brew_test_uses_the_bundle_s_own_smoke_check():
    """`brew test` proves the offline property, using the shell's existing flag."""
    assert "--smoke=" in _formula()
    assert '"--smoke="' in MAIN_MJS.read_text(encoding="utf-8"), (
        "desktop/main.mjs no longer implements --smoke, so `brew test` cannot work"
    )
