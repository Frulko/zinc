#!/bin/sh
# Real public GL paths preserve both written pixels and every untouched slot.
set -eu
cd "$(dirname "$0")/../.."
timeout 10 python3 tools/gen-zinc-gl --check
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_WEBGL=1 ZINC_FRAMES=1
for fixture in readpixels_preserve.js readpixels_alignment.js readpixels_pack_bounds.js buffer_readback.js; do
  out=$(timeout 20 "$ZINC" run "tests/data/webgl/$fixture" --engine quickjs 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
done
for fixture in readpixels_preserve.ts readpixels_kind.ts readpixels_rawkind.ts readpixels_backend.ts buffer_readback.ts; do
  out=$(timeout 20 "$ZINC" run "tests/data/webgl/$fixture" --interp 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
done
