#!/bin/sh
# createImageBitmap in a zinc:script WebGL context (ZN-569): a PNG of a data: URL decoded off the frame, a source rectangle with its orientation
# and premultiplication, the refusals by name (tests/data/script-images).
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/script-images
got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run "$d" 2>/dev/null)
[ "$got" = "$(cat "$d/expected.out")" ] || { echo "script_images: the output differs from $d/expected.out:"; echo "$got" | head -10; exit 1; }
