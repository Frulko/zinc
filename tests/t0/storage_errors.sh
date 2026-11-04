#!/bin/sh
# Storage errors are catchable and a failed replacement preserves the old bytes.
set -eu
cd "$(dirname "$0")/../.."
export ZINC_HEADLESS=1
for engine in interp native quickjs; do
  if [ "$engine" = quickjs ]; then set -- --engine quickjs; else set -- "--$engine"; fi
  output=$("$ZINC" run tests/data/storage_errors.ts "$@" 2>&1) || { echo "$output"; exit 1; }
  echo "$output" | grep -q 'storage-errors: pass' || { echo "$output"; exit 1; }
done
