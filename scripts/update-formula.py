#!/usr/bin/env python3
"""Point the Homebrew formula at a freshly tagged version.

`Formula/hypersweeper.rb` names one source tarball and its checksum;
everything else about it (how the app is built, where it lands, what `brew
test` runs) is stable and stays hand-written. So a release only has to rewrite
the version inside the URL and the `sha256` line, which is all this does —
.github/workflows/release.yml calls it after pushing the tag, and it is
runnable by hand if a release ever has to be repaired.

    scripts/update-formula.py --version 0.2.48 --sha256 <64 hex chars>

It is deliberately strict: an argument that does not look like a version or a
checksum, or a file whose lines it cannot find, is an error rather than a
silently unchanged formula that would send everyone who taps it at a tarball
that is not there.
"""

import argparse
import re
import sys
from pathlib import Path

FORMULA = Path(__file__).resolve().parent.parent / "Formula" / "hypersweeper.rb"

# Homebrew reads the version out of the URL, so there is no separate `version`
# stanza to keep in step — the tag in this line is the version.
URL_RE = re.compile(
    r"^(  url \"https://github\.com/sirk0/hypersweeper/archive/refs/tags/v)"
    r"\d+\.\d+\.\d+(\.tar\.gz\")$",
    re.M,
)
SHA256_RE = re.compile(r'^(  sha256 ")[0-9a-f]{64}(")$', re.M)


def update(text: str, version: str, sha256: str) -> str:
    """Return `text` with its source URL and checksum replaced."""
    for label, pattern, value in (
        ("url", URL_RE, version),
        ("sha256", SHA256_RE, sha256),
    ):
        text, count = pattern.subn(rf"\g<1>{value}\g<2>", text, count=1)
        if count != 1:
            raise SystemExit(f"error: no `{label}` stanza in {FORMULA}")
    return text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--version", required=True, help="the tagged version, e.g. 0.2.48")
    parser.add_argument("--sha256", required=True, help="checksum of the source tarball")
    args = parser.parse_args(argv)

    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        raise SystemExit(f"error: {args.version!r} is not an x.y.z version")
    if not re.fullmatch(r"[0-9a-f]{64}", args.sha256):
        raise SystemExit(f"error: {args.sha256!r} is not a sha256 checksum")

    original = FORMULA.read_text(encoding="utf-8")
    updated = update(original, args.version, args.sha256)
    if updated != original:
        FORMULA.write_text(updated, encoding="utf-8")
    print(f"{FORMULA.name}: {args.version} {args.sha256}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
