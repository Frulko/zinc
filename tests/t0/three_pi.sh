#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
set -eu
for profile in rpi1 linux macos; do
  ZINC_HEADLESS=1 timeout 20 "$ZINC" run tests/data/three-pi/split.js --engine quickjs --profile "$profile"
done
# r162 remains an external test input, not the production resolver's default.
legacy=$(tools/test-lib three-0.162.0) || exit 77
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp tests/data/three-pi/split.js "$tmp/"
printf '{"imports":{"three":"%s"}}\n' "$legacy" > "$tmp/importmap.json"
ZINC_HEADLESS=1 timeout 20 "$ZINC" run "$tmp/split.js" --engine quickjs --profile rpi1
