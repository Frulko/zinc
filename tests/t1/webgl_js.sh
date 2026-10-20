#!/bin/sh
# WebGL1 in JavaScript (ZN-203.03): tests/golden/webgl/triangle.js on the QuickJS engine draws through gl.*, reads the pixels back and sees the spec's errors; the output equals the C++ test's pixels (red centre) and the golden.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 "$ZINC" run tests/golden/webgl/triangle.js --engine quickjs 2>&1)
[ "$out" = "$(cat tests/golden/webgl/triangle.out)" ] || { echo "triangle.js output differs:"; echo "$out"; exit 1; }
out=$(ZINC_HEADLESS=1 "$ZINC" run tests/golden/webgl/antialias.js --engine quickjs 2>&1)   # ZN-576: the multisampled canvas (antialias)
[ "$out" = "$(cat tests/golden/webgl/antialias.out)" ] || { echo "antialias.js output differs:"; echo "$out"; exit 1; }
out=$(ZINC_HEADLESS=1 "$ZINC" run tests/golden/webgl/draw_caches.js --engine quickjs 2>&1)   # ZN-567: the draw checks' caches follow the data
[ "$out" = "$(cat tests/golden/webgl/draw_caches.out)" ] || { echo "draw_caches.js output differs:"; echo "$out"; exit 1; }
echo "webgl_js: ok"
