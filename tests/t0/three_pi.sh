#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
set -eu
for profile in rpi1 linux macos; do
  for fixture in split material-merge; do
    ZINC_HEADLESS=1 timeout 20 "$ZINC" run "tests/data/three-pi/$fixture.js" --engine quickjs --profile "$profile"
  done
done
# r162 remains an external test input, not the production resolver's default.
legacy=$(tools/test-lib three-0.162.0) || exit 77
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp tests/data/three-pi/split.js tests/data/three-pi/material-merge.js "$tmp/"
printf '{"imports":{"three":"%s","three/addons/utils/BufferGeometryUtils.js":"%s/BufferGeometryUtils.js"}}\n' "$legacy" "$(dirname "$legacy")" > "$tmp/importmap.json"
for fixture in split material-merge; do
  ZINC_HEADLESS=1 timeout 20 "$ZINC" run "$tmp/$fixture.js" --engine quickjs --profile rpi1
done
