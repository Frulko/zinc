#!/bin/sh
# The canvas element of the web environment bound to the WebGL module (ZN-568): document.createElement('canvas').getContext('webgl2' | 'webgl')
# is the existing binding with the element as gl.canvas; the element's width and height resize the drawing buffer; an ImageData is a texture
# source; a lost context is the element's event; and a canvas of the document is what the window shows (frame 2 equals its golden: rectangles
# only, so every GPU gives the same pixels).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/canvas.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/webenv/canvas.js --engine quickjs > "$tmp/out" 2>&1 \
  || { echo "webenv_canvas: canvas.js failed: $(head -c 300 "$tmp/out")"; fail=1; }
diff "$tmp/out" tests/golden/webenv/canvas.out > "$tmp/diff" || { echo "webenv_canvas: canvas.js differs from tests/golden/webenv/canvas.out:"; head -20 "$tmp/diff"; fail=1; }
tools/pngdiff "$tmp/canvas-2.png" tests/golden/webenv/canvas-2.png >/dev/null || { echo "webenv_canvas: the window does not show the canvas (frame 2 differs from tests/golden/webenv/canvas-2.png)"; fail=1; }
exit $fail
