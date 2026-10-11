#!/bin/sh
# The libraries on the web environment's Canvas 2D (ZN-570): PixiJS 8 Text and Phaser 3 Text (each drawn by the library on a 2D canvas of its
# own, measured with measureText and uploaded as a WebGL texture) and a p5.js sketch in its default 2D mode (shapes and text straight on the
# canvas of the document). The unmodified libraries, the scripts of tests/golden/webenv/canvas2d/libs as a page would have them; the window's
# frame 5 against what headless Chrome shows for the same script with the same font (libs/*-chrome.png, made by tools/canvas2d-ref libs):
# SSIM >= 0.90, and nothing thrown. p5.js is LGPL-2.1 and not in the repository (tools/test-lib): without it that page is left out.
# WEBENV_CANVAS2D_OUT=dir keeps the frames.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
libs=tests/golden/webenv/canvas2d/libs
page() {   # name
  env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=6 ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=5 "$ZINC" run "$libs/$1.js" --engine quickjs > "$tmp/$1.out" 2> "$tmp/$1.err" \
    || { echo "webenv_canvas2d_libs: $1.js failed: $(head -c 300 "$tmp/$1.err")"; fail=1; }
  [ -s "$tmp/$1.out" ] && { echo "webenv_canvas2d_libs: $1.js said: $(head -c 300 "$tmp/$1.out")"; fail=1; }
  grep -q "Uncaught" "$tmp/$1.err" && { echo "webenv_canvas2d_libs: $1.js threw: $(grep -m1 -A3 Uncaught "$tmp/$1.err" | cut -c1-300)"; fail=1; }
  [ -n "$WEBENV_CANVAS2D_OUT" ] && cp "$tmp/$1-5.png" "$WEBENV_CANVAS2D_OUT/$1.png"
  tools/pngdiff "$tmp/$1-5.png" "$libs/$1-chrome.png" --ssim 0.90 > "$tmp/$1.ssim" || { echo "webenv_canvas2d_libs: $1.js is not what Chrome shows (SSIM under 0.90): $(tail -1 "$tmp/$1.ssim")"; fail=1; }
}
page pixi
page phaser
if p5=$(tools/test-lib p5-1.11.13 2>"$tmp/fetch"); then WEBENV_P5="$p5"; export WEBENV_P5; page p5; else echo "webenv_canvas2d_libs: p5 left out: $(head -c 200 "$tmp/fetch")"; fi
exit $fail
