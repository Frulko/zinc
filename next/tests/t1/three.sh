#!/bin/sh
# Real three.js on zinc's WebGL 2 (ZN-204): a cube, an instanced mesh with a shadow map and a glTF scene render to the frames of headless Chrome (tests/three/ref, SSIM >= 0.90).
cd "$(dirname "$0")/../.." || exit 2
out=$(tools/three-compare) || { echo "$out"; exit 1; }
echo "three: ok"
