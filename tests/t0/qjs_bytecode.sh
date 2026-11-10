#!/bin/sh
# Local bytecode compatibility and unsigned pack source fallback; no downloads or timings.
set -eu
cd "$(dirname "$0")/../.."
ZINC_OFFLINE=1 timeout 10 "$ZINC" toolchain esbuild >/dev/null 2>&1 || exit 77
exec python3 tests/data/qjs_bytecode/check.py
