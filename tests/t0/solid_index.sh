#!/bin/sh
# Indexed map/For rows update their captured position; index-free rows stay keyed.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5
for engine in interp native quickjs; do
  if [ "$engine" = quickjs ]; then set -- --engine quickjs; else set -- "--$engine"; fi
  output=$("$ZINC" run tests/data/solid_index.tsx "$@" 2>&1) || { echo "$output"; exit 1; }
  echo "$output" | grep -q 'solid-index: pass' || { echo "$output"; exit 1; }
done
