#!/bin/sh
# Canvas 2D of the web environment, the full tier (ZN-572), on the backend of the first tier (canvas_ity, patched): pictures drawn smoothed
# or with the nearest pixel (imageSmoothingEnabled), a canvas read back once for each state of its bitmap, Path2D (its own calls, SVG path
# data, addPath with a matrix) filled, stroked, clipped and hit-tested without touching the current path, the even-odd rule, a clip the size
# of the canvas, ellipse, toDataURL and toBlob (PNG with alpha, JPEG) decoded again, OffscreenCanvas. full.js prints pixels of flat colours.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 "$ZINC" run tests/golden/webenv/canvas2d/full.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_canvas2d_full: full.js failed: $(head -c 300 "$tmp/err")"; fail=1; }
diff "$tmp/out" tests/golden/webenv/canvas2d/full.out > "$tmp/diff" || { echo "webenv_canvas2d_full: full.js differs from tests/golden/webenv/canvas2d/full.out:"; head -20 "$tmp/diff"; fail=1; }
[ -s "$tmp/err" ] && { echo "webenv_canvas2d_full: full.js wrote on stderr: $(head -c 300 "$tmp/err")"; fail=1; }
exit $fail
