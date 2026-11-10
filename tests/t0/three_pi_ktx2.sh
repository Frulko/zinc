#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
set -eu
for profile in rpi1 linux macos; do
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/three-pi/ktx2.js --engine quickjs --profile "$profile"
done
