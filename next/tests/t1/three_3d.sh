#!/bin/sh
# zinc:3d and three on their native renderers (ZN-107): the conformance programs scene3d.ts and three.ts print their frozen output; the four 3D examples draw real scenes, equal to the
# engine's own goldens (tests/golden/examples: the old toolchain had none). `three` and its addons resolve as bare specifiers through the plugin's manifest.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for n in scene3d three; do
  "$ZINC" run ../tests/conformance/$n.ts 2>&1 | diff -q - ../tests/conformance/$n.out >/dev/null || { echo "$n.ts differs from its frozen output"; fail=1; }
done
for e in 3d/cubes:3d-cubes 3d/model:3d-model three/cubes:three-cubes three/gltf-viewer:three-gltf-viewer; do
  ex=${e%%:*}; name=${e#*:}
  ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 ZINC_FRAMES=30 ZINC_SCALE=1 ZINC_SHOT="$tmp/$name.png" ZINC_SHOT_FRAMES=30 "$ZINC" run "../examples/$ex" >/dev/null 2>&1
  tools/pngdiff "$tmp/$name-30.png" "tests/golden/examples/$name-30.png" >/dev/null || { echo "$ex: frame 30 differs from tests/golden/examples/$name-30.png"; fail=1; }
done
exit $fail
