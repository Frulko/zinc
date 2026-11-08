#!/bin/sh
# ZN-1006: the shaping tier is on by default where it is linked, so a character the UI font lacks (Japanese, Persian, the triangles and
# arrows ▸▾↑↓, emoji with a skin tone) is drawn from the system's fallback fonts before a '?': the same frame on the interpreter and QuickJS,
# not the frame of "text": "simple" (the '?'s, and its one hint line), and on macOS the recorded frame (tests/golden/text-fallback/frame.hash,
# the system fonts' pixels). A Latin text keeps its pixels: the same frame with the tier on and off.
cd "$(dirname "$0")/../.." || exit 2
fail=0
dir=tests/golden/text-fallback
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=260x120 ZINC_FRAMES=2 ZINC_FRAMEHASH=last
hash() { timeout 60 env "$@" 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' | tail -1; }
i=$(hash ZINC_TEXT= "$ZINC" run --interp $dir/main.tsx)
q=$(hash ZINC_TEXT= "$ZINC" run --engine quickjs $dir/main.tsx)
s=$(hash ZINC_TEXT=simple "$ZINC" run --interp $dir/main.tsx)
[ -n "$i" ] || { echo "text_fallback: no frame"; exit 1; }
[ "$i" = "$q" ] || { echo "text_fallback: QuickJS draws $q, the interpreter $i"; fail=1; }
[ "$i" != "$s" ] || { echo "text_fallback: the default frame is the '?' frame of \"text\": \"simple\""; fail=1; }
hint=$(ZINC_TEXT= timeout 60 "$ZINC" run --interp $dir/main.tsx 2>&1 | grep -c "drawn as '?'")
[ "$hint" = 0 ] || { echo "text_fallback: the default run still says a character is drawn as '?'"; fail=1; }
if [ "$(uname)" = Darwin ]; then
  [ -n "$UPDATE" ] && echo "$i" > $dir/frame.hash
  [ "$i" = "$(cat $dir/frame.hash)" ] || { echo "text_fallback: frame $i, recorded $(cat $dir/frame.hash) (UPDATE=1 after looking at it)"; fail=1; }
fi
a=$(hash ZINC_TEXT= "$ZINC" run --interp $dir/latin.tsx)
b=$(hash ZINC_TEXT=simple "$ZINC" run --interp $dir/latin.tsx)
[ -n "$a" ] && [ "$a" = "$b" ] || { echo "text_fallback: a Latin text draws $a with the tier, $b without"; fail=1; }
exit $fail
