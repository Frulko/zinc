#!/bin/sh
# Text input on phones (docs/ui.md, "Text input on phones"; ZN-626's desktop half): IME composition from a ZINC_INPUT script (compose "n", "ni",
# "你", then commit), the field's state mirrored to the platform's input connection and its keyboard traits (ZINC_DEVICE_LOG), a finger's long
# press selecting a word with handles and the edit menu, a handle dragged under the magnifier, the menu's Copy; under ZINC_PLATFORM=ios and
# android, with the frames of the composing run, the menu and the magnifier (hashes in tests/golden/text-touch/expected.txt). TEXT_TOUCH_BLESS=1
# rewrites it; TEXT_TOUCH_SHOTS=dir writes those frames as PNGs.
cd "$(dirname "$0")/../golden/text-touch" || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for p in ios android; do
  env ZINC_DEVICE_LOG="$tmp/$p.log" ZINC_PLATFORM=$p ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x240 ZINC_FRAMES=80 ZINC_INPUT=compose.input ZINC_FRAMEHASH=all \
    ${TEXT_TOUCH_SHOTS:+ZINC_SHOT_FRAMES=7,56,64 ZINC_SHOT=$TEXT_TOUCH_SHOTS/$p.png} "$ZINC" run main.tsx > "$tmp/$p.out" 2> "$tmp/$p.err"
  { echo "== $p"; cat "$tmp/$p.out"; grep -v '^textinput\|^hello' "$tmp/$p.log"; grep -c '^textinput' "$tmp/$p.log" | sed 's/^/textinput mirrors: /'
    for f in 7 56 64; do echo "frame $f $(sed -n "s/^zinc: framehash $f [0-9x]* //p" "$tmp/$p.err" | head -1)"; done; } >> "$tmp/got.txt"
done
[ -n "$TEXT_TOUCH_BLESS" ] && cp "$tmp/got.txt" expected.txt
if diff expected.txt "$tmp/got.txt" > "$tmp/d"; then echo "text touch: ok"; exit 0; fi
echo "text_touch: differs from tests/golden/text-touch/expected.txt (look with TEXT_TOUCH_SHOTS=dir):"; cat "$tmp/d"; exit 1
