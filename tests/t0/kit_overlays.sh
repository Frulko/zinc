#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=12 timeout 20 "$ZINC" run tests/golden/kit-overlays "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^overlays: ok$' || { echo "$got"; exit 1; }
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 20 "$ZINC" run tests/golden/kit-overlays-react "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^overlays react: ok$' || { echo "$got"; exit 1; }
done
echo 'kit overlays: ok'
