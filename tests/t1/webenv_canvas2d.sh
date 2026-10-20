#!/bin/sh
# Canvas 2D of the web environment, the text-first tier (ZN-570): canvas.getContext('2d') draws on a bitmap of its own (canvas_ity for shapes,
# the engine's text tier for glyphs). text.js checks pixels of flat colours (rectangles, state, transforms, clip, alpha, compositing, paths,
# gradients, ImageData, drawImage in its three forms), then the numbers of text against headless Chrome's for the same font (chrome.json:
# widths within 1 %, TextMetrics, baselines, alignments and glyph boxes within a pixel), a FontFace of the program, and that what the tier
# leaves out is counted, not thrown. The window's frame 2 is the scene of scene.js: a game's kinds of text (fill, stroke, shadow, gradient,
# aligned, spaced, rotated) at SSIM >= 0.90 against Chrome's own drawing of it (scene-chrome.png). tools/canvas2d-ref makes both references.
# overlay.js: a 2D canvas keeps its alpha in the window.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x480 ZINC_FRAMES=3 ZINC_SHOT="$tmp/scene.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/webenv/canvas2d/text.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_canvas2d: text.js failed: $(head -c 300 "$tmp/err")"; fail=1; }
diff "$tmp/out" tests/golden/webenv/canvas2d/text.out > "$tmp/diff" || { echo "webenv_canvas2d: text.js differs from tests/golden/webenv/canvas2d/text.out:"; head -20 "$tmp/diff"; fail=1; }
[ -s "$tmp/err" ] && { echo "webenv_canvas2d: text.js wrote on stderr: $(head -c 300 "$tmp/err")"; fail=1; }
tools/pngdiff "$tmp/scene-2.png" tests/golden/webenv/canvas2d/scene-chrome.png --ssim 0.90 > "$tmp/ssim" || { echo "webenv_canvas2d: the scene is not Chrome's (SSIM under 0.90): $(tail -1 "$tmp/ssim")"; fail=1; }
# a 2D canvas over a WebGL canvas (an overlay): the window shows the one under where the one over is transparent, and their mix where it is half so
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=3 ZINC_SHOT="$tmp/overlay.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/webenv/canvas2d/overlay.js --engine quickjs > "$tmp/over" 2>&1 \
  || { echo "webenv_canvas2d: overlay.js failed: $(head -c 300 "$tmp/over")"; fail=1; }
tools/pngdiff "$tmp/overlay-2.png" tests/golden/webenv/canvas2d/overlay-2.png --tol 2 >/dev/null || { echo "webenv_canvas2d: a transparent 2D canvas does not show the WebGL canvas under it (frame 2 differs from overlay-2.png)"; fail=1; }
exit $fail
