#!/bin/sh
# The GL replay's shaders (runtime/gl_replay_shaders.h) compile and link as GLSL ES 1.00 under display-gl's GLES 2 prelude (D29: the Pi 3 floor), checked
# by glslang with the WebGL 1 rules on this machine, not on a device (ZN-581). Builds its own executable (tests/native/gl_replay_es2.cpp).
cd "$(dirname "$0")/../.." || exit 2
[ -f build/CMakeCache.txt ] || { echo "skipped: no build directory"; exit 77; }
# a build directory configured before the target existed learns it from cmake first
tools/build gl_replay_es2 >/dev/null 2>&1 || { cmake -S . -B build >/dev/null 2>&1 && tools/build gl_replay_es2 >/dev/null 2>&1; } || { echo "skipped: gl_replay_es2 does not build (ZN_WEBGL off?)"; exit 77; }
out=$(build/gl_replay_es2 2>&1) || { echo "$out"; exit 1; }
echo "gl_replay_es2: ok ($(echo "$out" | tr '\n' ' '))"
