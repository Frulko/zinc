#!/bin/sh
# glTF (ZN-119): cgltf, vendored, reads the viewer's models independently of the three plugin's reader (the prototype's); meshes, triangles, vertices and the world bounding box must be
# equal (tests/golden/gltf/stats.txt), and meshoptimizer's vertex cache optimiser must keep the triangles. The Zinc side is also the regression test of the module identity of plugins:
# the program compiles only when `three` and `three/addons/...` are one module.
BUILD=${BUILD:-build}
[ -x "$BUILD/gltf_check" ] || { echo "skipped: gltf_check is not built"; exit 77; }
M=$PWD/../examples/three/gltf-viewer/assets
[ -f "$M/CesiumMilkTruck.glb" ] || { echo "skipped: the viewer's models are not here"; exit 77; }
"$BUILD/gltf_check" "$M/CesiumMilkTruck.glb" "$M/box/BoxTextured.gltf" | diff -u tests/golden/gltf/stats.txt - || { echo "cgltf reads the models differently from the golden"; exit 1; }
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 "$ZINC" run tests/golden/host/gltf_stats/main.ts -- "$M/CesiumMilkTruck.glb" "$M/box/BoxTextured.gltf" 2>&1 | diff -u tests/golden/gltf/stats.txt - || { echo "the three plugin's loader reads the models differently from cgltf"; exit 1; }
