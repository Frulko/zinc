#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
libs=$(cd "$(dirname "$ZINC")" && pwd)
[ -f "$libs/libzn_meshopt.a" ] || { echo 'skipped: no native meshoptimizer'; exit 77; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
# Kenney Platformer Kit tree, CC0: examples/marble/assets/models/models.json and licences/.
scene=examples/marble/assets/models/high/tree.glb
for profile in psp30 vita60 n3ds30 ios60; do
  for copy in a b; do
    timeout 10 "$ZINC" assets cook "$scene" "$profile" -o "$tmp/$copy"
  done
  cmp "$tmp/a/$profile.zcook" "$tmp/b/$profile.zcook"
  cmp "$tmp/a/$profile.receipt.json" "$tmp/b/$profile.receipt.json"
done
# Call the existing API budget seam with two triangles, rather than generate a huge scene.
timeout 30 "${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -Isrc -Ithird_party/cgltf -Ithird_party/meshoptimizer \
  tests/native/cook.cpp src/assets/cook.cpp "$libs/libzn_meshopt.a" -o "$tmp/cook"
timeout 10 "$tmp/cook" tests/data/cook/two-triangles.gltf "$tmp"
timeout 10 "$ZINC" assets cook tests/data/cook/two-triangles.gltf psp30 -o "$tmp/cli"
python3 tests/data/cook/check.py "$tmp" tests/data/cook/two-triangles.gltf
echo "PASS cook"
