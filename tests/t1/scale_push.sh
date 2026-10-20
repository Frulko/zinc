#!/bin/sh
# zinc:gfx records its commands in physical pixels, C++ plugins' commands are converted when the frame ends (ZN-588): every primitive, an image
# drawn with beginImage (logical pixels) and a zinc:3d image give, at pixel scales 2 and 4, the frames of the former pass over the whole frame
# (tests/data/scale_push/golden.txt, recorded with it).
cd "$(dirname "$0")/../.." || exit 2
got=$(for k in 2 4; do ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=$k ZINC_SIZE=320x200 ZINC_FRAMES=3 ZINC_FRAMEHASH=all "$ZINC" run tests/data/scale_push/main.ts 2>&1 | sed -n 's/^zinc: framehash //p'; done)
[ "$got" = "$(cat tests/data/scale_push/golden.txt)" ] || { printf 'scale_push: frames differ\n%s\nwant:\n%s\n' "$got" "$(cat tests/data/scale_push/golden.txt)"; exit 1; }
echo "scale_push: ok"
