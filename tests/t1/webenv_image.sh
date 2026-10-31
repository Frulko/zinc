#!/bin/sh
# Images as WebGL texture sources in the web environment (ZN-569): tests/golden/webenv/image_gl.js hands image elements to texImage2D and
# texSubImage2D and reads the texture back. The picture is known (tests/data/images: twelve flat colours, the same in PNG,
# GIF, BMP and JPEG), so the pixels are checked against its colours, not against a capture: exact for PNG, GIF and BMP, within 1 for the
# JPEG; UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL; texSubImage2D; an image still loading is INVALID_VALUE; a lossless WebP equal
# pixel for pixel to the PNG it was encoded from. The window's frame 2 (the canvas, 4 pixels a texel) is the picture the right way up.
# Ten frames: an image loads at the frame after the one that asked for it (a timer set in a frame waits for the next), one format a frame.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=128x96 ZINC_FRAMES=10 ZINC_SHOT="$tmp/image_gl.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/webenv/image_gl.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_image: image_gl.js failed: $(grep -v UNSUPPORTED "$tmp/err" | head -c 300)"; fail=1; }
diff "$tmp/out" tests/golden/webenv/image_gl.out > "$tmp/diff" || { echo "webenv_image: image_gl.js differs from tests/golden/webenv/image_gl.out:"; head -20 "$tmp/diff"; fail=1; }
grep -q "Uncaught" "$tmp/err" && { echo "webenv_image: the page threw: $(grep -m1 Uncaught "$tmp/err" | cut -c1-200)"; fail=1; }
tools/pngdiff "$tmp/image_gl-2.png" tests/golden/webenv/image_gl-2.png >/dev/null || { echo "webenv_image: the window does not show the picture (frame 2 differs from tests/golden/webenv/image_gl-2.png)"; fail=1; }
exit $fail
