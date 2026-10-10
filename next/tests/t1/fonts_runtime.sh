#!/bin/sh
# Fonts at run time (ZN-669). tests/data/fonts_runtime/main.ts reads a font file name, a size and a text from assets/card.json while it runs and
# draws with loadFont: nothing in it is baked, the face is read from the assets, and the frame equals baked.ts's, where the same text is drawn in
# fonts the baker bakes (same pixels: the runtime rasterizer is the baker's), interpreted and compiled. tests/data/fonts_typed: Greek and Cyrillic
# letters that no file of the program holds, typed into a text field (ZINC_INPUT), draw their glyphs (golden), not '?'.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
shot() {   # name interp|native program [input frames]
  env ZINC_RUN=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=${5:-2} ${4:+ZINC_INPUT="$PWD/$4"} ZINC_SHOT="$tmp/$1.png" "$ZINC" run "$3" >"$tmp/$1.log" 2>&1 ||
    { echo "$1: exit $?: $(head -c 300 "$tmp/$1.log")"; fail=1; }
}
shot baked interp tests/data/fonts_runtime/baked.ts
for r in interp native; do
  shot run-$r $r tests/data/fonts_runtime/main.ts
  grep -q "^rasterized at run time: " "$tmp/run-$r.log" || { echo "run-$r: the fonts were not made at run time: $(head -c 300 "$tmp/run-$r.log")"; fail=1; }
  [ "$(sed -n 's/^rasterized at run time: //p' "$tmp/run-$r.log")" = "$(cat "$tmp/baked.log")" ] || { echo "run-$r measures '$(cat "$tmp/run-$r.log")', baked '$(cat "$tmp/baked.log")'"; fail=1; }
  tools/pngdiff "$tmp/run-$r.png" "$tmp/baked.png" >"$tmp/d" 2>&1 || { echo "run-$r: the frame differs from the baked one: $(head -1 "$tmp/d")"; fail=1; }
done
shot typed interp tests/data/fonts_typed tests/data/fonts_typed/typed.input 14
grep -q "typed 7 characters" "$tmp/typed.log" || { echo "typed: $(head -c 300 "$tmp/typed.log")"; fail=1; }
tools/pngdiff "$tmp/typed.png" tests/golden/fonts-runtime/typed.png >"$tmp/d" 2>&1 || { echo "typed: the frame differs from its golden: $(head -1 "$tmp/d")"; fail=1; }
exit $fail
