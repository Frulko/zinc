#!/bin/sh
# ZN-1042: the web environment's Canvas 2D samples a scaled pattern over four pixels (a browser's default quality), places it by
# CanvasPattern.setTransform, draws a picture made larger with the nearest pixel or four (the kept rows of drawImage's own loop), and a
# script element waits for the data: pictures the script before it loads (Phaser's blend-mode probe). The values in expected.out are
# worked out by hand from the sampling rules browsers use.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_FRAMES=3 timeout 60 "$ZINC" run tests/data/webenv-canvas-fidelity/main.js --engine quickjs > "$tmp/out" 2> "$tmp/err" || { echo "webenv_canvas_fidelity: the program failed: $(head -c 300 "$tmp/err")"; exit 1; }
diff "$tmp/out" tests/data/webenv-canvas-fidelity/expected.out > "$tmp/diff" || { echo "webenv_canvas_fidelity: differs from expected.out:"; head -20 "$tmp/diff"; exit 1; }
echo 'webenv_canvas_fidelity: pattern filter and transform, drawImage sampling, scripts after data: pictures PASS'
