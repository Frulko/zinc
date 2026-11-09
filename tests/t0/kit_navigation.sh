#!/bin/sh
# Navigation keyboard, boundary, overflow and scroll-follow contracts on both UI execution engines.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  got=$(ZINC_HEADLESS=1 ZINC_SIZE=640x900 ZINC_FRAMES=10 timeout 20 "$ZINC" run tests/golden/kit-navigation "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^navigation: ok$' || { echo "$got"; exit 1; }
  got=$(ZINC_HEADLESS=1 ZINC_SIZE=640x640 ZINC_FRAMES=8 timeout 20 "$ZINC" run tests/golden/kit-navigation-react "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^navigation react: ok$' || { echo "$got"; exit 1; }
done
echo 'kit navigation: ok'
