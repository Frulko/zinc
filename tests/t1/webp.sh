#!/bin/sh
# WebP (ZN-226): libwebp decodes a .webp asset like a PNG (a lossless capture of tests/golden/shaped drawn 1:1 gives that frame's pixels again), and
# `zinc capture --format webp` / ZINC_SHOT=*.webp write lossless WebP that decodes back to the PNG capture's pixels.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1"
env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/a.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/webp >/dev/null 2>&1
tools/pngdiff "$tmp/a-2.png" tests/golden/shaped/gfx.png >/dev/null || { echo "the .webp asset does not draw the pixels it was encoded from"; fail=1; }
"$ZINC" capture tests/golden/shaped --frames 2 --format webp --out "$tmp/shots" >/dev/null 2>&1
head -c 4 "$tmp/shots/frame-2.webp" 2>/dev/null | grep -q RIFF || { echo "zinc capture --format webp wrote no WebP"; fail=1; }
# the capture is lossless: it equals the asset frame (both come from tests/golden/shaped)
cmp -s "$tmp/shots/frame-2.webp" tests/golden/webp/assets/frame.webp || { echo "the WebP capture differs from tests/golden/webp/assets/frame.webp"; fail=1; }
exit $fail
