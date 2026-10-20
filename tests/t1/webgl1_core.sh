#!/bin/sh
# WebGL 1.0 core (ZN-203.02): a working frame (buffers, shaders, programs, uniforms, textures with the legacy formats, framebuffer texture) and the errors of the spec for 40+ invalid calls.
cd "$(dirname "$0")/../.." || exit 2
cmake --build build --target webgl1_test -j8 >/dev/null 2>&1 || { echo "webgl1_test does not build"; exit 1; }
out=$(build/webgl1_test 2>&1) || { echo "$out"; exit 1; }
echo "$out" | tail -1
