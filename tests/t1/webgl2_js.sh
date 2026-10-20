#!/bin/sh
# WebGL 2.0 in JavaScript (ZN-203.05): tests/golden/webgl/webgl2.js on the QuickJS engine: ES 3.00 shaders, a VAO, instanced attributes, a uniform buffer, buffer copies and the new errors.
# The driver may print "UNSUPPORTED (log once)" lines on stderr (Apple's GL); they are not part of the golden.
cd "$(dirname "$0")/../.." || exit 2
out=$(ZINC_HEADLESS=1 "$ZINC" run tests/golden/webgl/webgl2.js --engine quickjs 2>&1 | grep -v UNSUPPORTED)
[ "$out" = "$(cat tests/golden/webgl/webgl2.out)" ] || { echo "webgl2.js output differs:"; echo "$out"; exit 1; }
echo "webgl2_js: ok"
