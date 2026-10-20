#!/bin/sh
# WebGL foundation (ZN-203.01): the offscreen context helper creates every GL API the machine offers (desktop GL 3.3 core, GLES3, GLES2), draws a triangle with the D29 prelude and reads the pixels back.
# Needs a display session (SDL3 hidden window); the Linux Pi/Docker llvmpipe runs add the GLES paths.
cd "$(dirname "$0")/../.." || exit 2
cmake --build build --target gl_offscreen -j8 >/dev/null 2>&1 || { echo "gl_offscreen does not build"; exit 1; }
out=$(build/gl_offscreen 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q 'triangle ok' || { echo "no API drew a triangle: $out"; exit 1; }
echo "gl_offscreen: ok"
