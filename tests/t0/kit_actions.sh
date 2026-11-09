#!/bin/sh
# Focused Actions contract: filter/activate a palette command, early-release/blur cancellation and exactly-once keyboard hold, disabled focus, segmented arrows.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=9 timeout 20 "$ZINC" run tests/golden/kit-actions "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^actions: ok$' || { echo "$got"; exit 1; }
done
echo 'kit actions: ok'
