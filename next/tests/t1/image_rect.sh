#!/bin/sh
# zinc:gfx sprites (ZN-432): drawImageRect (a source rectangle of an image: mirrored, nearest or linear, alpha, cut at the image's edges) and imageFromBytes.
# tests/data/image_rect/main.ts draws frames of a sprite sheet from the baked image and from the same PNG decoded at run time. The nearest sprites are checked
# against the sheet texel by texel and the two images give the same pixels (check.py); the output and the frame hash are the golden's on the interpreter, QuickJS
# and the AOT build. zinc:canvas's 9-argument drawImage, now on the row, draws the frame its clip around the whole image scaled drew (canvas-golden.png, made
# by the engine before the row existed).
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
d=tests/data/image_rect
want=$(cat $d/golden.txt)
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=400x180 ZINC_FRAMES=2 ZINC_FRAMEHASH=last"
unset ZINC_ASSETS
fail=0
same() { [ "$2" = "$want" ] || { printf '%s:\n%s\nwant:\n%s\n' "$1" "$2" "$want"; fail=1; }; }
same interpreter "$(env $env ZINC_SHOT="$t/sw.png" "$ZINC" run $d/main.ts 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
python3 $d/check.py "$t/sw.png" $d/assets/sheet.png || fail=1
same quickjs "$(env $env "$ZINC" run $d/main.ts --engine quickjs 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
if [ -n "$CXX" ] || command -v c++ >/dev/null; then
  "$ZINC" build $d/main.ts -o "$t/app" >"$t/build.log" 2>&1 || { echo "image_rect: AOT build failed: $(head -c 300 "$t/build.log")"; exit 1; }
  same aot "$(env $env ZINC_ASSETS=$d/assets "$t/app" 2>&1 | sed 's/^zinc: framehash [0-9]* //' | sort)"
fi
ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=2 ZINC_SHOT="$t/canvas.png" "$ZINC" run $d/canvas.ts >"$t/canvas.log" 2>&1
out=$(python3 tools/pngdiff "$t/canvas.png" $d/canvas-golden.png 2>&1) || { echo "image_rect: zinc:canvas drawImage with a source rectangle differs from its golden: $out $(head -c 200 "$t/canvas.log")"; fail=1; }
[ $fail -eq 0 ] && echo "image_rect: ok"
exit $fail
