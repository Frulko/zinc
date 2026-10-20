#!/bin/sh
# The GL replay's capability record and tuning table (runtime/gl_caps.h, ZN-741): the families, capabilities and tuning rows of VideoCore IV,
# Adreno 220 and 320, Tegra 3, Apple, Intel and llvmpipe from their driver strings. Its own executable, built from the header alone: the record
# needs no GL and nothing of the runtime (D119: the layer stays extractable).
cd "$(dirname "$0")/../.." || exit 2
[ -f build/CMakeCache.txt ] || { echo "skipped: no build directory"; exit 77; }
tools/build gl_caps_test >/dev/null 2>&1 || { cmake -S . -B build >/dev/null 2>&1 && tools/build gl_caps_test >/dev/null 2>&1; } || { echo "gl_caps_test does not build"; exit 1; }
grep -q "target_link_libraries(gl_caps_test" CMakeLists.txt && { echo "gl_caps_test links a library: the record must stand alone"; exit 1; }
out=$(build/gl_caps_test 2>&1) || { echo "$out"; exit 1; }
echo "gl_caps: $out"
