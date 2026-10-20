#!/bin/sh
# ZN-048: a compiled program carries the fonts and images baked at build time (embedded in the C++) and draws the same frame.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" build tests/golden/res/main.ts -o "$tmp/res" 2>"$tmp/err" || { echo "aot build failed: $(head -c 300 "$tmp/err")"; exit 1; }
ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$tmp/r.png" ZINC_SHOT_FRAMES=2 "$tmp/res" >/dev/null 2>&1
tools/pngdiff "$tmp/r-2.png" tests/golden/res/frame-2.png >/dev/null || { echo "the compiled program's baked frame differs"; fail=1; }
exit $fail
