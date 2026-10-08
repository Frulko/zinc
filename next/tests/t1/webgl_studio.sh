#!/bin/sh
# The scene of examples/webgl-studio: the glTF truck loads (GLTFLoader over a GLB, TextDecoder in script contexts), markers follow the objects, picking, selection and the look controls work.
cd "$(dirname "$0")/../.." || exit 2
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=520x400 ZINC_FRAMES=10 "$ZINC" run tests/golden/webgl-studio 2>&1 | grep -v "EXT_\|GLTFLoader" | diff - tests/golden/webgl-studio/main.out || { echo "webgl-studio: differs"; exit 1; }
echo "webgl_studio: ok"
