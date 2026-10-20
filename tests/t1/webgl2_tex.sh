#!/bin/sh
# WebGL 2.0 textures, samplers, queries, sync, transform feedback, blits (ZN-203.07): tests/golden/webgl/webgl2_tex.js on the QuickJS engine against its golden output.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 "$ZINC" run tests/golden/webgl/webgl2_tex.js --engine quickjs 2>&1 | grep -v UNSUPPORTED)
[ "$out" = "$(cat tests/golden/webgl/webgl2_tex.out)" ] || { echo "webgl2_tex.js output differs:"; echo "$out" | diff - tests/golden/webgl/webgl2_tex.out | head; exit 1; }
echo "webgl2_tex: ok"
