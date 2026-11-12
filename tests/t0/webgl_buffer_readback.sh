#!/bin/sh
# Public JS views and typed output preservation through the real GL provider.
set -eu
cd "$(dirname "$0")/../.."
timeout 10 python3 tools/gen-zinc-gl --check
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_WEBGL=1 ZINC_FRAMES=1
out=$(timeout 20 "$ZINC" run tests/data/webgl/buffer_readback.js --engine quickjs 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'buffer readback JS: ok'
echo "$out"
out=$(timeout 20 "$ZINC" run tests/data/webgl/buffer_readback.ts --interp 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'buffer readback typed: ok'
echo "$out"
