#!/bin/sh
# Selection keyboard/state contracts, including mixed state and non-zero slider minima.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  got=$(ZINC_HEADLESS=1 ZINC_SIZE=640x640 ZINC_FRAMES=10 timeout 20 "$ZINC" run tests/golden/kit-selection "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^selection: ok$' || { echo "$got"; exit 1; }
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 20 "$ZINC" run tests/golden/kit-selection-react "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^selection react: ok$' || { echo "$got"; exit 1; }
done
echo 'kit selection: ok'
