#!/bin/sh
# zinc:svg and zinc:lottie on their native renderers (ZN-106, decision D23): the lottie conformance program prints its frozen output interpreted and compiled; the svg and lottie galleries draw
# real content, equal to the engine's own goldens (tests/golden/examples, made with these renderers: the old toolchain had none); and the renderers are not linked into zinc itself.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" run ../tests/conformance/lottie.ts 2>&1 | diff -q - ../tests/conformance/lottie.out >/dev/null || { echo "lottie.ts differs from its frozen output"; fail=1; }
"$ZINC" build ../tests/conformance/lottie.ts -o "$tmp/l" >"$tmp/b.log" 2>&1 && "$tmp/l" 2>&1 | diff -q - ../tests/conformance/lottie.out >/dev/null || { echo "lottie.ts differs as an AOT program: $(head -c 300 "$tmp/b.log")"; fail=1; }
for spec in "ui/lottie-gallery lottie-gallery" "maps/svg-gallery svg-gallery"; do
  set -- $spec
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 ZINC_SIZE=860x400 ZINC_SCALE=1 ZINC_SHOT="$tmp/$2.png" ZINC_SHOT_FRAMES=40 "$ZINC" run "../examples/$1" >/dev/null 2>&1
  tools/pngdiff "$tmp/$2-40.png" "tests/golden/examples/$2-40.png" >/dev/null || { echo "$2: frame 40 differs from tests/golden/examples/$2-40.png"; fail=1; }
done
# a program that does not use them is unchanged: their code lives in plugin libraries of the cache, never in zinc
nm "$ZINC" 2>/dev/null | grep -qiE "zn_module_(Lottie|Svg)" && { echo "the lottie or svg renderer is linked into zinc"; fail=1; }
exit $fail
