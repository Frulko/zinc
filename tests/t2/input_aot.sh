#!/bin/sh
# ZN-047: a compiled program takes the same scripted pointer events and draws the same frames, and opens the SDL window path (dummy driver).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" build tests/golden/ui/click.tsx -o "$tmp/click" 2>"$tmp/err" || { echo "aot build failed: $(head -c 300 "$tmp/err")"; exit 1; }
ZINC_INPUT=tests/golden/ui/click.input ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=20 ZINC_SHOT="$tmp/c.png" ZINC_SHOT_FRAMES=20 "$tmp/click" >/dev/null 2>&1
tools/pngdiff "$tmp/c-20.png" tests/golden/ui/click-20.png >/dev/null || { echo "aot click frame 20 differs"; fail=1; }
SDL_VIDEO_DRIVER=dummy ZINC_SCALE=1 ZINC_FRAMES=1 ZINC_SHOT="$tmp/l.png" ZINC_SHOT_FRAMES=1 "$tmp/click" >/dev/null 2>&1
tools/pngdiff "$tmp/l-1.png" tests/golden/ui/click-2.png >/dev/null || { echo "aot run with the window HAL differs"; fail=1; }
exit $fail
