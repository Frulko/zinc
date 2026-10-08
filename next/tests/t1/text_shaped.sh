#!/bin/sh
# Shaped text (ZN-224): zinc.json "text": "shaped" lays out zinc:gfx and zinc:ui text with HarfBuzz and SheenBidi (Hebrew, Arabic, Devanagari conjuncts, a ZWJ emoji, combining marks): the frames equal their goldens,
# with the program built ahead of time too; a program that does not ask does not link the tier, and Latin pixels do not change (tests/t2/examples_pixels.sh with ZINC_TEXT=shaped).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
env="ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1"
env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/g.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/shaped >/dev/null 2>&1
tools/pngdiff "$tmp/g-2.png" tests/golden/shaped/gfx.png >/dev/null || { echo "zinc:gfx shaped text differs from tests/golden/shaped/gfx.png"; fail=1; }
env $env ZINC_FRAMES=3 ZINC_SHOT="$tmp/u.png" ZINC_SHOT_FRAMES=3 "$ZINC" run tests/golden/shaped-ui >/dev/null 2>&1
tools/pngdiff "$tmp/u-3.png" tests/golden/shaped-ui/ui.png >/dev/null || { echo "zinc:ui shaped text differs from tests/golden/shaped-ui/ui.png"; fail=1; }
# OpenType fonts with CFF outlines (Canadian syllabics), and colour emoji from the system font when the machine has one (Apple Color Emoji on macOS)
env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/c.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/shaped-cff >/dev/null 2>&1
tools/pngdiff "$tmp/c-2.png" tests/golden/shaped-cff/frame.png >/dev/null || { echo "CFF text differs from tests/golden/shaped-cff/frame.png"; fail=1; }
if [ -f "/System/Library/Fonts/Apple Color Emoji.ttc" ]; then
  env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/e.png" ZINC_SHOT_FRAMES=2 "$ZINC" run tests/golden/shaped-emoji >/dev/null 2>&1
  tools/pngdiff "$tmp/e-2.png" tests/golden/shaped-emoji/frame.png >/dev/null || { echo "colour emoji differ from tests/golden/shaped-emoji/frame.png"; fail=1; }
fi
# the same text without the option: the codepoint tables draw it (no shaping: the combining mark stays beside its letter), so the frame differs from the shaped golden
mkdir "$tmp/plain" && cp tests/golden/shaped/main.ts "$tmp/plain/" && ln -s "$PWD/tests/data/fonts" "$tmp/plain/assets" && echo '{"name":"plain","entry":"main.ts"}' > "$tmp/plain/zinc.json"
env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/p.png" ZINC_SHOT_FRAMES=2 "$ZINC" run "$tmp/plain" >/dev/null 2>&1
tools/pngdiff "$tmp/p-2.png" tests/golden/shaped/gfx.png >/dev/null 2>&1 && { echo "the unshaped run drew the shaped frame"; fail=1; }
if command -v c++ >/dev/null && [ -f "$(dirname "$ZINC")/libzn_text_gfx.a" ]; then
  "$ZINC" build tests/golden/shaped -o "$tmp/shaped_aot" >/dev/null 2>&1 || { echo "AOT build with text: shaped failed"; fail=1; }
  "$ZINC" build "$tmp/plain" -o "$tmp/plain_aot" >/dev/null 2>&1 || { echo "AOT build without the option failed"; fail=1; }
  nm "$tmp/shaped_aot" 2>/dev/null | grep -q hb_shape || { echo "the shaped AOT program does not link the shaping tier"; fail=1; }
  nm "$tmp/plain_aot" 2>/dev/null | grep -q hb_shape && { echo "an AOT program without the option links the shaping tier"; fail=1; }
  env $env ZINC_FRAMES=2 ZINC_SHOT="$tmp/a.png" ZINC_SHOT_FRAMES=2 "$tmp/shaped_aot" >/dev/null 2>&1
  tools/pngdiff "$tmp/a-2.png" tests/golden/shaped/gfx.png >/dev/null || { echo "the shaped AOT program draws another frame than the interpreter"; fail=1; }
  echo "sizes: shaped $(wc -c < "$tmp/shaped_aot") bytes, plain $(wc -c < "$tmp/plain_aot") bytes" >&2
fi
exit $fail
