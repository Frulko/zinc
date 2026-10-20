#!/bin/sh
# The controls of examples/webgl-cube (ZN-205): the pointer events of a Surface reach three's OrbitControls (a drag on the background moves the camera) and TransformControls (a drag on the gizmo's X arrow moves the cube).
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=400x280 ZINC_FRAMES=60 "$ZINC" run tests/golden/webgl-gizmo 2>&1 | grep -v EXT_ | diff - tests/golden/webgl-gizmo/main.out || { echo "webgl-gizmo: controls differ"; exit 1; }
echo "webgl_gizmo: ok"
