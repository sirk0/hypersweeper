#!/bin/sh
# Bootstrap the local dependencies needed by Codex in a fresh checkout.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if ! command -v uv >/dev/null 2>&1; then
  echo "setup-codex: uv is required to install Python 3.13" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "setup-codex: npm is required to install web dependencies" >&2
  exit 1
fi

# Codex worktrees may not have permission to use the account-wide uv cache.
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/hypersweeper-uv-cache}"
# The managed Python installation is separate from uv's download cache and may
# also be outside the worktree's write boundary in a sandboxed Codex session.
export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-/tmp/hypersweeper-uv-python}"

uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r requirements-all.txt
(cd web && npm ci)

echo "setup-codex: ready ($(.venv/bin/python --version), $(node --version))"
